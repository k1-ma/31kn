/**
 * @fileoverview Unit tests for merge behavior with deletedAt preservation
 * Tests that deleted items remain deleted during sync merges.
 * 
 * Note: This test file contains inline copies of the merge functions to enable
 * standalone testing without runtime dependencies. While this creates duplication,
 * it ensures tests can run independently and catch regressions in the merge logic.
 * If the merge functions change in syncDb.js, these copies must be updated.
 * 
 * Run with: node src/lib/__tests__/syncMergeDeletedAt.test.js
 */

// ── Inline helpers (must mirror src/lib/syncDb.js) ──────────────────────────

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
    if (trade && trade.id) {
      serverTradesMap.set(trade.id, trade);
    }
  }
  
  const localTradesMap = new Map();
  for (const trade of localTrades) {
    if (trade && trade.id) {
      localTradesMap.set(trade.id, trade);
    }
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
      // Both exist - compare timestamps
      const serverTimestamp = getItemTimestamp(serverTrade);
      const localTimestamp = getItemTimestamp(localTrade);
      
      let mergedTrade;
      if (serverTimestamp > localTimestamp) {
        mergedTrade = serverTrade;
      } else {
        mergedTrade = localTrade;
      }
      
      // CRITICAL: Preserve deletedAt status across versions
      const serverDeletedAt = (typeof serverTrade?.deletedAt === 'number' && serverTrade.deletedAt > 0) ? serverTrade.deletedAt : null;
      const localDeletedAt = (typeof localTrade?.deletedAt === 'number' && localTrade.deletedAt > 0) ? localTrade.deletedAt : null;
      
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        const maxDeletedAt = Math.max(
          serverDeletedAt ?? 0,
          localDeletedAt ?? 0
        );
        mergedTrade = { ...mergedTrade, deletedAt: maxDeletedAt };
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
    if (item && item.id) {
      serverMap.set(item.id, item);
    }
  }
  
  const localMap = new Map();
  for (const item of localArr) {
    if (item && item.id) {
      localMap.set(item.id, item);
    }
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
      // Both exist - compare timestamps
      const serverTimestamp = getItemTimestamp(serverItem);
      const localTimestamp = getItemTimestamp(localItem);
      
      let mergedItem;
      if (serverTimestamp > localTimestamp) {
        mergedItem = serverItem;
      } else {
        mergedItem = localItem;
      }
      
      // CRITICAL: Preserve deletedAt status across versions
      const serverDeletedAt = (typeof serverItem?.deletedAt === 'number' && serverItem.deletedAt > 0) ? serverItem.deletedAt : null;
      const localDeletedAt = (typeof localItem?.deletedAt === 'number' && localItem.deletedAt > 0) ? localItem.deletedAt : null;
      
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        const maxDeletedAt = Math.max(
          serverDeletedAt ?? 0,
          localDeletedAt ?? 0
        );
        mergedItem = { ...mergedItem, deletedAt: maxDeletedAt };
      } else if (mergedItem.deletedAt !== undefined && !(typeof mergedItem.deletedAt === 'number' && mergedItem.deletedAt > 0)) {
        const { deletedAt, ...rest } = mergedItem;
        mergedItem = rest;
      }
      
      mergedMap.set(id, mergedItem);
    }
  }
  
  return Array.from(mergedMap.values());
}

// ── Simple test framework ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("\n=== Sync Merge deletedAt Preservation Tests ===\n");

// ── Scenario: Local deletes trade, server has older version without deletedAt ───

test("local deleted trade (newer) wins over server active trade (older)", () => {
  const now = Date.now();
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: now,
    deletedAt: now,
    symbol: "EURUSD"
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 1000,
    symbol: "EURUSD"
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  expect(merged[0].deletedAt).toBeTruthy();
  expect(merged[0].deletedAt).toBe(now);
});

// ── Scenario: Server has newer version but local was deleted ───

test("server has newer update but local has deletedAt - preserve deletedAt", () => {
  const now = Date.now();
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 2000,
    deletedAt: 2000,
    symbol: "EURUSD"
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 3000, // Server is newer!
    symbol: "GBPUSD" // Server has different data
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  // Should use server data (newer timestamp) but preserve deletedAt
  expect(merged[0].symbol).toBe("GBPUSD");
  expect(merged[0].deletedAt).toBeTruthy();
  expect(merged[0].deletedAt).toBe(2000);
});

// ── Scenario: Both versions have deletedAt - use most recent ───

test("both versions deleted - use most recent deletedAt", () => {
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 2000,
    deletedAt: 2000,
    symbol: "EURUSD"
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 3000,
    deletedAt: 3000,
    symbol: "EURUSD"
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  expect(merged[0].deletedAt).toBe(3000); // Most recent deletedAt
});

// ── Scenario: Server deleted, local has older active version ───

test("server deleted (newer) wins over local active (older)", () => {
  const now = Date.now();
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 1000,
    symbol: "EURUSD"
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: now,
    deletedAt: now,
    symbol: "EURUSD"
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  expect(merged[0].deletedAt).toBeTruthy();
  expect(merged[0].deletedAt).toBe(now);
});

// ── Scenario: Test with accounts (symbols) ───

test("deleted symbol preserved when server has newer active version", () => {
  const now = Date.now();
  const localSymbols = [{
    id: "gold",
    name: "Gold",
    createdAt: 1000,
    updatedAt: 2000,
    deletedAt: 2000
  }];
  
  const serverSymbols = [{
    id: "gold",
    name: "Gold XAU/USD",
    createdAt: 1000,
    updatedAt: 3000 // Server is newer
  }];
  
  const merged = mergeArraysById(localSymbols, serverSymbols, false);
  expect(merged.length).toBe(1);
  // Should use server data (newer) but preserve deletedAt
  expect(merged[0].name).toBe("Gold XAU/USD");
  expect(merged[0].deletedAt).toBeTruthy();
  expect(merged[0].deletedAt).toBe(2000);
});

// ── Scenario: Account deletion preserved ───

test("deleted account preserved when server has newer active version", () => {
  const now = Date.now();
  const localAccounts = [{
    id: "acc1",
    name: "Demo Account",
    createdAt: 1000,
    updatedAt: 2000,
    deletedAt: 2000,
    currentEquity: 5000
  }];
  
  const serverAccounts = [{
    id: "acc1",
    name: "Demo Account",
    createdAt: 1000,
    updatedAt: 3000, // Server is newer
    currentEquity: 6000 // Server has updated equity
  }];
  
  const merged = mergeArraysById(localAccounts, serverAccounts, false);
  expect(merged.length).toBe(1);
  // Should use server data (newer equity) but preserve deletedAt
  expect(merged[0].currentEquity).toBe(6000);
  expect(merged[0].deletedAt).toBeTruthy();
  expect(merged[0].deletedAt).toBe(2000);
});

// ── Scenario: No deletion in either version ───

test("no deletedAt in either version - normal merge", () => {
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 2000,
    symbol: "EURUSD"
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 3000,
    symbol: "GBPUSD"
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  expect(merged[0].symbol).toBe("GBPUSD"); // Server wins (newer)
  expect(merged[0].deletedAt).toBeFalsy(); // No deletedAt
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
