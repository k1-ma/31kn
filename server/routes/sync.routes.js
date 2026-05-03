import { Router } from "express";
import { randomUUID } from "crypto";
import { getPool, ensurePool, dbUnavailableResponse } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { restoreStrippedImages, hasStrippedImages } from "../utils/imageRestore.js";
import { isDeleted } from "../utils/tombstones.js";

const router = Router();

const READONLY_ROLES = new Set(
  String(process.env.READONLY_ROLES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

// Structured logging helper
function logSyncOp(operation, userId, details = {}) {
  const logData = {
    ts: new Date().toISOString(),
    op: operation,
    userId,
    ...details,
  };
  console.log(`[sync.routes] ${JSON.stringify(logData)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATEMENT TIMEOUT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Raised timeout for large JSONB writes (3+ months of data can exceed 10s default)
const STATEMENT_TIMEOUT_LARGE_WRITE = "30s";
// Default pool timeout to reset after large write completes
const STATEMENT_TIMEOUT_DEFAULT = "10s";

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOSS PROTECTION CONSTANTS (shared with state.routes.js)
// ─────────────────────────────────────────────────────────────────────────────

// Minimum records count to enable percentage-based protection for any collection
const MIN_RECORDS_FOR_PROTECTION = 10;

// Maximum allowed data loss (50%) before triggering server-side merge
const MAX_ACCEPTABLE_DROP_PERCENTAGE = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// TIMESTAMP-BASED MERGE HELPERS (for data loss protection in chunked sync)
// Mirrors the merge logic in state.routes.js to prevent data loss when
// chunked sync would overwrite server state with fewer records.
// ─────────────────────────────────────────────────────────────────────────────

function getItemTimestamp(item) {
  if (!item) return 0;
  if (typeof item.updatedAt === 'number' && item.updatedAt > 0) return item.updatedAt;
  if (typeof item.createdAt === 'number' && item.createdAt > 0) return item.createdAt;
  return 0;
}

function mergeArraysById(localArr, serverArr) {
  if (!Array.isArray(localArr) && !Array.isArray(serverArr)) {
    return serverArr ?? localArr ?? [];
  }
  if (!Array.isArray(localArr)) return serverArr || [];
  if (!Array.isArray(serverArr)) return localArr || [];

  const serverMap = new Map();
  for (const item of serverArr) {
    if (item && item.id) serverMap.set(item.id, item);
  }

  const localMap = new Map();
  for (const item of localArr) {
    if (item && item.id) localMap.set(item.id, item);
  }

  const mergedMap = new Map();
  const allIds = new Set([...serverMap.keys(), ...localMap.keys()]);

  for (const id of allIds) {
    const serverItem = serverMap.get(id);
    const localItem = localMap.get(id);

    if (!serverItem) {
      mergedMap.set(id, localItem);
    } else if (!localItem) {
      mergedMap.set(id, serverItem);
    } else {
      const serverTs = getItemTimestamp(serverItem);
      const localTs = getItemTimestamp(localItem);
      let mergedItem = serverTs > localTs ? serverItem : localItem;

      const serverDeletedAt = (typeof serverItem.deletedAt === 'number' && serverItem.deletedAt > 0) ? serverItem.deletedAt : null;
      const localDeletedAt = (typeof localItem.deletedAt === 'number' && localItem.deletedAt > 0) ? localItem.deletedAt : null;
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        mergedItem = { ...mergedItem, deletedAt: Math.max(serverDeletedAt ?? 0, localDeletedAt ?? 0) };
      }

      mergedMap.set(id, mergedItem);
    }
  }

  return Array.from(mergedMap.values());
}

function mergeStatesForProtection(incomingState, serverState) {
  if (!serverState) return incomingState;
  if (!incomingState) return serverState;

  const merged = { ...incomingState };

  if (incomingState.trades || serverState.trades) {
    merged.trades = mergeArraysById(incomingState.trades, serverState.trades);
  }
  if (incomingState.accounts || serverState.accounts) {
    merged.accounts = mergeArraysById(incomingState.accounts, serverState.accounts);
  }
  if (incomingState.documents || serverState.documents) {
    merged.documents = mergeArraysById(incomingState.documents, serverState.documents);
  }
  if (incomingState.backtests || serverState.backtests) {
    merged.backtests = mergeArraysById(incomingState.backtests, serverState.backtests);
  }
  if (incomingState.libraries || serverState.libraries) {
    const incomingLib = incomingState.libraries ?? {};
    const serverLib = serverState.libraries ?? {};
    merged.libraries = {
      ...incomingLib,
      symbols: mergeArraysById(incomingLib.symbols, serverLib.symbols),
      sessions: mergeArraysById(incomingLib.sessions, serverLib.sessions),
      models: mergeArraysById(incomingLib.models, serverLib.models),
    };
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-BACKED CHUNK SESSION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a sync session in Postgres (idempotent).
 * Uses session_type to distinguish "ops" vs "state" sessions in the same table.
 * TTL increased to 30 minutes to accommodate VPN users with unstable connections.
 */
async function upsertSession(pool, sessionId, userId, totalChunks) {
  await pool.query(
    `INSERT INTO sync_state_sessions (session_id, user_id, total_chunks, status, created_at, updated_at, expires_at)
     VALUES ($1, $2, $3, 'receiving', now(), now(), now() + interval '30 minutes')
     ON CONFLICT (session_id, user_id) DO UPDATE SET
       updated_at = now(),
       total_chunks = EXCLUDED.total_chunks`,
    [sessionId, userId, totalChunks]
  );
}

/**
 * Upsert a single chunk into Postgres (idempotent via UNIQUE constraint).
 * Returns true if this was a new insert, false if duplicate.
 */
async function upsertChunk(pool, sessionId, userId, chunkIndex, chunkData) {
  const result = await pool.query(
    `INSERT INTO sync_state_chunks (session_id, user_id, chunk_index, chunk_data, created_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (session_id, user_id, chunk_index) DO UPDATE SET
       chunk_data = EXCLUDED.chunk_data
     RETURNING (xmax = 0) AS is_new`,
    [sessionId, userId, chunkIndex, JSON.stringify(chunkData)]
  );
  return result.rows?.[0]?.is_new ?? true;
}

/**
 * Get the count of received chunks and list of received indices for a session.
 */
async function getChunkStatus(pool, sessionId, userId) {
  const result = await pool.query(
    `SELECT chunk_index FROM sync_state_chunks
     WHERE session_id = $1 AND user_id = $2
     ORDER BY chunk_index`,
    [sessionId, userId]
  );
  const receivedIndices = result.rows.map(r => r.chunk_index);
  return { count: receivedIndices.length, receivedIndices };
}

/**
 * Compute which chunk indices are missing (0..totalChunks-1).
 */
function computeMissingChunks(receivedIndices, totalChunks) {
  const receivedSet = new Set(receivedIndices);
  const missing = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!receivedSet.has(i)) missing.push(i);
  }
  return missing;
}

/**
 * Load all chunks for a session from DB, ordered by chunk_index.
 */
async function loadAllChunks(pool, sessionId, userId) {
  const result = await pool.query(
    `SELECT chunk_index, chunk_data FROM sync_state_chunks
     WHERE session_id = $1 AND user_id = $2
     ORDER BY chunk_index`,
    [sessionId, userId]
  );
  return result.rows;
}

/**
 * Delete session and its chunks from DB.
 */
async function cleanupSession(pool, sessionId, userId) {
  await pool.query(
    "DELETE FROM sync_state_chunks WHERE session_id = $1 AND user_id = $2",
    [sessionId, userId]
  );
  await pool.query(
    "DELETE FROM sync_state_sessions WHERE session_id = $1 AND user_id = $2",
    [sessionId, userId]
  );
}

/**
 * Check session ownership. Returns session row or null.
 */
async function getSession(pool, sessionId, userId) {
  const result = await pool.query(
    `SELECT session_id, user_id, total_chunks, status, created_at, expires_at
     FROM sync_state_sessions
     WHERE session_id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  return result.rows?.[0] ?? null;
}

/**
 * Check if a session exists for a different user (ownership check).
 */
async function sessionBelongsToOtherUser(pool, sessionId, userId) {
  const result = await pool.query(
    `SELECT user_id FROM sync_state_sessions WHERE session_id = $1 AND user_id != $2 LIMIT 1`,
    [sessionId, userId]
  );
  return result.rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPIRED SESSION CLEANUP
// On Vercel setInterval doesn't run between invocations, so we trigger this
// probabilistically on chunk requests (5% per request). Errors are surfaced
// to logs (we previously silently swallowed them, leaving 91 orphaned rows).
// ─────────────────────────────────────────────────────────────────────────────
const ORPHAN_CLEANUP_PROBABILITY = 0.05;

async function cleanupExpiredSessions(pool) {
  try {
    // Delete chunks for expired sessions first (and orphaned chunks whose
    // session row is gone — covers the prod-observed orphan case).
    const chunkRes = await pool.query(
      `DELETE FROM sync_state_chunks
       WHERE (session_id, user_id) IN (
         SELECT session_id, user_id FROM sync_state_sessions WHERE expires_at < now()
       )
       OR NOT EXISTS (
         SELECT 1 FROM sync_state_sessions s
         WHERE s.session_id = sync_state_chunks.session_id
           AND s.user_id = sync_state_chunks.user_id
       )`
    );
    const sessionRes = await pool.query(
      "DELETE FROM sync_state_sessions WHERE expires_at < now()"
    );
    const removedChunks = chunkRes.rowCount ?? 0;
    const removedSessions = sessionRes.rowCount ?? 0;
    if (removedChunks > 0 || removedSessions > 0) {
      console.log(
        `[sync.routes] cleanupExpiredSessions removed chunks=${removedChunks} sessions=${removedSessions}`
      );
    }
  } catch (err) {
    console.error(
      "[sync.routes] cleanupExpiredSessions failed:",
      err?.message || err,
      err?.stack || ""
    );
  }
}

// Probabilistic per-request trigger so Vercel deployments still cycle expired
// rows even though setInterval is unreliable between serverless invocations.
function maybeCleanupExpiredSessions(pool) {
  if (Math.random() < ORPHAN_CLEANUP_PROBABILITY) {
    cleanupExpiredSessions(pool);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKED OPERATIONS SYNC
// POST /api/sync/chunk - Receive a chunk of operations
// ─────────────────────────────────────────────────────────────────────────────
router.post("/chunk", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    logSyncOp("chunk", req.session?.userId, { error: "db_unavailable" });
    return res.status(503).json(dbUnavailableResponse());
  }

  const userId = req.session.userId;

  if (READONLY_ROLES.has(String(req.user?.role || "").toLowerCase())) {
    logSyncOp("chunk", userId, { error: "readonly_role" });
    return res.status(403).json({ error: "Read-only role" });
  }

  const { chunkIndex, totalChunks, operations, isLast } = req.body || {};
  let sessionId = req.body?.sessionId;

  // SessionId handshake
  if (!sessionId || typeof sessionId !== "string") {
    if (typeof chunkIndex === "number" && chunkIndex > 0) {
      return res.status(409).json({
        ok: false,
        code: "SESSION_ID_REQUIRED",
        message: "Restart upload from chunk 0",
      });
    }
    sessionId = randomUUID();
  }

  // Validate request
  if (typeof chunkIndex !== "number" || chunkIndex < 0) {
    return res.status(400).json({ error: "Missing or invalid chunkIndex", code: "INVALID_CHUNK_INDEX" });
  }
  if (typeof totalChunks !== "number" || totalChunks < 1) {
    return res.status(400).json({ error: "Missing or invalid totalChunks", code: "INVALID_TOTAL_CHUNKS" });
  }
  if (!Array.isArray(operations)) {
    return res.status(400).json({ error: "Operations must be an array", code: "INVALID_OPERATIONS" });
  }

  // Always run on the first chunk; otherwise run probabilistically (5%) so
  // Vercel-style serverless deployments still flush expired/orphaned rows.
  if (chunkIndex === 0) {
    cleanupExpiredSessions(pool);
  } else {
    maybeCleanupExpiredSessions(pool);
  }

  const opSessionId = `ops:${sessionId}`;

  try {
    // Check ownership
    if (await sessionBelongsToOtherUser(pool, opSessionId, userId)) {
      logSyncOp("chunk", userId, { error: "session_mismatch", sessionId });
      return res.status(403).json({ error: "Session belongs to another user", code: "SESSION_MISMATCH" });
    }

    // For chunkIndex > 0, verify session exists (handles different server instance)
    if (chunkIndex > 0) {
      const existingSession = await getSession(pool, opSessionId, userId);
      if (!existingSession) {
        logSyncOp("chunk", userId, { error: "session_not_found", sessionId });
        return res.status(409).json({
          ok: false,
          code: "SESSION_NOT_FOUND_RETRY",
          message: "Restart upload (new server instance)",
        });
      }
      
      // Check if session has expired
      if (new Date(existingSession.expires_at) < new Date()) {
        logSyncOp("chunk", userId, { error: "session_expired", sessionId });
        // Clean up the expired session
        await cleanupSession(pool, opSessionId, userId);
        return res.status(409).json({
          ok: false,
          code: "SESSION_EXPIRED_RETRY",
          message: "Session expired, restart upload",
        });
      }
    }

    // Upsert session and chunk
    await upsertSession(pool, opSessionId, userId, totalChunks);
    const isNew = await upsertChunk(pool, opSessionId, userId, chunkIndex, { operations });

    // Get current chunk status
    const { count: chunksReceived, receivedIndices } = await getChunkStatus(pool, opSessionId, userId);

    const opIds = operations.map(op => op.opId).filter(Boolean);

    logSyncOp("chunk", userId, {
      sessionId,
      chunkIndex,
      totalChunks,
      operationsCount: operations.length,
      opIds: opIds.slice(0, 5),
      isLast,
      chunksReceived,
      duplicate: !isNew
    });

    // Idempotency: if duplicate chunk, still check if we can finalize
    // Finalize ONLY when ALL chunks are received
    if (chunksReceived === totalChunks) {
      // All chunks received - assemble and apply operations
      const allChunkRows = await loadAllChunks(pool, opSessionId, userId);

      const allOperations = [];
      for (const row of allChunkRows) {
        const chunkOps = row.chunk_data?.operations || [];
        allOperations.push(...chunkOps);
      }

      const result = await applyOperations(pool, userId, allOperations);

      // Clean up session
      await cleanupSession(pool, opSessionId, userId);

      logSyncOp("chunk", userId, {
        sessionId,
        status: "complete",
        totalOperations: allOperations.length,
        newVersion: result.version,
        tradeCount: result.tradeCount
      });

      return res.json({
        ok: true,
        status: "complete",
        sessionId,
        version: result.version,
        updated_at: result.updated_at,
        operationsApplied: allOperations.length,
        tradeCount: result.tradeCount
      });
    }

    // Not all chunks yet
    if (isLast) {
      // Client thinks this is the last chunk but we're missing some
      const missingChunks = computeMissingChunks(receivedIndices, totalChunks);
      logSyncOp("chunk", userId, {
        sessionId,
        status: "receiving",
        code: "PARTIAL_CHUNKS_RECEIVED",
        chunksReceived,
        totalChunks,
        missingChunks
      });
      return res.status(202).json({
        ok: true,
        status: "receiving",
        sessionId,
        code: "PARTIAL_CHUNKS_RECEIVED",
        chunksReceived,
        totalChunks,
        missingChunks
      });
    }

    return res.json({
      ok: true,
      status: "receiving",
      sessionId,
      chunksReceived,
      totalChunks,
    });
  } catch (err) {
    logSyncOp("chunk", userId, {
      error: err?.message || "unknown",
      sessionId,
      status: "failed"
    });
    return res.status(500).json({
      error: "Failed to process chunk",
      code: "CHUNK_FAILED",
      details: err?.message
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKED STATE SYNC
// POST /api/sync/state-chunk - Receive a chunk of full state
// ─────────────────────────────────────────────────────────────────────────────
router.post("/state-chunk", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    logSyncOp("state-chunk", req.session?.userId, { error: "db_unavailable" });
    return res.status(503).json(dbUnavailableResponse());
  }

  const userId = req.session.userId;

  if (READONLY_ROLES.has(String(req.user?.role || "").toLowerCase())) {
    logSyncOp("state-chunk", userId, { error: "readonly_role" });
    return res.status(403).json({ error: "Read-only role" });
  }

  const { chunkIndex, totalChunks, chunk, isLast, expected_version } = req.body || {};
  let sessionId = req.body?.sessionId;

  // SessionId handshake
  if (!sessionId || typeof sessionId !== "string") {
    if (typeof chunkIndex === "number" && chunkIndex > 0) {
      return res.status(409).json({
        ok: false,
        code: "SESSION_ID_REQUIRED",
        message: "Restart upload from chunk 0",
      });
    }
    sessionId = randomUUID();
  }

  // Validate request
  if (typeof chunkIndex !== "number" || chunkIndex < 0) {
    return res.status(400).json({ error: "Missing or invalid chunkIndex", code: "INVALID_CHUNK_INDEX" });
  }
  if (typeof totalChunks !== "number" || totalChunks < 1) {
    return res.status(400).json({ error: "Missing or invalid totalChunks", code: "INVALID_TOTAL_CHUNKS" });
  }
  if (!chunk || typeof chunk !== "object") {
    return res.status(400).json({ error: "Chunk must be an object", code: "INVALID_CHUNK" });
  }

  // Always run on the first chunk; otherwise run probabilistically (5%) so
  // Vercel-style serverless deployments still flush expired/orphaned rows.
  if (chunkIndex === 0) {
    cleanupExpiredSessions(pool);
  } else {
    maybeCleanupExpiredSessions(pool);
  }

  const stateSessionId = `state:${sessionId}`;

  try {
    // Check ownership
    if (await sessionBelongsToOtherUser(pool, stateSessionId, userId)) {
      logSyncOp("state-chunk", userId, { error: "session_mismatch", sessionId });
      return res.status(403).json({ error: "Session belongs to another user", code: "SESSION_MISMATCH" });
    }

    // For chunkIndex > 0, check session state
    if (chunkIndex > 0) {
      const existingSession = await getSession(pool, stateSessionId, userId);
      if (!existingSession) {
        // Session not found — log and continue. upsertSession below will create it.
        // This gracefully handles Vercel serverless cold starts, connection-pool
        // switches, and transient Postgres read-replica lag instead of forcing
        // the client to restart the entire upload from scratch.
        logSyncOp("state-chunk", userId, { action: "session_auto_created", sessionId, chunkIndex });
      } else if (new Date(existingSession.expires_at) < new Date()) {
        // Session expired — chunks may have been cleaned up, must restart
        logSyncOp("state-chunk", userId, { error: "session_expired", sessionId });
        await cleanupSession(pool, stateSessionId, userId);
        return res.status(409).json({
          ok: false,
          code: "SESSION_EXPIRED_RETRY",
          message: "Session expired, restart upload",
        });
      }
    }

    // Upsert session and chunk
    await upsertSession(pool, stateSessionId, userId, totalChunks);
    const isNew = await upsertChunk(pool, stateSessionId, userId, chunkIndex, chunk);

    // Get current chunk status
    const { count: chunksReceived, receivedIndices } = await getChunkStatus(pool, stateSessionId, userId);

    logSyncOp("state-chunk", userId, {
      sessionId,
      chunkIndex,
      totalChunks,
      chunkType: chunk.type,
      isLast,
      chunksReceived,
      duplicate: !isNew
    });

    // Finalize ONLY when ALL chunks are received
    if (chunksReceived === totalChunks) {
      // All chunks received - assemble state from DB
      const allChunkRows = await loadAllChunks(pool, stateSessionId, userId);

      // Reassemble the state from ordered chunks
      let assembledState = {};
      const arrayBatches = new Map();

      for (const row of allChunkRows) {
        const c = row.chunk_data;
        if (c.type === "fullState") {
          assembledState = c.data;
        } else if (c.type === "partialState") {
          Object.assign(assembledState, c.data);
        } else if (c.type === "arrayBatch") {
          const key = c.key;
          if (!arrayBatches.has(key)) {
            arrayBatches.set(key, { batches: [], totalLength: c.totalLength });
          }
          arrayBatches.get(key).batches.push({
            startIndex: c.startIndex,
            data: c.data
          });
        }
      }

      // Assemble array batches - only finalize with complete data
      for (const [key, { batches, totalLength }] of arrayBatches) {
        batches.sort((a, b) => a.startIndex - b.startIndex);
        const combined = new Array(totalLength);
        for (const batch of batches) {
          for (let i = 0; i < batch.data.length; i++) {
            combined[batch.startIndex + i] = batch.data[i];
          }
        }
        // Verify completeness: all slots should be filled
        const filledCount = combined.filter(item => item !== undefined).length;
        if (filledCount < totalLength) {
          logSyncOp("state-chunk", userId, {
            sessionId,
            error: "incomplete_array_batch_abort",
            key,
            expectedLength: totalLength,
            filledCount,
            severity: "CRITICAL"
          });
          // CRITICAL FIX: Abort save to prevent permanent data loss.
          // Missing array slots mean chunks were corrupted or lost in transit.
          // Saving incomplete data would overwrite the server's complete state.
          await cleanupSession(pool, stateSessionId, userId);
          return res.status(409).json({
            ok: false,
            code: "INCOMPLETE_ARRAY_BATCH",
            message: `Array '${key}' is incomplete: ${filledCount}/${totalLength} items. Retry required.`,
            key,
            expectedLength: totalLength,
            filledCount
          });
        }
        // Only include defined items (no undefined holes)
        assembledState[key] = combined.filter(item => item !== undefined);
      }

      // No version check - let server always accept client state (matches PUT behavior)
      // Client-side merge on load handles conflicts when multiple tabs/devices sync

      // Fetch current server state for image restoration AND data loss protection.
      // Both checks need the current state, so we do a single query.
      let currentState = null;
      try {
        const currentRow = await pool.query(
          "SELECT state_json FROM states WHERE user_id = $1",
          [userId]
        );
        currentState = currentRow.rows?.[0]?.state_json;
      } catch (fetchErr) {
        logSyncOp("state-chunk", userId, {
          sessionId,
          warning: "fetch_current_state_failed",
          error: fetchErr?.message
        });
        // Continue — we can still save, just without protection/restoration
      }

      // CRITICAL: Restore images stripped during chunking.
      // ensureChunksFitBodyLimit replaces base64 images with [IMAGE_STRIPPED]
      // when a chunk exceeds the Vercel body limit. Without this restoration,
      // the full state replacement would permanently lose those images.
      if (hasStrippedImages(assembledState)) {
        if (currentState) {
          try {
            assembledState = restoreStrippedImages(assembledState, currentState);
            logSyncOp("state-chunk", userId, {
              sessionId,
              info: "restored_stripped_images"
            });
          } catch (restoreErr) {
            logSyncOp("state-chunk", userId, {
              sessionId,
              warning: "restore_stripped_images_failed",
              error: restoreErr?.message
            });
          }
        }
      }

      // DATA LOSS PROTECTION: Prevent chunked sync from overwriting server data
      // with significantly fewer records. This matches the protection in PUT /api/state
      // (state.routes.js) which was previously missing from the chunked sync path.
      if (currentState) {
        const incomingTradesCount = assembledState?.trades?.length ?? 0;
        const serverTradesCount = currentState?.trades?.length ?? 0;
        const incomingBacktestsCount = assembledState?.backtests?.length ?? 0;
        const serverBacktestsCount = currentState?.backtests?.length ?? 0;

        let shouldMerge = false;
        let mergeReason = "";

        // Block complete data wipe for trades
        if (incomingTradesCount === 0 && serverTradesCount > 0) {
          shouldMerge = true;
          mergeReason = "chunked_merge_prevent_trades_wipe";
        }
        // Block complete data wipe for backtests
        else if (incomingBacktestsCount === 0 && serverBacktestsCount > 0) {
          shouldMerge = true;
          mergeReason = "chunked_merge_prevent_backtests_wipe";
        }
        // Detect partial data loss for trades (>50% reduction)
        else if (serverTradesCount > MIN_RECORDS_FOR_PROTECTION && incomingTradesCount > 0) {
          const dropPercentage = (serverTradesCount - incomingTradesCount) / serverTradesCount;
          if (dropPercentage > MAX_ACCEPTABLE_DROP_PERCENTAGE) {
            shouldMerge = true;
            mergeReason = "chunked_merge_prevent_trades_partial_loss";
          }
        }
        // Detect partial data loss for backtests (>50% reduction)
        else if (serverBacktestsCount > MIN_RECORDS_FOR_PROTECTION && incomingBacktestsCount > 0) {
          const dropPercentage = (serverBacktestsCount - incomingBacktestsCount) / serverBacktestsCount;
          if (dropPercentage > MAX_ACCEPTABLE_DROP_PERCENTAGE) {
            shouldMerge = true;
            mergeReason = "chunked_merge_prevent_backtests_partial_loss";
          }
        }

        if (shouldMerge) {
          logSyncOp("state-chunk", userId, {
            sessionId,
            action: mergeReason,
            incomingTradesCount,
            serverTradesCount,
            incomingBacktestsCount,
            serverBacktestsCount,
            severity: "CRITICAL"
          });
          assembledState = mergeStatesForProtection(assembledState, currentState);
          logSyncOp("state-chunk", userId, {
            sessionId,
            action: "chunked_merge_completed",
            reason: mergeReason,
            mergedTradesCount: assembledState?.trades?.length ?? 0,
            mergedBacktestsCount: assembledState?.backtests?.length ?? 0
          });
        }
      }

      // Save assembled state
      const result = await saveState(pool, userId, assembledState);

      // Clean up session
      await cleanupSession(pool, stateSessionId, userId);

      const tradeCount = assembledState?.trades?.length ?? 0;
      const stateSize = JSON.stringify(assembledState).length;
      logSyncOp("state-chunk", userId, {
        sessionId,
        status: "complete",
        newVersion: result.version,
        tradeCount,
        stateSize
      });

      return res.json({
        ok: true,
        status: "complete",
        sessionId,
        version: result.version,
        updated_at: result.updated_at,
        tradeCount
      });
    }

    // Not all chunks yet
    if (isLast) {
      // Client thinks this is the last chunk but we're missing some
      const missingChunks = computeMissingChunks(receivedIndices, totalChunks);
      logSyncOp("state-chunk", userId, {
        sessionId,
        status: "receiving",
        code: "PARTIAL_CHUNKS_RECEIVED",
        chunksReceived,
        totalChunks,
        missingChunks
      });
      return res.status(202).json({
        ok: true,
        status: "receiving",
        sessionId,
        code: "PARTIAL_CHUNKS_RECEIVED",
        chunksReceived,
        totalChunks,
        missingChunks
      });
    }

    return res.json({
      ok: true,
      status: "receiving",
      sessionId,
      chunksReceived,
      totalChunks,
    });
  } catch (err) {
    logSyncOp("state-chunk", userId, {
      error: err?.message || "unknown",
      sessionId,
      status: "failed"
    });
    return res.status(500).json({
      error: "Failed to save state chunk",
      code: "SAVE_FAILED",
      details: err?.message
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Apply operations to state
// ─────────────────────────────────────────────────────────────────────────────
async function applyOperations(pool, userId, operations) {
  const client = await pool.connect();
  
  try {
    // Raise statement_timeout for large JSONB writes (e.g. 3+ months of data)
    await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_LARGE_WRITE}'`);
    await client.query("BEGIN");
    
    // Get current state with lock
    const current = await client.query(
      "SELECT state_json, version FROM states WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    
    let state = current.rows?.[0]?.state_json ?? {};
    
    // Apply each operation
    for (const op of operations) {
      state = applyOperation(state, op);
    }
    
    // Save updated state
    const result = await client.query(
      `INSERT INTO states (user_id, state_json, updated_at, version)
       VALUES ($1, $2, now(), 1)
       ON CONFLICT (user_id) DO UPDATE SET 
         state_json = EXCLUDED.state_json, 
         updated_at = now(),
         version = states.version + 1
       RETURNING updated_at, version`,
      [userId, state]
    );
    
    await client.query("COMMIT");
    
    return {
      version: result.rows?.[0]?.version ?? 1,
      updated_at: result.rows?.[0]?.updated_at,
      tradeCount: Array.isArray(state?.trades) ? state.trades.length : 0
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_DEFAULT}'`).catch(() => {});
    client.release();
  }
}

// Apply a single operation to state
function applyOperation(state, op) {
  const { type, collection, entityId, data } = op;
  
  switch (type) {
    case "set":
      // Set a top-level key
      if (collection === "state") {
        return { ...state, ...data };
      }
      return { ...state, [collection]: data };
      
    case "setBatch":
      // Set a batch of items in an array (for partial array updates)
      if (!state[collection]) state[collection] = [];
      const items = data?.items || [];
      const startIndex = data?.startIndex ?? 0;
      
      // Ensure array is large enough
      while (state[collection].length < startIndex + items.length) {
        state[collection].push(null);
      }
      
      // Insert items
      for (let i = 0; i < items.length; i++) {
        state[collection][startIndex + i] = items[i];
      }
      
      // Filter out nulls
      state[collection] = state[collection].filter(item => item !== null);
      return state;
      
    case "create":
      // Add item to collection
      if (!state[collection]) state[collection] = [];
      if (Array.isArray(state[collection])) {
        // Check if item already exists (idempotency)
        const exists = state[collection].some(item => item?.id === entityId);
        if (!exists) {
          state[collection].push(data);
        }
      }
      return state;
      
    case "update":
      // Update item in collection
      if (Array.isArray(state[collection])) {
        const index = state[collection].findIndex(item => item?.id === entityId);
        if (index >= 0) {
          // Restore any [IMAGE_STRIPPED] fields from the existing item
          // to prevent chunked operation splitting from permanently losing images
          const updatedData = hasStrippedImages(data)
            ? restoreStrippedImages(data, state[collection][index])
            : data;
          state[collection][index] = updatedData;
        } else {
          // If not found, create it (handles out-of-order operations)
          state[collection].push(data);
        }
      }
      return state;
      
    case "delete":
      // Remove item from collection
      if (Array.isArray(state[collection])) {
        state[collection] = state[collection].filter(item => item?.id !== entityId);
      }
      return state;
      
    default:
      // Unknown operation type - ignore
      console.warn(`[sync] Unknown operation type: ${type}`);
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Save full state
// ─────────────────────────────────────────────────────────────────────────────
async function saveState(pool, userId, state) {
  // Use a dedicated client with raised statement_timeout for large JSONB writes.
  // The default pool timeout (10s) is too short for users with 3+ months of data.
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_LARGE_WRITE}'`);
    const result = await client.query(
      `INSERT INTO states (user_id, state_json, updated_at, version)
       VALUES ($1, $2, now(), 1)
       ON CONFLICT (user_id) DO UPDATE SET 
         state_json = EXCLUDED.state_json, 
         updated_at = now(),
         version = states.version + 1
       RETURNING updated_at, version`,
      [userId, state]
    );
    
    return {
      version: result.rows?.[0]?.version ?? 1,
      updated_at: result.rows?.[0]?.updated_at
    };
  } finally {
    await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_DEFAULT}'`).catch(() => {});
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync/session/:sessionId - Get sync session status
// ─────────────────────────────────────────────────────────────────────────────
router.get("/session/:sessionId", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  const { sessionId } = req.params;
  const userId = req.session.userId;

  try {
    // Check both ops: and state: prefixed sessions
    let session = await getSession(pool, sessionId, userId);
    if (!session) session = await getSession(pool, `ops:${sessionId}`, userId);
    if (!session) session = await getSession(pool, `state:${sessionId}`, userId);

    if (!session) {
      return res.status(404).json({ error: "Session not found", code: "SESSION_NOT_FOUND" });
    }

    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ error: "Session expired", code: "SESSION_EXPIRED" });
    }

    const { count: chunksReceived } = await getChunkStatus(pool, session.session_id, userId);

    return res.json({
      sessionId,
      status: session.status,
      chunksReceived,
      totalChunks: session.total_chunks,
      createdAt: session.created_at,
      expiresAt: session.expires_at
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to get session status", details: err?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sync/session/:sessionId - Cancel a sync session
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/session/:sessionId", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  const { sessionId } = req.params;
  const userId = req.session.userId;

  try {
    // Try to clean up both prefixed sessions
    await cleanupSession(pool, sessionId, userId);
    await cleanupSession(pool, `ops:${sessionId}`, userId);
    await cleanupSession(pool, `state:${sessionId}`, userId);

    logSyncOp("session-cancel", userId, { sessionId });
    return res.json({ ok: true, cancelled: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to cancel session", details: err?.message });
  }
});

export default router;
