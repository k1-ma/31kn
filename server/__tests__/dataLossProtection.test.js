/**
 * @fileoverview Tests for server-side data loss protection.
 * Verifies that the PUT /api/state endpoint prevents accidental overwrites
 * of non-empty state with empty state (e.g. when a new device sends seed state
 * after a failed fetchState).
 *
 * Run with: node server/__tests__/dataLossProtection.test.js
 */

// Simple test framework (same as existing server tests)
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
  };
}

// ── Inline helpers (must mirror server/routes/state.routes.js) ──────────────

// Data loss protection constants (must match server)
const MIN_TRADES_FOR_PROTECTION = 10;
const MAX_ACCEPTABLE_DROP_PERCENTAGE = 0.5;

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
      const serverTimestamp = getItemTimestamp(serverItem);
      const localTimestamp = getItemTimestamp(localItem);
      mergedMap.set(id, serverTimestamp > localTimestamp ? serverItem : localItem);
    }
  }

  return Array.from(mergedMap.values());
}

function mergeStates(incomingState, serverState) {
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
  if (incomingState.libraries || serverState.libraries) {
    const incomingLib = incomingState.libraries ?? {};
    const serverLib = serverState.libraries ?? {};
    merged.libraries = {
      ...incomingLib,
      symbols: mergeArraysById(incomingLib.symbols, serverLib.symbols),
      sessions: mergeArraysById(incomingLib.sessions, serverLib.sessions),
    };
  }
  if (incomingState.docFolders || serverState.docFolders) {
    merged.docFolders = mergeArraysById(incomingState.docFolders, serverState.docFolders);
  }
  if (incomingState.docShares || serverState.docShares) {
    merged.docShares = mergeArraysById(incomingState.docShares, serverState.docShares);
  }

  return merged;
}

/**
 * Simulate the PUT /api/state data-loss protection logic.
 * Returns the finalState that would be saved to the database.
 */
function simulatePutProtection(incomingState, currentState, force = false) {
  let finalState = incomingState;

  if (currentState && !force) {
    const finalTradesCount = finalState?.trades?.length ?? 0;
    const serverTradesCount = currentState?.trades?.length ?? 0;

    // CRITICAL: Block complete data wipe
    if (finalTradesCount === 0 && serverTradesCount > 0) {
      finalState = mergeStates(finalState, currentState);
    } 
    // ENHANCED: Detect and prevent partial data loss (>50% reduction)
    else if (serverTradesCount > MIN_TRADES_FOR_PROTECTION && finalTradesCount > 0) {
      const dropPercentage = (serverTradesCount - finalTradesCount) / serverTradesCount;
      if (dropPercentage > MAX_ACCEPTABLE_DROP_PERCENTAGE) {
        // Merge to preserve server data - likely corrupted client state
        finalState = mergeStates(finalState, currentState);
      }
    }
  }

  return finalState;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("Empty incoming state with non-empty server → merges to preserve server trades", () => {
  const incoming = { trades: [], accounts: [], ui: { theme: "dark" } };
  const server = {
    trades: [
      { id: "t1", symbol: "EURUSD", pnl: 100, createdAt: 1000, updatedAt: 1000 },
      { id: "t2", symbol: "GBPUSD", pnl: -50, createdAt: 2000, updatedAt: 2000 },
    ],
    accounts: [{ id: "a1", name: "Main", createdAt: 1000 }],
    ui: { theme: "light" },
  };

  const result = simulatePutProtection(incoming, server);

  // Server trades must be preserved
  expect(result.trades.length).toBe(2);
  expect(result.trades.find(t => t.id === "t1")).toBeTruthy();
  expect(result.trades.find(t => t.id === "t2")).toBeTruthy();
  // Server accounts must be preserved
  expect(result.accounts.length).toBe(1);
  // Incoming UI preferences should be kept (incoming wins for non-array fields)
  expect(result.ui.theme).toBe("dark");
});

test("Empty incoming with force=true → overwrites server (no protection)", () => {
  const incoming = { trades: [], accounts: [] };
  const server = {
    trades: [{ id: "t1", symbol: "EURUSD", createdAt: 1000 }],
    accounts: [{ id: "a1", name: "Main", createdAt: 1000 }],
  };

  const result = simulatePutProtection(incoming, server, true);

  // Force=true should skip protection
  expect(result.trades.length).toBe(0);
  expect(result.accounts.length).toBe(0);
});

test("Non-empty incoming with non-empty server → accepts incoming as-is", () => {
  const incoming = {
    trades: [{ id: "t1", symbol: "EURUSD", pnl: 200, updatedAt: 5000 }],
    accounts: [],
  };
  const server = {
    trades: [
      { id: "t1", symbol: "EURUSD", pnl: 100, updatedAt: 1000 },
      { id: "t2", symbol: "GBPUSD", pnl: -50, updatedAt: 2000 },
    ],
    accounts: [{ id: "a1", name: "Main", createdAt: 1000 }],
  };

  const result = simulatePutProtection(incoming, server);

  // Non-empty incoming → accepted as-is (no merge protection triggered)
  expect(result.trades.length).toBe(1);
  expect(result.trades[0].id).toBe("t1");
  expect(result.trades[0].pnl).toBe(200);
});

test("Empty incoming with no server state → accepts incoming as-is", () => {
  const incoming = { trades: [], accounts: [] };

  const result = simulatePutProtection(incoming, null);

  expect(result.trades.length).toBe(0);
});

test("Seed state (no trades array) incoming with server trades → merges to preserve", () => {
  // Simulates the exact bug: seed state sent from new device
  const seed = { ui: { theme: "dark" }, accounts: [], libraries: { symbols: [], sessions: [] } };
  const server = {
    trades: [
      { id: "t1", symbol: "EURUSD", pnl: 100, createdAt: 1000 },
    ],
    accounts: [{ id: "a1", name: "Main", createdAt: 1000 }],
    ui: { theme: "light" },
    libraries: { symbols: [{ id: "s1", name: "EURUSD" }], sessions: [] },
  };

  const result = simulatePutProtection(seed, server);

  // Server trades must be preserved (seed has no trades → length 0)
  expect(result.trades.length).toBe(1);
  expect(result.trades[0].id).toBe("t1");
  // Server accounts must be preserved
  expect(result.accounts.length).toBe(1);
});

test("Merge preserves both incoming and server trades on data-loss protection", () => {
  // Edge case: incoming has 0 trades, server has trades from multiple devices
  const incoming = { trades: [] };
  const server = {
    trades: [
      { id: "t1", symbol: "EURUSD", createdAt: 1000 },
      { id: "t2", symbol: "GBPUSD", createdAt: 2000 },
      { id: "t3", symbol: "XAUUSD", createdAt: 3000 },
    ],
  };

  const result = simulatePutProtection(incoming, server);

  expect(result.trades.length).toBe(3);
});

test("Partial data loss protection: >50% drop triggers merge", () => {
  // Simulate corrupted client state that lost >50% of trades
  const incoming = {
    trades: [
      { id: "t1", symbol: "EURUSD", createdAt: 1000 },
      { id: "t2", symbol: "GBPUSD", createdAt: 2000 },
    ],
  };
  const server = {
    trades: [
      { id: "t1", symbol: "EURUSD", createdAt: 1000 },
      { id: "t2", symbol: "GBPUSD", createdAt: 2000 },
      { id: "t3", symbol: "XAUUSD", createdAt: 3000 },
      { id: "t4", symbol: "USDJPY", createdAt: 4000 },
      { id: "t5", symbol: "USDCHF", createdAt: 5000 },
      // Server has 20 trades total
      { id: "t6", symbol: "EURJPY", createdAt: 6000 },
      { id: "t7", symbol: "EURCHF", createdAt: 7000 },
      { id: "t8", symbol: "GBPJPY", createdAt: 8000 },
      { id: "t9", symbol: "GBPCHF", createdAt: 9000 },
      { id: "t10", symbol: "AUDUSD", createdAt: 10000 },
      { id: "t11", symbol: "NZDUSD", createdAt: 11000 },
      { id: "t12", symbol: "USDCAD", createdAt: 12000 },
      { id: "t13", symbol: "EURCAD", createdAt: 13000 },
      { id: "t14", symbol: "GBPCAD", createdAt: 14000 },
      { id: "t15", symbol: "AUDCAD", createdAt: 15000 },
      { id: "t16", symbol: "NZDCAD", createdAt: 16000 },
      { id: "t17", symbol: "EURAUD", createdAt: 17000 },
      { id: "t18", symbol: "GBPAUD", createdAt: 18000 },
      { id: "t19", symbol: "EURNZD", createdAt: 19000 },
      { id: "t20", symbol: "GBPNZD", createdAt: 20000 },
    ],
  };

  const result = simulatePutProtection(incoming, server);

  // Should trigger merge protection: incoming has 2, server has 20 (90% drop)
  // Result should preserve all server trades by merging
  expect(result.trades.length).toBe(20);
});

test("Partial data loss protection: <50% drop is allowed", () => {
  // Client legitimately deleted some trades
  const incoming = {
    trades: [
      { id: "t1", symbol: "EURUSD", updatedAt: 5000 },
      { id: "t2", symbol: "GBPUSD", updatedAt: 6000 },
      { id: "t3", symbol: "XAUUSD", updatedAt: 7000 },
      { id: "t4", symbol: "USDJPY", updatedAt: 8000 },
      { id: "t5", symbol: "USDCHF", updatedAt: 9000 },
      { id: "t6", symbol: "EURJPY", updatedAt: 10000 },
      { id: "t7", symbol: "EURCHF", updatedAt: 11000 },
    ],
  };
  const server = {
    trades: [
      { id: "t1", symbol: "EURUSD", createdAt: 1000 },
      { id: "t2", symbol: "GBPUSD", createdAt: 2000 },
      { id: "t3", symbol: "XAUUSD", createdAt: 3000 },
      { id: "t4", symbol: "USDJPY", createdAt: 4000 },
      { id: "t5", symbol: "USDCHF", createdAt: 5000 },
      { id: "t6", symbol: "EURJPY", createdAt: 6000 },
      { id: "t7", symbol: "EURCHF", createdAt: 7000 },
      { id: "t8", symbol: "GBPJPY", createdAt: 8000 },
      { id: "t9", symbol: "GBPCHF", createdAt: 9000 },
      { id: "t10", symbol: "AUDUSD", createdAt: 10000 },
      { id: "t11", symbol: "NZDUSD", createdAt: 11000 },
      { id: "t12", symbol: "USDCAD", createdAt: 12000 },
    ],
  };

  const result = simulatePutProtection(incoming, server);

  // 7 out of 12 = 58% retained (42% drop) → should accept incoming as-is
  // But incoming has newer timestamps, so merge will keep incoming versions
  expect(result.trades.length).toBe(7);
});

test("Partial data loss protection: small dataset (<10 trades) not protected", () => {
  // Small datasets shouldn't trigger percentage-based protection
  const incoming = {
    trades: [{ id: "t1", symbol: "EURUSD", createdAt: 1000 }],
  };
  const server = {
    trades: [
      { id: "t1", symbol: "EURUSD", createdAt: 1000 },
      { id: "t2", symbol: "GBPUSD", createdAt: 2000 },
      { id: "t3", symbol: "XAUUSD", createdAt: 3000 },
    ],
  };

  const result = simulatePutProtection(incoming, server);

  // Server has <10 trades, so percentage protection doesn't apply
  // Incoming is accepted as-is (1 trade)
  expect(result.trades.length).toBe(1);
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
