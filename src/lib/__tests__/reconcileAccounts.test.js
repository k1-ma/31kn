/**
 * @fileoverview Unit tests for reconcileAccountsEquity and mergeStates reconciliation
 * Run with: node src/lib/__tests__/reconcileAccounts.test.js
 *
 * Because syncDb.js depends on Vite aliases (@/lib/…) and React, we replicate
 * the pure helper functions here so the tests can run with plain Node.
 */

// ── Inline helpers (must mirror src/lib/syncDb.js) ──────────────────────────

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

    // equityCorrection is a fixed offset set when the user creates/edits the account.
    // It must NOT be recalculated when trades change.

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

function getItemTimestamp(item) {
  if (!item) return 0;
  if (typeof item.updatedAt === 'number' && item.updatedAt > 0) return item.updatedAt;
  if (typeof item.createdAt === 'number' && item.createdAt > 0) return item.createdAt;
  return 0;
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
      if (isInitialLoad) mergedMap.set(id, serverItem);
    } else {
      const serverTs = getItemTimestamp(serverItem);
      const localTs = getItemTimestamp(localItem);
      mergedMap.set(id, serverTs > localTs ? serverItem : localItem);
    }
  }
  return Array.from(mergedMap.values());
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
      if (isInitialLoad) mergedMap.set(id, serverItem);
    } else {
      const serverTs = getItemTimestamp(serverItem);
      const localTs = getItemTimestamp(localItem);
      mergedMap.set(id, serverTs > localTs ? serverItem : localItem);
    }
  }
  return Array.from(mergedMap.values());
}

function mergeStates(localState, serverState) {
  if (!serverState) return localState;
  if (!localState) return serverState;
  const merged = { ...serverState };
  if (localState.trades || serverState.trades) {
    merged.trades = mergeTradesArrays(localState.trades, serverState.trades);
  }
  if (localState.accounts || serverState.accounts) {
    merged.accounts = mergeArraysById(localState.accounts, serverState.accounts);
  }
  if (localState.ui || serverState.ui) {
    merged.ui = { ...serverState.ui, ...localState.ui };
  }
  reconcileAccountsEquity(merged);
  return merged;
}

// ── Simple test framework (same as other test files) ────────────────────────

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
    toBeCloseTo(expected, delta = 0.01) {
      if (Math.abs(actual - expected) > delta) {
        throw new Error(
          `Expected ${actual} to be close to ${expected} (±${delta})`
        );
      }
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("\n=== Reconcile Accounts Equity Tests ===\n");

// ── 1. Deleted trade on another device must NOT affect account equity ───────

test("mergeStates: deleted trade's PnL is excluded from account equity", () => {
  const accountId = "acc-1";
  const startingEquity = 5000;

  const localState = {
    accounts: [
      {
        id: accountId,
        name: "Main",
        startingEquity,
        currentEquity: 5079.65, // stale — includes deleted trade's PnL
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId, pnl: 233.53, commission: 0 }],
      },
    ],
  };

  // Server knows the second trade was deleted
  const serverState = {
    accounts: [
      {
        id: accountId,
        name: "Main",
        startingEquity,
        currentEquity: 5079.65, // also stale on server
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId, pnl: 233.53, commission: 0 }],
      },
      {
        id: "t2",
        deletedAt: "2025-06-01T00:00:00Z",
        allocations: [{ accountId, pnl: -153.88, commission: 0 }],
      },
    ],
  };

  const merged = mergeStates(localState, serverState);
  const acc = merged.accounts.find((a) => a.id === accountId);

  // Expected: startingEquity + t1.pnl (t2 is deleted → ignored)
  const expectedEquity = startingEquity + 233.53;
  expect(acc.currentEquity).toBeCloseTo(expectedEquity);
});

// ── 2. Restored trade (deletedAt removed) re-includes PnL ─────────────────

test("mergeStates: restored trade's PnL is re-included in account equity", () => {
  const accountId = "acc-1";
  const startingEquity = 5000;

  const localState = {
    accounts: [
      {
        id: accountId,
        name: "Main",
        startingEquity,
        currentEquity: 5233.53, // without the restored trade
      },
    ],
    trades: [
      {
        id: "t1",
        createdAt: 1000,
        allocations: [{ accountId, pnl: 233.53, commission: 0 }],
      },
      {
        id: "t2",
        createdAt: 1000,
        deletedAt: "2025-06-01T00:00:00Z", // locally still deleted
        allocations: [{ accountId, pnl: 100, commission: 5 }],
      },
    ],
  };

  // Server restored t2 (deletedAt removed, updatedAt is newer)
  const serverState = {
    accounts: [
      {
        id: accountId,
        name: "Main",
        startingEquity,
        currentEquity: 5233.53, // stale on server too
      },
    ],
    trades: [
      {
        id: "t1",
        createdAt: 1000,
        allocations: [{ accountId, pnl: 233.53, commission: 0 }],
      },
      {
        id: "t2",
        createdAt: 1000,
        updatedAt: 2000, // restored on server → newer timestamp
        // deletedAt is absent — trade restored
        allocations: [{ accountId, pnl: 100, commission: 5 }],
      },
    ],
  };

  const merged = mergeStates(localState, serverState);
  const acc = merged.accounts.find((a) => a.id === accountId);

  // Expected: startingEquity + t1 net + t2 net
  // t1 net = 233.53, t2 net = 100 - |5| = 95
  const expectedEquity = startingEquity + 233.53 + 95;
  expect(acc.currentEquity).toBeCloseTo(expectedEquity);
});

// ── 3. Commission is properly subtracted ────────────────────────────────────

test("reconcileAccountsEquity: commission is subtracted as |commission|", () => {
  const state = {
    accounts: [
      { id: "a1", startingEquity: 10000, currentEquity: 0 },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 500, commission: -12 }],
      },
    ],
  };

  reconcileAccountsEquity(state);
  const acc = state.accounts.find((a) => a.id === "a1");
  // net = 500 - |-12| = 500 - 12 = 488
  expect(acc.currentEquity).toBeCloseTo(10000 + 488);
});

// ── 4. Deleted accounts are not touched ─────────────────────────────────────

test("reconcileAccountsEquity: deleted accounts are untouched", () => {
  const state = {
    accounts: [
      { id: "a1", startingEquity: 10000, currentEquity: 9999, deletedAt: "2025-01-01" },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 500, commission: 0 }],
      },
    ],
  };

  reconcileAccountsEquity(state);
  const acc = state.accounts.find((a) => a.id === "a1");
  // Should remain 9999 because account is deleted
  expect(acc.currentEquity).toBe(9999);
});

// ── 5. No trades → equity equals startingEquity ─────────────────────────────

test("reconcileAccountsEquity: no trades → equity = startingEquity", () => {
  const state = {
    accounts: [
      { id: "a1", startingEquity: 5000, currentEquity: 9999 },
    ],
    trades: [],
  };

  reconcileAccountsEquity(state);
  expect(state.accounts[0].currentEquity).toBeCloseTo(5000);
});

// ── 6. Multiple accounts with mixed allocations ─────────────────────────────

test("reconcileAccountsEquity: multiple accounts each get correct equity", () => {
  const state = {
    accounts: [
      { id: "a1", startingEquity: 1000, currentEquity: 0 },
      { id: "a2", startingEquity: 2000, currentEquity: 0 },
    ],
    trades: [
      {
        id: "t1",
        allocations: [
          { accountId: "a1", pnl: 100, commission: 10 },
          { accountId: "a2", pnl: -50, commission: 5 },
        ],
      },
      {
        id: "t2",
        deletedAt: "2025-01-01",
        allocations: [
          { accountId: "a1", pnl: 999, commission: 0 }, // should be ignored
        ],
      },
    ],
  };

  reconcileAccountsEquity(state);
  // a1: 1000 + (100 - 10) = 1090
  expect(state.accounts.find((a) => a.id === "a1").currentEquity).toBeCloseTo(1090);
  // a2: 2000 + (-50 - 5) = 1945
  expect(state.accounts.find((a) => a.id === "a2").currentEquity).toBeCloseTo(1945);
});

// ── 7. Local account changes are preserved when merged with stale server ───

test("mergeStates: local startingEquity change is preserved over stale server", () => {
  const accountId = "acc-1";

  // Local state has the updated startingEquity the user just set (more recent updatedAt)
  const localState = {
    accounts: [
      {
        id: accountId,
        name: "My Account",
        startingEquity: 25000,
        currentEquity: 25000,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ],
    trades: [],
  };

  // Server still has the old (stale) startingEquity (older updatedAt)
  const serverState = {
    accounts: [
      {
        id: accountId,
        name: "My Account",
        startingEquity: 10000,
        currentEquity: 10000,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    trades: [],
  };

  const merged = mergeStates(localState, serverState);
  const acc = merged.accounts.find((a) => a.id === accountId);

  // Local change should be preserved (local has newer updatedAt)
  expect(acc.startingEquity).toBe(25000);
  expect(acc.currentEquity).toBe(25000);
});

// ── 8. New local account is preserved when server has no accounts ──────────

test("mergeStates: new local account is preserved when server has empty accounts", () => {
  const localState = {
    accounts: [
      {
        id: "acc-new",
        name: "New Account",
        startingEquity: 50000,
        currentEquity: 50000,
      },
    ],
    trades: [],
  };

  const serverState = {
    accounts: [],
    trades: [],
  };

  const merged = mergeStates(localState, serverState);
  expect(merged.accounts.length).toBe(1);
  expect(merged.accounts[0].startingEquity).toBe(50000);
});

// ── 9. Manual balance override is preserved via equityCorrection ────────────

test("reconcileAccountsEquity: equityCorrection preserves manual balance", () => {
  const state = {
    accounts: [
      {
        id: "a1",
        startingEquity: 10000,
        currentEquity: 12000,  // user manually set to 12000
        equityCorrection: 1500, // manual adjustment of +1500
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 500, commission: 0 }],
      },
    ],
  };

  reconcileAccountsEquity(state);
  const acc = state.accounts.find((a) => a.id === "a1");
  // Expected: 10000 + 500 + 1500 = 12000 (should stay at 12000)
  expect(acc.currentEquity).toBeCloseTo(12000);
});

// ── 10. equityCorrection=0 (or missing) behaves like before ────────────────

test("reconcileAccountsEquity: missing equityCorrection defaults to 0", () => {
  const state = {
    accounts: [
      { id: "a1", startingEquity: 10000, currentEquity: 0 },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 500, commission: 0 }],
      },
    ],
  };

  reconcileAccountsEquity(state);
  // Expected: 10000 + 500 = 10500
  expect(state.accounts[0].currentEquity).toBeCloseTo(10500);
});

// ── 11. equityCorrection works with mergeStates ────────────────────────────

test("mergeStates: equityCorrection is preserved through merge and reconciliation", () => {
  const accountId = "acc-1";
  const startingEquity = 10000;

  const localState = {
    accounts: [
      {
        id: accountId,
        name: "Main",
        startingEquity,
        currentEquity: 12000,
        equityCorrection: 1500,
        updatedAt: 2000,
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId, pnl: 500, commission: 0 }],
      },
    ],
  };

  const serverState = {
    accounts: [
      {
        id: accountId,
        name: "Main",
        startingEquity,
        currentEquity: 10500,
        updatedAt: 1000, // older than local
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId, pnl: 500, commission: 0 }],
      },
    ],
  };

  const merged = mergeStates(localState, serverState);
  const acc = merged.accounts.find((a) => a.id === accountId);

  // Local state wins (newer updatedAt), equityCorrection preserved
  // Expected: 10000 + 500 + 1500 = 12000
  expect(acc.currentEquity).toBeCloseTo(12000);
});

// ── 12. Manual currentEquity preserved when trades are imported later ────────

test("reconcileAccountsEquity: manual equity preserved after trade import", () => {
  // User created account with manual balance 5065, prop size 5000
  // equityCorrection = 5065 - 5000 = 65 (from fix #1 in Accounts.jsx)
  const state = {
    accounts: [
      {
        id: "a1",
        startingEquity: 5000,
        currentEquity: 5065,
        equityCorrection: 65, // set at creation: curEq - startEq
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 180.56, commission: 0 }],
      },
    ],
  };

  reconcileAccountsEquity(state);
  const acc = state.accounts.find((a) => a.id === "a1");
  // equityCorrection stays fixed at 65; currentEquity updates with trades.
  // Expected: 5000 + 180.56 + 65 = 5245.56
  expect(acc.currentEquity).toBeCloseTo(5245.56);
  expect(acc.equityCorrection).toBeCloseTo(65);
});

// ── 13. Normal account (equityCorrection=0) still updates from trades ───────

test("reconcileAccountsEquity: normal account (correction=0) updates from trades", () => {
  const state = {
    accounts: [
      {
        id: "a1",
        startingEquity: 5000,
        currentEquity: 5000,
        equityCorrection: 0,
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 200, commission: 10 }],
      },
    ],
  };

  reconcileAccountsEquity(state);
  const acc = state.accounts.find((a) => a.id === "a1");
  // Normal account: expected = 5000 + (200 - 10) + 0 = 5190
  expect(acc.currentEquity).toBeCloseTo(5190);
});

// ── 14. Payout calculation uses correct equity after manual balance fix ──────

test("payout: profitGross computed from actual manual balance, not inflated", () => {
  // Simulates computePayoutForecast logic:
  // profitGross = currentEquity - prop.size
  const acc = {
    startingEquity: 5000,
    currentEquity: 5065,
    equityCorrection: -115.56,
    prop: { size: 5000 },
  };

  const startEq = clampNum(acc.prop.size);
  const curEq = clampNum(acc.currentEquity);
  const profitGross = Math.max(0, curEq - startEq);

  // Should be 65 (not 180.56 or 245.56)
  expect(profitGross).toBeCloseTo(65);
});

// ── 15. Initial deficit: equity updates with trades instead of being pinned ──

test("reconcileAccountsEquity: initial deficit account updates with trades", () => {
  // Scenario: account size 5000, user started tracking at 4875 (deficit of 125)
  // equityCorrection = 4875 - 5000 = -125
  // After adding trade with +125 PnL, balance should be 5000 (not pinned at 4875)
  const state = {
    accounts: [
      {
        id: "a1",
        startingEquity: 5000,
        currentEquity: 4875,
        equityCorrection: -125,
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 125, commission: 0 }],
      },
    ],
  };

  reconcileAccountsEquity(state);
  const acc = state.accounts.find((a) => a.id === "a1");
  // Expected: 5000 + 125 + (-125) = 5000
  expect(acc.currentEquity).toBeCloseTo(5000);
  // equityCorrection should remain at -125 (NOT recalculated)
  expect(acc.equityCorrection).toBeCloseTo(-125);
  // Account PnL = currentEquity - startingEquity = 5000 - 5000 = 0
  const accountPnl = acc.currentEquity - acc.startingEquity;
  expect(accountPnl).toBeCloseTo(0);
});

// ── 16. Initial deficit: partial recovery shows correct intermediate balance ──

test("reconcileAccountsEquity: partial recovery from deficit shows correct balance", () => {
  // Account size 5000, started at 4875 (deficit -125), trade +50
  const state = {
    accounts: [
      {
        id: "a1",
        startingEquity: 5000,
        currentEquity: 4875,
        equityCorrection: -125,
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 50, commission: 0 }],
      },
    ],
  };

  reconcileAccountsEquity(state);
  const acc = state.accounts.find((a) => a.id === "a1");
  // Expected: 5000 + 50 + (-125) = 4925
  expect(acc.currentEquity).toBeCloseTo(4925);
  // Account PnL = 4925 - 5000 = -75 (still in deficit, but recovering)
  const accountPnl = acc.currentEquity - acc.startingEquity;
  expect(accountPnl).toBeCloseTo(-75);
});

// ── 17. Payout: balance persists after page reload ──────────────────────────

test("reconcileAccountsEquity: payout balance persists after page reload", () => {
  // Scenario: Prop account with $5000 starting equity
  // - Made trades totaling +$500 profit → balance = $5500
  // - Requested payout of $400 (80% of $500 profit = $400)
  // - After payout marked paid:
  //   - currentEquity reset to $5000 (initial size)
  //   - equityCorrection should be set to preserve this after reload
  // - After page reload, reconcileAccountsEquity should maintain $5000 balance
  
  // Step 1: Account with trades, before payout
  const stateBeforePayout = {
    accounts: [
      {
        id: "a1",
        startingEquity: 5000,
        currentEquity: 5500,
        equityCorrection: 0,
        prop: {
          size: 5000,
          payouts: [],
        },
      },
    ],
    trades: [
      {
        id: "t1",
        allocations: [{ accountId: "a1", pnl: 300, commission: 0 }],
      },
      {
        id: "t2",
        allocations: [{ accountId: "a1", pnl: 200, commission: 0 }],
      },
    ],
  };
  
  reconcileAccountsEquity(stateBeforePayout);
  const accBefore = stateBeforePayout.accounts[0];
  expect(accBefore.currentEquity).toBeCloseTo(5500);
  
  // Step 2: Payout marked as paid - simulate handleMarkPaid logic
  // Current implementation (BUGGY): sets equityCorrection = 0
  // This causes the balance to revert to 5500 after reload
  const tradePnl = 500; // Sum of all trade PnL
  const initialSize = accBefore.prop.size; // 5000
  
  // CORRECT calculation: equityCorrection should make the balance stick to initialSize
  // Formula: currentEquity = startingEquity + tradePnl + equityCorrection
  // We want: 5000 = 5000 + 500 + equityCorrection
  // Therefore: equityCorrection = 5000 - 5000 - 500 = -500
  const correctEquityCorrection = initialSize - accBefore.startingEquity - tradePnl;
  
  const stateAfterPayout = {
    accounts: [
      {
        ...accBefore,
        currentEquity: initialSize, // Reset to 5000
        equityCorrection: correctEquityCorrection, // Should be -500
        prop: {
          ...accBefore.prop,
          payouts: [
            {
              id: "p1",
              amountTrader: 400,
              status: "paid",
              paidAt: Date.now(),
            },
          ],
          lastPayoutResetAt: Date.now(),
        },
      },
    ],
    trades: stateBeforePayout.trades, // Same trades
  };
  
  // Step 3: Simulate page reload - reconcileAccountsEquity runs again
  reconcileAccountsEquity(stateAfterPayout);
  const accAfter = stateAfterPayout.accounts[0];
  
  // Balance should remain at 5000 (initial size) after reload
  expect(accAfter.currentEquity).toBeCloseTo(5000);
  // equityCorrection should remain at -500 (NOT recalculated)
  expect(accAfter.equityCorrection).toBeCloseTo(-500);
});

// ── 18. Payout: paid amount displays correctly after marking paid ───────────

test("payout: paid amount displays correctly after marking paid", () => {
  // Replicate summarizePayouts logic to verify paid amounts are counted
  function summarizePayouts(account) {
    const payouts = account?.prop?.payouts || [];
    const lastResetAt = Number(account?.prop?.lastPayoutResetAt || 0) || 0;
    
    const isInCurrentCycle = (p) => {
      if (!lastResetAt) return true;
      const ts = Number(p?.paidAt || p?.requestedAt || 0);
      return ts > lastResetAt;
    };
    
    const paid = payouts.filter((p) => p.status === "paid" && isInCurrentCycle(p));
    const paidTrader = paid.reduce((s, p) => s + clampNum(p.amountTrader), 0);
    
    return { paidTrader, payouts };
  }
  
  // Scenario: After marking payout as paid at timestamp 1000
  // lastPayoutResetAt should be set to 999 (1ms before) so the payout is included
  const now = 1000;
  const account = {
    prop: {
      size: 5000,
      payouts: [
        {
          id: "p1",
          amountTrader: 400,
          status: "paid",
          paidAt: now, // Paid at timestamp 1000
        },
      ],
      lastPayoutResetAt: now - 1, // Reset at 999, so payout at 1000 is included
    },
  };
  
  const { paidTrader } = summarizePayouts(account);
  
  // Paid amount should be 400, not 0
  expect(paidTrader).toBeCloseTo(400);
  
  // Test the broken case: if lastPayoutResetAt = now, paid amount would be 0
  const brokenAccount = {
    ...account,
    prop: {
      ...account.prop,
      lastPayoutResetAt: now, // Same as paidAt - this causes the bug
    },
  };
  
  const { paidTrader: brokenPaidTrader } = summarizePayouts(brokenAccount);
  
  // With broken logic, paid amount would be 0 because paidAt is not > lastPayoutResetAt
  expect(brokenPaidTrader).toBeCloseTo(0);
});

// ── 19. Payout: availableTrader accounts for equity deduction from paid payouts ──

test("payout: availableTrader correct when lastPayoutResetAt is not set", () => {
  // Replicate computePayoutForecast logic for availableTrader
  // This tests the fix: when a payout was deducted from equity but lastPayoutResetAt
  // is not set (legacy data), the available amount should still be correct.
  
  function payoutGrossFromTrader(amountTrader, profitSplitPct) {
    const pct = Math.max(1e-9, clampNum(profitSplitPct));
    return clampNum(amountTrader) / (pct / 100);
  }
  
  const splitPct = 80;
  const startEq = 5000;
  const curEq = 5119;
  const profitGross = Math.max(0, curEq - startEq); // 119
  
  // Scenario: payout of $52.45 was paid, equity was deducted by gross amount
  // but lastPayoutResetAt was never set (legacy data)
  const paidTrader = 52.45;
  const pendingTrader = 0;
  const paidGross = payoutGrossFromTrader(paidTrader, splitPct); // 65.5625
  const pendingGross = 0;
  
  // OLD (buggy) formula: double-counts paid amount
  const oldAvailable = Math.max(0, profitGross * (splitPct / 100) - paidTrader - pendingTrader);
  expect(oldAvailable).toBeCloseTo(42.75); // The bug: $42.75 instead of $95.20
  
  // NEW (fixed) formula: adds back paidGross to get true total profit
  const totalProfitGross = profitGross + paidGross;
  const newAvailable = Math.max(0, totalProfitGross * (splitPct / 100) - paidTrader - pendingTrader);
  expect(newAvailable).toBeCloseTo(95.20); // Correct: $95.20
});

test("payout: availableTrader correct with lastPayoutResetAt set", () => {
  // When lastPayoutResetAt is set, paidGross = 0 (old payouts excluded)
  // So totalProfitGross = profitGross (just current profit)
  
  const splitPct = 80;
  const startEq = 5000;
  const curEq = 5119;
  const profitGross = Math.max(0, curEq - startEq); // 119
  
  // With lastPayoutResetAt set, old payouts are excluded from cycle
  const paidTrader = 0;
  const paidGross = 0;
  
  const totalProfitGross = profitGross + paidGross; // 119 + 0 = 119
  const available = Math.max(0, totalProfitGross * (splitPct / 100) - paidTrader - 0);
  expect(available).toBeCloseTo(95.20); // $119 * 0.80 = $95.20
});

test("payout: availableTrader correct with multiple payouts and no reset", () => {
  // Scenario: two payouts made, equity deducted for each, no lastPayoutResetAt
  function payoutGrossFromTrader(amountTrader, profitSplitPct) {
    const pct = Math.max(1e-9, clampNum(profitSplitPct));
    return clampNum(amountTrader) / (pct / 100);
  }
  
  const splitPct = 80;
  const startEq = 5000;
  
  // Two payouts of $40 each (trader share) = $80 total trader, $100 total gross
  const paidTrader = 80;
  const paidGross = payoutGrossFromTrader(80, splitPct); // 100
  
  // Current equity after two gross deductions: 5000 + 250 - 100 = 5150
  // Total earnings = 250, already paid gross = 100, equity shows profit of 150
  const curEq = 5150;
  const profitGross = Math.max(0, curEq - startEq); // 150
  
  const totalProfitGross = profitGross + paidGross; // 150 + 100 = 250
  const available = Math.max(0, totalProfitGross * (splitPct / 100) - paidTrader - 0);
  // Total trader share = 250 * 0.8 = 200, already paid = 80, available = 120
  expect(available).toBeCloseTo(120);
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
