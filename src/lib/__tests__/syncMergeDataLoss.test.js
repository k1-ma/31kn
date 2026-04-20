/**
 * @fileoverview Unit tests for merge behavior with isInitialLoad flag
 * Tests the data loss scenario where stale localStorage cache causes
 * server-only trades to be dropped during merge.
 * 
 * Run with: node src/lib/__tests__/syncMergeDataLoss.test.js
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
  const serverMap = new Map();
  for (const t of serverTrades) { if (t && t.id) serverMap.set(t.id, t); }
  const localMap = new Map();
  for (const t of localTrades) { if (t && t.id) localMap.set(t.id, t); }
  const mergedMap = new Map();
  const allIds = new Set([...serverMap.keys(), ...localMap.keys()]);
  for (const id of allIds) {
    const serverItem = serverMap.get(id);
    const localItem = localMap.get(id);
    if (!serverItem) {
      mergedMap.set(id, localItem);
    } else if (!localItem) {
      // Server-only item — always preserve (tombstone-based deletion only)
      mergedMap.set(id, serverItem);
    } else {
      const serverTs = getItemTimestamp(serverItem);
      const localTs = getItemTimestamp(localItem);
      mergedMap.set(id, serverTs > localTs ? serverItem : localItem);
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
  for (const item of serverArr) { if (item && item.id) serverMap.set(item.id, item); }
  const localMap = new Map();
  for (const item of localArr) { if (item && item.id) localMap.set(item.id, item); }
  const mergedMap = new Map();
  const allIds = new Set([...serverMap.keys(), ...localMap.keys()]);
  for (const id of allIds) {
    const serverItem = serverMap.get(id);
    const localItem = localMap.get(id);
    if (!serverItem) {
      mergedMap.set(id, localItem);
    } else if (!localItem) {
      // Server-only item — always preserve (tombstone-based deletion only)
      mergedMap.set(id, serverItem);
    } else {
      const serverTs = getItemTimestamp(serverItem);
      const localTs = getItemTimestamp(localItem);
      mergedMap.set(id, serverTs > localTs ? serverItem : localItem);
    }
  }
  return Array.from(mergedMap.values());
}

function clampNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function reconcileAccountsEquity(state) {
  const trades   = Array.isArray(state?.trades)   ? state.trades   : [];
  const accounts = Array.isArray(state?.accounts)  ? state.accounts  : [];
  if (accounts.length === 0) return state;
  const netByAccount = new Map();
  for (const t of trades) {
    if (t?.deletedAt) continue;
    const allocs = Array.isArray(t.allocations) ? t.allocations : [];
    for (const a of allocs) {
      if (!a?.accountId) continue;
      const net = clampNum(a.pnl) - Math.abs(clampNum(a.commission));
      netByAccount.set(a.accountId, (netByAccount.get(a.accountId) || 0) + net);
    }
  }
  const EQUITY_TOLERANCE = 0.01;
  state.accounts = accounts.map((acc) => {
    if (!acc?.id || acc.deletedAt) return acc;
    const startEq   = clampNum(acc.startingEquity);
    const tradePnl   = netByAccount.get(acc.id) || 0;
    const calculated = startEq + tradePnl;
    let correction   = clampNum(acc.equityCorrection);
    const expected = calculated + correction;
    const actual   = clampNum(acc.currentEquity);
    if (acc.currentEquity == null || Math.abs(expected - actual) > EQUITY_TOLERANCE) {
      return { ...acc, currentEquity: expected, equityCorrection: correction };
    }
    if (Math.abs(correction - clampNum(acc.equityCorrection)) > EQUITY_TOLERANCE) {
      return { ...acc, equityCorrection: correction };
    }
    return acc;
  });
  return state;
}

function mergeStates(localState, serverState, isInitialLoad = false) {
  if (!serverState) return localState;
  if (!localState) return serverState;

  const serverTradeCount = serverState?.trades?.length ?? 0;
  const localTradeCount = localState?.trades?.length ?? 0;

  if (serverTradeCount === 0 && localTradeCount > 0 && !isInitialLoad) {
    return { ...localState, version: serverState.version };
  }

  const merged = { ...serverState };

  if (localState.trades || serverState.trades) {
    merged.trades = mergeTradesArrays(localState.trades, serverState.trades, isInitialLoad);
  }
  if (localState.accounts || serverState.accounts) {
    merged.accounts = mergeArraysById(localState.accounts, serverState.accounts, isInitialLoad);
  }
  if (localState.ui || serverState.ui) {
    merged.ui = { ...serverState.ui, ...localState.ui };
  }
  if (localState.libraries || serverState.libraries) {
    const localLib = localState.libraries ?? {};
    const serverLib = serverState.libraries ?? {};
    merged.libraries = {
      ...serverLib,
      symbols: mergeArraysById(localLib.symbols, serverLib.symbols, isInitialLoad),
      sessions: mergeArraysById(localLib.sessions, serverLib.sessions, isInitialLoad),
    };
  }
  if (localState.documents || serverState.documents) {
    merged.documents = mergeArraysById(localState.documents, serverState.documents, isInitialLoad);
  }
  if (localState.docFolders || serverState.docFolders) {
    merged.docFolders = mergeArraysById(localState.docFolders, serverState.docFolders, isInitialLoad);
  }
  if (localState.docShares || serverState.docShares) {
    merged.docShares = mergeArraysById(localState.docShares, serverState.docShares, isInitialLoad);
  }
  reconcileAccountsEquity(merged);
  return merged;
}

// ── Simulate isInitialLoad determination logic from fetchState ──────────────

/**
 * Simulates the isInitialLoad flag computation from fetchState.
 * This mirrors the logic in syncDb.js.
 *
 * On first page load (!loadedRefCurrent), isInitialLoad is always true
 * to preserve server-only items (e.g. admin-restored data, multi-device sync).
 * The safeIsInitialLoad override below still protects against restoring items
 * when local has more data than server.
 *
 * @param {boolean} loadedRefCurrent - whether state was already loaded this session
 * @param {object|null} cachedState - localStorage cached state (kept for API compatibility with fetchState; not used in isInitialLoad computation after fix)
 * @param {boolean} hasOutboxChanges - whether outbox has pending changes
 * @param {object|null} localStateToMerge - local state being merged
 * @param {object} serverState - server state
 * @param {boolean} [serverVersionChanged=false] - whether the server version changed
 * @returns {boolean} safeIsInitialLoad
 */
function computeSafeIsInitialLoad(loadedRefCurrent, cachedState, hasOutboxChanges, localStateToMerge, serverState, serverVersionChanged = false) {
  const isInitialLoad = !loadedRefCurrent || serverVersionChanged;
  let safeIsInitialLoad = isInitialLoad;

  if (localStateToMerge && serverState) {
    const localTradeCount = localStateToMerge?.trades?.length ?? 0;
    const serverTradeCount = serverState?.trades?.length ?? 0;

    if (isInitialLoad && localTradeCount > 0 && serverTradeCount < localTradeCount) {
      safeIsInitialLoad = false;
    }
    
    // CRITICAL: If local state is empty but server has data,
    // always treat as initial load to preserve server-only trades.
    if (!safeIsInitialLoad && localTradeCount === 0 && serverTradeCount > 0) {
      safeIsInitialLoad = true;
    }
  }
  return safeIsInitialLoad;
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
    toBeGreaterThanOrEqual(expected) {
      if (actual < expected) {
        throw new Error(`Expected ${actual} >= ${expected}`);
      }
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("\n=== Sync Merge Data Loss Prevention Tests ===\n");

// ── Scenario: Admin restores state, user logs in with stale (empty) cache ───

test("stale empty cache does NOT wipe restored server trades on first page load", () => {
  // Server has 50 trades (admin-restored)
  const serverTrades = Array.from({ length: 50 }, (_, i) => ({
    id: `t${i}`,
    createdAt: 1000 + i,
  }));
  const serverState = { trades: serverTrades };

  // Local cache is empty (stale)
  const localState = { trades: [] };

  // On first page load, isInitialLoad is always true — even without serverVersionChanged.
  // This ensures admin-restored data is preserved regardless of version changes.
  const safeFlagNoVersion = computeSafeIsInitialLoad(
    /* loadedRefCurrent */ false,
    /* cachedState */ localState,
    /* hasOutboxChanges */ false,
    /* localStateToMerge */ localState,
    /* serverState */ serverState
  );
  expect(safeFlagNoVersion).toBe(true);

  const merged = mergeStates(localState, serverState, safeFlagNoVersion);
  expect(merged.trades.length).toBe(50);
});

// ── Scenario: Stale cache has fewer trades than server ──────────────────────

test("stale cache with fewer trades preserves server-only trades when version changed", () => {
  const serverTrades = [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
    { id: "t4", createdAt: 1003 },
    { id: "t5", createdAt: 1004 },
  ];
  const serverState = { trades: serverTrades };

  // Cache only has 2 of the 5 trades
  const localState = { trades: [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
  ] };

  // serverVersionChanged=true triggers isInitialLoad → preserves server trades
  const safeFlag = computeSafeIsInitialLoad(false, localState, false, localState, serverState, true);
  expect(safeFlag).toBe(true);

  const merged = mergeStates(localState, serverState, safeFlag);
  expect(merged.trades.length).toBe(5);
});

// ── Scenario: User permanently deleted trades within same session ────────────

test("soft-deleted trades do NOT return within same session (loadedRef=true)", () => {
  // User had 5 trades, soft-deleted 2 (with tombstone). Sync hasn't completed yet.
  const serverTrades = [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
    { id: "t4", createdAt: 1003 },
    { id: "t5", createdAt: 1004 },
  ];
  const serverState = { trades: serverTrades };

  // Local has 5 trades, 2 are tombstoned (soft-deleted)
  const localState = { trades: [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
    { id: "t4", createdAt: 1003, deletedAt: 2000 },
    { id: "t5", createdAt: 1004, deletedAt: 2000 },
  ] };

  // Within same session (loadedRef=true), isInitialLoad is false
  const safeFlag = computeSafeIsInitialLoad(true, localState, false, localState, serverState, false);
  // Should remain false — within same session, absence = local deletion
  expect(safeFlag).toBe(false);

  const merged = mergeStates(localState, serverState, safeFlag);
  // All 5 trades should be present, but t4 and t5 should have deletedAt (tombstoned)
  expect(merged.trades.length).toBe(5);
  const t4 = merged.trades.find(t => t.id === "t4");
  const t5 = merged.trades.find(t => t.id === "t5");
  if (!t4?.deletedAt || t4.deletedAt <= 0) throw new Error("t4 should remain tombstoned");
  if (!t5?.deletedAt || t5.deletedAt <= 0) throw new Error("t5 should remain tombstoned");
});

// ── Scenario: First page load — server has more data → server items preserved ─

test("first page load preserves server-only trades (admin restore without version change)", () => {
  // Admin restored state directly in DB (version not bumped)
  const serverTrades = [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
    { id: "t4", createdAt: 1003 },
    { id: "t5", createdAt: 1004 },
  ];
  const serverState = { trades: serverTrades };

  // Local cache has fewer trades (stale)
  const localState = { trades: [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
  ] };

  // First page load (loadedRef=false), no version change
  const safeFlag = computeSafeIsInitialLoad(false, localState, false, localState, serverState, false);
  // On first page load, isInitialLoad=true — server-only items preserved
  expect(safeFlag).toBe(true);

  const merged = mergeStates(localState, serverState, safeFlag);
  // All 5 trades should be present (3 from local + 2 server-only preserved)
  expect(merged.trades.length).toBe(5);
});

// ── Scenario: Trade-off — unsynced hard-deletes reappear on first page load ─

test("unsynced hard-deleted trades reappear on first page load (documented trade-off)", () => {
  // User hard-deleted t4, t5 locally. Sync didn't complete before page close.
  // Server still has all 5 trades. On refresh, they reappear because
  // first page load treats server items as authoritative.
  // This is the trade-off for supporting admin restore.
  const serverTrades = [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
    { id: "t4", createdAt: 1003 },
    { id: "t5", createdAt: 1004 },
  ];
  const serverState = { trades: serverTrades };

  // localStorage saved without deleted trades (hard delete, not soft)
  const localState = { trades: [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
  ] };

  // First page load — isInitialLoad=true, server items preserved
  const safeFlag = computeSafeIsInitialLoad(false, localState, false, localState, serverState, false);
  expect(safeFlag).toBe(true);

  const merged = mergeStates(localState, serverState, safeFlag);
  // All 5 trades return — user can delete again if needed.
  // Use soft-delete (deletedAt) to avoid this edge case.
  expect(merged.trades.length).toBe(5);
});

// ── Scenario: User deliberately deleted trades (local has more than server) ─

test("local has more trades than server → isInitialLoad stays false", () => {
  const serverState = { trades: [{ id: "t1", createdAt: 1000 }] };
  const localState = { trades: [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
  ] };

  // No cache (fresh start): isInitialLoad would be true, but local>server overrides to false
  const safeFlagFresh = computeSafeIsInitialLoad(false, null, false, localState, serverState);
  expect(safeFlagFresh).toBe(false);
});

// ── Scenario: Already loaded (tab refresh) — don't flip to isInitialLoad ────

test("already loaded session does NOT override isInitialLoad to true", () => {
  const serverState = { trades: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] };
  const localState = { trades: [{ id: "t1" }] };

  // loadedRef=true means we've already loaded in this session
  const safeFlag = computeSafeIsInitialLoad(true, localState, false, localState, serverState);
  // Should remain false — not a first load
  expect(safeFlag).toBe(false);
});

// ── Scenario: First load with outbox — don't override (outbox has priority) ─

test("first load with outbox — isInitialLoad is true (server items preserved)", () => {
  const serverState = { trades: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] };
  const localState = { trades: [{ id: "t1" }] };

  // hasOutboxChanges=true means we have pending local changes
  // But on first page load, isInitialLoad is still true
  const safeFlag = computeSafeIsInitialLoad(false, localState, true, localState, serverState);
  // First load → isInitialLoad=true, server has more → preserved
  expect(safeFlag).toBe(true);
});

// ── Scenario: Server and local have same count — no override ────────────────

test("equal trade counts on first load → isInitialLoad is true", () => {
  const serverState = { trades: [{ id: "t1" }, { id: "t2" }] };
  const localState = { trades: [{ id: "t1" }, { id: "t3" }] };

  const safeFlag = computeSafeIsInitialLoad(false, localState, false, localState, serverState);
  // First page load → isInitialLoad=true; equal count → no override
  expect(safeFlag).toBe(true);
});

// ── Scenario: mergeStates safety check — empty server doesn't wipe local ────

test("mergeStates: server returns empty trades, local has data → prefer local", () => {
  const localState = { trades: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] };
  const serverState = { trades: [], version: 5 };

  // isInitialLoad=false simulates a subsequent sync (not first load)
  const merged = mergeStates(localState, serverState, false);
  // Safety check in mergeStates should preserve local data
  expect(merged.trades.length).toBe(3);
});

// ── Scenario: Permanently deleted symbols (pairs) do NOT return ─────────────

test("soft-deleted symbols (pairs) do NOT return within same session", () => {
  const serverState = {
    trades: [{ id: "t1", createdAt: 1000 }],
    libraries: {
      symbols: [
        { id: "s1", name: "EURUSD", createdAt: 1000 },
        { id: "s2", name: "GBPUSD", createdAt: 1001 },
        { id: "s3", name: "XAUUSD", createdAt: 1002 },
      ],
      sessions: [],
    }
  };
  const localState = {
    trades: [{ id: "t1", createdAt: 1000 }], // same trade count
    libraries: {
      symbols: [
        { id: "s1", name: "EURUSD", createdAt: 1000 },
        // s2 and s3 soft-deleted (tombstoned)
        { id: "s2", name: "GBPUSD", createdAt: 1001, deletedAt: 2000 },
        { id: "s3", name: "XAUUSD", createdAt: 1002, deletedAt: 2000 },
      ],
      sessions: [],
    }
  };

  // Within same session (loadedRef=true), deletions are respected
  const safeFlag = computeSafeIsInitialLoad(true, localState, false, localState, serverState, false);
  expect(safeFlag).toBe(false);

  const merged = mergeStates(localState, serverState, safeFlag);
  // All 3 symbols present, but s2 and s3 remain tombstoned
  expect(merged.libraries.symbols.length).toBe(3);
  const s2 = merged.libraries.symbols.find(s => s.id === "s2");
  const s3 = merged.libraries.symbols.find(s => s.id === "s3");
  if (!s2?.deletedAt || s2.deletedAt <= 0) throw new Error("s2 should remain tombstoned");
  if (!s3?.deletedAt || s3.deletedAt <= 0) throw new Error("s3 should remain tombstoned");
});

// ── Scenario: Permanently deleted sessions do NOT return ────────────────────

test("soft-deleted sessions do NOT return within same session", () => {
  const serverState = {
    trades: [],
    libraries: {
      symbols: [],
      sessions: [
        { id: "ses1", name: "London", createdAt: 1000 },
        { id: "ses2", name: "NY", createdAt: 1001 },
      ],
    }
  };
  const localState = {
    trades: [],
    libraries: {
      symbols: [],
      sessions: [
        { id: "ses1", name: "London", createdAt: 1000 },
        // ses2 soft-deleted (tombstoned)
        { id: "ses2", name: "NY", createdAt: 1001, deletedAt: 2000 },
      ],
    }
  };

  // Within same session (loadedRef=true), deletions are respected
  const safeFlag = computeSafeIsInitialLoad(true, localState, false, localState, serverState, false);
  expect(safeFlag).toBe(false);

  const merged = mergeStates(localState, serverState, safeFlag);
  expect(merged.libraries.sessions.length).toBe(2);
  const ses2 = merged.libraries.sessions.find(s => s.id === "ses2");
  if (!ses2?.deletedAt || ses2.deletedAt <= 0) throw new Error("ses2 should remain tombstoned");
});

// ── Scenario: Permanently deleted accounts do NOT return ────────────────────

test("soft-deleted accounts do NOT return within same session", () => {
  const serverState = {
    trades: [],
    accounts: [
      { id: "a1", name: "Main", createdAt: 1000 },
      { id: "a2", name: "Demo", createdAt: 1001 },
    ]
  };
  const localState = {
    trades: [],
    accounts: [
      { id: "a1", name: "Main", createdAt: 1000 },
      // a2 soft-deleted (tombstoned)
      { id: "a2", name: "Demo", createdAt: 1001, deletedAt: 2000 },
    ]
  };

  // Within same session (loadedRef=true), deletions are respected
  const safeFlag = computeSafeIsInitialLoad(true, localState, false, localState, serverState, false);
  expect(safeFlag).toBe(false);

  const merged = mergeStates(localState, serverState, safeFlag);
  expect(merged.accounts.length).toBe(2);
  const a2 = merged.accounts.find(a => a.id === "a2");
  if (!a2?.deletedAt || a2.deletedAt <= 0) throw new Error("a2 should remain tombstoned");
});

// ── Scenario: Fresh start (no cache) → still treats as initial load ─────────

test("fresh start (no cache) preserves server data", () => {
  const serverState = {
    trades: [{ id: "t1", createdAt: 1000 }],
    accounts: [{ id: "a1", createdAt: 1000 }],
  };

  // No cached state (brand new device)
  const safeFlag = computeSafeIsInitialLoad(false, null, false, null, serverState, false);
  expect(safeFlag).toBe(true); // Initial load → preserve server data
});

// ── Scenario: Server version changed → preserves server-only items ──────────

test("server version changed (multi-device sync) preserves server-only items", () => {
  const serverState = {
    trades: [
      { id: "t1", createdAt: 1000 },
      { id: "t2", createdAt: 1001 }, // added from another device
    ]
  };
  const localState = {
    trades: [{ id: "t1", createdAt: 1000 }]
  };

  // serverVersionChanged=true (another device synced)
  const safeFlag = computeSafeIsInitialLoad(false, localState, false, localState, serverState, true);
  expect(safeFlag).toBe(true);

  const merged = mergeStates(localState, serverState, safeFlag);
  expect(merged.trades.length).toBe(2);
});

// ── VPN Race Condition Tests ────────────────────────────────────────────────

test("VPN scenario: seed (empty) local + server with trades → all server trades preserved", () => {
  // After VPN reconnect, setDb(seed) wipes local state to empty.
  // Server still has all 50 trades.
  const serverTrades = Array.from({ length: 50 }, (_, i) => ({
    id: `t${i}`,
    createdAt: 1000 + i,
  }));
  const serverState = { trades: serverTrades };
  const seedState = { trades: [] }; // This is what setDb(seed) produces

  // loadedRef is true from a PREVIOUS load cycle (VPN flicker: load→reset→load)
  // Without fix, isInitialLoad=false → server-only trades dropped
  // With fix, safeIsInitialLoad overridden to true because local=0, server=50
  const safeFlag = computeSafeIsInitialLoad(
    /* loadedRefCurrent */ true,
    /* cachedState */ seedState,
    /* hasOutboxChanges */ false,
    /* localStateToMerge */ seedState,
    /* serverState */ serverState,
    /* serverVersionChanged */ false
  );
  expect(safeFlag).toBe(true); // Must be true to preserve server trades

  const merged = mergeStates(seedState, serverState, safeFlag);
  expect(merged.trades.length).toBe(50);
});

test("VPN scenario: loadedRef=true + empty local + server data → isInitialLoad forced true", () => {
  // Simulates: userId flickers null→42→null→42, second cycle has loadedRef=true
  // but localStorage was wiped to seed. Server has real data.
  const serverState = { trades: [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
  ]};
  const emptyLocal = { trades: [] };

  const safeFlag = computeSafeIsInitialLoad(true, emptyLocal, false, emptyLocal, serverState, false);
  // Without fix this would be false (loadedRef=true, no version change)
  // With fix it's true because localTradeCount=0 && serverTradeCount>0
  expect(safeFlag).toBe(true);
  
  const merged = mergeStates(emptyLocal, serverState, safeFlag);
  expect(merged.trades.length).toBe(3);
});

test("VPN scenario: user with real local soft-deletions (non-empty) — tombstoned items stay deleted", () => {
  // User actually deleted trades (soft-delete with tombstones).
  // Server has 3 trades, local has 3 trades but 2 are tombstoned.
  // After merge, all 3 should be present but 2 should remain tombstoned.
  const serverState = { trades: [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001 },
    { id: "t3", createdAt: 1002 },
  ]};
  const localState = { trades: [
    { id: "t1", createdAt: 1000 },
    { id: "t2", createdAt: 1001, deletedAt: 2000 },
    { id: "t3", createdAt: 1002, deletedAt: 2000 },
  ]};

  // loadedRef=true, no version change → isInitialLoad=false
  const safeFlag = computeSafeIsInitialLoad(true, localState, false, localState, serverState, false);
  expect(safeFlag).toBe(false);

  const merged = mergeStates(localState, serverState, safeFlag);
  expect(merged.trades.length).toBe(3); // All 3 present
  // t2 and t3 should remain tombstoned
  const t2 = merged.trades.find(t => t.id === "t2");
  const t3 = merged.trades.find(t => t.id === "t3");
  if (!t2?.deletedAt || t2.deletedAt <= 0) throw new Error("t2 should remain tombstoned");
  if (!t3?.deletedAt || t3.deletedAt <= 0) throw new Error("t3 should remain tombstoned");
});

// ── BUG #1 Regression: Tombstone-based deletion ────────────────────────────
// Server-only items should NEVER be silently dropped just because local doesn't
// contain them. An item is dropped only when local has a tombstone (deletedAt > 0).

test("BUG#1: server-only item with NO tombstone must survive (isInitialLoad=false)", () => {
  // Scenario: Another device added trade "t-new" while this device was offline.
  // Local does NOT have this trade and has NO tombstone for it.
  // isInitialLoad=false (within same session, e.g. after a failed sync cycle).
  // BUG: old code drops "t-new" as "locally deleted" — data loss!
  const serverTrades = [
    { id: "t1", createdAt: 1000 },
    { id: "t-new", createdAt: 2000 }, // added from another device
  ];
  const localTrades = [
    { id: "t1", createdAt: 1000 },
    // t-new is NOT here, but no tombstone either
  ];

  // Even with isInitialLoad=false, t-new should survive because there's no tombstone
  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  const ids = merged.map(t => t.id);
  expect(ids.length).toBe(2);
  if (!ids.includes("t-new")) {
    throw new Error("Server-only trade 't-new' was dropped without a tombstone — data loss!");
  }
});

test("BUG#1: server-only item WITH local tombstone must stay deleted", () => {
  // User deleted trade "t-del" locally (soft delete with deletedAt).
  // Server still has the non-deleted version.
  // Merge should keep the tombstoned version (item stays deleted).
  const serverTrades = [
    { id: "t1", createdAt: 1000 },
    { id: "t-del", createdAt: 1000, updatedAt: 1500 },
  ];
  const localTrades = [
    { id: "t1", createdAt: 1000 },
    { id: "t-del", createdAt: 1000, updatedAt: 2000, deletedAt: 2000 }, // tombstoned locally
  ];

  const merged = mergeTradesArrays(localTrades, serverTrades, false);
  const delItem = merged.find(t => t.id === "t-del");
  if (!delItem) throw new Error("Tombstoned item 't-del' was completely removed instead of being kept as tombstone");
  if (!delItem.deletedAt || delItem.deletedAt <= 0) {
    throw new Error("Tombstoned item 't-del' lost its deletedAt — deletion was reverted!");
  }
});

test("BUG#1: tombstone older than 30 days is hard-deleted during GC", () => {
  // Tombstone GC: items with deletedAt older than 30 days should be removed
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const trades = [
    { id: "t1", createdAt: 1000 }, // active
    { id: "t-old", createdAt: 1000, deletedAt: now - THIRTY_DAYS_MS - 1000 }, // expired tombstone
    { id: "t-recent", createdAt: 1000, deletedAt: now - 1000 }, // recent tombstone (keep)
  ];

  // Simple GC function that mirrors what server should do
  const gcTombstones = (items, retentionMs = THIRTY_DAYS_MS) => {
    const cutoff = Date.now() - retentionMs;
    return items.filter(item => {
      if (typeof item?.deletedAt === 'number' && item.deletedAt > 0) {
        return item.deletedAt >= cutoff; // keep only recent tombstones
      }
      return true; // keep active items
    });
  };

  const cleaned = gcTombstones(trades);
  expect(cleaned.length).toBe(2); // t1 (active) + t-recent (recent tombstone)
  if (cleaned.find(t => t.id === "t-old")) {
    throw new Error("Expired tombstone 't-old' was not garbage collected!");
  }
  if (!cleaned.find(t => t.id === "t-recent")) {
    throw new Error("Recent tombstone 't-recent' was incorrectly garbage collected!");
  }
});

test("BUG#1: mergeArraysById — server-only item with NO tombstone must survive", () => {
  const serverArr = [
    { id: "a1", createdAt: 1000 },
    { id: "a-new", createdAt: 2000 },
  ];
  const localArr = [
    { id: "a1", createdAt: 1000 },
  ];

  const merged = mergeArraysById(localArr, serverArr, false);
  const ids = merged.map(a => a.id);
  expect(ids.length).toBe(2);
  if (!ids.includes("a-new")) {
    throw new Error("Server-only item 'a-new' was dropped without a tombstone — data loss!");
  }
});

test("BUG#1: mergeArraysById — server-only item WITH local tombstone stays deleted", () => {
  const serverArr = [
    { id: "a1", createdAt: 1000 },
    { id: "a-del", createdAt: 1000, updatedAt: 1500 },
  ];
  const localArr = [
    { id: "a1", createdAt: 1000 },
    { id: "a-del", createdAt: 1000, updatedAt: 2000, deletedAt: 2000 },
  ];

  const merged = mergeArraysById(localArr, serverArr, false);
  const delItem = merged.find(a => a.id === "a-del");
  if (!delItem) throw new Error("Tombstoned item was completely removed");
  if (!delItem.deletedAt || delItem.deletedAt <= 0) {
    throw new Error("Tombstoned item lost its deletedAt!");
  }
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
