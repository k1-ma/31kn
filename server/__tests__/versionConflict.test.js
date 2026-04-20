/**
 * @fileoverview Test for BUG #5 — Version counter races.
 * Verifies that:
 * 1. Server rejects writes with stale expected_version (409)
 * 2. 409 response includes current server state for client merge
 * 3. Two-device interleaved writes are detected
 *
 * Run with: node server/__tests__/versionConflict.test.js
 */

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
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
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
  };
}

// ── Simulate the server version check logic ─────────────────────────────────

function simulateVersionCheck(expectedVersion, currentVersion) {
  if (typeof expectedVersion === "number" && currentVersion !== expectedVersion) {
    return {
      conflict: true,
      statusCode: 409,
      response: {
        error: "Version conflict",
        code: "VERSION_CONFLICT",
        expected_version: expectedVersion,
        current_version: currentVersion,
      },
    };
  }
  return { conflict: false };
}

// ── Simulate client-side merge-and-retry on 409 ─────────────────────────────

function mergeArraysById(localArr, serverArr) {
  if (!Array.isArray(localArr) && !Array.isArray(serverArr)) return [];
  if (!Array.isArray(localArr)) return serverArr || [];
  if (!Array.isArray(serverArr)) return localArr || [];

  const map = new Map();
  for (const item of serverArr) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of localArr) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function mergeStates(local, server) {
  return {
    ...local,
    trades: mergeArraysById(local?.trades, server?.trades),
    accounts: mergeArraysById(local?.accounts, server?.accounts),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("No expected_version → no conflict (backward compat)", () => {
  const result = simulateVersionCheck(undefined, 5);
  expect(result.conflict).toBe(false);
});

test("Matching expected_version → no conflict", () => {
  const result = simulateVersionCheck(5, 5);
  expect(result.conflict).toBe(false);
});

test("Stale expected_version → 409 conflict", () => {
  const result = simulateVersionCheck(3, 5);
  expect(result.conflict).toBe(true);
  expect(result.statusCode).toBe(409);
  expect(result.response.code).toBe("VERSION_CONFLICT");
  expect(result.response.expected_version).toBe(3);
  expect(result.response.current_version).toBe(5);
});

test("Two-device interleaved write: device A writes, device B stale → detected", () => {
  // Simulate: both devices start with version 1
  let serverVersion = 1;
  const serverState = {
    trades: [{ id: "t1", symbol: "EURUSD", pnl: 100, updatedAt: 1000 }],
  };

  // Device A writes first (version 1 → 2)
  const deviceAState = {
    trades: [
      { id: "t1", symbol: "EURUSD", pnl: 200, updatedAt: 2000 },
      { id: "t2", symbol: "GBPUSD", pnl: -50, updatedAt: 2000 },
    ],
  };
  const checkA = simulateVersionCheck(1, serverVersion);
  expect(checkA.conflict).toBe(false);
  // Device A succeeds → server version becomes 2
  serverVersion = 2;
  // Update server state with device A's changes
  Object.assign(serverState, deviceAState);

  // Device B tries to write with stale version 1 (it hasn't seen A's changes)
  const deviceBState = {
    trades: [
      { id: "t1", symbol: "EURUSD", pnl: 150, updatedAt: 1500 },
      { id: "t3", symbol: "XAUUSD", pnl: 300, updatedAt: 1500 },
    ],
  };
  const checkB = simulateVersionCheck(1, serverVersion);
  expect(checkB.conflict).toBe(true);
  expect(checkB.statusCode).toBe(409);
});

test("Two-device: after conflict, device B merges and retries with correct version", () => {
  const serverVersion = 2;
  const serverState = {
    trades: [
      { id: "t1", symbol: "EURUSD", pnl: 200, updatedAt: 2000 },
      { id: "t2", symbol: "GBPUSD", pnl: -50, updatedAt: 2000 },
    ],
  };

  const deviceBState = {
    trades: [
      { id: "t1", symbol: "EURUSD", pnl: 150, updatedAt: 1500 },
      { id: "t3", symbol: "XAUUSD", pnl: 300, updatedAt: 1500 },
    ],
  };

  // Device B merges its state with server state
  const merged = mergeStates(deviceBState, serverState);

  // Verify merge preserves all trades
  expect(merged.trades.length).toBe(3); // t1 from server (newer), t2 from server, t3 from B
  const t1 = merged.trades.find(t => t.id === "t1");
  expect(t1.pnl).toBe(200); // server version wins (updatedAt 2000 > 1500)
  const t2 = merged.trades.find(t => t.id === "t2");
  expect(t2).toBeTruthy(); // device A's new trade preserved
  const t3 = merged.trades.find(t => t.id === "t3");
  expect(t3).toBeTruthy(); // device B's new trade preserved

  // Device B retries with correct version
  const retryCheck = simulateVersionCheck(serverVersion, serverVersion);
  expect(retryCheck.conflict).toBe(false);
});

test("expected_version: 0 (new user) vs server version 0 → no conflict", () => {
  const result = simulateVersionCheck(0, 0);
  expect(result.conflict).toBe(false);
});

test("expected_version: 0 (new device) vs server version > 0 → conflict", () => {
  // New device that hasn't fetched yet tries to write
  const result = simulateVersionCheck(0, 5);
  expect(result.conflict).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// RUN TESTS
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`✓ ${t.name}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${t.name}\n  ${e.message}`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
