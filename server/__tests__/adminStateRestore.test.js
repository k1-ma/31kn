/**
 * @fileoverview Tests for admin state restore functionality.
 *
 * 1. Verifies that the client-side merge logic correctly handles admin restore
 *    by preferring server's deletedAt status when isInitialLoad=true (server
 *    version changed).
 *
 * 2. Verifies that regular (non-initial-load) merge still preserves
 *    Math.max(deletedAt) behavior to prevent accidental undelete.
 *
 * Run with: node server/__tests__/adminStateRestore.test.js
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
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
  };
}

// ── Inline merge helpers (mirror src/lib/syncDb.js) ──────────────────────────

function isDeleted(item) {
  return typeof item?.deletedAt === 'number' && item.deletedAt > 0;
}

function getItemTimestamp(item) {
  if (!item) return 0;
  if (typeof item.updatedAt === 'number' && item.updatedAt > 0) return item.updatedAt;
  if (typeof item.createdAt === 'number' && item.createdAt > 0) return item.createdAt;
  return 0;
}

function mergeTradesArrays(localTrades, serverTrades, isInitialLoad = false) {
  if (!Array.isArray(localTrades) && !Array.isArray(serverTrades)) {
    return serverTrades ?? localTrades ?? [];
  }
  if (!Array.isArray(localTrades)) return serverTrades || [];
  if (!Array.isArray(serverTrades)) return localTrades || [];

  const serverTradesMap = new Map();
  for (const trade of serverTrades) {
    if (trade && trade.id) serverTradesMap.set(trade.id, trade);
  }

  const localTradesMap = new Map();
  for (const trade of localTrades) {
    if (trade && trade.id) localTradesMap.set(trade.id, trade);
  }

  const mergedMap = new Map();
  const allIds = new Set([...serverTradesMap.keys(), ...localTradesMap.keys()]);

  for (const id of allIds) {
    const serverTrade = serverTradesMap.get(id);
    const localTrade = localTradesMap.get(id);

    if (!serverTrade) {
      mergedMap.set(id, localTrade);
    } else if (!localTrade) {
      if (isInitialLoad) {
        mergedMap.set(id, serverTrade);
      }
    } else {
      const serverTimestamp = getItemTimestamp(serverTrade);
      const localTimestamp = getItemTimestamp(localTrade);

      let mergedTrade;
      if (serverTimestamp > localTimestamp) {
        mergedTrade = serverTrade;
      } else {
        mergedTrade = localTrade;
      }

      // ── deletedAt handling (matches updated syncDb.js) ──
      const serverDeletedAt = (typeof serverTrade?.deletedAt === 'number' && serverTrade.deletedAt > 0) ? serverTrade.deletedAt : null;
      const localDeletedAt = (typeof localTrade?.deletedAt === 'number' && localTrade.deletedAt > 0) ? localTrade.deletedAt : null;

      if (serverDeletedAt !== null || localDeletedAt !== null) {
        if (isInitialLoad) {
          // Server is authoritative on initial load
          if (serverDeletedAt !== null) {
            mergedTrade = { ...mergedTrade, deletedAt: serverDeletedAt };
          } else {
            const { deletedAt, ...rest } = mergedTrade;
            mergedTrade = rest;
          }
        } else {
          // Regular sync — Math.max
          const maxDeletedAt = Math.max(serverDeletedAt ?? 0, localDeletedAt ?? 0);
          mergedTrade = { ...mergedTrade, deletedAt: maxDeletedAt };
        }
      } else if (mergedTrade.deletedAt !== undefined && !(typeof mergedTrade.deletedAt === 'number' && mergedTrade.deletedAt > 0)) {
        const { deletedAt, ...rest } = mergedTrade;
        mergedTrade = rest;
      }

      mergedMap.set(id, mergedTrade);
    }
  }

  return Array.from(mergedMap.values());
}

function mergeArraysById(localArr, serverArr, isInitialLoad = false) {
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
      if (isInitialLoad) {
        mergedMap.set(id, serverItem);
      }
    } else {
      const serverTimestamp = getItemTimestamp(serverItem);
      const localTimestamp = getItemTimestamp(localItem);
      let mergedItem = serverTimestamp > localTimestamp ? serverItem : localItem;

      const serverDeletedAt = (typeof serverItem?.deletedAt === 'number' && serverItem.deletedAt > 0) ? serverItem.deletedAt : null;
      const localDeletedAt = (typeof localItem?.deletedAt === 'number' && localItem.deletedAt > 0) ? localItem.deletedAt : null;

      if (serverDeletedAt !== null || localDeletedAt !== null) {
        if (isInitialLoad) {
          if (serverDeletedAt !== null) {
            mergedItem = { ...mergedItem, deletedAt: serverDeletedAt };
          } else {
            const { deletedAt, ...rest } = mergedItem;
            mergedItem = rest;
          }
        } else {
          const maxDeletedAt = Math.max(serverDeletedAt ?? 0, localDeletedAt ?? 0);
          mergedItem = { ...mergedItem, deletedAt: maxDeletedAt };
        }
      } else if (mergedItem.deletedAt !== undefined && !(typeof mergedItem.deletedAt === 'number' && mergedItem.deletedAt > 0)) {
        const { deletedAt, ...rest } = mergedItem;
        mergedItem = rest;
      }

      mergedMap.set(id, mergedItem);
    }
  }

  return Array.from(mergedMap.values());
}

function mergeStates(localState, serverState, isInitialLoad = false) {
  if (!serverState) return localState;
  if (!localState) return serverState;

  const merged = { ...serverState };

  if (localState.trades || serverState.trades) {
    merged.trades = mergeTradesArrays(localState.trades, serverState.trades, isInitialLoad);
  }
  if (localState.accounts || serverState.accounts) {
    merged.accounts = mergeArraysById(localState.accounts, serverState.accounts, isInitialLoad);
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("Admin restore: server-only trades appear when isInitialLoad=true", () => {
  const localState = {
    trades: [
      { id: "t1", updatedAt: 100, pair: "EURUSD" },
    ],
  };
  const serverState = {
    trades: [
      { id: "t1", updatedAt: 100, pair: "EURUSD" },
      { id: "t2", updatedAt: 200, pair: "GBPUSD" },
      { id: "t3", updatedAt: 300, pair: "USDJPY" },
    ],
  };

  const merged = mergeStates(localState, serverState, true);
  expect(merged.trades.length).toBe(3);
  expect(merged.trades.find(t => t.id === "t2")).toBeTruthy();
  expect(merged.trades.find(t => t.id === "t3")).toBeTruthy();
});

test("Admin restore: server-only trades ignored when isInitialLoad=false", () => {
  const localState = {
    trades: [
      { id: "t1", updatedAt: 100, pair: "EURUSD" },
    ],
  };
  const serverState = {
    trades: [
      { id: "t1", updatedAt: 100, pair: "EURUSD" },
      { id: "t2", updatedAt: 200, pair: "GBPUSD" },
    ],
  };

  const merged = mergeStates(localState, serverState, false);
  expect(merged.trades.length).toBe(1);
});

test("Admin restore: locally-deleted trade is undeleted when server has no deletedAt and isInitialLoad=true", () => {
  // User deleted trade locally → deletedAt set
  // Admin restores old state → trade has no deletedAt on server
  const localState = {
    trades: [
      { id: "t1", updatedAt: 500, deletedAt: 500, pair: "EURUSD" },
    ],
  };
  const serverState = {
    trades: [
      // Admin restored the trade without deletedAt
      { id: "t1", updatedAt: 100, pair: "EURUSD" },
    ],
  };

  const merged = mergeStates(localState, serverState, true);
  expect(merged.trades.length).toBe(1);
  // On isInitialLoad=true, server is authoritative → deletedAt removed
  expect(merged.trades[0].deletedAt).toBeUndefined();
});

test("Regular sync: locally-deleted trade stays deleted when server has no deletedAt (isInitialLoad=false)", () => {
  const localState = {
    trades: [
      { id: "t1", updatedAt: 500, deletedAt: 500, pair: "EURUSD" },
    ],
  };
  const serverState = {
    trades: [
      { id: "t1", updatedAt: 100, pair: "EURUSD" },
    ],
  };

  const merged = mergeStates(localState, serverState, false);
  expect(merged.trades.length).toBe(1);
  // Regular sync → Math.max → deletedAt preserved
  expect(merged.trades[0].deletedAt).toBe(500);
});

test("Multi-device delete sync: server-deleted trade stays deleted on isInitialLoad=true", () => {
  // User A deleted trade on another device → server has deletedAt
  // User B has local copy without deletedAt
  const localState = {
    trades: [
      { id: "t1", updatedAt: 100, pair: "EURUSD" },
    ],
  };
  const serverState = {
    trades: [
      { id: "t1", updatedAt: 500, deletedAt: 500, pair: "EURUSD" },
    ],
  };

  const merged = mergeStates(localState, serverState, true);
  expect(merged.trades.length).toBe(1);
  // Server says deleted → trade is deleted
  expect(merged.trades[0].deletedAt).toBe(500);
});

test("Admin restore: accounts are also undeleted when server has no deletedAt and isInitialLoad=true", () => {
  const localState = {
    accounts: [
      { id: "a1", updatedAt: 500, deletedAt: 500, name: "Main" },
    ],
  };
  const serverState = {
    accounts: [
      { id: "a1", updatedAt: 100, name: "Main" },
    ],
  };

  const merged = mergeStates(localState, serverState, true);
  expect(merged.accounts.length).toBe(1);
  expect(merged.accounts[0].deletedAt).toBeUndefined();
});

test("Admin restore: full scenario with empty local and restored server", () => {
  // User has no data locally (everything gone)
  // Admin restores old state with trades
  const localState = {
    trades: [],
    accounts: [],
  };
  const serverState = {
    trades: [
      { id: "t1", updatedAt: 100, pair: "EURUSD" },
      { id: "t2", updatedAt: 200, pair: "GBPUSD" },
    ],
    accounts: [
      { id: "a1", updatedAt: 100, name: "Main" },
    ],
  };

  const merged = mergeStates(localState, serverState, true);
  expect(merged.trades.length).toBe(2);
  expect(merged.accounts.length).toBe(1);
});

test("Both sides have deletedAt — server's wins on isInitialLoad=true", () => {
  const localState = {
    trades: [
      { id: "t1", updatedAt: 600, deletedAt: 600, pair: "EURUSD" },
    ],
  };
  const serverState = {
    trades: [
      { id: "t1", updatedAt: 500, deletedAt: 500, pair: "EURUSD" },
    ],
  };

  const merged = mergeStates(localState, serverState, true);
  // Server is authoritative on initial load
  expect(merged.trades[0].deletedAt).toBe(500);
});

test("Both sides have deletedAt — Math.max on regular sync", () => {
  const localState = {
    trades: [
      { id: "t1", updatedAt: 600, deletedAt: 600, pair: "EURUSD" },
    ],
  };
  const serverState = {
    trades: [
      { id: "t1", updatedAt: 500, deletedAt: 500, pair: "EURUSD" },
    ],
  };

  const merged = mergeStates(localState, serverState, false);
  expect(merged.trades[0].deletedAt).toBe(600);
});

// ── Runner ──────────────────────────────────────────────────────────────────
(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`✗ ${t.name}\n  ${err.message}`);
    }
  }
  console.log(`\n=== Results ===\nPassed: ${passed}\nFailed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
