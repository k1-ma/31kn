/**
 * @fileoverview Server-side tests for chunked sync logic.
 * Tests the critical safety guarantees:
 * 1. Partial chunks (isLast=true but missing chunks) must NOT save state
 * 2. All chunks received in any order → state correctly assembled
 * 3. Two parallel sessions for same user → no cross-contamination
 *
 * Uses a mock Postgres pool that simulates the sync_state_sessions/sync_state_chunks tables.
 * Run with: node server/__tests__/syncChunked.server.test.js
 */

// Simple test framework (same as existing client tests)
let passed = 0;
let failed = 0;
const asyncTests = [];

function test(name, fn) {
  asyncTests.push({ name, fn });
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected ${actual} to be truthy`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected ${actual} to be falsy`);
      }
    },
    toContain(expected) {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`);
        }
      } else {
        throw new Error(`Expected an array, got ${typeof actual}`);
      }
    },
    toHaveLength(expected) {
      const len = Array.isArray(actual) ? actual.length : actual?.length;
      if (len !== expected) {
        throw new Error(`Expected length ${expected}, got ${len}`);
      }
    },
    not: {
      toContain(expected) {
        if (Array.isArray(actual) && actual.includes(expected)) {
          throw new Error(`Expected array NOT to contain ${JSON.stringify(expected)}`);
        }
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK POSTGRES POOL
// Simulates the sync_state_sessions and sync_state_chunks tables in-memory
// for testing the chunked sync logic without a real database.
// ─────────────────────────────────────────────────────────────────────────────

function createMockPool() {
  const sessions = new Map(); // key: `${session_id}:${user_id}` → session row
  const chunks = new Map();   // key: `${session_id}:${user_id}:${chunk_index}` → chunk row
  const states = new Map();   // key: user_id → { state_json, version }
  let saveCalled = false;

  function query(sql, params = []) {
    const text = sql.replace(/\s+/g, " ").trim();

    // INSERT session (upsert)
    if (text.includes("INSERT INTO sync_state_sessions")) {
      const [session_id, user_id, total_chunks] = params;
      const key = `${session_id}:${user_id}`;
      if (!sessions.has(key)) {
        sessions.set(key, {
          session_id, user_id, total_chunks,
          status: "receiving",
          created_at: new Date(),
          updated_at: new Date(),
          expires_at: new Date(Date.now() + 300000),
        });
      } else {
        const s = sessions.get(key);
        s.updated_at = new Date();
        s.total_chunks = total_chunks;
      }
      return { rows: [] };
    }

    // INSERT chunk (upsert)
    if (text.includes("INSERT INTO sync_state_chunks")) {
      const [session_id, user_id, chunk_index, chunk_data] = params;
      const key = `${session_id}:${user_id}:${chunk_index}`;
      const isNew = !chunks.has(key);
      const parsed = typeof chunk_data === "string" ? JSON.parse(chunk_data) : chunk_data;
      chunks.set(key, {
        session_id, user_id, chunk_index,
        chunk_data: parsed,
        created_at: new Date(),
      });
      return { rows: [{ is_new: isNew }] };
    }

    // SELECT chunk_index (for getChunkStatus)
    if (text.includes("SELECT chunk_index FROM sync_state_chunks")) {
      const [session_id, user_id] = params;
      const prefix = `${session_id}:${user_id}:`;
      const rows = [];
      for (const [k, v] of chunks) {
        if (k.startsWith(prefix)) {
          rows.push({ chunk_index: v.chunk_index });
        }
      }
      rows.sort((a, b) => a.chunk_index - b.chunk_index);
      return { rows };
    }

    // SELECT chunk_index, chunk_data (for loadAllChunks)
    if (text.includes("SELECT chunk_index, chunk_data FROM sync_state_chunks")) {
      const [session_id, user_id] = params;
      const prefix = `${session_id}:${user_id}:`;
      const rows = [];
      for (const [k, v] of chunks) {
        if (k.startsWith(prefix)) {
          rows.push({ chunk_index: v.chunk_index, chunk_data: v.chunk_data });
        }
      }
      rows.sort((a, b) => a.chunk_index - b.chunk_index);
      return { rows };
    }

    // SELECT session
    if (text.includes("SELECT session_id, user_id, total_chunks")) {
      const [session_id, user_id] = params;
      const key = `${session_id}:${user_id}`;
      const s = sessions.get(key);
      return { rows: s ? [s] : [] };
    }

    // SELECT user_id FROM sync_state_sessions WHERE session_id AND user_id != 
    if (text.includes("SELECT user_id FROM sync_state_sessions") && text.includes("!=")) {
      const [session_id, user_id] = params;
      const rows = [];
      for (const [, v] of sessions) {
        if (v.session_id === session_id && v.user_id !== user_id) {
          rows.push({ user_id: v.user_id });
        }
      }
      return { rows };
    }

    // DELETE chunks
    if (text.includes("DELETE FROM sync_state_chunks WHERE session_id")) {
      const [session_id, user_id] = params;
      const prefix = `${session_id}:${user_id}:`;
      for (const k of [...chunks.keys()]) {
        if (k.startsWith(prefix)) chunks.delete(k);
      }
      return { rows: [] };
    }

    // DELETE session
    if (text.includes("DELETE FROM sync_state_sessions WHERE session_id")) {
      const [session_id, user_id] = params;
      sessions.delete(`${session_id}:${user_id}`);
      return { rows: [] };
    }

    // DELETE expired (cleanup)
    if (text.includes("DELETE FROM sync_state_chunks WHERE (session_id, user_id) IN")) {
      return { rows: [] };
    }
    if (text.includes("DELETE FROM sync_state_sessions WHERE expires_at")) {
      return { rows: [] };
    }

    // INSERT into states (saveState)
    if (text.includes("INSERT INTO states")) {
      const [user_id, state_json] = params;
      saveCalled = true;
      const current = states.get(user_id);
      const newVersion = (current?.version ?? 0) + 1;
      const parsed = typeof state_json === "string" ? JSON.parse(state_json) : state_json;
      states.set(user_id, { state_json: parsed, version: newVersion });
      return {
        rows: [{ updated_at: new Date(), version: newVersion }],
      };
    }

    // SELECT from states (for version check)
    if (text.includes("SELECT version, state_json FROM states") || text.includes("SELECT state_json, version FROM states")) {
      const [user_id] = params;
      const s = states.get(user_id);
      return { rows: s ? [s] : [] };
    }

    return { rows: [] };
  }

  return {
    query,
    connect: () => ({
      query,
      release: () => {},
    }),
    _sessions: sessions,
    _chunks: chunks,
    _states: states,
    get saveCalled() { return saveCalled; },
    resetSaveCalled() { saveCalled = false; },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulate the server-side route handler logic
// (extracted from sync.routes.js for testability)
// ─────────────────────────────────────────────────────────────────────────────

async function upsertSession(pool, sessionId, userId, totalChunks) {
  await pool.query(
    `INSERT INTO sync_state_sessions (session_id, user_id, total_chunks, status, created_at, updated_at, expires_at)
     VALUES ($1, $2, $3, 'receiving', now(), now(), now() + interval '5 minutes')
     ON CONFLICT (session_id, user_id) DO UPDATE SET
       updated_at = now(),
       total_chunks = EXCLUDED.total_chunks`,
    [sessionId, userId, totalChunks]
  );
}

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

function computeMissingChunks(receivedIndices, totalChunks) {
  const receivedSet = new Set(receivedIndices);
  const missing = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!receivedSet.has(i)) missing.push(i);
  }
  return missing;
}

async function loadAllChunks(pool, sessionId, userId) {
  const result = await pool.query(
    `SELECT chunk_index, chunk_data FROM sync_state_chunks
     WHERE session_id = $1 AND user_id = $2
     ORDER BY chunk_index`,
    [sessionId, userId]
  );
  return result.rows;
}

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

async function saveState(pool, userId, state) {
  const result = await pool.query(
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
}

import { randomUUID } from "crypto";

/**
 * Simulate the state-chunk endpoint logic (with sessionId handshake).
 * Returns { status, body, statusCode }
 */
async function simulateStateChunkEndpoint(pool, userId, { sessionId, chunkIndex, totalChunks, chunk, isLast, expected_version }) {
  // SessionId handshake
  if (!sessionId || typeof sessionId !== "string") {
    if (typeof chunkIndex === "number" && chunkIndex > 0) {
      return {
        statusCode: 409,
        body: {
          ok: false,
          code: "SESSION_ID_REQUIRED",
          message: "Restart upload from chunk 0",
        }
      };
    }
    sessionId = randomUUID();
  }

  const stateSessionId = `state:${sessionId}`;

  // For chunkIndex > 0, check session state
  if (chunkIndex > 0) {
    const existingSession = await getSession(pool, stateSessionId, userId);
    if (!existingSession) {
      // Session not found — continue and let upsertSession create it.
      // This mirrors the production route which gracefully handles
      // Vercel serverless cold starts / transient DB issues.
    }
  }

  await upsertSession(pool, stateSessionId, userId, totalChunks);
  await upsertChunk(pool, stateSessionId, userId, chunkIndex, chunk);

  const { count: chunksReceived, receivedIndices } = await getChunkStatus(pool, stateSessionId, userId);

  // Finalize ONLY when ALL chunks are received
  if (chunksReceived === totalChunks) {
    const allChunkRows = await loadAllChunks(pool, stateSessionId, userId);

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
        arrayBatches.get(key).batches.push({ startIndex: c.startIndex, data: c.data });
      }
    }

    for (const [key, { batches, totalLength }] of arrayBatches) {
      batches.sort((a, b) => a.startIndex - b.startIndex);
      const combined = [];
      for (const batch of batches) {
        for (let i = 0; i < batch.data.length; i++) {
          combined[batch.startIndex + i] = batch.data[i];
        }
      }
      assembledState[key] = combined.filter(item => item !== undefined);
    }

    // Optimistic concurrency check
    if (typeof expected_version === "number") {
      const current = await pool.query(
        "SELECT version, state_json FROM states WHERE user_id = $1",
        [userId]
      );
      const currentVersion = current.rows?.[0]?.version ?? 0;
      if (currentVersion !== expected_version) {
        return {
          statusCode: 409,
          body: {
            error: "Version conflict",
            code: "VERSION_CONFLICT",
            expected_version,
            current_version: currentVersion,
          }
        };
      }
    }

    const result = await saveState(pool, userId, assembledState);
    await cleanupSession(pool, stateSessionId, userId);

    return {
      statusCode: 200,
      body: {
        ok: true,
        status: "complete",
        sessionId,
        version: result.version,
        updated_at: result.updated_at,
      }
    };
  }

  // Not all chunks yet
  if (isLast) {
    const missingChunks = computeMissingChunks(receivedIndices, totalChunks);
    return {
      statusCode: 202,
      body: {
        ok: true,
        status: "receiving",
        sessionId,
        code: "PARTIAL_CHUNKS_RECEIVED",
        chunksReceived,
        totalChunks,
        missingChunks,
      }
    };
  }

  return {
    statusCode: 200,
    body: {
      ok: true,
      status: "receiving",
      sessionId,
      chunksReceived,
      totalChunks,
    }
  };
}

async function getSession(pool, sessionId, userId) {
  const result = await pool.query(
    `SELECT session_id, user_id, total_chunks, status, created_at, expires_at
     FROM sync_state_sessions
     WHERE session_id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  return result.rows?.[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== Server Chunked Sync Tests ===\n");

test("Only last chunk sent (isLast=true) with totalChunks=5 → server does NOT save state, returns missingChunks", async () => {
  const pool = createMockPool();
  const userId = 1;
  const sessionId = "test-session-partial";
  const totalChunks = 5;

  // First create the session by sending chunk 0
  await simulateStateChunkEndpoint(pool, userId, {
    sessionId,
    chunkIndex: 0,
    totalChunks,
    chunk: { type: "partialState", data: { ui: { sidebar: true } } },
    isLast: false,
  });

  // Send only the last chunk (index 4) with isLast=true (chunks 1-3 missing)
  const result = await simulateStateChunkEndpoint(pool, userId, {
    sessionId,
    chunkIndex: 4,
    totalChunks,
    chunk: { type: "partialState", data: { settings: { theme: "dark" } } },
    isLast: true,
  });

  // Server must NOT save state
  expect(pool.saveCalled).toBeFalsy();

  // Must return 202 with "receiving" status
  expect(result.statusCode).toBe(202);
  expect(result.body.status).toBe("receiving");
  expect(result.body.code).toBe("PARTIAL_CHUNKS_RECEIVED");
  expect(result.body.chunksReceived).toBe(2);
  expect(result.body.totalChunks).toBe(5);

  // Must return the list of missing chunk indices
  expect(result.body.missingChunks).toHaveLength(3);
  expect(result.body.missingChunks).toContain(1);
  expect(result.body.missingChunks).toContain(2);
  expect(result.body.missingChunks).toContain(3);
  expect(result.body.missingChunks).not.toContain(0);
  expect(result.body.missingChunks).not.toContain(4);
});

test("All 5 chunks sent in order → state correctly assembled and saved", async () => {
  const pool = createMockPool();
  const userId = 1;
  const sessionId = "test-session-complete";
  const totalChunks = 5;

  const chunksData = [
    { type: "partialState", data: { ui: { theme: "dark" } } },
    { type: "partialState", data: { settings: { lang: "en" } } },
    { type: "arrayBatch", key: "trades", data: [{ id: "t1", name: "Trade 1" }, { id: "t2", name: "Trade 2" }], startIndex: 0, totalLength: 5 },
    { type: "arrayBatch", key: "trades", data: [{ id: "t3", name: "Trade 3" }, { id: "t4", name: "Trade 4" }], startIndex: 2, totalLength: 5 },
    { type: "arrayBatch", key: "trades", data: [{ id: "t5", name: "Trade 5" }], startIndex: 4, totalLength: 5 },
  ];

  let lastResult;
  for (let i = 0; i < totalChunks; i++) {
    lastResult = await simulateStateChunkEndpoint(pool, userId, {
      sessionId,
      chunkIndex: i,
      totalChunks,
      chunk: chunksData[i],
      isLast: i === totalChunks - 1,
    });
  }

  // State must be saved
  expect(pool.saveCalled).toBeTruthy();
  expect(lastResult.statusCode).toBe(200);
  expect(lastResult.body.status).toBe("complete");
  expect(lastResult.body.version).toBe(1);

  // Verify assembled state
  const savedState = pool._states.get(userId);
  expect(savedState).toBeTruthy();
  expect(savedState.state_json.ui.theme).toBe("dark");
  expect(savedState.state_json.settings.lang).toBe("en");
  expect(savedState.state_json.trades).toHaveLength(5);
  expect(savedState.state_json.trades[0].id).toBe("t1");
  expect(savedState.state_json.trades[4].id).toBe("t5");
});

test("All 5 chunks sent in REVERSE order → state correctly assembled", async () => {
  const pool = createMockPool();
  const userId = 1;
  const sessionId = "test-session-reverse";
  const totalChunks = 5;

  const chunksData = [
    { type: "partialState", data: { ui: { theme: "light" } } },
    { type: "partialState", data: { settings: { lang: "ru" } } },
    { type: "arrayBatch", key: "accounts", data: [{ id: "a1" }], startIndex: 0, totalLength: 3 },
    { type: "arrayBatch", key: "accounts", data: [{ id: "a2" }], startIndex: 1, totalLength: 3 },
    { type: "arrayBatch", key: "accounts", data: [{ id: "a3" }], startIndex: 2, totalLength: 3 },
  ];

  // Send chunk 0 first to create the session, then remaining in reverse: 4, 3, 2, 1
  const order = [0, 4, 3, 2, 1];
  let lastResult;
  for (const idx of order) {
    lastResult = await simulateStateChunkEndpoint(pool, userId, {
      sessionId,
      chunkIndex: idx,
      totalChunks,
      chunk: chunksData[idx],
      isLast: idx === order[order.length - 1],
    });
  }

  // State must be saved (last chunk completes the set)
  expect(pool.saveCalled).toBeTruthy();
  expect(lastResult.statusCode).toBe(200);
  expect(lastResult.body.status).toBe("complete");

  const savedState = pool._states.get(userId);
  expect(savedState.state_json.ui.theme).toBe("light");
  expect(savedState.state_json.settings.lang).toBe("ru");
  expect(savedState.state_json.accounts).toHaveLength(3);
});

test("Two parallel sessions for same user → no cross-contamination", async () => {
  const pool = createMockPool();
  const userId = 1;
  const session1 = "session-A";
  const session2 = "session-B";
  const totalChunks = 2;

  // Session A: chunk 0
  await simulateStateChunkEndpoint(pool, userId, {
    sessionId: session1,
    chunkIndex: 0,
    totalChunks,
    chunk: { type: "partialState", data: { source: "A", ui: { theme: "dark" } } },
    isLast: false,
  });

  // Session B: chunk 0
  await simulateStateChunkEndpoint(pool, userId, {
    sessionId: session2,
    chunkIndex: 0,
    totalChunks,
    chunk: { type: "partialState", data: { source: "B", ui: { theme: "light" } } },
    isLast: false,
  });

  // Session A: chunk 1 (completes session A)
  const resultA = await simulateStateChunkEndpoint(pool, userId, {
    sessionId: session1,
    chunkIndex: 1,
    totalChunks,
    chunk: { type: "partialState", data: { extra: "fromA" } },
    isLast: true,
  });

  // Session A should complete with its own data
  expect(resultA.statusCode).toBe(200);
  expect(resultA.body.status).toBe("complete");

  const stateAfterA = pool._states.get(userId);
  expect(stateAfterA.state_json.source).toBe("A");
  expect(stateAfterA.state_json.ui.theme).toBe("dark");
  expect(stateAfterA.state_json.extra).toBe("fromA");

  // Session B: chunk 1 (completes session B)
  const resultB = await simulateStateChunkEndpoint(pool, userId, {
    sessionId: session2,
    chunkIndex: 1,
    totalChunks,
    chunk: { type: "partialState", data: { extra: "fromB" } },
    isLast: true,
  });

  // Session B should complete with its own data, overwriting session A's state
  expect(resultB.statusCode).toBe(200);
  expect(resultB.body.status).toBe("complete");

  const stateAfterB = pool._states.get(userId);
  expect(stateAfterB.state_json.source).toBe("B");
  expect(stateAfterB.state_json.ui.theme).toBe("light");
  expect(stateAfterB.state_json.extra).toBe("fromB");
});

test("Duplicate chunk (idempotency) → does not cause double-save or errors", async () => {
  const pool = createMockPool();
  const userId = 1;
  const sessionId = "test-idempotent";
  const totalChunks = 2;

  // Send chunk 0
  await simulateStateChunkEndpoint(pool, userId, {
    sessionId,
    chunkIndex: 0,
    totalChunks,
    chunk: { type: "partialState", data: { key: "value" } },
    isLast: false,
  });

  // Send chunk 0 again (duplicate)
  const dupResult = await simulateStateChunkEndpoint(pool, userId, {
    sessionId,
    chunkIndex: 0,
    totalChunks,
    chunk: { type: "partialState", data: { key: "value" } },
    isLast: false,
  });

  // Should not have saved state yet (only 1 unique chunk)
  expect(pool.saveCalled).toBeFalsy();
  expect(dupResult.body.chunksReceived).toBe(1);
  expect(dupResult.body.status).toBe("receiving");

  // Send chunk 1 to complete
  const finalResult = await simulateStateChunkEndpoint(pool, userId, {
    sessionId,
    chunkIndex: 1,
    totalChunks,
    chunk: { type: "partialState", data: { key2: "value2" } },
    isLast: true,
  });

  expect(pool.saveCalled).toBeTruthy();
  expect(finalResult.body.status).toBe("complete");
});

test("Optimistic concurrency: version mismatch returns 409", async () => {
  const pool = createMockPool();
  const userId = 1;
  const sessionId = "test-occ";
  const totalChunks = 1;

  // Pre-set a state with version 5
  pool._states.set(userId, { state_json: { trades: [] }, version: 5 });

  // Send a single chunk with expected_version=3 (wrong)
  const result = await simulateStateChunkEndpoint(pool, userId, {
    sessionId,
    chunkIndex: 0,
    totalChunks,
    chunk: { type: "fullState", data: { trades: [{ id: "new" }] } },
    isLast: true,
    expected_version: 3,
  });

  // Should return 409 conflict
  expect(result.statusCode).toBe(409);
  expect(result.body.code).toBe("VERSION_CONFLICT");
  expect(result.body.current_version).toBe(5);
  expect(result.body.expected_version).toBe(3);

  // State should NOT be overwritten
  const state = pool._states.get(userId);
  expect(state.version).toBe(5);
  expect(state.state_json.trades).toHaveLength(0);
});

test("Optimistic concurrency: correct version allows save", async () => {
  const pool = createMockPool();
  const userId = 1;
  const sessionId = "test-occ-ok";
  const totalChunks = 1;

  // Pre-set a state with version 5
  pool._states.set(userId, { state_json: { trades: [] }, version: 5 });

  // Send with correct expected_version=5
  const result = await simulateStateChunkEndpoint(pool, userId, {
    sessionId,
    chunkIndex: 0,
    totalChunks,
    chunk: { type: "fullState", data: { trades: [{ id: "new" }] } },
    isLast: true,
    expected_version: 5,
  });

  expect(result.statusCode).toBe(200);
  expect(result.body.status).toBe("complete");

  const state = pool._states.get(userId);
  expect(state.version).toBe(6);
  expect(state.state_json.trades).toHaveLength(1);
});

test("computeMissingChunks: correctly identifies missing indices", () => {
  expect(computeMissingChunks([0, 2, 4], 5)).toEqual([1, 3]);
  expect(computeMissingChunks([0, 1, 2, 3, 4], 5)).toEqual([]);
  expect(computeMissingChunks([], 3)).toEqual([0, 1, 2]);
  expect(computeMissingChunks([4], 5)).toEqual([0, 1, 2, 3]);
});

test("fullState chunk type: single chunk correctly saved", async () => {
  const pool = createMockPool();
  const userId = 1;
  const sessionId = "test-full-state";

  const fullState = {
    trades: [{ id: "t1", name: "Trade 1" }],
    accounts: [{ id: "a1", name: "Account 1" }],
    ui: { theme: "dark" },
  };

  const result = await simulateStateChunkEndpoint(pool, userId, {
    sessionId,
    chunkIndex: 0,
    totalChunks: 1,
    chunk: { type: "fullState", data: fullState },
    isLast: true,
  });

  expect(result.statusCode).toBe(200);
  expect(result.body.status).toBe("complete");
  expect(pool.saveCalled).toBeTruthy();

  const saved = pool._states.get(userId);
  expect(saved.state_json.trades).toHaveLength(1);
  expect(saved.state_json.accounts).toHaveLength(1);
  expect(saved.state_json.ui.theme).toBe("dark");
});

// ─────────────────────────────────────────────────────────────────────────────
// SESSION ID HANDSHAKE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("SessionId handshake: no sessionId at chunkIndex 0 → server generates sessionId", async () => {
  const pool = createMockPool();
  const userId = 1;

  const result = await simulateStateChunkEndpoint(pool, userId, {
    sessionId: null,
    chunkIndex: 0,
    totalChunks: 1,
    chunk: { type: "fullState", data: { trades: [{ id: "t1" }] } },
    isLast: true,
  });

  expect(result.statusCode).toBe(200);
  expect(result.body.ok).toBe(true);
  expect(result.body.status).toBe("complete");
  // Server must return a sessionId
  expect(typeof result.body.sessionId).toBe("string");
  expect(result.body.sessionId.length).toBeGreaterThan(0);
});

test("SessionId handshake: no sessionId at chunkIndex > 0 → 409 SESSION_ID_REQUIRED", async () => {
  const pool = createMockPool();
  const userId = 1;

  const result = await simulateStateChunkEndpoint(pool, userId, {
    sessionId: null,
    chunkIndex: 2,
    totalChunks: 5,
    chunk: { type: "partialState", data: { key: "value" } },
    isLast: false,
  });

  expect(result.statusCode).toBe(409);
  expect(result.body.code).toBe("SESSION_ID_REQUIRED");
  expect(result.body.ok).toBe(false);
  // Must NOT save state
  expect(pool.saveCalled).toBeFalsy();
});

test("SessionId handshake: unknown sessionId at chunkIndex > 0 → session auto-created", async () => {
  const pool = createMockPool();
  const userId = 1;

  // Send chunkIndex 1 with a sessionId that was never created
  const result = await simulateStateChunkEndpoint(pool, userId, {
    sessionId: "non-existent-session-id",
    chunkIndex: 1,
    totalChunks: 3,
    chunk: { type: "partialState", data: { key: "value" } },
    isLast: false,
  });

  // Session is auto-created and chunk is accepted (no 409)
  expect(result.statusCode).toBe(200);
  expect(result.body.ok).toBe(true);
  expect(result.body.status).toBe("receiving");
  // Session should now exist
  expect(pool._sessions.size).toBe(1);
  // Must NOT yet save state (incomplete chunk set)
  expect(pool.saveCalled).toBeFalsy();
});

test("SessionId handshake: server-generated sessionId works for multi-chunk flow", async () => {
  const pool = createMockPool();
  const userId = 1;
  const totalChunks = 2;

  // Chunk 0: no sessionId → server generates one
  const result0 = await simulateStateChunkEndpoint(pool, userId, {
    sessionId: null,
    chunkIndex: 0,
    totalChunks,
    chunk: { type: "partialState", data: { ui: { theme: "dark" } } },
    isLast: false,
  });

  expect(result0.statusCode).toBe(200);
  expect(result0.body.status).toBe("receiving");
  const serverSessionId = result0.body.sessionId;
  expect(typeof serverSessionId).toBe("string");
  expect(serverSessionId.length).toBeGreaterThan(0);

  // Chunk 1: use server-provided sessionId
  const result1 = await simulateStateChunkEndpoint(pool, userId, {
    sessionId: serverSessionId,
    chunkIndex: 1,
    totalChunks,
    chunk: { type: "partialState", data: { settings: { lang: "en" } } },
    isLast: true,
  });

  expect(result1.statusCode).toBe(200);
  expect(result1.body.status).toBe("complete");
  expect(pool.saveCalled).toBeTruthy();

  const saved = pool._states.get(userId);
  expect(saved.state_json.ui.theme).toBe("dark");
  expect(saved.state_json.settings.lang).toBe("en");
});

test("SessionId handshake: client-provided sessionId at chunkIndex 0 still works (backward compat)", async () => {
  const pool = createMockPool();
  const userId = 1;

  const result = await simulateStateChunkEndpoint(pool, userId, {
    sessionId: "client-generated-id",
    chunkIndex: 0,
    totalChunks: 1,
    chunk: { type: "fullState", data: { trades: [] } },
    isLast: true,
  });

  expect(result.statusCode).toBe(200);
  expect(result.body.status).toBe("complete");
  expect(result.body.sessionId).toBe("client-generated-id");
});

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  for (const { name, fn } of asyncTests) {
    try {
      await fn();
      passed++;
      console.log(`✓ ${name}`);
    } catch (err) {
      failed++;
      console.log(`✗ ${name}`);
      console.log(`  Error: ${err.message}`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
})();
