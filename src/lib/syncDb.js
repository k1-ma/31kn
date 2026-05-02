import { useEffect, useRef, useState, useCallback } from "react";
import { apiJson } from "@/lib/api.js";
import { clampNum } from "@/lib/utils.js";
import {
  getPayloadSize,
  formatBytes,
  MAX_CHUNK_SIZE_BYTES,
  sendFullStateChunked,
  countBase64Images,
  getBase64ImageSize,
} from "@/lib/syncChunked.js";
import { isDeleted, withoutDeletedAt } from "@/lib/tombstones.js";
import { idbStorage } from "@/lib/idbStorage.js";

// Re-export so existing `import { isDeleted } from "@/lib/syncDb.js"` still works
export { isDeleted, withoutDeletedAt };

// Performance helpers for dev diagnostics
const IS_DEV = process.env.NODE_ENV === "development";

// ─────────────────────────────────────────────────────────────────────────────
// MONOTONIC TIMESTAMPS
// Date.now() can return the same millisecond twice in a row (or even go
// backwards if the system clock is adjusted).  For fields like updatedAt /
// createdAt / deletedAt, equal timestamps make merge ordering ambiguous.
// monoNow() guarantees strictly-increasing values within the lifetime of
// this module while staying close to wall-clock time.
// ─────────────────────────────────────────────────────────────────────────────
let _monoLastTs = 0;
export function monoNow() {
  const now = Date.now();
  _monoLastTs = Math.max(_monoLastTs + 1, now);
  return _monoLastTs;
}

// Normalize an id value to a stable string key for Map/object lookups.
// Without this, Map.get("123") !== Map.get(123) and items can be duplicated
// across local/server arrays when the id types diverge.
const idKey = (id) => (id == null ? "" : String(id));

// True when the page is in a hidden tab. Browsers (Chrome/Edge in particular)
// throttle timers and may pause/abort background fetches in hidden tabs,
// which produces spurious AbortError/NETWORK_ERROR results from /api/ping
// and /api/state that are not actually connectivity problems. We use this
// to skip periodic pings and debounced syncs while hidden — the sync layer
// catches up immediately when the tab becomes visible again.
const isTabHidden = () =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

// ─────────────────────────────────────────────────────────────────────────────
// SERVER REACHABILITY HEARTBEAT
// Periodic ping to actual server endpoint to detect VPN/DPI blocking
// ─────────────────────────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const PING_TIMEOUT_MS = 5000;
const PING_RETRY_ATTEMPTS = 1; // Number of additional retry attempts after first failure
const PING_RETRY_DELAY_MS = 1500; // Wait 1.5s between retries

/**
 * Single ping attempt to the server.
 * Returns { ok: true } on success, or { ok: false, reason } on failure.
 */
async function pingOnce() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch("/api/ping", {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok ? { ok: true } : { ok: false, reason: "server_error", status: res.status };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") return { ok: false, reason: "timeout" };
    return { ok: false, reason: "network" };
  }
}

/**
 * Ping the server to verify connectivity before attempting a heavy sync.
 * Retries once on transient failure to avoid false sync errors.
 * Returns { ok: true } on success, or { ok: false, reason } on failure.
 */
async function pingServer() {
  if (!navigator.onLine) return { ok: false, reason: "offline" };

  const result = await pingOnce();
  if (result.ok) return result;

  // Retry for transient failures (network blip, slow response)
  let lastResult = result;
  for (let attempt = 0; attempt < PING_RETRY_ATTEMPTS; attempt++) {
    if (!navigator.onLine) return { ok: false, reason: "offline" };
    await new Promise((r) => setTimeout(r, PING_RETRY_DELAY_MS));
    lastResult = await pingOnce();
    if (lastResult.ok) return lastResult;
  }

  return lastResult;
}

/**
 * Classify a sync/fetch error into a category for UI messages.
 * Returns one of: "network" | "timeout" | "auth" | "server" | "unknown"
 */
function classifySyncError(err) {
  if (!err) return "unknown";
  const status = err.status ?? 0;
  if (err.name === "AbortError" || err.name === "TimeoutError" || err.code === "CHUNK_TIMEOUT") return "timeout";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "server";
  if (status === 0 || err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) return "network";
  return "unknown";
}

// State size threshold for performance warnings (in KB)
const STATE_SIZE_WARNING_KB = 900;

// Maximum PATCH payload size before falling back to PUT (in KB)
// PATCH is more efficient for small changes, but if the diff is very large,
// PUT may be simpler and more reliable. 500KB is a reasonable threshold.
const MAX_PATCH_SIZE_KB = 500;

// Maximum payload size before using chunked sync (in bytes)
// Vercel allows 4.5MB (Hobby) / 6MB (Pro) per request body.
// Set to 3.0MB to leave headroom for HTTP/JSON overhead, base64 expansion,
// and unforeseen growth between size measurement and actual upload.
// This means most users (< 50 trades with images) will use a fast
// single PUT request instead of slow multi-chunk uploads.
const MAX_SINGLE_REQUEST_SIZE_BYTES = 3 * 1024 * 1024;
// Vercel hard limit (4.5MB Hobby plan).  Above this size even chunked sync
// is doomed if individual chunks exceed the limit; we log an error so the
// user/operator can investigate.
const VERCEL_HARD_LIMIT_BYTES = 4.5 * 1024 * 1024;

// Data loss protection thresholds (shared with server)
const MIN_RECORDS_FOR_PROTECTION = 10; // Minimum records count to enable percentage-based protection for any collection
const MAX_ACCEPTABLE_DROP_PERCENTAGE = 0.5; // Maximum allowed data loss (50%) before blocking sync

// Outbox key prefix for pending sync operations
const OUTBOX_KEY_PREFIX = "tradecrm:outbox:";
// Last synced state key prefix
const LAST_SYNCED_KEY_PREFIX = "tradecrm:lastSynced:";
// Last local save timestamp key prefix
const LAST_LOCAL_SAVE_KEY_PREFIX = "tradecrm:lastLocalSave:";
// Server version key prefix for optimistic concurrency control
const SERVER_VERSION_KEY_PREFIX = "tradecrm:serverVersion:";
// Sync progress key prefix
const SYNC_PROGRESS_KEY_PREFIX = "tradecrm:syncProgress:";

// Current schema version for outbox entries and local cache (BUG #10).
// Bump this when the state schema changes (field added/removed/renamed).
// Old outbox entries with a lower version are migrated before use.
const CURRENT_SCHEMA_VERSION = 1;

/**
 * Check if a state object has meaningful user data (not just an empty seed).
 * Used to decide whether state is worth saving to localStorage and whether
 * to consider in-memory state as a merge source during initial load.
 */
function hasMeaningfulData(state) {
  if (!state) return false;
  return (Array.isArray(state.trades) && state.trades.length > 0) ||
         (Array.isArray(state.accounts) && state.accounts.length > 0) ||
         (Array.isArray(state.documents) && state.documents.length > 0);
}

function perfMark(label) {
  if (IS_DEV && typeof performance !== "undefined") {
    performance.mark(label);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE SCHEMA MIGRATIONS (BUG #10)
// Registered migrations run in order on outbox/cached state written by
// older schema versions. Each migration is a pure function:
//   (state) => migratedState
// The key is the target version (migration runs when fromVersion < key).
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATIONS = {
  // Example: version 2 migration (uncomment and add when schema changes):
  // 2: (state) => { /* transform state from v1 → v2 */ return state; },
};

/**
 * Run all applicable migrations on a state object from `fromVersion` up
 * to `CURRENT_SCHEMA_VERSION`.
 */
function migrateState(state, fromVersion) {
  let current = state;
  for (let v = fromVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    if (typeof MIGRATIONS[v] === "function") {
      try {
        current = MIGRATIONS[v](current);
        if (IS_DEV) {
          console.log(`[syncDb] Migrated state from schema v${v - 1} → v${v}`);
        }
      } catch (e) {
        console.error(`[syncDb] Migration v${v} failed:`, e?.message);
        // Return the partially-migrated state — better than losing everything
        return current;
      }
    }
  }
  return current;
}

function perfMeasure(label, startMark, endMark) {
  if (IS_DEV && typeof performance !== "undefined") {
    try {
      performance.measure(label, startMark, endMark);
      const entries = performance.getEntriesByName(label, "measure");
      const duration = entries[entries.length - 1]?.duration ?? 0;
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(label);
      return duration;
    } catch {
      return 0;
    }
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL STORAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synchronously save state to localStorage as immediate fallback,
 * then asynchronously save to IndexedDB (which has 50MB+ quota).
 * BUG #4 FIX: On localStorage quota exceeded, IDB is the primary store.
 *
 * @param {string} userId
 * @param {object} state
 * @param {Function} [setLastLocalSaveAt] - State setter for last save timestamp
 */
function saveToLocalStorageSync(userId, state, setLastLocalSaveAt) {
  if (!userId || state === undefined) return false;
  try {
    const json = JSON.stringify(state);
    const sizeKb = Math.round(json.length / 1024);
    
    // Fire-and-forget IDB save (async, won't block UI)
    idbStorage.saveWithFallback(`tradecrm:user:${userId}`, state, {
      onQuotaExceeded: (store) => {
        console.error(
          `[syncDb] CRITICAL: ${store} quota exceeded — please export your data.`
        );
      },
    }).catch(() => {}); // Best-effort

    try {
      localStorage.setItem(`tradecrm:user:${userId}`, json);
      localStorage.setItem(`${LAST_LOCAL_SAVE_KEY_PREFIX}${userId}`, new Date().toISOString());
      if (typeof setLastLocalSaveAt === "function") setLastLocalSaveAt(new Date());
      
      if (IS_DEV) {
        console.log("[syncDb] Local save (sync):", { sizeKb });
      }
      return true;
    } catch (quotaError) {
      // localStorage quota exceeded - try to recover
      if (IS_DEV) {
        console.warn("[syncDb] localStorage quota exceeded:", quotaError?.message, "- IDB save is in progress");
      }
      
      // Try to clear old lastSynced state (it's a duplicate) to free space
      try {
        localStorage.removeItem(`${LAST_SYNCED_KEY_PREFIX}${userId}`);
        
        // Retry the save
        localStorage.setItem(`tradecrm:user:${userId}`, json);
        localStorage.setItem(`${LAST_LOCAL_SAVE_KEY_PREFIX}${userId}`, new Date().toISOString());
        if (typeof setLastLocalSaveAt === "function") setLastLocalSaveAt(new Date());
        
        if (IS_DEV) {
          console.log("[syncDb] Local save succeeded after clearing lastSynced cache");
        }
        return true;
      } catch {
        // localStorage failed completely — IDB is primary now
        console.warn(
          "[syncDb] localStorage save failed — relying on IndexedDB. " +
          `State size: ${sizeKb}KB.`
        );
        
        // The IDB save was already fired above, so data should be safe
        return false;
      }
    }
  } catch (e) {
    if (IS_DEV) {
      console.warn("[syncDb] localStorage sync write failed:", e?.message);
    }
    return false;
  }
}

/**
 * Get last local save timestamp
 */
function getLastLocalSaveTime(userId) {
  try {
    const ts = localStorage.getItem(`${LAST_LOCAL_SAVE_KEY_PREFIX}${userId}`);
    return ts ? new Date(ts) : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTBOX HELPERS - Queue for failed server syncs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a UUID v4 for the Idempotency-Key header. Returns null when
 * crypto.randomUUID is unavailable; the server middleware passes the
 * request through when the header is missing, so callers degrade safely.
 */
function newIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {}
  return null;
}

/**
 * Save pending state to outbox when server sync fails.
 *
 * @param {string} userId
 * @param {object} state - Latest in-memory state to retry
 * @param {object} errorInfo - { status, code, message }
 * @param {string|null} idempotencyKey - Reused on every retry of this
 *   logical save, so the server's idempotency middleware dedupes replays
 *   that may have already reached the DB. Pass null for legacy callers;
 *   retryOutbox() will then run without a key (server still accepts).
 */
function saveToOutbox(userId, state, errorInfo = {}, idempotencyKey = null) {
  if (!userId) return;
  try {
    const outbox = {
      state,
      timestamp: new Date().toISOString(),
      error: errorInfo,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      idempotencyKey,
    };
    localStorage.setItem(`${OUTBOX_KEY_PREFIX}${userId}`, JSON.stringify(outbox));
    if (IS_DEV) {
      console.log("[syncDb] Saved to outbox:", { timestamp: outbox.timestamp, error: errorInfo.code, schemaVersion: CURRENT_SCHEMA_VERSION, hasKey: !!idempotencyKey });
    }
  } catch (e) {
    if (IS_DEV) {
      console.warn("[syncDb] Failed to save to outbox:", e?.message);
    }
  }
}

/**
 * Get pending state from outbox.
 * If the outbox entry was written by an older schema version, run
 * registered migrations before returning the data (BUG #10).
 */
function getOutbox(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${OUTBOX_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    let outbox = JSON.parse(raw);
    // Migrate if schema version is older than current
    if (outbox && typeof outbox.schemaVersion === "number" && outbox.schemaVersion < CURRENT_SCHEMA_VERSION) {
      outbox.state = migrateState(outbox.state, outbox.schemaVersion);
      outbox.schemaVersion = CURRENT_SCHEMA_VERSION;
      // Re-save the migrated outbox entry. If persisting fails (e.g. quota
      // exceeded), keep the in-memory migrated copy so the caller can still
      // sync pending changes this session. The original raw entry stays in
      // localStorage as a fallback for the next load — migrations are
      // idempotent (loop over fromVersion+1..CURRENT) so re-running is safe.
      try {
        localStorage.setItem(`${OUTBOX_KEY_PREFIX}${userId}`, JSON.stringify(outbox));
      } catch (e) {
        console.warn("[sync] outbox migration persist failed; keeping in-memory copy", e);
      }
    }
    return outbox;
  } catch {
    return null;
  }
}

/**
 * Clear outbox after successful sync
 */
function clearOutbox(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(`${OUTBOX_KEY_PREFIX}${userId}`);
    if (IS_DEV) {
      console.log("[syncDb] Outbox cleared");
    }
  } catch {}
}

/**
 * Check if there are pending changes in outbox
 */
function hasOutbox(userId) {
  if (!userId) return false;
  try {
    return !!localStorage.getItem(`${OUTBOX_KEY_PREFIX}${userId}`);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LAST SYNCED STATE - For computing diffs
// ─────────────────────────────────────────────────────────────────────────────

function getLastSyncedState(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${LAST_SYNCED_KEY_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLastSyncedState(userId, state) {
  if (!userId) return;
  try {
    localStorage.setItem(`${LAST_SYNCED_KEY_PREFIX}${userId}`, JSON.stringify(state));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER VERSION - For optimistic concurrency control
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the last known server version for this user
 */
function getServerVersion(userId) {
  if (!userId) return 0;
  try {
    const raw = localStorage.getItem(`${SERVER_VERSION_KEY_PREFIX}${userId}`);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Set the server version after successful sync
 */
function setServerVersion(userId, version) {
  if (!userId) return;
  try {
    localStorage.setItem(`${SERVER_VERSION_KEY_PREFIX}${userId}`, String(version));
  } catch {}
}

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

const IMAGE_STRIPPED = "[IMAGE_STRIPPED]";

/**
 * Restore [IMAGE_STRIPPED] placeholders in the "winner" from the "donor" item.
 * Called during merge when the selected trade has stripped images but the other
 * version has real base64 data. Prevents chunked-sync stripping from propagating
 * back into local state.
 */
function restoreTradeImages(winner, donor) {
  if (!winner || !donor) return winner;

  // Restore images array
  if (Array.isArray(winner.images) && Array.isArray(donor.images)) {
    const donorById = new Map();
    for (const img of donor.images) {
      if (img && img.id) donorById.set(idKey(img.id), img);
    }
    let anyRestored = false;
    const restored = winner.images.map((img) => {
      if (img && img.dataUrl === IMAGE_STRIPPED && img.id) {
        const real = donorById.get(idKey(img.id));
        if (real && real.dataUrl && real.dataUrl !== IMAGE_STRIPPED) {
          anyRestored = true;
          return { ...img, dataUrl: real.dataUrl };
        }
      }
      return img;
    });
    if (anyRestored) {
      winner = { ...winner, images: restored };
    }
  }

  // Restore top-level string fields (e.g. screenshot, avatar, headerImage)
  for (const key of Object.keys(winner)) {
    if (winner[key] === IMAGE_STRIPPED && donor[key] && donor[key] !== IMAGE_STRIPPED) {
      winner = { ...winner, [key]: donor[key] };
    }
  }

  return winner;
}

/**
 * Merge local and server trades arrays by ID with timestamp-based conflict resolution.
 * The newer version (by updatedAt/createdAt) wins for each trade ID.
 * Local-only trades are always preserved.
 * Server-only trades are only preserved on initial load (to support multi-device sync).
 * 
 * @param {Array} localTrades - Local trades array
 * @param {Array} serverTrades - Server trades array
 * @param {boolean} isInitialLoad - If true, preserve server-only items. If false, ignore them.
 */
function mergeTradesArrays(localTrades, serverTrades, isInitialLoad = false, serverVersionChanged = false) {
  if (!Array.isArray(localTrades) && !Array.isArray(serverTrades)) {
    return serverTrades ?? localTrades ?? [];
  }
  if (!Array.isArray(localTrades)) return serverTrades || [];
  if (!Array.isArray(serverTrades)) return localTrades || [];
  
  // Create a map of server trades by ID (normalized to string).
  const serverTradesMap = new Map();
  for (const trade of serverTrades) {
    if (trade && trade.id) {
      serverTradesMap.set(idKey(trade.id), trade);
    }
  }

  // Create a map of local trades by ID (normalized to string).
  const localTradesMap = new Map();
  for (const trade of localTrades) {
    if (trade && trade.id) {
      localTradesMap.set(idKey(trade.id), trade);
    }
  }

  // Merge: prefer newer version based on timestamp
  const mergedMap = new Map();

  // Process all unique IDs
  const allIds = new Set([...serverTradesMap.keys(), ...localTradesMap.keys()]);

  for (const id of allIds) {
    const serverTrade = serverTradesMap.get(id);
    const localTrade = localTradesMap.get(id);
    
    if (!serverTrade) {
      // Local-only trade - always preserve (might be newly created)
      mergedMap.set(id, localTrade);
      if (IS_DEV) {
        console.log("[syncDb] Preserving local-only trade:", id);
      }
    } else if (!localTrade) {
      // Server-only trade — always preserve.
      // An item is considered deleted only when local has a tombstone
      // (deletedAt > 0) for that id.  Never drop silently just because
      // local does not contain an id — it may have been added by another
      // device or lost from local cache due to quota errors.
      mergedMap.set(id, serverTrade);
      if (IS_DEV) {
        console.log("[syncDb] Preserving server-only trade (no local tombstone):", id);
      }
    } else {
      // Both exist - compare timestamps
      const serverTimestamp = getItemTimestamp(serverTrade);
      const localTimestamp = getItemTimestamp(localTrade);
      
      let mergedTrade;
      if (serverTimestamp > localTimestamp) {
        // Server is newer - use server as base
        mergedTrade = serverTrade;
        if (IS_DEV) {
          console.log("[syncDb] Server trade is newer:", id, { localTs: localTimestamp, serverTs: serverTimestamp });
        }
      } else {
        // Local is newer or same age (local wins ties) - use local as base
        mergedTrade = localTrade;
        if (IS_DEV) {
          console.log("[syncDb] Local trade is newer or same age:", id, { localTs: localTimestamp, serverTs: serverTimestamp });
        }
      }

      // Restore any [IMAGE_STRIPPED] placeholders from the other version.
      // The chunked sync may strip base64 images from large chunks before
      // sending to the server. When the server state comes back with
      // [IMAGE_STRIPPED], restore real images from the local version.
      const loser = mergedTrade === serverTrade ? localTrade : serverTrade;
      mergedTrade = restoreTradeImages(mergedTrade, loser);
      
      // CRITICAL: Preserve deletedAt status across versions
      // If either version has deletedAt, use the most recent deletion timestamp.
      //
      // EXCEPTION: When serverVersionChanged is true (admin restore, another device),
      // the server state was explicitly modified. If the server trade does NOT have
      // deletedAt but the local trade DOES, the admin/device intentionally un-deleted
      // the trade. In that case, respect the server and remove deletedAt.
      //
      // Without serverVersionChanged: a user's local deletion (deletedAt set before
      // the debounce or beacon could reach the server) must survive page reloads
      // regardless of whether the server already knows about it.
      const serverDeletedAt = (typeof serverTrade?.deletedAt === 'number' && serverTrade.deletedAt > 0) ? serverTrade.deletedAt : null;
      const localDeletedAt = (typeof localTrade?.deletedAt === 'number' && localTrade.deletedAt > 0) ? localTrade.deletedAt : null;
      
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        // Server was explicitly modified and un-deleted this trade → respect server
        if (serverVersionChanged && serverDeletedAt === null && localDeletedAt !== null) {
          mergedTrade = withoutDeletedAt(mergedTrade);
          if (IS_DEV) {
            console.log("[syncDb] Removing local deletedAt — server version changed and trade was un-deleted:", id);
          }
        } else {
          const maxDeletedAt = Math.max(
            serverDeletedAt ?? 0,
            localDeletedAt ?? 0
          );
          mergedTrade = { ...mergedTrade, deletedAt: maxDeletedAt };
          if (IS_DEV) {
            console.log("[syncDb] Preserving deletedAt status:", id, { deletedAt: mergedTrade.deletedAt, isInitialLoad, serverVersionChanged });
          }
        }
      } else if (mergedTrade.deletedAt !== undefined && !(typeof mergedTrade.deletedAt === 'number' && mergedTrade.deletedAt > 0)) {
        // Neither version has a valid deletedAt, but mergedTrade might have deletedAt: 0 or invalid value
        // Remove it to prevent treating the trade as deleted
        mergedTrade = withoutDeletedAt(mergedTrade);
        if (IS_DEV) {
          console.log("[syncDb] Removing invalid deletedAt:", id, { deletedAt });
        }
      }
      
      mergedMap.set(id, mergedTrade);
    }
  }
  
  return Array.from(mergedMap.values());
}

// Tolerance for equity comparison — below this delta we skip updating
const EQUITY_TOLERANCE = 0.01;

/**
 * Reconcile derived field accounts.currentEquity after a merge.
 * Re-computes currentEquity = startingEquity + Σ(pnl − |commission|) for
 * every non-deleted trade allocation that references the account.
 * Mutates state.accounts in-place for efficiency and returns the same state.
 */
function reconcileAccountsEquity(state) {
  const trades   = Array.isArray(state?.trades)   ? state.trades   : [];
  const accounts = Array.isArray(state?.accounts)  ? state.accounts  : [];
  if (accounts.length === 0) return state;

  // Sum net PnL per accountId from non-deleted trades
  const netByAccount = new Map();
  for (const t of trades) {
    if (isDeleted(t)) continue;
    const allocs = Array.isArray(t.allocations) ? t.allocations : [];
    for (const a of allocs) {
      if (!a?.accountId) continue;
      const key = idKey(a.accountId);
      const net = clampNum(a.pnl) - Math.abs(clampNum(a.commission));
      netByAccount.set(key, (netByAccount.get(key) || 0) + net);
    }
  }

  // Update each non-deleted account's currentEquity when it drifts > 0.01
  state.accounts = accounts.map((acc) => {
    if (!acc?.id || isDeleted(acc)) return acc;
    const startEq   = clampNum(acc.startingEquity);
    const tradePnl   = netByAccount.get(idKey(acc.id)) || 0;
    const calculated = startEq + tradePnl;
    let correction   = clampNum(acc.equityCorrection);

    // equityCorrection is a fixed offset set when the user creates/edits the account
    // with a currentEquity different from startingEquity.  It represents an initial
    // deficit or surplus before trade tracking began and must NOT be recalculated
    // when trades change — otherwise the balance would be pinned to its old value.

    const expected = calculated + correction;
    const actual   = clampNum(acc.currentEquity);
    if (acc.currentEquity == null || Math.abs(expected - actual) > EQUITY_TOLERANCE) {
      if (IS_DEV) {
        console.warn(
          `[syncDb] Reconciliation: Account "${acc.name || acc.id}" equity ` +
          `expected=${expected.toFixed(2)} actual=${actual.toFixed(2)}. Fixing.`
        );
      }
      return { ...acc, currentEquity: expected, equityCorrection: correction };
    }
    // Persist updated equityCorrection even when currentEquity did not change
    if (Math.abs(correction - clampNum(acc.equityCorrection)) > EQUITY_TOLERANCE) {
      return { ...acc, equityCorrection: correction };
    }
    return acc;
  });

  return state;
}

/**
 * Merge local and server state, ensuring no trades are lost.
 * Uses ID-based merge for trades array.
 * 
 * @param {object} localState - Local state with potentially unsynced changes
 * @param {object} serverState - Server state fetched from API
 * @param {boolean} isInitialLoad - If true, preserve server-only items (from other devices).
 *                                   If false, don't restore server-only items (they were deleted).
 * @param {boolean} serverVersionChanged - If true, server was externally modified (admin restore,
 *                                          another device). Items un-deleted on the server will
 *                                          have their local deletedAt removed.
 */
function mergeStates(localState, serverState, isInitialLoad = false, serverVersionChanged = false) {
  if (!serverState) return localState;
  if (!localState) return serverState;
  
  // CRITICAL SAFETY CHECK: If server state looks corrupted (empty when it shouldn't be),
  // prefer local state to prevent data loss
  const serverTradeCount = serverState?.trades?.length ?? 0;
  const localTradeCount = localState?.trades?.length ?? 0;
  
  if (serverTradeCount === 0 && localTradeCount > 0 && !isInitialLoad) {
    console.warn(
      "[syncDb] Server returned empty trades when local has data - " +
      "preferring local to prevent data loss. Local trades:", localTradeCount
    );
    // Return local state with server's version info to maintain sync
    return {
      ...localState,
      version: serverState.version
    };
  }
  
  const merged = { ...serverState };
  
  // Merge trades array specially to prevent data loss
  if (localState.trades || serverState.trades) {
    merged.trades = mergeTradesArrays(localState.trades, serverState.trades, isInitialLoad, serverVersionChanged);
    if (IS_DEV) {
      console.log("[syncDb] Merged trades:", {
        local: localState.trades?.length ?? 0,
        server: serverState.trades?.length ?? 0,
        merged: merged.trades?.length ?? 0,
        isInitialLoad
      });
    }
    
    // Additional validation: verify merge didn't lose data
    const mergedCount = merged.trades?.length ?? 0;
    if (mergedCount < localTradeCount && mergedCount < serverTradeCount) {
      console.error(
        "[syncDb] MERGE ERROR: Result has fewer trades than both inputs! " +
        `Local: ${localTradeCount}, Server: ${serverTradeCount}, Merged: ${mergedCount}`
      );
      // Emergency fallback: use whichever has more data
      merged.trades = localTradeCount >= serverTradeCount 
        ? (localState.trades || [])
        : (serverState.trades || []);
    }
  }
  
  // Merge accounts array similarly
  if (localState.accounts || serverState.accounts) {
    merged.accounts = mergeArraysById(localState.accounts, serverState.accounts, isInitialLoad, serverVersionChanged);
  }
  
  // Merge UI settings - prefer local settings (theme, language, etc.)
  // Local UI preferences should take precedence over server
  if (localState.ui || serverState.ui) {
    merged.ui = { ...serverState.ui, ...localState.ui };
  }
  
  // Merge libraries (symbols/pairs, sessions, models, customTags) to prevent
  // deleted items from restoring and to preserve locally added items
  if (localState.libraries || serverState.libraries) {
    const localLib = localState.libraries ?? {};
    const serverLib = serverState.libraries ?? {};
    merged.libraries = {
      ...serverLib,
      symbols: mergeArraysById(localLib.symbols, serverLib.symbols, isInitialLoad, serverVersionChanged),
      sessions: mergeArraysById(localLib.sessions, serverLib.sessions, isInitialLoad, serverVersionChanged),
      models: mergeArraysById(localLib.models, serverLib.models, isInitialLoad, serverVersionChanged),
      customTags: mergeArraysById(localLib.customTags, serverLib.customTags, isInitialLoad, serverVersionChanged),
    };
  }
  
  // Merge documents to prevent data loss (new documents disappearing)
  if (localState.documents || serverState.documents) {
    merged.documents = mergeArraysById(localState.documents, serverState.documents, isInitialLoad, serverVersionChanged);
  }
  
  // Merge docFolders and docShares similarly
  if (localState.docFolders || serverState.docFolders) {
    merged.docFolders = mergeArraysById(localState.docFolders, serverState.docFolders, isInitialLoad, serverVersionChanged);
  }
  if (localState.docShares || serverState.docShares) {
    merged.docShares = mergeArraysById(localState.docShares, serverState.docShares, isInitialLoad, serverVersionChanged);
  }
  
  // Merge backtests array to prevent data loss (new backtest trades disappearing)
  // Each backtest has its own trades array that needs to be merged independently
  if (localState.backtests || serverState.backtests) {
    merged.backtests = mergeBacktestsArray(localState.backtests, serverState.backtests, isInitialLoad, serverVersionChanged);
  }
  
  // Reconcile derived equity after merge so deleted/restored trades are reflected
  reconcileAccountsEquity(merged);

  return merged;
}

/**
 * Generic merge for arrays with id property using timestamp-based conflict resolution
 * The newer version (by updatedAt/createdAt) wins for each ID
 * 
 * @param {Array} localArr - Local array
 * @param {Array} serverArr - Server array
 * @param {boolean} isInitialLoad - If true, preserve server-only items. If false, ignore them.
 * @param {boolean} serverVersionChanged - If true, server was externally modified (admin restore).
 */
function mergeArraysById(localArr, serverArr, isInitialLoad = false, serverVersionChanged = false) {
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
      // Local-only item - always preserve
      mergedMap.set(id, localItem);
    } else if (!localItem) {
      // Server-only item — always preserve.
      // An item is considered deleted only when local has a tombstone
      // (deletedAt > 0) for that id.  Never drop silently.
      mergedMap.set(id, serverItem);
      // Otherwise ignore (was deleted locally)
    } else {
      // Both exist - compare timestamps
      const serverTimestamp = getItemTimestamp(serverItem);
      const localTimestamp = getItemTimestamp(localItem);
      
      let mergedItem;
      if (serverTimestamp > localTimestamp) {
        // Server is newer - use server as base
        mergedItem = serverItem;
      } else {
        // Local is newer or same age (local wins ties) - use local as base
        mergedItem = localItem;
      }

      // Restore [IMAGE_STRIPPED] placeholders from the other version
      const donor = mergedItem === serverItem ? localItem : serverItem;
      mergedItem = restoreTradeImages(mergedItem, donor);
      
      // CRITICAL: Preserve deletedAt status across versions
      // Use the most recent deletedAt unless serverVersionChanged indicates
      // the server explicitly un-deleted the item (admin restore / another device).
      const serverDeletedAt = (typeof serverItem?.deletedAt === 'number' && serverItem.deletedAt > 0) ? serverItem.deletedAt : null;
      const localDeletedAt = (typeof localItem?.deletedAt === 'number' && localItem.deletedAt > 0) ? localItem.deletedAt : null;
      
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        if (serverVersionChanged && serverDeletedAt === null && localDeletedAt !== null) {
          // Server was explicitly modified and un-deleted this item → respect server
          mergedItem = withoutDeletedAt(mergedItem);
        } else {
          const maxDeletedAt = Math.max(
            serverDeletedAt ?? 0,
            localDeletedAt ?? 0
          );
          mergedItem = { ...mergedItem, deletedAt: maxDeletedAt };
        }
      } else if (mergedItem.deletedAt !== undefined && !(typeof mergedItem.deletedAt === 'number' && mergedItem.deletedAt > 0)) {
        // Neither version has a valid deletedAt, but mergedItem might have deletedAt: 0 or invalid value
        // Remove it to prevent treating the item as deleted
        mergedItem = withoutDeletedAt(mergedItem);
      }
      
      mergedMap.set(id, mergedItem);
    }
  }
  
  return Array.from(mergedMap.values());
}

/**
 * Merge backtests arrays with special handling for nested trades arrays.
 * Each backtest has its own trades array that needs to be merged independently.
 * 
 * @param {Array} localArr - Local backtests array
 * @param {Array} serverArr - Server backtests array
 * @param {boolean} isInitialLoad - If true, preserve server-only items. If false, ignore them.
 * @param {boolean} serverVersionChanged - If true, server was externally modified (admin restore).
 */
function mergeBacktestsArray(localArr, serverArr, isInitialLoad = false, serverVersionChanged = false) {
  if (!Array.isArray(localArr) && !Array.isArray(serverArr)) {
    return serverArr ?? localArr ?? [];
  }
  if (!Array.isArray(localArr)) return serverArr || [];
  if (!Array.isArray(serverArr)) return localArr || [];
  
  const serverMap = new Map();
  for (const backtest of serverArr) {
    if (backtest && backtest.id) {
      serverMap.set(idKey(backtest.id), backtest);
    }
  }

  const localMap = new Map();
  for (const backtest of localArr) {
    if (backtest && backtest.id) {
      localMap.set(idKey(backtest.id), backtest);
    }
  }

  // Merge: prefer newer version based on timestamp, but also merge trades arrays
  const mergedMap = new Map();
  const allIds = new Set([...serverMap.keys(), ...localMap.keys()]);

  for (const id of allIds) {
    const serverBacktest = serverMap.get(id);
    const localBacktest = localMap.get(id);
    
    if (!serverBacktest) {
      // Local-only backtest - always preserve
      mergedMap.set(id, localBacktest);
    } else if (!localBacktest) {
      // Server-only backtest — always preserve.
      // An item is considered deleted only when local has a tombstone
      // (deletedAt > 0) for that id.  Never drop silently.
      mergedMap.set(id, serverBacktest);
      // Otherwise ignore (was deleted locally)
    } else {
      // Both exist - compare timestamps and merge trades
      const serverTimestamp = getItemTimestamp(serverBacktest);
      const localTimestamp = getItemTimestamp(localBacktest);
      
      let mergedBacktest;
      if (serverTimestamp > localTimestamp) {
        // Server metadata is newer - use server as base
        mergedBacktest = { ...serverBacktest };
      } else {
        // Local metadata is newer or same age - use local as base (local wins ties)
        mergedBacktest = { ...localBacktest };
      }
      
      // CRITICAL: Always merge trades arrays independently of backtest timestamp
      // This prevents loss of newly added trades even if the backtest metadata is older
      if (localBacktest.trades || serverBacktest.trades) {
        mergedBacktest.trades = mergeTradesArrays(
          localBacktest.trades,
          serverBacktest.trades,
          isInitialLoad,
          serverVersionChanged
        );
        
        // Recalculate backtest account equity based on merged trades
        // to ensure it stays consistent with the trade history
        if (mergedBacktest.trades && mergedBacktest.account) {
          const totalPnl = mergedBacktest.trades
            .filter(t => !isDeleted(t))
            .reduce((sum, t) => {
              const allocs = Array.isArray(t.allocations) ? t.allocations : [];
              return sum + allocs.reduce((s, a) => 
                s + (Number(a?.pnl) || 0) - Math.abs(Number(a?.commission) || 0), 0
              );
            }, 0);
          
          const initialEquity = mergedBacktest.account.initialEquity || mergedBacktest.initialEquity || 0;
          mergedBacktest.account = {
            ...mergedBacktest.account,
            currentEquity: initialEquity + totalPnl
          };
        }
      }
      
      // CRITICAL: Preserve deletedAt status across versions
      // If either version has deletedAt, use the most recent deletion timestamp.
      // EXCEPTION: When serverVersionChanged is true and server un-deleted the
      // backtest (admin restore), respect the server and remove local deletedAt.
      const serverDeletedAt = (typeof serverBacktest?.deletedAt === 'number' && serverBacktest.deletedAt > 0) ? serverBacktest.deletedAt : null;
      const localDeletedAt = (typeof localBacktest?.deletedAt === 'number' && localBacktest.deletedAt > 0) ? localBacktest.deletedAt : null;
      
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        if (serverVersionChanged && serverDeletedAt === null && localDeletedAt !== null) {
          // Server was explicitly modified and un-deleted this backtest → respect server
          mergedBacktest = withoutDeletedAt(mergedBacktest);
        } else {
          const maxDeletedAt = Math.max(
            serverDeletedAt ?? 0,
            localDeletedAt ?? 0
          );
          mergedBacktest = { ...mergedBacktest, deletedAt: maxDeletedAt };
        }
      } else if (mergedBacktest.deletedAt !== undefined && !(typeof mergedBacktest.deletedAt === 'number' && mergedBacktest.deletedAt > 0)) {
        // Neither version has a valid deletedAt, but mergedBacktest might have deletedAt: 0 or invalid value
        // Remove it to prevent treating the backtest as deleted
        mergedBacktest = withoutDeletedAt(mergedBacktest);
      }
      
      mergedMap.set(id, mergedBacktest);
    }
  }
  
  return Array.from(mergedMap.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH COMPUTATION - Compute minimal diff for PATCH requests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a shallow patch (top-level keys only) between old and new state
 * Returns null if states are identical, or { patch, patchKeys }
 */
/**
 * Compute a shallow patch (top-level keys only) between old and new state.
 * Returns null if states are identical, or { patch, patchKeys, isFull }.
 * 
 * Note: Uses JSON.stringify for deep equality comparison at the top-level key values.
 * This is acceptable for our use case since we only compare a few top-level keys
 * (trades, accounts, settings, etc.) and the serialization happens during the
 * debounced save anyway. For very large state, consider a more efficient deep-equal
 * implementation or hash-based comparison.
 */
function computeShallowPatch(oldState, newState) {
  if (!oldState || !newState) return { patch: newState, patchKeys: Object.keys(newState || {}), isFull: true };
  
  const patch = {};
  const patchKeys = [];
  
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);
  
  for (const key of allKeys) {
    const oldVal = oldState[key];
    const newVal = newState[key];
    
    // Quick check: if references are same, skip (handles primitives and unchanged objects)
    if (oldVal === newVal) continue;
    
    // Compare JSON serialization for deep equality at top-level values
    const oldJson = JSON.stringify(oldVal);
    const newJson = JSON.stringify(newVal);
    
    if (oldJson !== newJson) {
      patch[key] = newVal;
      patchKeys.push(key);
    }
  }
  
  if (patchKeys.length === 0) {
    return null; // No changes
  }
  
  return { patch, patchKeys, isFull: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// BEACON/KEEPALIVE SYNC - For page unload
// ─────────────────────────────────────────────────────────────────────────────

// sendBeacon has a ~64KB limit in most browsers
const BEACON_SIZE_LIMIT = 64 * 1024;

/**
 * Attempt to sync state to server using sendBeacon or fetch with keepalive
 * This is used on page unload for best-effort server sync
 */
function syncWithBeacon(userId, state) {
  if (!userId || !navigator.onLine) return;
  
  try {
    const body = JSON.stringify({ state });
    const bodySize = new Blob([body]).size;
    
    // Check if state has changed since last successful sync
    // Skip beacon if state hasn't changed to avoid unnecessary network requests
    const lastSynced = getLastSyncedState(userId);
    if (lastSynced && JSON.stringify(lastSynced) === JSON.stringify(state)) {
      if (IS_DEV) {
        console.log("[syncDb] sendBeacon: skipped (state unchanged since last sync)");
      }
      return;
    }
    
    const url = "/api/state";
    
    // Check payload size before attempting sendBeacon
    if (bodySize > BEACON_SIZE_LIMIT) {
      if (IS_DEV) {
        console.warn("[syncDb] sendBeacon: payload too large:", formatBytes(bodySize), "> 64KB limit");
      }
      // Payload too large for sendBeacon. Save to outbox so changes are retried
      // on next page load. The state is already saved to localStorage in flushOnHide.
      // DO NOT strip images and send — that would replace full-quality server
      // state with [IMAGE_STRIPPED] placeholders, causing permanent image loss
      // on other devices or after cache clear.
      saveToOutbox(userId, state, { code: "BEACON_TOO_LARGE", message: `Payload ${formatBytes(bodySize)} exceeds 64KB beacon limit` });
      return;
    }
    
    // Try sendBeacon first (most reliable for unload)
    // Note: sendBeacon always sends POST requests, server has a POST handler for this
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon(url, blob);
      if (IS_DEV) {
        console.log("[syncDb] sendBeacon:", sent ? "queued" : "failed", formatBytes(bodySize));
      }
      // If sendBeacon succeeded (queued), we're done
      // If it failed (sent=false), fall through to fetch keepalive as backup
      if (sent) return;
    }
    
    // Fallback to fetch with keepalive (also used when sendBeacon fails to queue)
    if (typeof fetch === "function") {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "include",
        keepalive: true,
      }).catch(() => {
        // Ignore errors - best effort
      });
      if (IS_DEV) {
        console.log("[syncDb] fetch keepalive: queued", formatBytes(bodySize));
      }
    }
  } catch (e) {
    if (IS_DEV) {
      console.warn("[syncDb] Beacon sync failed:", e?.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────────────────────────────────────

// Syncs the whole CRM JSON blob to the server per user.
// - Loads once on mount
// - Saves with debounce on any change
// - ALWAYS saves locally, even if unauthorized/offline/error
// - Handles auth failures gracefully without overwriting data
// - Uses outbox for failed syncs, auto-retries on reconnect
// - Flushes to localStorage on page hide/unload
// - Uses PATCH for smaller payloads when possible
// - Uses chunked sync for large payloads (>800KB)
// - Supports fallback to lastKnownUserId when userId is null (read-only mode)
export function useSyncedDb(userId, seed, options = {}) {
  // Support fallback to lastKnownUserId for read-only offline mode
  const { lastKnownUserId } = options;
  const fallbackUserId = !userId && lastKnownUserId ? lastKnownUserId : null;
  const isReadOnly = !!fallbackUserId && !userId;
  
  const [db, setDb] = useState(seed);
  const [syncStatus, setSyncStatus] = useState("loading"); // loading | synced | saving | error | offline | unauthorized | pending
  const [lastError, setLastError] = useState(null); // { code, message, status }
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null); // { current, total, percent } for chunked sync (syncStatus=saving)
  const [isServerReachable, setIsServerReachable] = useState(true); // Server reachability from heartbeat
  const loadedRef = useRef(false);
  const saveTimer = useRef(null);
  const retryTimer = useRef(null);
  const outboxRetryTimer = useRef(null);
  const heartbeatTimer = useRef(null);
  const retryCount = useRef(0);
  const lastChangeTime = useRef(0);
  const changeCount = useRef(0);
  const lastSuccessfulSync = useRef(null); // Timestamp of last successful sync
  const consecutiveFailures = useRef(0); // Count of consecutive sync failures
  const syncInFlight = useRef(false); // Guard against concurrent syncs
  const shareInFlightRef = useRef(false); // Guard: block visibility-change fetchState during share operations
  const justLoadedFromServerRef = useRef(false); // Skip sync-back after fetchState
  const isResettingRef = useRef(false); // Guard: skip save effect during userId-change reset
  const dbRef = useRef(db); // Keep current db in ref for event handlers
  dbRef.current = db;
  // Track syncStatus in a ref so save effect can check it without being a dependency
  const syncStatusRef = useRef(syncStatus);
  syncStatusRef.current = syncStatus;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds
  const DEBOUNCE_FAST_MS = 800; // When user stops typing after a single change
  const DEBOUNCE_SLOW_MS = 1500; // When user is actively making changes
  // Debounce for userId change effect — VPN reconnections can cause rapid
  // userId oscillation (null→id→null→id) within ~100-200ms.  300ms safely
  // absorbs this while staying imperceptible to the user on normal login.
  const USER_CHANGE_DEBOUNCE_MS = 300;
  // Outbox retry: exponential backoff 1s→2s→4s→8s→16s→30s cap, with ±25 % jitter
  const OUTBOX_BASE_DELAY = 1000;
  const OUTBOX_MAX_DELAY = 30000;
  const OUTBOX_MAX_ATTEMPTS = 20; // stop auto-retrying after ~20 attempts; manual retry resets
  const FLUSH_SYNC_TIMEOUT_MS = 30000; // Max wait time for in-flight sync to finish during flushSync
  const FLUSH_SYNC_POLL_MS = 100; // Polling interval when waiting for in-flight sync
  const SHARE_GUARD_DURATION_MS = 10000; // Keep share guard active after share to cover tab-switching
  const outboxAttempt = useRef(0);

  // Fetch state from server with retry logic
  const fetchState = useCallback(async (cancelled, isRetry = false) => {
    if (!isRetry) {
      setSyncStatus("loading");
      retryCount.current = 0;
    }
    
    try {
      const res = await apiJson("/api/state");
      if (cancelled.value) return;
      
      // Check if server responded but DB is down
      // This handles both legacy 200 responses and serves as a safety check
      // (the new 503 responses will be caught by apiJson and throw before reaching here)
      if (res?.db === "down") {
        const err = new Error("Database unavailable");
        err.status = 503;
        err.code = "DB_UNAVAILABLE";
        throw err;
      }
      
      const serverState = res?.state ?? seed;
      const serverVersion = res?.version ?? 0;
      
      // Check if we have local changes that need to be preserved
      const outbox = getOutbox(userId);
      const hasOutboxChanges = !!outbox?.state;
      
      // Determine the local state to merge with server.
      // On a running page use the in-memory state (most current).
      // On initial page load fall through to the localStorage cache below.
      //
      // IMPORTANT: outbox.state is intentionally NOT used as the merge source.
      // The outbox stores a snapshot captured at the moment a past sync failed,
      // so it can be arbitrarily stale. For example: a sync fails (outbox = S1),
      // the user then deletes a backtest (localStorage = S2 with deletedAt),
      // and reloads. If we merge outbox.state (S1, no deletedAt) with the server
      // (also no deletedAt yet), the deletion is lost. The localStorage cache is
      // written synchronously on every state change, so it is always at least as
      // current as the outbox snapshot and must be preferred as the merge source.
      let localStateToMerge = null;
      if (loadedRef.current) {
        localStateToMerge = dbRef.current;
      }
      
      // Read from IDB first (BUG #4), then fall back to localStorage cache.
      // Used for UI preferences and, on initial load, as the merge source
      // to prevent loss of unsynced local changes.
      let localUi = null;
      let cachedState = null;
      try {
        // Try IDB first (async, but we await it here for initial load correctness)
        const idbState = await idbStorage.loadWithFallback(`tradecrm:user:${userId}`);
        if (idbState) {
          cachedState = idbState;
          localUi = cachedState?.ui;
        } else {
          // Fallback to raw localStorage (pre-migration)
          const cached = localStorage.getItem(`tradecrm:user:${userId}`);
          if (cached) {
            cachedState = JSON.parse(cached);
            localUi = cachedState?.ui;
          }
        }
      } catch {}
      
      // One-time migration from localStorage to IDB (BUG #4)
      idbStorage.migrateFromLocalStorage(userId).catch((err) => {
        if (IS_DEV) {
          console.warn("[syncDb] IDB migration failed:", err?.message);
        }
      });
      
      // On initial load, use localStorage cache as merge source.
      // This preserves changes saved locally but not yet synced to the server
      // (e.g. deletion happened after the last failed sync, debounce hadn't fired,
      // or the page was closed before the debounce could fire).
      if (!localStateToMerge && cachedState) {
        localStateToMerge = cachedState;
      }
      
      // CRITICAL FIX: When not fully loaded, the user may have made in-memory
      // changes (added trades before initial fetch completed or while fetch was
      // retrying). These changes need to be captured as a merge source so they
      // aren't overwritten when the server state arrives.
      // - If cache exists AND in-memory has changes → merge both
      // - If cache is empty AND in-memory has changes → use in-memory
      if (!loadedRef.current) {
        const currentDb = dbRef.current;
        const inMemoryHasData = hasMeaningfulData(currentDb);
        
        if (inMemoryHasData && localStateToMerge) {
          // Both cache and in-memory have data — check if in-memory has trades
          // not in the cache (user added trades during loading window).
          // Compare by trade count as a quick heuristic; the full ID-based merge
          // in mergeStates handles precise deduplication.
          const inMemoryTradeCount = currentDb?.trades?.length ?? 0;
          const cacheTradeCount = localStateToMerge?.trades?.length ?? 0;
          if (inMemoryTradeCount > 0 && inMemoryTradeCount !== cacheTradeCount) {
            // isInitialLoad=true: preserve items from both sides (cache and in-memory)
            localStateToMerge = mergeStates(currentDb, localStateToMerge, true);
            if (IS_DEV) {
              console.log("[syncDb] Merged in-memory changes with cache for initial load", {
                inMemoryTrades: currentDb?.trades?.length ?? 0,
                cacheTrades: cachedState?.trades?.length ?? 0,
                mergedTrades: localStateToMerge?.trades?.length ?? 0
              });
            }
          }
        } else if (inMemoryHasData && !localStateToMerge) {
          // No cache but in-memory has data — use in-memory as merge source
          localStateToMerge = currentDb;
          if (IS_DEV) {
            console.log("[syncDb] Using in-memory state as merge source (no cache)", {
              inMemoryTrades: currentDb?.trades?.length ?? 0
            });
          }
        }
      }
      
      // Merge server and local state to preserve any local-only changes.
      // Always merge when local state exists — not just when outbox has changes —
      // because the debounced server sync may not have fired before the page was
      // backgrounded or reloaded, meaning the server has stale data.
      // 
      // Determine isInitialLoad: on first page load, always treat as initial
      // to preserve server-only items (e.g. admin-restored data, multi-device sync).
      // Previously, having a cached state would set isInitialLoad=false, causing
      // server-only items to be dropped (treated as "locally deleted"). This broke
      // admin state restoration — the stale/empty localStorage cache would
      // overwrite the new DB data because absent-from-cache items were ignored.
      //
      // On first load, localStorage is a stale CACHE — not the source of truth.
      // Items missing from the cache were not necessarily deleted by the user;
      // they may have been added server-side. The safeIsInitialLoad override
      // below still protects against restoring items when local has more data.
      //
      // Deletions use soft-delete (deletedAt timestamp), so deleted items remain
      // in arrays and are handled correctly by the merge regardless of this flag.
      //
      // Check if server version has changed since last sync
      const lastKnownVersion = getServerVersion(userId);
      const serverVersionChanged = serverVersion > lastKnownVersion;
      
      // Base isInitialLoad: always true on first page load, OR server version changed
      const isInitialLoad = !loadedRef.current || serverVersionChanged;
      const hasLocalState = !!localStateToMerge;
      
      if (IS_DEV && serverVersionChanged) {
        console.log("[syncDb] Server version changed - treating as initial load", {
          lastKnown: lastKnownVersion,
          current: serverVersion
        });
      }
      
      // Safety check for isInitialLoad:
      // If local has MORE data than server on initial load, override to false
      // to prevent restoring items the user deleted locally.
      // EXCEPTION: When serverVersionChanged is true, the server was modified
      // externally (another device, admin restore, etc.). In that case, server-only
      // items are legitimate new data and MUST be preserved — overriding to false
      // would drop them. Soft-delete (deletedAt) handles local deletions correctly
      // in the merge regardless of isInitialLoad, so this is safe.
      let safeIsInitialLoad = isInitialLoad;
      if (localStateToMerge && serverState) {
        const localTradeCount = localStateToMerge?.trades?.length ?? 0;
        const serverTradeCount = serverState?.trades?.length ?? 0;
        
        if (isInitialLoad && !serverVersionChanged && localTradeCount > 0 && serverTradeCount < localTradeCount) {
          // Local has more data than server AND server hasn't changed —
          // don't restore server-only items (they were deleted locally)
          safeIsInitialLoad = false;
          if (IS_DEV) {
            console.log("[syncDb] Override isInitialLoad=false - local has more data, server unchanged", {
              localTrades: localTradeCount,
              serverTrades: serverTradeCount
            });
          }
        }
        
        // CRITICAL: If local state is empty (seed / reset) but server has real data,
        // always treat as initial load so that server-only trades are preserved.
        // This prevents VPN-caused reset cycles from dropping all server trades
        // (local empty state is a cache artifact, NOT intentional user deletion).
        if (!safeIsInitialLoad && localTradeCount === 0 && serverTradeCount > 0) {
          safeIsInitialLoad = true;
          if (IS_DEV) {
            console.log("[syncDb] Override isInitialLoad=true - local empty, server has data", {
              serverTrades: serverTradeCount
            });
          }
        }
      }
      
      let next = hasLocalState 
        ? mergeStates(localStateToMerge, serverState, safeIsInitialLoad, serverVersionChanged) 
        : serverState;
      
      // Log merge results for debugging trade disappearance issues
      if (IS_DEV && hasLocalState) {
        const localTrades = localStateToMerge?.trades?.length ?? 0;
        const serverTrades = serverState?.trades?.length ?? 0;
        const mergedTrades = next?.trades?.length ?? 0;
        console.log("[syncDb] Merge completed:", {
          localTrades,
          serverTrades,
          mergedTrades,
          isInitialLoad: safeIsInitialLoad,
          serverVersionChanged,
          loadedBefore: loadedRef.current,
          hadCache: !!cachedState,
          hadOutbox: hasOutboxChanges
        });
        
        // Warn if trades were lost (but not due to deduplication)
        if (mergedTrades < Math.max(localTrades, serverTrades)) {
          const expectedMerge = localTrades + serverTrades; // If no overlap
          const actualLoss = Math.max(localTrades, serverTrades) - mergedTrades;
          
          // Only warn if the loss is significant (more than normal deduplication)
          if (mergedTrades < Math.min(localTrades, serverTrades)) {
            console.error("[syncDb] CRITICAL: Trade count is less than both inputs - possible merge bug!", {
              localTrades,
              serverTrades,
              mergedTrades,
              lost: actualLoss
            });
          } else {
            console.warn("[syncDb] Trade count decreased after merge", {
              localTrades,
              serverTrades,
              mergedTrades,
              difference: actualLoss,
              note: "This may be expected if trades were deduplicated or deleted"
            });
          }
        }
      }
      
      // When server state is used directly (no local merge), still reconcile equity
      if (!hasLocalState) {
        reconcileAccountsEquity(next);
      }
      
      // Merge UI preferences from localStorage only on INITIAL load.
      // On initial load, in-memory state is not yet available, so localStorage
      // is the best source of local UI prefs (theme, language, etc.).
      // After the app is loaded (loadedRef.current=true), the in-memory state
      // (dbRef.current) is the source of truth — mergeStates already preserves
      // it via { ...serverState.ui, ...localState.ui }.  Re-reading localStorage
      // here would overwrite in-memory UI changes that haven't been flushed to
      // localStorage yet (React effects are async), causing the theme to revert.
      if (localUi && !loadedRef.current) {
        next = { ...next, ui: { ...next.ui, ...localUi } };
      }
      
      // Use functional update to prevent race conditions:
      // If the user made changes (e.g. deleted a backtest) while the fetch was
      // in flight, the in-memory state (currentDb) may differ from the snapshot
      // we read at the start (localStateToMerge).  A plain setDb(next) would
      // overwrite those changes.  The functional form lets us re-merge with the
      // latest state so user edits are never silently dropped.
      setDb(currentDb => {
        if (loadedRef.current && currentDb !== localStateToMerge) {
          // Re-compute safeIsInitialLoad using currentDb (latest in-memory state)
          // instead of the stale localStateToMerge snapshot.
          // The original safeIsInitialLoad was computed from localStateToMerge which
          // may be outdated if the user made changes while the fetch was in flight.
          let freshSafeIsInitialLoad = isInitialLoad;
          const freshLocalTradeCount = currentDb?.trades?.length ?? 0;
          const freshServerTradeCount = serverState?.trades?.length ?? 0;
          
          if (isInitialLoad && !serverVersionChanged && freshLocalTradeCount > 0 && freshServerTradeCount < freshLocalTradeCount) {
            freshSafeIsInitialLoad = false;
          }
          if (!freshSafeIsInitialLoad && freshLocalTradeCount === 0 && freshServerTradeCount > 0) {
            freshSafeIsInitialLoad = true;
          }
          
          let freshMerged = mergeStates(currentDb, serverState, freshSafeIsInitialLoad, serverVersionChanged);
          // currentDb.ui is the most up-to-date in-memory UI state, and
          // mergeStates already preserves it via { ...serverState.ui, ...currentDb.ui }.
          // We intentionally do NOT re-read localStorage here because React's
          // save effect (useEffect) may not have flushed the latest in-memory
          // state to localStorage yet.  Reading stale localStorage would
          // overwrite the user's recent theme/language change, causing the
          // infamous "theme reverts after 10-20 seconds" bug.
          
          // DATA INTEGRITY CHECK: If merge resulted in fewer trades than the
          // current in-memory state, prefer in-memory state to prevent data loss.
          // This catches scenarios where stale server state would cause trades
          // to be dropped (e.g. visibility-change fetch after share operation).
          const mergedTradeCount = freshMerged?.trades?.length ?? 0;
          if (freshLocalTradeCount > 0 && mergedTradeCount < freshLocalTradeCount) {
            console.warn(
              `[syncDb] DATA INTEGRITY: Merge would reduce trades from ${freshLocalTradeCount} to ${mergedTradeCount}. ` +
              "Preferring in-memory state to prevent data loss."
            );
            return currentDb;
          }
          
          return freshMerged;
        }
        return next;
      });
      
      // Save to localStorage and update last synced state.
      // In the rare race-condition path the functional update above may produce
      // a slightly different result than `next`.  That is acceptable because the
      // save effect (which fires synchronously on every db change) will
      // immediately overwrite localStorage with the correct committed state.
      try { 
        localStorage.setItem(`tradecrm:user:${userId}`, JSON.stringify(next));
        setLastSyncedState(userId, next);
        setServerVersion(userId, serverVersion);
      } catch {}
      
      loadedRef.current = true;
      // Keep unsaved flag if local state had changes that need syncing
      const hadLocalChanges = hasOutboxChanges || (hasLocalState && !!cachedState);
      setHasUnsavedChanges(!!hadLocalChanges);
      setLastError(null);
      setSyncStatus(hadLocalChanges ? "pending" : "synced");
      retryCount.current = 0;
      
      // When no local changes exist, the server state is canonical.
      // Set flag so the save effect skips the redundant (and potentially
      // destructive) sync-back of the just-fetched state to the server.
      if (!hadLocalChanges) {
        justLoadedFromServerRef.current = true;
      }
      
      // Clear outbox only if we didn't have outbox changes (server state is canonical)
      if (!hasOutboxChanges) {
        clearOutbox(userId);
      }
      
      // Log successful load in dev
      if (IS_DEV) {
        console.log("[syncDb] State loaded successfully:", {
          tradesCount: next?.trades?.length ?? 0,
          serverVersion,
          hadOutboxChanges: hasOutboxChanges
        });
      }
    } catch (e) {
      if (cancelled.value) return;
      
      const status = e?.status;
      const isAuthError = status === 401 || status === 403;
      
      // Log error details in dev
      if (process.env.NODE_ENV === "development") {
        console.warn("[syncDb] Load error:", { status, message: e?.message, isAuthError });
      }
      
      if (isAuthError) {
        // Auth error: DO NOT overwrite existing data with seed/empty
        // Keep current db state (could be from localStorage or previous load)
        // Try to load from localStorage first
        if (!loadedRef.current) {
          let cached = null;
          try {
            const raw = localStorage.getItem(`tradecrm:user:${userId}`);
            cached = raw ? JSON.parse(raw) : null;
          } catch {}
          
          if (cached) {
            setDb(cached);
            loadedRef.current = true;
          }
        }
        
        setSyncStatus("unauthorized");
        setLastError({ code: "UNAUTHORIZED", message: e?.message, status });
        
        // Check if there's pending data in outbox
        if (hasOutbox(userId)) {
          setHasUnsavedChanges(true);
        }
        
        // Schedule retry - auth might become ready after login completes
        if (retryCount.current < MAX_RETRIES) {
          retryCount.current++;
          // Exponential backoff: 2s, 4s, 8s
          const delay = RETRY_DELAY * Math.pow(2, retryCount.current - 1);
          retryTimer.current = setTimeout(() => {
            if (!cancelled.value) fetchState(cancelled, true);
          }, delay);
        }
        return;
      }
      
      // Non-auth error (network, server error, etc.)
      // Try local cache but DON'T fall back to seed if we already have data
      if (!loadedRef.current) {
        // First load attempt failed - try localStorage
        let cached = null;
        try {
          const raw = localStorage.getItem(`tradecrm:user:${userId}`);
          cached = raw ? JSON.parse(raw) : null;
        } catch {}
        
        if (cached) {
          setDb(cached);
          loadedRef.current = true;
          setSyncStatus(navigator.onLine ? "error" : "offline");
          
          // Check if there's pending data in outbox
          if (hasOutbox(userId)) {
            setHasUnsavedChanges(true);
          }
        } else {
          // No cache available — show empty seed in UI but do NOT mark as loaded.
          // Keeping loadedRef.current = false prevents the SAVE EFFECT from
          // syncing this empty seed to the server, which would overwrite real
          // data saved from another device (e.g. PC → phone scenario).
          // Retries will continue and, on success, properly set loadedRef.
          setDb(seed);
          setSyncStatus(navigator.onLine ? "error" : "offline");
        }
      } else {
        // Already loaded before - keep existing data, just update status
        setSyncStatus(navigator.onLine ? "error" : "offline");
      }
      
      setLastError({ code: "LOAD_ERROR", message: e?.message, status });
      
      // Schedule retry for network errors
      if (retryCount.current < MAX_RETRIES && navigator.onLine) {
        retryCount.current++;
        // Exponential backoff: 2s, 4s, 8s
        const delay = RETRY_DELAY * Math.pow(2, retryCount.current - 1);
        retryTimer.current = setTimeout(() => {
          if (!cancelled.value) fetchState(cancelled, true);
        }, delay);
      }
    }
  }, [userId, seed]);

  // Load - reset state when userId changes to ensure proper data isolation
  // Debounced to prevent rapid VPN-caused userId oscillation (null→id→null→id)
  // from triggering multiple reset+fetch cycles that can wipe localStorage.
  useEffect(() => {
    if (!userId) return;
    const cancelled = { value: false };

    const timer = setTimeout(() => {
      if (cancelled.value) return;

      // Mark reset so save effect skips writing seed to localStorage.
      // The save effect (below) checks and clears this flag synchronously
      // on its next invocation.  Because React processes state updates
      // (setDb → save effect) within the same commit, the flag is always
      // consumed before the next userId change can set it again.
      isResettingRef.current = true;

      // Reset state for new user to prevent data leakage between users
      loadedRef.current = false;
      setDb(seed);
      setSyncStatus("loading");
      
      fetchState(cancelled);
    }, USER_CHANGE_DEBOUNCE_MS);

    return () => { 
      cancelled.value = true;
      clearTimeout(timer);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  // Note: seed is intentionally excluded - it's a constant and shouldn't trigger re-fetches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchState]);

  // ─────────────────────────────────────────────────────────────────────────────
  // FALLBACK LOAD - Load from lastKnownUserId when auth fails (read-only mode)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Only activate when userId is null but fallbackUserId exists
    if (userId || !fallbackUserId) return;
    if (loadedRef.current) return;
    
    // Try to load cached data from the last known user
    let cached = null;
    try {
      const raw = localStorage.getItem(`tradecrm:user:${fallbackUserId}`);
      cached = raw ? JSON.parse(raw) : null;
    } catch {}
    
    if (cached) {
      setDb(cached);
      loadedRef.current = true;
      setSyncStatus("offline"); // Mark as offline since we can't sync without auth
      setLastError({ 
        code: "AUTH_UNAVAILABLE", 
        message: "Auth unavailable - viewing cached data", 
        status: 0 
      });
      if (IS_DEV) {
        console.log("[syncDb] Loaded cached data for fallback user:", fallbackUserId);
      }
    } else {
      // No cache available - use seed but mark as read-only
      setDb(seed);
      loadedRef.current = true;
      setSyncStatus("offline");
    }
  }, [userId, fallbackUserId, seed]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SERVER SYNC FUNCTION - Attempts to sync to server with PATCH/PUT or chunked
  // ─────────────────────────────────────────────────────────────────────────────
  const syncToServer = useCallback(async (stateToSync) => {
    if (!userId) return { success: false };

    // Prevent concurrent sync requests
    if (syncInFlight.current) {
      if (IS_DEV) console.log("[syncDb] Sync already in flight, skipping");
      return { success: false, skipped: true };
    }

    // Fast pre-check: if browser says offline, skip immediately
    if (!navigator.onLine) {
      return { success: false, offline: true };
    }

    // ─── Idempotency key for this logical save attempt ─────────────────
    // Reuse the existing outbox key if there's a pending save — that lets
    // the server dedupe replays of the same logical operation even though
    // the body (dbRef.current) may be a more recent state than the
    // snapshot stored in the outbox. If the outbox is empty, generate a
    // fresh key. The same key is reused across apiJson's internal retry
    // loop and across outbox-driven retries.
    const existingOutbox = getOutbox(userId);
    const effectiveIdempotencyKey =
      existingOutbox?.idempotencyKey || newIdempotencyKey();

    // CRITICAL VALIDATION: Prevent syncing corrupted/empty state that could overwrite server data
    // This prevents data loss when browser state gets corrupted or cleared unexpectedly
    const lastSynced = getLastSyncedState(userId);
    if (lastSynced) {
      // Count ACTIVE (non-deleted) records only — tombstoned records are intentional deletes.
      // Comparing total array length (including tombstones) causes false positives:
      // the array length stays stable when items are tombstoned, misfiring the guard
      // on the wrong quantity.
      const currentTrades = Array.isArray(stateToSync?.trades) ? stateToSync.trades : [];
      const lastSyncedTrades = Array.isArray(lastSynced?.trades) ? lastSynced.trades : [];
      const currentActiveCount = currentTrades.filter(t => !isDeleted(t)).length;
      const lastSyncedActiveCount = lastSyncedTrades.filter(t => !isDeleted(t)).length;
      
      // If we previously had data but now have zero active records, check for corruption
      if (lastSyncedActiveCount > 0 && currentActiveCount === 0) {
        // Check if ALL previously-active trades are now tombstoned (legitimate bulk delete)
        const lastActiveIds = new Set(
          lastSyncedTrades.filter(t => !isDeleted(t)).map(t => t.id)
        );
        const currentTombstonedIds = new Set(
          currentTrades.filter(t => isDeleted(t)).map(t => t.id)
        );
        const allAccountedFor = [...lastActiveIds].every(id => currentTombstonedIds.has(id));
        
        if (!allAccountedFor) {
          // Some trades vanished without tombstones — this is corruption, not user delete
          console.error(
            "[syncDb] BLOCKED: Attempted to sync empty state when last sync had data. " +
            "This likely indicates corrupted state. Last synced active trades:", lastSyncedActiveCount
          );
          // Save to outbox so the state is not lost
          saveToOutbox(userId, stateToSync, { code: "CORRUPTED_STATE_BLOCKED", message: "Prevented syncing empty state" }, effectiveIdempotencyKey);
          setLastError({ 
            code: "CORRUPTED_STATE_BLOCKED", 
            message: "Prevented syncing empty state - data corruption detected", 
            status: 0 
          });
          return { success: false, corruptedState: true };
        }
        // All trades accounted for with tombstones — this is a legitimate delete, allow sync
        if (IS_DEV) {
          console.log("[syncDb] All previously-active trades have tombstones — allowing bulk delete sync");
        }
      }
      
      // If active trade count dropped by more than 50%, check if it's corruption or legitimate delete.
      // Distinguish "sudden drop without tombstones" (corruption — block) from
      // "drop with matching tombstones" (user delete — allow).
      if (lastSyncedActiveCount > MIN_RECORDS_FOR_PROTECTION && currentActiveCount > 0) {
        const dropPercentage = (lastSyncedActiveCount - currentActiveCount) / lastSyncedActiveCount;
        if (dropPercentage > MAX_ACCEPTABLE_DROP_PERCENTAGE) {
          // Identify which trades disappeared
          const lastActiveIds = new Set(
            lastSyncedTrades.filter(t => !isDeleted(t)).map(t => t.id)
          );
          const currentActiveIds = new Set(
            currentTrades.filter(t => !isDeleted(t)).map(t => t.id)
          );
          const currentTombstonedIds = new Set(
            currentTrades.filter(t => isDeleted(t)).map(t => t.id)
          );
          
          // droppedIds = trades that were active before but are now neither active nor in current at all
          const droppedIds = [...lastActiveIds].filter(id => !currentActiveIds.has(id));
          // Check if all dropped trades have corresponding tombstones
          const allDroppedHaveTombstones = droppedIds.every(id => currentTombstonedIds.has(id));
          
          if (!allDroppedHaveTombstones) {
            // Some trades vanished without tombstones — block sync (likely corruption)
            console.error(
              `[syncDb] BLOCKED: Active trade count dropped by ${(dropPercentage * 100).toFixed(0)}% ` +
              `(${lastSyncedActiveCount} → ${currentActiveCount}) without matching tombstones. ` +
              `Blocking sync to prevent data loss.`
            );
            // Save to outbox so the state is not lost
            saveToOutbox(userId, stateToSync, {
              code: "EXCESSIVE_DATA_LOSS_BLOCKED",
              message: `Trade count dropped ${(dropPercentage * 100).toFixed(0)}% without tombstones`
            }, effectiveIdempotencyKey);
            setLastError({ 
              code: "EXCESSIVE_DATA_LOSS_BLOCKED", 
              message: `Prevented syncing — trade count dropped by ${(dropPercentage * 100).toFixed(0)}%`, 
              status: 0 
            });
            return { success: false, corruptedState: true };
          }
          // All dropped trades have tombstones — legitimate bulk delete, allow sync
          if (IS_DEV) {
            console.log(
              `[syncDb] Active trades dropped by ${(dropPercentage * 100).toFixed(0)}% ` +
              `but all dropped IDs have tombstones — allowing sync`
            );
          }
        }
      }
    }
    
    // Don't attempt server sync if unauthorized (but we will still save locally)
    const currentStatus = syncStatusRef.current;
    if (currentStatus === "unauthorized") {
      return { success: false, unauthorized: true };
    }
    
    // Connectivity probe — skip heavy payload if server is unreachable
    // This provides real-time check before sync (heartbeat is periodic)
    syncInFlight.current = true;
    try {
    const ping = await pingServer();
    if (!ping.ok) {
      const reason = ping.reason; // "offline" | "timeout" | "network" | "server_error"
      if (IS_DEV) {
        console.warn("[syncDb] Ping failed, skipping sync:", reason);
      }
      // Update reachability state based on ping result
      setIsServerReachable(false);
      // Save to outbox so it retries later
      saveToOutbox(userId, stateToSync, { code: "PING_FAILED", message: `Server unreachable (${reason})` }, effectiveIdempotencyKey);
      setHasUnsavedChanges(true);
      const errorCode = reason === "timeout" ? "TIMEOUT" : reason === "server_error" ? "SERVER_ERROR" : "NETWORK_ERROR";
      setLastError({ code: errorCode, message: `Server unreachable (${reason})`, status: ping.status || 0 });
      return { success: false, error: true, pingFailed: true, reason };
    }
    
    perfMark("syncDb:apiSave:start");

    // Calculate payload size to determine sync strategy
    const payload = { state: stateToSync };
    const payloadSize = getPayloadSize(payload);

    if (IS_DEV) {
      const imageCount = countBase64Images(stateToSync);
      const imageSize = getBase64ImageSize(stateToSync);
      console.log("[syncDb] Payload analysis:", {
        totalSizeKb: Math.round(payloadSize / 1024),
        tradesCount: stateToSync?.trades?.length ?? 0,
        imageCount,
        imageSizeKb: Math.round(imageSize / 1024),
        willChunk: payloadSize > MAX_SINGLE_REQUEST_SIZE_BYTES
      });
    }

    // B14: Hard ceiling — Vercel rejects bodies > 4.5MB outright.  Even chunked
    // sync may struggle if individual chunks approach this size after JSON
    // overhead.  Surface this as an error in all environments so it is visible
    // in production logs.
    if (payloadSize > VERCEL_HARD_LIMIT_BYTES) {
      console.error(
        "[syncDb] Payload exceeds Vercel hard limit — sync will likely fail",
        {
          sizeKb: Math.round(payloadSize / 1024),
          hardLimitKb: Math.round(VERCEL_HARD_LIMIT_BYTES / 1024),
        }
      );
    }

    try {
      let result;

      // Use chunked sync if payload is too large.  This branch runs in all
      // environments (not gated on IS_DEV) — production users with large
      // payloads must also take the chunked path or sync will fail.
      if (payloadSize > MAX_SINGLE_REQUEST_SIZE_BYTES) {
        if (IS_DEV) {
          console.log("[syncDb] Using chunked sync:", {
            sizeKb: Math.round(payloadSize / 1024),
            limitKb: Math.round(MAX_SINGLE_REQUEST_SIZE_BYTES / 1024)
          });
        }

        // Defensive: if chunked sync helper is unavailable for any reason
        // (bundler tree-shake, mocked import, etc.), fall back to the outbox
        // instead of attempting a single PUT that the server will reject.
        if (typeof sendFullStateChunked !== "function") {
          console.warn(
            "[syncDb] Chunked sync unavailable — saving to outbox for later retry",
            { sizeKb: Math.round(payloadSize / 1024) }
          );
          saveToOutbox(
            userId,
            stateToSync,
            { code: "CHUNKED_UNAVAILABLE", message: "Chunked sync helper missing" },
            effectiveIdempotencyKey
          );
          setHasUnsavedChanges(true);
          setLastError({
            code: "CHUNKED_UNAVAILABLE",
            message: "Payload too large and chunked sync unavailable",
            status: 0,
          });
          return { success: false, error: true };
        }

        setSyncProgress({ current: 0, total: 0, percent: 0 });

        try {
          // BUG #5 FIX: Pass expected_version for chunked sync too
          const knownVersion = getServerVersion(userId);
          result = await sendFullStateChunked(stateToSync, {
            onProgress: (percent, current, total) => {
              setSyncProgress({ current, total, percent });
              if (IS_DEV) {
                console.log(`[syncDb] Chunk progress: ${current}/${total} (${percent}%)`);
              }
            },
            expected_version: knownVersion,
          });
        } finally {
          // Clear progress after sync completes
          setSyncProgress(null);
        }

        // Chunked sync must return "complete" status to be considered successful
        if (result?.status !== "complete") {
          const err = new Error("Chunked sync did not complete");
          err.code = result?.code || "SYNC_INCOMPLETE";
          err.data = result;
          throw err;
        }
      } else {
        // Use regular PUT for smaller payloads
        if (IS_DEV) {
          console.log("[syncDb] Using PUT:", { 
            sizeKb: Math.round(payloadSize / 1024),
            tradesCount: stateToSync?.trades?.length ?? 0
          });
        }
        
        // BUG #5 FIX: Send expected_version so the server can detect concurrent writes
        // from multiple devices. On mismatch, server returns 409 with latest state.
        const knownVersion = getServerVersion(userId);
        result = await apiJson("/api/state", {
          method: "PUT",
          body: { ...payload, expected_version: knownVersion },
          idempotencyKey: effectiveIdempotencyKey,
        });
      }
      
      // Verify the response indicates actual success
      // Check for db: "down" or ok: false which means the server couldn't persist
      if (result?.db === "down" || result?.ok === false) {
        const err = new Error(result?.db === "down" ? "Database unavailable" : "Server rejected the save");
        err.status = 503;
        err.code = result?.code || "SYNC_FAILED";
        throw err;
      }
      
      // State integrity verification: check trade count in response
      const preSyncTradeCount = stateToSync?.trades?.length ?? 0;
      const postSyncTradeCount = result?.tradeCount;
      
      if (typeof postSyncTradeCount === 'number' && postSyncTradeCount < preSyncTradeCount) {
        console.warn(
          `[syncDb] WARNING: Trade count mismatch after sync! ` +
          `Pre-sync: ${preSyncTradeCount}, Post-sync: ${postSyncTradeCount}. ` +
          `Possible data loss detected.`
        );
        // Still consider this a success but log the warning
        // The server has the data, but something may have gone wrong
      }
      
      // Success - update last synced state and version
      const newVersion = result?.version ?? 1;
      setLastSyncedState(userId, stateToSync);
      setServerVersion(userId, newVersion);
      clearOutbox(userId);
      setHasUnsavedChanges(false);
      setLastError(null);
      setIsServerReachable(true); // Server is reachable
      lastSuccessfulSync.current = Date.now();
      consecutiveFailures.current = 0;
      
      perfMark("syncDb:apiSave:end");
      const duration = perfMeasure("syncDb:apiSave", "syncDb:apiSave:start", "syncDb:apiSave:end");
      
      if (IS_DEV) {
        console.log("[syncDb] Server sync success:", { 
          tradesCount: stateToSync?.trades?.length ?? 0,
          newVersion,
          durationMs: duration.toFixed(0),
          wasChunked: payloadSize > MAX_SINGLE_REQUEST_SIZE_BYTES
        });
      }
      
      return { success: true };
    } catch (e) {
      const status = e?.status;
      const code = e?.code || e?.data?.code;
      const message = e?.message;
      
      consecutiveFailures.current++;
      
      if (IS_DEV) {
        console.warn("[syncDb] Server sync error:", { status, code, message, consecutiveFailures: consecutiveFailures.current });
      }
      
      // BUG #5 FIX: Handle version conflict (409) — another device wrote first.
      // Fetch the server's latest state, merge locally, and retry once.
      if (status === 409 && code === "VERSION_CONFLICT" && e?.data?.server_state) {
        if (IS_DEV) {
          console.log("[syncDb] Version conflict detected — merging server state and retrying");
        }
        try {
          const serverState = e.data.server_state;
          const serverVersion = e.data.current_version ?? 0;
          // Merge server state with local state
          const merged = mergeStates(stateToSync, serverState, false, true);
          // Update local state with merged result
          dbRef.current = merged;
          setDb(merged);
          saveToLocalStorageSync(userId, merged);
          setServerVersion(userId, serverVersion);
          setLastSyncedState(userId, merged);
          
          // Retry once with merged state and correct version.
          // Use a FRESH idempotency key. The original effectiveIdempotencyKey
          // is already cached server-side mapped to the 409 response — re-using
          // it would just replay the 409 forever instead of letting the merged
          // body succeed.
          const retryPayload = { state: merged, expected_version: serverVersion };
          const retryIdempotencyKey = newIdempotencyKey();
          const retryResult = await apiJson("/api/state", {
            method: "PUT",
            body: retryPayload,
            idempotencyKey: retryIdempotencyKey,
          });
          
          if (retryResult?.db === "down" || retryResult?.ok === false) {
            throw new Error("Retry after merge failed");
          }
          
          const newVersion = retryResult?.version ?? serverVersion + 1;
          setLastSyncedState(userId, merged);
          setServerVersion(userId, newVersion);
          clearOutbox(userId);
          setHasUnsavedChanges(false);
          setLastError(null);
          setIsServerReachable(true);
          lastSuccessfulSync.current = Date.now();
          consecutiveFailures.current = 0;
          
          if (IS_DEV) {
            console.log("[syncDb] Version conflict resolved via merge+retry, new version:", newVersion);
          }
          return { success: true, conflictResolved: true };
        } catch (retryErr) {
          if (IS_DEV) {
            console.warn("[syncDb] Retry after version conflict failed:", retryErr?.message);
          }
          // Fall through to normal error handling. Save the outbox under
          // the FRESH retry key so subsequent outbox retries reuse a key
          // not already poisoned by the cached 409 response.
          saveToOutbox(userId, stateToSync, { status, code: "VERSION_CONFLICT_RETRY_FAILED", message: retryErr?.message }, retryIdempotencyKey);
          setHasUnsavedChanges(true);
          setLastError({ code: "VERSION_CONFLICT", message: "Conflict with another device — will retry", status: 409 });
          return { success: false, versionConflict: true };
        }
      }
      
      // 413 PAYLOAD_TOO_LARGE: state exceeds server's per-user quota. Outbox
      // retries with the same body would loop forever. Clear the outbox so
      // we don't keep replaying an oversized payload, and surface a distinct
      // error so the UI can ask the user to clean up images / large data.
      if (status === 413 || code === "PAYLOAD_TOO_LARGE") {
        clearOutbox(userId);
        setHasUnsavedChanges(true);
        setLastError({
          code: "PAYLOAD_TOO_LARGE",
          message: "Saved data exceeds server limit — please remove large images or attachments",
          status: 413,
        });
        return { success: false, payloadTooLarge: true };
      }

      // Save to outbox for later retry. Reuse effectiveIdempotencyKey so
      // subsequent outbox retries hit the server's idempotency cache and
      // dedupe replays of this same logical save.
      saveToOutbox(userId, stateToSync, { status, code, message }, effectiveIdempotencyKey);
      setHasUnsavedChanges(true);

      // Determine error type
      if (status === 401 || status === 403) {
        setLastError({ code: "UNAUTHORIZED", message, status });
        return { success: false, unauthorized: true };
      }
      
      // Network or server error — classify for better UI messages
      const errorCategory = classifySyncError(e);
      const errorCode = errorCategory === "network" ? "NETWORK_ERROR"
        : errorCategory === "timeout" ? "TIMEOUT"
        : errorCategory === "server" ? "SERVER_ERROR"
        : "SYNC_ERROR";
      setLastError({ code: errorCode, message, status });
      return { success: false, error: true };
    }
    } finally {
      syncInFlight.current = false;
    }
  }, [userId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // OUTBOX RETRY - Attempt to sync pending changes from outbox
  // ─────────────────────────────────────────────────────────────────────────────
  const retryOutbox = useCallback(async () => {
    if (!userId) return false;
    
    const outbox = getOutbox(userId);
    if (!outbox) return false;
    
    // CRITICAL FIX: Always sync current state from dbRef.current, not stale outbox.state
    // The outbox tracks that there ARE unsaved changes, but the actual data to send
    // should always be the latest state to prevent overwriting newer local edits
    const stateToSync = dbRef.current;
    
    if (IS_DEV) {
      console.log("[syncDb] Retrying outbox - using CURRENT state, outbox timestamp:", outbox.timestamp);
    }
    
    const result = await syncToServer(stateToSync);
    return result.success;
  }, [userId, syncToServer]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE EFFECT - Handles local + server persistence
  // ─────────────────────────────────────────────────────────────────────────────
  // CRITICAL FIX: ALWAYS save to localStorage immediately, regardless of auth/network status
  // Server sync is debounced and conditional
  useEffect(() => {
    if (!userId) return;

    // Skip save when the db was just reset to seed during userId change.
    // Writing the empty seed to localStorage would corrupt the cache and
    // cause all server-only trades to be dropped on the next merge.
    if (isResettingRef.current) {
      isResettingRef.current = false;
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRITICAL FIX: Save to localStorage even when loadedRef is false, but
    // only if the state contains meaningful data (not empty seed).
    // This prevents data loss when the user adds trades before the initial
    // server fetch completes, or when the fetch fails/retries.
    // The hasMeaningfulData guard prevents overwriting a valid localStorage
    // cache (from a previous session) with an empty seed state.
    // ─────────────────────────────────────────────────────────────────────────
    if (hasMeaningfulData(db)) {
      saveToLocalStorageSync(userId, db);
    }

    // Server sync requires full load to prevent syncing stale/partial state
    if (!loadedRef.current) return;

    // Track change activity for adaptive debounce
    const now = Date.now();
    const timeSinceLastChange = now - lastChangeTime.current;
    lastChangeTime.current = now;
    
    // If changes are happening rapidly (< 2s apart), increase debounce
    if (timeSinceLastChange < 2000) {
      changeCount.current++;
    } else {
      changeCount.current = 1;
    }
    
    // Adaptive debounce: use slower debounce when actively editing (many changes)
    const isActiveEditing = changeCount.current > 2;
    const debounceMs = isActiveEditing ? DEBOUNCE_SLOW_MS : DEBOUNCE_FAST_MS;

    // Save to localStorage (already done above for all states, but ensure it's
    // also saved here for the loaded state path in case hasMeaningfulData was
    // false above but state is now loaded - e.g. user with only UI settings)
    saveToLocalStorageSync(userId, db);

    // If this db change comes from fetchState (server is canonical),
    // skip the redundant (and potentially destructive) sync-back.
    if (justLoadedFromServerRef.current) {
      justLoadedFromServerRef.current = false;
      if (IS_DEV) {
        console.log("[syncDb] Skipping server sync-back — state just loaded from server");
      }
      return;
    }
    
    // Mark as having unsaved changes - this indicates changes not yet synced to SERVER
    // (not localStorage). This flag is cleared when syncToServer succeeds.
    setHasUnsavedChanges(true);

    // ─────────────────────────────────────────────────────────────────────────
    // Server sync (debounced, conditional on auth/network)
    // ─────────────────────────────────────────────────────────────────────────
    if (saveTimer.current) clearTimeout(saveTimer.current);
    
    // Update status based on current conditions
    const currentStatus = syncStatusRef.current;
    if (!navigator.onLine) {
      setSyncStatus("offline");
    } else if (currentStatus !== "unauthorized") {
      setSyncStatus("saving");
    }
    // If unauthorized, keep that status but still save locally (done above)

    saveTimer.current = setTimeout(async () => {
      // Defer the server sync if the tab went hidden while the debounce
      // was pending. A fetch fired now would race with browser background
      // throttling and frequently fail with NETWORK_ERROR/TIMEOUT, which
      // would in turn flip the badge to red and surface the "Нет
      // подключения" banner even though the connection is fine.
      // The state is already in localStorage (above); the visibility
      // handler will pick it up via the heartbeat outbox flush as soon
      // as the tab is in the foreground again.
      if (isTabHidden()) {
        if (syncStatusRef.current === "saving") setSyncStatus("pending");
        // Persist to outbox so the heartbeat / online listener can pick
        // it up the moment the tab is visible again.
        saveToOutbox(
          userId,
          db,
          { code: "DEFERRED_HIDDEN", message: "Sync deferred: tab hidden" },
          newIdempotencyKey()
        );
        setHasUnsavedChanges(true);
        return;
      }

      const result = await syncToServer(db);

      if (result.success) {
        setSyncStatus("synced");
        changeCount.current = 0;
      } else if (result.skipped) {
        // Another sync is already in flight (e.g. chunked upload) — keep current
        // status ("saving") so the UI doesn't flash an error banner while chunks
        // are still being uploaded.
      } else if (result.unauthorized) {
        setSyncStatus("unauthorized");
      } else if (result.offline) {
        setSyncStatus("offline");
      } else if (result.pingFailed) {
        // Ping failed but browser reports online — treat as transient.
        // Keep "pending" so the error banner doesn't flash; the heartbeat
        // and outbox retry will auto-recover within seconds.
        setSyncStatus("pending");
      } else {
        // First failure: use "pending" so the badge doesn't flash red.
        // The outbox retry and heartbeat will auto-recover within seconds.
        // Persistent failures (2+ in a row) still surface the "error" state.
        if (consecutiveFailures.current <= 1) {
          setSyncStatus("pending");
        } else {
          setSyncStatus(navigator.onLine ? "error" : "offline");
        }
      }
    }, debounceMs);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, db, syncToServer]); // Intentionally excluding syncStatus to prevent infinite loop

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE VISIBILITY / UNLOAD HANDLERS - Flush data before page closes
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    
    const flushOnHide = () => {
      const currentDb = dbRef.current;
      
      // CRITICAL FIX: Save to localStorage even when loadedRef is false,
      // as long as the state has meaningful data. This prevents data loss
      // when the user closes the page before the initial fetch completes
      // but has already made changes (e.g. added trades).
      if (!loadedRef.current && !hasMeaningfulData(currentDb)) return;
      
      // Synchronously save to localStorage
      saveToLocalStorageSync(userId, currentDb);
      
      // Best-effort server sync via beacon (only when fully loaded)
      if (loadedRef.current && navigator.onLine && syncStatusRef.current !== "unauthorized") {
        syncWithBeacon(userId, currentDb);
      }
    };
    
    // Track visibility fetch timer to prevent race conditions
    let visibilityFetchTimer = null;
    // Track the cancellation token of any in-flight visibility/bfcache fetch
    // so we can abort the merge when the page goes hidden again. Without this,
    // an in-flight fetch can complete and merge stale server state into local
    // state after the user has already started editing again.
    let activeFetchCancelToken = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Clear any pending visibility fetch when going hidden
        if (visibilityFetchTimer) {
          clearTimeout(visibilityFetchTimer);
          visibilityFetchTimer = null;
        }
        // Cancel any in-flight visibility fetch's merge
        if (activeFetchCancelToken) {
          activeFetchCancelToken.value = true;
          activeFetchCancelToken = null;
        }
        flushOnHide();
      } else if (document.visibilityState === "visible") {
        // Page became visible - debounce fetch to allow pending local syncs to complete
        // CRITICAL FIX: Wait 2 seconds before fetching to prevent race condition where:
        // 1. Page hidden → beacon sync queued
        // 2. Page visible → immediate fetch gets stale server state
        // 3. Beacon sync completes after fetch, but merge already happened with old data
        // 4. Local changes made during beacon delay get overwritten by stale merge
        if (loadedRef.current && navigator.onLine && syncStatusRef.current !== "unauthorized") {
          if (IS_DEV) {
            console.log("[syncDb] Page became visible - scheduling fetch with delay to avoid race");
          }
          
          // Cancel any existing timer
          if (visibilityFetchTimer) {
            clearTimeout(visibilityFetchTimer);
          }
          
          // Wait 2 seconds to allow:
          // - Any pending debounced syncs from before visibility change to complete
          // - Beacon syncs from page hide to reach server
          // - User to start making changes (which will trigger their own sync)
          visibilityFetchTimer = setTimeout(() => {
            visibilityFetchTimer = null;
            // Double-check we're still mounted and conditions haven't changed
            if (!loadedRef.current || !navigator.onLine || syncStatusRef.current === "unauthorized") {
              if (IS_DEV) {
                console.log("[syncDb] Skipping visibility fetch - conditions changed");
              }
              return;
            }
            
            // CRITICAL: Block visibility fetch when a share operation is in-flight.
            // Opening a share link in a new tab causes visibilitychange, which
            // would fetch stale server state and overwrite local trades.
            if (shareInFlightRef.current) {
              if (IS_DEV) {
                console.log("[syncDb] Skipping visibility fetch - share operation in-flight");
              }
              return;
            }
            
            // CRITICAL: Block visibility fetch when a sync is actively uploading.
            // A chunked sync might still be in-flight (syncInFlight.current=true)
            // even though syncStatusRef might not reflect it accurately.
            if (syncInFlight.current) {
              if (IS_DEV) {
                console.log("[syncDb] Skipping visibility fetch - sync in-flight");
              }
              return;
            }
            
            // BUG #7 FIX: Skip fetch if a write just completed within the last 3 seconds.
            // After a successful sync write, the server (or CDN/edge read replica) may
            // not yet reflect the updated state. Fetching immediately can return stale
            // data that overwrites local changes via merge. The 3-second window covers
            // typical CDN propagation and read-after-write consistency delays.
            const WRITE_PROPAGATION_DELAY_MS = 3000;
            if (lastSuccessfulSync.current && (Date.now() - lastSuccessfulSync.current) < WRITE_PROPAGATION_DELAY_MS) {
              if (IS_DEV) {
                console.log("[syncDb] Skipping visibility fetch - write completed within 3s, waiting for propagation");
              }
              return;
            }
            
            // Check for unsaved changes using ref to get latest value
            // We check syncStatusRef instead of hasUnsavedChanges state to avoid stale closure
            const currentStatus = syncStatusRef.current;
            const hasUnsavedWork = currentStatus === "saving" || currentStatus === "pending";
            
            // Only fetch if no unsaved changes are pending
            // If user is actively editing, their changes will sync normally
            if (!hasUnsavedWork) {
              if (IS_DEV) {
                console.log("[syncDb] Executing delayed visibility fetch");
              }
              const cancelled = { value: false };
              activeFetchCancelToken = cancelled;
              fetchState(cancelled).catch(() => {
                // Ignore errors - this is best effort
              }).finally(() => {
                if (activeFetchCancelToken === cancelled) {
                  activeFetchCancelToken = null;
                }
              });
            } else {
              if (IS_DEV) {
                console.log("[syncDb] Skipping visibility fetch - user has unsaved changes");
              }
            }
          }, 2000);
        }
      }
    };
    
    const handlePageHide = () => {
      flushOnHide();
    };
    
    const handleBeforeUnload = () => {
      flushOnHide();
    };
    
    // Handle Safari bfcache restoration (pageshow with persisted=true)
    // When Safari restores a page from bfcache, JavaScript state is frozen/restored
    // but network connections may be stale and server state may have changed.
    // visibilitychange should also fire, but pageshow is a more reliable signal
    // for bfcache restoration specifically.
    const handlePageShow = (e) => {
      if (!e.persisted) return; // Only handle bfcache restoration
      
      if (IS_DEV) {
        console.log("[syncDb] Page restored from bfcache (pageshow.persisted)");
      }
      
      // Ensure current state is saved to localStorage (belt-and-suspenders)
      if (loadedRef.current) {
        saveToLocalStorageSync(userId, dbRef.current);
      }
      
      // Schedule a server fetch if visibilitychange hasn't already scheduled one
      if (!visibilityFetchTimer && loadedRef.current && navigator.onLine && syncStatusRef.current !== "unauthorized") {
        visibilityFetchTimer = setTimeout(() => {
          visibilityFetchTimer = null;
          if (!loadedRef.current || !navigator.onLine || syncStatusRef.current === "unauthorized") return;
          
          // Block fetch during share or sync operations (same guards as visibility handler)
          if (shareInFlightRef.current || syncInFlight.current) return;
          
          const currentStatus = syncStatusRef.current;
          const hasUnsavedWork = currentStatus === "saving" || currentStatus === "pending";
          
          if (!hasUnsavedWork) {
            if (IS_DEV) {
              console.log("[syncDb] Executing bfcache restoration fetch");
            }
            const cancelled = { value: false };
            activeFetchCancelToken = cancelled;
            fetchState(cancelled).catch(() => {}).finally(() => {
              if (activeFetchCancelToken === cancelled) {
                activeFetchCancelToken = null;
              }
            });
          }
        }, 2000);
      }
    };
    
    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      // Clean up visibility fetch timer
      if (visibilityFetchTimer) {
        clearTimeout(visibilityFetchTimer);
      }
      // Cancel any in-flight visibility fetch on unmount
      if (activeFetchCancelToken) {
        activeFetchCancelToken.value = true;
        activeFetchCancelToken = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  // fetchState is intentionally excluded: it only changes when userId or seed
  // changes, and seed is a constant. Including fetchState would cause the effect
  // to re-register event listeners unnecessarily and risk stale closure issues
  // with the visibilityFetchTimer variable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SERVER REACHABILITY HEARTBEAT - Periodic ping to detect VPN/DPI blocking
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    
    let lastReachable = true;
    
    const checkServerReachability = async () => {
      // Skip while the tab is hidden — background-tab throttling can cause
      // pingServer's AbortController timer to fire before the throttled
      // fetch resolves, producing spurious "timeout"/"network" results
      // that wrongly mark the server as unreachable. The next heartbeat
      // tick (and the visibilitychange handler below) will catch up as
      // soon as the tab is in the foreground again.
      if (isTabHidden()) return;

      // Fast pre-check: if definitely offline (browser API), skip ping
      if (!navigator.onLine) {
        if (lastReachable) {
          setIsServerReachable(false);
          lastReachable = false;
          if (IS_DEV) {
            console.log("[syncDb] Heartbeat: browser offline");
          }
        }
        return;
      }

      // Ping the actual server
      const ping = await pingServer();
      const reachable = ping.ok;

      if (reachable !== lastReachable) {
        setIsServerReachable(reachable);
        lastReachable = reachable;

        if (IS_DEV) {
          console.log("[syncDb] Heartbeat: server reachability changed:", reachable);
        }
      }

      // Flush outbox whenever server is reachable and outbox exists.
      // Previously this only ran on unreachable→reachable transitions,
      // which missed cases where syncToServer's inline ping failed
      // transiently but the heartbeat's ping always succeeded (no
      // transition detected → outbox stuck until manual retry).
      if (reachable && hasOutbox(userId) && !syncInFlight.current) {
        if (IS_DEV) {
          console.log("[syncDb] Heartbeat: server reachable, flushing outbox");
        }
        retryOutbox().then(success => {
          if (success) {
            outboxAttempt.current = 0;
            setSyncStatus("synced");
          }
        });
      }
    };

    // When the tab becomes visible again, immediately re-check reachability
    // and clear any transient network errors that accumulated while the tab
    // was throttled in the background. Without this the user can return to
    // a stale red "NETWORK_ERROR" banner that only clears on the next
    // successful sync — the actual connection is fine, the failures were
    // just artifacts of background-tab throttling.
    const handleHeartbeatVisibility = () => {
      if (isTabHidden()) return;
      // Reset the soft failure counter so a couple of throttled-background
      // failures don't immediately escalate to "error" once we're back.
      consecutiveFailures.current = 0;
      setLastError(prev => {
        if (!prev) return prev;
        if (prev.code === "NETWORK_ERROR" || prev.code === "TIMEOUT" || prev.code === "PING_FAILED") {
          return null;
        }
        return prev;
      });
      // Demote a stale "error" status to "pending" if there are unsynced
      // changes, otherwise back to "synced". The reachability check below
      // will refine this once the ping returns.
      if (syncStatusRef.current === "error") {
        setSyncStatus(hasOutbox(userId) ? "pending" : "synced");
      }
      // Force a fresh ping so the badge updates without waiting up to 30s.
      lastReachable = false; // ensure the result is treated as a transition
      checkServerReachability();
    };

    document.addEventListener("visibilitychange", handleHeartbeatVisibility);

    // Initial check
    checkServerReachability();

    // Periodic heartbeat
    heartbeatTimer.current = setInterval(checkServerReachability, HEARTBEAT_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleHeartbeatVisibility);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    };
  }, [userId, retryOutbox]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ONLINE/AUTH RECOVERY - Auto-retry outbox when connectivity or auth restored
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    
    const handleOnline = async () => {
      if (IS_DEV) {
        console.log("[syncDb] Online event - checking outbox");
      }
      // Reset backoff on reconnect
      outboxAttempt.current = 0;
      
      if (hasOutbox(userId)) {
        const success = await retryOutbox();
        if (success) {
          setSyncStatus("synced");
          outboxAttempt.current = 0;
        }
      }
    };
    
    window.addEventListener("online", handleOnline);
    
    // Exponential backoff retry with jitter instead of fixed interval
    function scheduleOutboxRetry() {
      if (outboxRetryTimer.current) clearTimeout(outboxRetryTimer.current);
      const base = Math.min(OUTBOX_BASE_DELAY * Math.pow(2, outboxAttempt.current), OUTBOX_MAX_DELAY);
      const jitter = base * 0.25 * (Math.random() * 2 - 1);
      const delay = Math.max(OUTBOX_BASE_DELAY, Math.round(base + jitter));

      outboxRetryTimer.current = setTimeout(async () => {
        // Skip the retry while the tab is hidden — background fetches are
        // throttled and tend to fail spuriously, which both inflates the
        // backoff exponent and accumulates consecutiveFailures. The
        // heartbeat's visibilitychange handler triggers a fresh attempt
        // the moment the tab is visible again, so deferring here is safe.
        if (!isTabHidden() && navigator.onLine && hasOutbox(userId) && syncStatusRef.current !== "unauthorized") {
          const success = await retryOutbox();
          if (success) {
            setSyncStatus("synced");
            outboxAttempt.current = 0;
          } else {
            outboxAttempt.current++;
          }
        }
        // Schedule next retry if outbox still has data and under max attempts
        if (hasOutbox(userId) && outboxAttempt.current < OUTBOX_MAX_ATTEMPTS) {
          scheduleOutboxRetry();
        }
      }, delay);
    }

    // Kick-off the first scheduled retry if there's an outbox
    if (hasOutbox(userId)) {
      scheduleOutboxRetry();
    }
    
    return () => {
      window.removeEventListener("online", handleOnline);
      if (outboxRetryTimer.current) clearTimeout(outboxRetryTimer.current);
    };
  }, [userId, retryOutbox]);

  // ─────────────────────────────────────────────────────────────────────────────
  // MANUAL RETRY FUNCTION
  // ─────────────────────────────────────────────────────────────────────────────
  const refetch = useCallback(() => {
    if (!userId) return;
    retryCount.current = 0;
    const cancelled = { value: false };
    fetchState(cancelled);
  }, [userId, fetchState]);

  // Manual sync retry - attempts to sync current state or outbox
  const retrySync = useCallback(async () => {
    if (!userId) return false;
    
    // Reset backoff on manual retry
    outboxAttempt.current = 0;
    setSyncStatus("saving");
    
    // First try outbox if it exists
    if (hasOutbox(userId)) {
      const success = await retryOutbox();
      if (success) {
        setSyncStatus("synced");
        return true;
      }
    }
    
    // Try syncing current state
    const result = await syncToServer(db);
    if (result.success) {
      setSyncStatus("synced");
      return true;
    }
    
    // Update status based on error
    if (result.skipped) {
      // Sync already in flight — keep "saving" status, don't show error banner
    } else if (result.unauthorized) {
      setSyncStatus("unauthorized");
    } else if (result.offline) {
      setSyncStatus("offline");
    } else {
      setSyncStatus("error");
    }
    
    return false;
  }, [userId, db, syncToServer, retryOutbox]);

  // ─────────────────────────────────────────────────────────────────────────────
  // FLUSH SYNC - Immediately sync current state to server (bypasses debounce)
  // Used before share operations to ensure server has the latest state
  // ─────────────────────────────────────────────────────────────────────────────
  const flushSync = useCallback(async () => {
    if (!userId || !loadedRef.current) return false;
    
    // Cancel any pending debounced sync to prevent double-sync
    if (saveTimer.current) clearTimeout(saveTimer.current);
    
    // If a sync is already in flight, wait for it to complete
    if (syncInFlight.current) {
      if (IS_DEV) console.log("[syncDb] flushSync: waiting for in-flight sync");
      const deadline = Date.now() + FLUSH_SYNC_TIMEOUT_MS;
      while (syncInFlight.current && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, FLUSH_SYNC_POLL_MS));
      }
      if (syncInFlight.current) {
        if (IS_DEV) console.warn("[syncDb] flushSync: timed out waiting for in-flight sync");
        return false;
      }
    }
    
    const currentDb = dbRef.current;
    if (IS_DEV) {
      console.log("[syncDb] flushSync: immediate sync", {
        tradesCount: currentDb?.trades?.length ?? 0
      });
    }
    
    const result = await syncToServer(currentDb);
    if (result.success) {
      setSyncStatus("synced");
      changeCount.current = 0;
    }
    return result.success;
  }, [userId, syncToServer]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SHARE IN-FLIGHT GUARD - Prevents visibility-change fetchState during share
  // ─────────────────────────────────────────────────────────────────────────────
  const setShareInFlight = useCallback((value) => {
    shareInFlightRef.current = !!value;
    if (IS_DEV) {
      console.log("[syncDb] shareInFlight:", !!value);
    }
  }, []);

  // Get last local save time for UI display
  const getLastSaveTime = useCallback(() => {
    return getLastLocalSaveTime(userId || fallbackUserId);
  }, [userId, fallbackUserId]);
  
  // Count pending operations in outbox
  const getPendingOpsCount = useCallback(() => {
    const outbox = getOutbox(userId || fallbackUserId);
    if (!outbox) return 0;
    // Outbox stores full state, not individual operations
    // Return 1 if there's an outbox (indicating pending sync)
    return 1;
  }, [userId, fallbackUserId]);

  return { 
    db, 
    setDb: isReadOnly ? () => {} : setDb, // Disable setDb in read-only mode
    syncStatus, 
    refetch, 
    retrySync,
    flushSync, // Immediately sync current state to server (bypasses debounce)
    setShareInFlight, // Guard: block visibility-change fetchState during share operations
    lastError,
    hasUnsavedChanges,
    syncProgress, // { current, total, percent } during chunked sync
    getLastSaveTime,
    hasOutbox: hasOutbox(userId || fallbackUserId),
    isReadOnly, // Indicates app is running with cached userId (no auth)
    // Sync diagnostics for debugging and support
    syncDiagnostics: {
      lastSuccessfulSync: lastSuccessfulSync.current,
      pendingOpsCount: getPendingOpsCount(),
      consecutiveFailures: consecutiveFailures.current,
      serverReachable: isServerReachable,
    },
  };
}

// Exported for testing
export { reconcileAccountsEquity, mergeStates };
