/**
 * @fileoverview Test for deletedAt: 0 edge case fix
 * 
 * ISSUE: Trades were disappearing because deletedAt: 0 was being treated as "deleted"
 * This happened in PR #366 when adding deletedAt preservation logic.
 * 
 * ROOT CAUSE: The check `typeof item?.deletedAt === 'number'` returns true for 0,
 * causing trades with deletedAt: 0 to be marked as deleted.
 * 
 * FIX: Check that deletedAt is a positive number (> 0) before treating it as deleted.
 * Valid deletion timestamps are always positive (Date.now() > 0).
 * 
 * Run with: node src/lib/__tests__/syncMergeZeroDeletedAt.test.js
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
      // Only treat as deleted if deletedAt is a positive number (> 0)
      const serverDeletedAt = (typeof serverTrade?.deletedAt === 'number' && serverTrade.deletedAt > 0) ? serverTrade.deletedAt : null;
      const localDeletedAt = (typeof localTrade?.deletedAt === 'number' && localTrade.deletedAt > 0) ? localTrade.deletedAt : null;
      
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        const maxDeletedAt = Math.max(
          serverDeletedAt ?? 0,
          localDeletedAt ?? 0
        );
        mergedTrade = { ...mergedTrade, deletedAt: maxDeletedAt };
      } else if (mergedTrade.deletedAt !== undefined && !(typeof mergedTrade.deletedAt === 'number' && mergedTrade.deletedAt > 0)) {
        // Neither version has a valid deletedAt, but mergedTrade might have deletedAt: 0 or invalid value
        // Remove it to prevent treating the trade as deleted
        const { deletedAt, ...rest } = mergedTrade;
        mergedTrade = rest;
      }
      
      mergedMap.set(id, mergedTrade);
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
    console.log(`  Stack: ${err.stack}`);
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
    toBeUndefined() {
      if (actual !== undefined) {
        throw new Error(`Expected undefined, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("\n=== Sync Merge deletedAt: 0 Bug Test ===\n");

// ── Scenario: Server has deletedAt: 0 (corrupted data) ───

test("trade with deletedAt: 0 should NOT be treated as deleted (FIXED)", () => {
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 2000,
    symbol: "EURUSD",
    // No deletedAt - active trade
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 3000, // Server is newer
    symbol: "EURUSD",
    deletedAt: 0 // Corrupted/edge case: 0 instead of null
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  
  // FIXED: deletedAt: 0 should be ignored (treated as not deleted)
  console.log(`  Merged trade deletedAt: ${JSON.stringify(merged[0].deletedAt)}`);
  
  // The fixed code should NOT set deletedAt on the merged trade
  expect(merged[0].deletedAt).toBeUndefined();
});

// ── Scenario: Local has deletedAt: 0 ───

test("local trade with deletedAt: 0 should NOT be treated as deleted (FIXED)", () => {
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 2000,
    symbol: "EURUSD",
    deletedAt: 0 // Edge case
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 3000,
    symbol: "GBPUSD",
    // No deletedAt - active on server
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  
  // FIXED: deletedAt: 0 should be ignored
  console.log(`  Merged trade deletedAt: ${JSON.stringify(merged[0].deletedAt)}`);
  expect(merged[0].deletedAt).toBeUndefined();
});

// ── Scenario: Both have deletedAt: 0 ───

test("both trades with deletedAt: 0 should NOT be treated as deleted (FIXED)", () => {
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 2000,
    symbol: "EURUSD",
    deletedAt: 0
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 3000,
    symbol: "EURUSD",
    deletedAt: 0
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  // FIXED: deletedAt: 0 should be ignored
  expect(merged[0].deletedAt).toBeUndefined();
});

// ── Scenario: Verify valid deletedAt timestamps still work ───

test("valid deletedAt timestamps are still preserved", () => {
  const now = Date.now();
  const localTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 2000,
    symbol: "EURUSD",
    deletedAt: now - 1000
  }];
  
  const serverTrades = [{
    id: "t1",
    createdAt: 1000,
    updatedAt: 3000,
    symbol: "EURUSD",
    deletedAt: now // Server has newer deletion
  }];
  
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  expect(merged.length).toBe(1);
  // Should preserve the most recent deletedAt (from server)
  expect(merged[0].deletedAt).toBe(now);
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
