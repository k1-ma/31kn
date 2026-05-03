import { Router } from "express";
import { getPool, ensurePool, dbUnavailableResponse } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotency } from "../middleware/idempotency.js";
import { restoreStrippedImages, hasStrippedImages } from "../utils/imageRestore.js";
import { isDeleted } from "../utils/tombstones.js";
import {
  writeStateV2,
  readStateV2,
  isReadFromV2Enabled,
  IMAGE_DUAL_WRITE_ENABLED,
} from "../services/imageStore.service.js";

// Note: Rate limiting is applied globally to all /api routes in app.js via rateLimitDbMiddleware

const router = Router();

const READONLY_ROLES = new Set(
  String(process.env.READONLY_ROLES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

// Structured logging helper
function logStateOp(operation, userId, details = {}) {
  const logData = {
    ts: new Date().toISOString(),
    op: operation,
    userId,
    ...details,
  };
  console.log(`[state.routes] ${JSON.stringify(logData)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOSS PROTECTION CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Minimum records count to enable percentage-based protection for any collection
// Small datasets (<10 items) don't trigger percentage-based protection
// Applies to trades, backtests, and other collections
const MIN_RECORDS_FOR_PROTECTION = 10;

// Maximum allowed data loss (50%) before triggering server-side merge
// If incoming state has >50% fewer records than server, merge instead of overwrite
const MAX_ACCEPTABLE_DROP_PERCENTAGE = 0.5;

// Per-user quota on the size of the JSON state blob. Anything larger is
// almost certainly a runaway image cache; reject with 413 instead of letting
// it blow up the JSONB write or exhaust function memory.
const MAX_STATE_BYTES = 50 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// STATEMENT TIMEOUT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Raised timeout for large JSONB writes (3+ months of data can exceed 10s default)
const STATEMENT_TIMEOUT_LARGE_WRITE = "30s";
// Default pool timeout to reset after large write completes
const STATEMENT_TIMEOUT_DEFAULT = "10s";

// ─────────────────────────────────────────────────────────────────────────────
// TIMESTAMP-BASED MERGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get timestamp from an item for comparison
 * Prefers updatedAt, falls back to createdAt, then to 0
 */
function getItemTimestamp(item) {
  if (!item) return 0;
  if (typeof item.updatedAt === 'number' && item.updatedAt > 0) return item.updatedAt;
  if (typeof item.createdAt === 'number' && item.createdAt > 0) return item.createdAt;
  return 0;
}

// Normalize an id to a stable string key. Without this, Map.get("123") and
// Map.get(123) miss each other and the same logical record ends up duplicated
// in the merged output when client and server agree on the value but disagree
// on the type. Mirrors src/lib/syncDb.js#idKey.
function idKey(id) {
  return id == null ? "" : String(id);
}

/**
 * Merge arrays by ID with timestamp-based conflict resolution
 * The newer version (by updatedAt/createdAt) wins for each ID
 */
function mergeArraysById(localArr, serverArr) {
  if (!Array.isArray(localArr) && !Array.isArray(serverArr)) {
    return serverArr ?? localArr ?? [];
  }
  if (!Array.isArray(localArr)) return serverArr || [];
  if (!Array.isArray(serverArr)) return localArr || [];

  const serverMap = new Map();
  for (const item of serverArr) {
    if (item && item.id) {
      serverMap.set(idKey(item.id), item);
    }
  }

  const localMap = new Map();
  for (const item of localArr) {
    if (item && item.id) {
      localMap.set(idKey(item.id), item);
    }
  }
  
  // Merge: prefer newer version based on timestamp
  const mergedMap = new Map();
  const allIds = new Set([...serverMap.keys(), ...localMap.keys()]);
  
  for (const id of allIds) {
    const serverItem = serverMap.get(id);
    const localItem = localMap.get(id);
    
    if (!serverItem) {
      // Local-only item
      mergedMap.set(id, localItem);
    } else if (!localItem) {
      // Server-only item
      mergedMap.set(id, serverItem);
    } else {
      // Both exist - compare timestamps
      const serverTimestamp = getItemTimestamp(serverItem);
      const localTimestamp = getItemTimestamp(localItem);
      
      let mergedItem;
      if (serverTimestamp > localTimestamp) {
        // Server is newer
        mergedItem = serverItem;
      } else {
        // Local is newer or same age (local/incoming wins ties)
        mergedItem = localItem;
      }
      
      // CRITICAL: Preserve deletedAt using Math.max so a local deletion that
      // hasn't reached the server yet is never silently dropped by a server-side
      // safety merge.  If either side has a valid deletedAt, keep the larger one.
      const serverDeletedAt = (typeof serverItem.deletedAt === 'number' && serverItem.deletedAt > 0) ? serverItem.deletedAt : null;
      const localDeletedAt  = (typeof localItem.deletedAt  === 'number' && localItem.deletedAt  > 0) ? localItem.deletedAt  : null;
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        const maxDeletedAt = Math.max(serverDeletedAt ?? 0, localDeletedAt ?? 0);
        mergedItem = { ...mergedItem, deletedAt: maxDeletedAt };
      }
      
      mergedMap.set(id, mergedItem);
    }
  }
  
  return Array.from(mergedMap.values());
}

/**
 * Merge incoming state with server state using timestamp-based conflict resolution
 * Used on PUT /api/state when force is not set
 */
function mergeStates(incomingState, serverState) {
  if (!serverState) return incomingState;
  if (!incomingState) return serverState;
  
  const merged = { ...incomingState };
  
  // Merge trades array with timestamp-based conflict resolution
  if (incomingState.trades || serverState.trades) {
    merged.trades = mergeArraysById(incomingState.trades, serverState.trades);
  }
  
  // Merge accounts array similarly
  if (incomingState.accounts || serverState.accounts) {
    merged.accounts = mergeArraysById(incomingState.accounts, serverState.accounts);
  }
  
  // Merge documents array similarly
  if (incomingState.documents || serverState.documents) {
    merged.documents = mergeArraysById(incomingState.documents, serverState.documents);
  }
  
  // Merge libraries (symbols/pairs + sessions + models + customTags).
  // customTags is a real id-keyed sub-collection just like the other three —
  // omitting it caused safety-net merges to silently drop newly-added tags
  // when the incoming payload looked smaller than the server's view.
  if (incomingState.libraries || serverState.libraries) {
    const incomingLib = incomingState.libraries ?? {};
    const serverLib = serverState.libraries ?? {};
    merged.libraries = {
      ...incomingLib,
      symbols: mergeArraysById(incomingLib.symbols, serverLib.symbols),
      sessions: mergeArraysById(incomingLib.sessions, serverLib.sessions),
      models: mergeArraysById(incomingLib.models, serverLib.models),
      customTags: mergeArraysById(incomingLib.customTags, serverLib.customTags),
    };
  }
  
  // Merge docFolders and docShares
  if (incomingState.docFolders || serverState.docFolders) {
    merged.docFolders = mergeArraysById(incomingState.docFolders, serverState.docFolders);
  }
  if (incomingState.docShares || serverState.docShares) {
    merged.docShares = mergeArraysById(incomingState.docShares, serverState.docShares);
  }
  
  // Merge backtests array with timestamp-based conflict resolution
  if (incomingState.backtests || serverState.backtests) {
    merged.backtests = mergeArraysById(incomingState.backtests, serverState.backtests);
  }
  
  // For other top-level keys, prefer incoming state
  // (UI settings, etc. should come from client)
  
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH MERGE HELPER
// ─────────────────────────────────────────────────────────────────────────────

// Deep merge helper for PATCH - merges source into target
// Arrays are replaced entirely (not merged) to avoid duplicate entries
function deepMerge(target, source) {
  // Handle null/undefined
  if (source === null || source === undefined) return source;
  if (target === null || target === undefined) return source;
  
  // Non-objects: source wins
  if (typeof source !== "object") return source;
  if (typeof target !== "object") return source;
  
  // Arrays are replaced entirely (don't merge array elements)
  if (Array.isArray(source)) return source;
  if (Array.isArray(target)) return source; // Target was array, source is object -> source wins
  
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    
    if (srcVal === null || srcVal === undefined) {
      // Explicit null/undefined = keep that value
      result[key] = srcVal;
    } else if (Array.isArray(srcVal)) {
      // Arrays are replaced entirely
      result[key] = srcVal;
    } else if (typeof srcVal === "object" && typeof tgtVal === "object" && !Array.isArray(tgtVal)) {
      // Recursively merge nested objects
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

// GET /api/state
router.get("/", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    logStateOp("get", req.session?.userId, { error: "db_unavailable" });
    return res.status(503).json(dbUnavailableResponse());
  }

  const userId = req.session.userId;

  // Phase 3 read path. When READ_FROM_V2_USER_IDS includes this user, try
  // serving the rehydrated state_json_v2 first. readStateV2 self-validates
  // (counts match canonical, no missing refs, not stale, no verify-failed
  // stamp); on ANY failure it returns ok:false and we silently fall back to
  // the canonical state_json read below.
  if (isReadFromV2Enabled(userId)) {
    try {
      const v2 = await readStateV2({ pool, userId });
      if (v2?.ok) {
        const tradesCount = v2.state?.trades?.length ?? 0;
        logStateOp("get", userId, {
          source: "v2",
          found: true,
          tradesCount,
          hasState: !!v2.state,
          version: v2.version ?? 0,
          metrics: v2.metrics,
        });
        res.set("Cache-Control", "no-store");
        res.json({
          state: v2.state ?? null,
          updated_at: v2.updated_at ?? null,
          version: v2.version ?? 0,
        });
        maybeRunTombstoneGc(pool, userId).catch(() => {});
        return;
      }
      // Not ok — log the reason and fall through to v1.
      if (v2?.reason && v2.reason !== "no_state_row") {
        logStateOp("get", userId, {
          source: "v1_fallback",
          v2_reason: v2.reason,
          v2_metrics: v2.metrics,
        });
      }
    } catch (err) {
      // readStateV2 doesn't throw, but defensive guard so a bug there can't
      // 500 the user. Fall through to canonical path.
      logStateOp("get", userId, { source: "v1_fallback", v2_error: err?.message });
    }
  }

  try {
    const r = await pool.query("SELECT state_json, updated_at, version FROM states WHERE user_id = $1", [userId]);
    const row = r.rows?.[0];
    const tradesCount = row?.state_json?.trades?.length ?? 0;

    logStateOp("get", userId, {
      source: "v1",
      found: !!row,
      tradesCount,
      hasState: !!row?.state_json,
      version: row?.version ?? 0
    });

    // Prevent CDN/edge caching of user state — stale reads cause merge conflicts (BUG #7)
    res.set("Cache-Control", "no-store");
    res.json({
      state: row?.state_json ?? null,
      updated_at: row?.updated_at ?? null,
      version: row?.version ?? 0
    });

    // Fire tombstone GC asynchronously after response (at most once/day/user)
    maybeRunTombstoneGc(pool, userId).catch(() => {});
    return;
  } catch (err) {
    logStateOp("get", userId, { error: err?.message || "unknown" });
    return res.status(500).json({ error: "Failed to load state" });
  }
});

// PUT/POST /api/state - Full state replacement with optimistic locking
// Supports expected_version for conflict detection
// POST is also handled because navigator.sendBeacon() always sends POST requests,
// and the client uses sendBeacon for best-effort sync on page hide/unload.
async function handleStateSave(req, res) {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    logStateOp("put", req.session?.userId, { error: "db_unavailable" });
    return res.status(503).json(dbUnavailableResponse());
  }

  const userId = req.session.userId;

  if (READONLY_ROLES.has(String(req.user?.role || "").toLowerCase())) {
    logStateOp("put", userId, { error: "readonly_role" });
    return res.status(403).json({ error: "Read-only role" });
  }

  const { state, expected_version, force } = req.body || {};

  // Validate state shape: must be a plain object (or explicit null to clear).
  // Rejecting arrays/scalars prevents corrupt JSONB writes downstream.
  if (state !== null && state !== undefined && (typeof state !== "object" || Array.isArray(state))) {
    logStateOp("put", userId, { error: "invalid_state_type", typeofState: typeof state });
    return res.status(400).json({ error: "Invalid state: must be an object" });
  }

  // Per-user state size quota — see MAX_STATE_BYTES.
  if (state) {
    const stateBytes = Buffer.byteLength(JSON.stringify(state), "utf8");
    if (stateBytes > MAX_STATE_BYTES) {
      logStateOp("put", userId, {
        error: "state_too_large",
        stateBytes,
        limitBytes: MAX_STATE_BYTES,
        severity: "WARN"
      });
      return res.status(413).json({
        error: "state_too_large",
        code: "PAYLOAD_TOO_LARGE",
        limit_bytes: MAX_STATE_BYTES,
      });
    }
  }

  const incomingTradesCount = state?.trades?.length ?? 0;

  try {
    // Use a client for transaction to prevent race conditions
    const client = await pool.connect();
    
    try {
      // Raise statement_timeout for large JSONB writes (3+ months of data can exceed 10s)
      await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_LARGE_WRITE}'`);
      await client.query("BEGIN");
      
      // Lock the row for update to prevent concurrent modifications
      const current = await client.query(
        "SELECT version, state_json FROM states WHERE user_id = $1 FOR UPDATE",
        [userId]
      );
      const currentVersion = current.rows?.[0]?.version ?? 0;
      const currentState = current.rows?.[0]?.state_json;
      
      // If expected_version is provided, check for conflict
      if (typeof expected_version === "number" && currentVersion !== expected_version) {
        await client.query("ROLLBACK");
        
        const currentTradesCount = currentState?.trades?.length ?? 0;
        logStateOp("put", userId, { 
          error: "version_conflict", 
          expected: expected_version, 
          actual: currentVersion,
          currentTradesCount,
          incomingTradesCount
        });
        return res.status(409).json({ 
          error: "Version conflict", 
          code: "VERSION_CONFLICT",
          expected_version,
          current_version: currentVersion,
          // Return current server state so client can merge
          server_state: currentState,
          server_trades_count: currentTradesCount
        });
      }
      
      // Determine final state: use client state directly (client already merged on GET)
      // Server-side merge only happens on version conflict (handled above with 409)
      // The client sends its canonical state after merging locally, so accept it as-is
      let finalState = state;
      
      // Safety net: if incoming state has fewer records than the server has,
      // merge instead of overwrite to prevent accidental data wipe. Protects
      // against buggy clients sending an empty/partial state (e.g. a new
      // device where fetchState failed but the empty seed was synced).
      //
      // Compares ACTIVE (non-tombstoned) records only. If the drop is fully
      // accounted for by matching tombstones in the incoming state, the
      // delete is treated as legitimate.
      //
      // Applies to: trades, backtests, accounts, documents, libraries
      // sub-collections (symbols/sessions/models), and the settings object.
      if (currentState && !force) {
        const reasons = [];

        // Helper: analyse one array collection (full-wipe + >50% drop check).
        // Returns true if a merge is required for data-loss protection.
        function shouldMergeForCollection(label, finalArr, serverArr, severityFullWipe = "CRITICAL") {
          const finalArrSafe = Array.isArray(finalArr) ? finalArr : [];
          const serverArrSafe = Array.isArray(serverArr) ? serverArr : [];
          const finalActive = finalArrSafe.filter(item => !isDeleted(item));
          const serverActive = serverArrSafe.filter(item => !isDeleted(item));
          const incomingTombstonedIds = new Set(
            finalArrSafe.filter(item => isDeleted(item) && item?.id).map(item => item.id)
          );

          // Full wipe of an actively-populated collection
          if (finalActive.length === 0 && serverActive.length > 0) {
            const serverActiveIds = new Set(serverActive.map(it => it?.id).filter(Boolean));
            const allAccountedFor =
              serverActiveIds.size > 0 &&
              [...serverActiveIds].every(id => incomingTombstonedIds.has(id));
            if (!allAccountedFor) {
              const reason = `merge_to_prevent_${label}_data_loss`;
              logStateOp("put", userId, {
                action: reason,
                collection: label,
                incomingActiveCount: finalActive.length,
                serverActiveCount: serverActive.length,
                severity: severityFullWipe
              });
              return reason;
            }
            return null;
          }

          // Partial wipe (>50% active drop) on a sufficiently-large collection
          if (
            serverActive.length > MIN_RECORDS_FOR_PROTECTION &&
            finalActive.length > 0
          ) {
            const dropPct = (serverActive.length - finalActive.length) / serverActive.length;
            if (dropPct > MAX_ACCEPTABLE_DROP_PERCENTAGE) {
              const finalActiveIds = new Set(finalActive.map(it => it?.id).filter(Boolean));
              const droppedIds = serverActive
                .map(it => it?.id)
                .filter(id => id && !finalActiveIds.has(id));
              const allDroppedHaveTombstones =
                droppedIds.length > 0 &&
                droppedIds.every(id => incomingTombstonedIds.has(id));
              if (!allDroppedHaveTombstones) {
                const reason = `merge_to_prevent_${label}_partial_data_loss`;
                logStateOp("put", userId, {
                  action: reason,
                  collection: label,
                  incomingActiveCount: finalActive.length,
                  serverActiveCount: serverActive.length,
                  dropPercentage: (dropPct * 100).toFixed(1) + "%",
                  severity: "HIGH"
                });
                return reason;
              }
            }
          }

          return null;
        }

        // Top-level array collections
        const checks = [
          ["trades",     finalState?.trades,     currentState?.trades],
          ["backtests",  finalState?.backtests,  currentState?.backtests],
          ["accounts",   finalState?.accounts,   currentState?.accounts],
          ["documents",  finalState?.documents,  currentState?.documents],
        ];
        for (const [label, finalArr, serverArr] of checks) {
          const r = shouldMergeForCollection(label, finalArr, serverArr);
          if (r) reasons.push(r);
        }

        // Library sub-collections (symbols / sessions / models). Each is its
        // own array with the same tombstone semantics.
        const incomingLib = finalState?.libraries ?? null;
        const serverLib = currentState?.libraries ?? null;
        if (serverLib && typeof serverLib === "object") {
          for (const subKey of ["symbols", "sessions", "models", "customTags"]) {
            const r = shouldMergeForCollection(
              `libraries.${subKey}`,
              incomingLib?.[subKey],
              serverLib?.[subKey]
            );
            if (r) reasons.push(r);
          }
        }

        // Settings object: if the server had a non-empty settings object and
        // the incoming payload either omits it or sends an empty {}, treat
        // it as accidental wipe and merge.
        const serverSettings = currentState?.settings;
        const incomingSettings = finalState?.settings;
        const serverHasSettings =
          serverSettings &&
          typeof serverSettings === "object" &&
          !Array.isArray(serverSettings) &&
          Object.keys(serverSettings).length > 0;
        const incomingSettingsEmpty =
          incomingSettings === undefined ||
          incomingSettings === null ||
          (typeof incomingSettings === "object" &&
            !Array.isArray(incomingSettings) &&
            Object.keys(incomingSettings).length === 0);
        if (serverHasSettings && incomingSettingsEmpty) {
          const reason = "merge_to_prevent_settings_data_loss";
          logStateOp("put", userId, {
            action: reason,
            collection: "settings",
            serverSettingsKeys: Object.keys(serverSettings).length,
            severity: "HIGH"
          });
          reasons.push(reason);
        }

        // Perform a single merge if any check tripped.
        if (reasons.length > 0) {
          finalState = mergeStates(finalState, currentState);
          // Settings aren't covered by mergeStates() (which only merges
          // arrays-by-id); fall back to taking the server-side object when
          // the incoming side is empty.
          if (serverHasSettings && incomingSettingsEmpty) {
            finalState = { ...finalState, settings: serverSettings };
          }
          logStateOp("put", userId, {
            action: "merge_completed",
            reasons,
            mergedTradesCount: finalState?.trades?.length ?? 0,
            mergedBacktestsCount: finalState?.backtests?.length ?? 0,
            mergedAccountsCount: finalState?.accounts?.length ?? 0,
            mergedDocumentsCount: finalState?.documents?.length ?? 0
          });
        } else {
          // Audit: log normal state-size deltas for visibility.
          const finalTradesCount = finalState?.trades?.length ?? 0;
          const serverTradesCount = currentState?.trades?.length ?? 0;
          const finalBacktestsCount = finalState?.backtests?.length ?? 0;
          const serverBacktestsCount = currentState?.backtests?.length ?? 0;
          if (
            finalTradesCount !== serverTradesCount ||
            finalBacktestsCount !== serverBacktestsCount
          ) {
            logStateOp("put", userId, {
              action: "accepting_client_state",
              incomingTradesCount,
              serverTradesCount,
              finalTradesCount,
              tradesChange: finalTradesCount - serverTradesCount,
              incomingBacktestsCount: finalBacktestsCount,
              serverBacktestsCount,
              backtestsChange: finalBacktestsCount - serverBacktestsCount
            });
          }
        }
      }

      // Safety net: restore any [IMAGE_STRIPPED] placeholders from the current
      // server state. This should not happen via the normal PUT/POST path (beacon
      // stripping was removed in PR #499), but guards against regressions.
      if (finalState && hasStrippedImages(finalState)) {
        if (currentState) {
          finalState = restoreStrippedImages(finalState, currentState);
          logStateOp("put", userId, {
            action: "restored_stripped_images",
            severity: "WARN"
          });
        } else {
          // No server-side state to restore from — placeholders will be
          // persisted as-is, permanently losing those images. We don't crash
          // here (better a degraded write than a 500), but flag it loudly so
          // the regression is visible in logs.
          let placeholderCount = 0;
          const countPlaceholders = (node) => {
            if (node === "[IMAGE_STRIPPED]") { placeholderCount++; return; }
            if (node == null || typeof node !== "object") return;
            if (Array.isArray(node)) { node.forEach(countPlaceholders); return; }
            for (const v of Object.values(node)) countPlaceholders(v);
          };
          countPlaceholders(finalState);
          logStateOp("put", userId, {
            action: "stripped_images_unrestorable",
            severity: "WARN",
            count: placeholderCount
          });
        }
      }

      // Atomic insert/update with version increment
      const result = await client.query(
        `INSERT INTO states (user_id, state_json, updated_at, version)
         VALUES ($1, $2, now(), 1)
         ON CONFLICT (user_id) DO UPDATE SET 
           state_json = EXCLUDED.state_json, 
           updated_at = now(),
           version = states.version + 1
         RETURNING updated_at, version`,
        [userId, finalState === null ? null : finalState]
      );

      await client.query("COMMIT");

      const newUpdatedAt = result.rows?.[0]?.updated_at;
      const newVersion = result.rows?.[0]?.version ?? 1;
      const tradeCount = finalState?.trades?.length ?? 0;

      logStateOp("put", userId, {
        tradeCount,
        hasState: !!finalState,
        version: newVersion,
        acceptedClientState: true
      });

      // Phase 2 dual-write (gated by IMAGE_DUAL_WRITE=1). Best-effort and
      // fire-and-forget — the canonical state_json write above has already
      // succeeded, so any failure here only affects the (currently unread)
      // state_json_v2 mirror. Nothing reads v2 until READ_FROM_V2 is enabled
      // in a future phase.
      if (IMAGE_DUAL_WRITE_ENABLED && finalState != null) {
        Promise.resolve()
          .then(() => writeStateV2({
            pool,
            userId,
            canonicalState: finalState,
            statementTimeout: STATEMENT_TIMEOUT_LARGE_WRITE,
          }))
          .catch((err) => {
            logStateOp("put", userId, {
              warning: "v2_dual_write_threw",
              error: err?.message,
            });
          });
      }

      return res.json({
        ok: true,
        updated_at: newUpdatedAt,
        version: newVersion,
        tradeCount
      });
    } finally {
      // Reset statement_timeout to pool default before releasing
      await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_DEFAULT}'`).catch(() => {});
      client.release();
    }
  } catch (err) {
    logStateOp("put", userId, { error: err?.message || "unknown", incomingTradesCount });
    return res.status(500).json({ error: "Failed to save state" });
  }
}

router.put("/", requireAuth, idempotency(), handleStateSave);
// POST is used by navigator.sendBeacon() which always sends POST requests.
router.post("/", requireAuth, idempotency(), handleStateSave);

// PATCH /api/state - Partial state update with optimistic locking
// Supports expected_version for conflict detection to prevent data loss
router.patch("/", requireAuth, idempotency(), async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    logStateOp("patch", req.session?.userId, { error: "db_unavailable" });
    return res.status(503).json(dbUnavailableResponse());
  }

  const userId = req.session.userId;

  if (READONLY_ROLES.has(String(req.user?.role || "").toLowerCase())) {
    logStateOp("patch", userId, { error: "readonly_role" });
    return res.status(403).json({ error: "Read-only role" });
  }

  const { patch, expected_version } = req.body || {};
  if (!patch || typeof patch !== "object") {
    logStateOp("patch", userId, { error: "invalid_patch" });
    return res.status(400).json({ error: "Invalid patch object" });
  }

  const patchKeys = Object.keys(patch);

  try {
    // Use a client for transaction to prevent race conditions
    const client = await pool.connect();
    
    try {
      // Raise statement_timeout for large JSONB writes
      await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_LARGE_WRITE}'`);
      await client.query("BEGIN");
      
      // Lock the row for update to prevent concurrent modifications
      const current = await client.query(
        "SELECT state_json, version FROM states WHERE user_id = $1 FOR UPDATE",
        [userId]
      );
      const currentState = current.rows?.[0]?.state_json ?? {};
      const currentVersion = current.rows?.[0]?.version ?? 0;
      
      // Check version if provided
      if (typeof expected_version === "number" && currentVersion !== expected_version) {
        await client.query("ROLLBACK");
        
        const currentTradesCount = currentState?.trades?.length ?? 0;
        logStateOp("patch", userId, { 
          error: "version_conflict", 
          expected: expected_version, 
          actual: currentVersion,
          patchKeys,
          currentTradesCount
        });
        return res.status(409).json({ 
          error: "Version conflict", 
          code: "VERSION_CONFLICT",
          expected_version,
          current_version: currentVersion,
          server_state: currentState,
          server_trades_count: currentTradesCount
        });
      }
      
      // Merge patch into current state
      const newState = deepMerge(currentState, patch);

      // Safety net: if the patch contained [IMAGE_STRIPPED] values, restore
      // real images from the current state before saving.
      if (hasStrippedImages(newState)) {
        const restored = restoreStrippedImages(newState, currentState);
        Object.assign(newState, restored);
        logStateOp("patch", userId, {
          action: "restored_stripped_images",
          patchKeys,
          severity: "WARN"
        });
      }

      const tradesCount = newState?.trades?.length ?? 0;
      
      // Save merged state with version increment
      const result = await client.query(
        `INSERT INTO states (user_id, state_json, updated_at, version)
         VALUES ($1, $2, now(), 1)
         ON CONFLICT (user_id) DO UPDATE SET 
           state_json = EXCLUDED.state_json, 
           updated_at = now(),
           version = states.version + 1
         RETURNING updated_at, version`,
        [userId, newState]
      );
      
      await client.query("COMMIT");

      const newUpdatedAt = result.rows?.[0]?.updated_at;
      const newVersion = result.rows?.[0]?.version ?? 1;
      const tradeCount = newState?.trades?.length ?? 0;

      logStateOp("patch", userId, { patchKeys, tradeCount, hasState: true, version: newVersion });

      // Phase 2 dual-write (gated by IMAGE_DUAL_WRITE=1). Best-effort.
      if (IMAGE_DUAL_WRITE_ENABLED && newState != null) {
        Promise.resolve()
          .then(() => writeStateV2({
            pool,
            userId,
            canonicalState: newState,
            statementTimeout: STATEMENT_TIMEOUT_LARGE_WRITE,
          }))
          .catch((err) => {
            logStateOp("patch", userId, {
              warning: "v2_dual_write_threw",
              error: err?.message,
            });
          });
      }

      return res.json({
        ok: true,
        updated_at: newUpdatedAt,
        version: newVersion,
        tradeCount
      });
    } finally {
      // Reset statement_timeout to pool default before releasing
      await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_DEFAULT}'`).catch(() => {});
      client.release();
    }
  } catch (err) {
    logStateOp("patch", userId, { error: err?.message || "unknown", patchKeys });
    return res.status(500).json({ error: "Failed to patch state" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TOMBSTONE GARBAGE COLLECTION
// Removes soft-deleted items (deletedAt > 0) older than 30 days.
// Called once per day per user during GET /api/state if enough time has passed.
// ─────────────────────────────────────────────────────────────────────────────

const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// "At most once per day per user" — the actual gate lives in the
// tombstone_gc_runs table (see maybeRunTombstoneGc). Previously this was an
// in-memory Map, which silently reset on every serverless cold start.

/**
 * Remove expired tombstones from an array of items.
 * Items with deletedAt > 0 and older than cutoff are hard-deleted.
 * @param {Array} items - Array of items with potential deletedAt
 * @param {number} cutoff - Timestamp: items deleted before this are removed
 * @returns {{ cleaned: Array, removed: number }}
 */
function gcTombstones(items, cutoff) {
  if (!Array.isArray(items)) return { cleaned: items, removed: 0 };
  let removed = 0;
  const cleaned = items.filter(item => {
    if (isDeleted(item) && item.deletedAt < cutoff) {
      removed++;
      return false;
    }
    return true;
  });
  return { cleaned, removed };
}

/**
 * Run tombstone GC on a state object.
 * Removes expired tombstones from trades, accounts, documents, backtests,
 * and library collections.
 * @param {Object} state - The state object to clean
 * @returns {{ state: Object, totalRemoved: number }}
 */
function gcStateExpiredTombstones(state) {
  if (!state) return { state, totalRemoved: 0 };
  const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
  let totalRemoved = 0;
  const cleaned = { ...state };

  for (const key of ['trades', 'accounts', 'documents', 'docFolders', 'docShares', 'backtests']) {
    if (Array.isArray(cleaned[key])) {
      const result = gcTombstones(cleaned[key], cutoff);
      cleaned[key] = result.cleaned;
      totalRemoved += result.removed;
    }
  }

  // GC library sub-collections
  if (cleaned.libraries) {
    cleaned.libraries = { ...cleaned.libraries };
    for (const key of ['symbols', 'sessions', 'models', 'customTags']) {
      if (Array.isArray(cleaned.libraries[key])) {
        const result = gcTombstones(cleaned.libraries[key], cutoff);
        cleaned.libraries[key] = result.cleaned;
        totalRemoved += result.removed;
      }
    }
  }

  // GC nested backtest trades
  if (Array.isArray(cleaned.backtests)) {
    cleaned.backtests = cleaned.backtests.map(bt => {
      if (!Array.isArray(bt?.trades)) return bt;
      const result = gcTombstones(bt.trades, cutoff);
      totalRemoved += result.removed;
      return result.removed > 0 ? { ...bt, trades: result.cleaned } : bt;
    });
  }

  return { state: cleaned, totalRemoved };
}

/**
 * Middleware-style function that runs tombstone GC on GET /api/state
 * if at least 24 hours have passed since the last GC for this user.
 * Runs asynchronously after returning the response to the client.
 *
 * The "last run" timestamp is persisted in the tombstone_gc_runs table so
 * that the throttle survives serverless cold starts.
 */
async function maybeRunTombstoneGc(pool, userId) {
  try {
    const lastRunResult = await pool.query(
      "SELECT last_run_at FROM tombstone_gc_runs WHERE user_id = $1",
      [userId]
    );
    const lastRunAt = lastRunResult.rows?.[0]?.last_run_at;
    if (lastRunAt) {
      const lastRunMs = new Date(lastRunAt).getTime();
      if (Date.now() - lastRunMs < 24 * 60 * 60 * 1000) return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT state_json, version FROM states WHERE user_id = $1 FOR UPDATE",
        [userId]
      );
      const currentState = current.rows?.[0]?.state_json;
      if (!currentState) {
        await client.query("ROLLBACK");
        // Still mark the run so we don't re-check on every GET for users
        // who have no state yet.
        await pool.query(
          `INSERT INTO tombstone_gc_runs (user_id, last_run_at)
           VALUES ($1, now())
           ON CONFLICT (user_id) DO UPDATE SET last_run_at = now()`,
          [userId]
        );
        return;
      }

      const { state: cleanedState, totalRemoved } = gcStateExpiredTombstones(currentState);
      if (totalRemoved === 0) {
        await client.query("ROLLBACK");
      } else {
        await client.query(
          `UPDATE states SET state_json = $1, updated_at = now(), version = version + 1
           WHERE user_id = $2`,
          [cleanedState, userId]
        );
        await client.query("COMMIT");
        logStateOp("tombstone_gc", userId, { totalRemoved });
      }

      // Record the run regardless of whether anything was removed — the
      // throttle is about "we already looked", not "we found work".
      await pool.query(
        `INSERT INTO tombstone_gc_runs (user_id, last_run_at)
         VALUES ($1, now())
         ON CONFLICT (user_id) DO UPDATE SET last_run_at = now()`,
        [userId]
      );
    } finally {
      client.release();
    }
  } catch (err) {
    logStateOp("tombstone_gc", userId, { error: err?.message || "unknown" });
  }
}

export { gcTombstones, gcStateExpiredTombstones, TOMBSTONE_RETENTION_MS };

export default router;
