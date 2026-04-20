/**
 * @fileoverview Unit tests for mergeStates: libraries (symbols/sessions) and documents merging
 * Run with: node src/lib/__tests__/mergeLibrariesDocs.test.js
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
    const expected = calculated + correction;
    const actual   = clampNum(acc.currentEquity);
    if (acc.currentEquity == null || Math.abs(expected - actual) > EQUITY_TOLERANCE) {
      return { ...acc, currentEquity: expected, equityCorrection: correction };
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

function withoutDeletedAt(item) {
  const { deletedAt, ...rest } = item;
  return rest;
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
      let mergedItem = serverTs > localTs ? serverItem : localItem;
      // CRITICAL: Preserve deletedAt status across versions using Math.max
      const serverDeletedAt = (typeof serverItem?.deletedAt === 'number' && serverItem.deletedAt > 0) ? serverItem.deletedAt : null;
      const localDeletedAt = (typeof localItem?.deletedAt === 'number' && localItem.deletedAt > 0) ? localItem.deletedAt : null;
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        const maxDeletedAt = Math.max(serverDeletedAt ?? 0, localDeletedAt ?? 0);
        mergedItem = { ...mergedItem, deletedAt: maxDeletedAt };
      } else if (mergedItem.deletedAt !== undefined && !(typeof mergedItem.deletedAt === 'number' && mergedItem.deletedAt > 0)) {
        mergedItem = withoutDeletedAt(mergedItem);
      }
      mergedMap.set(id, mergedItem);
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
      let mergedItem = serverTs > localTs ? serverItem : localItem;
      // CRITICAL: Preserve deletedAt status across versions using Math.max
      const serverDeletedAt = (typeof serverItem?.deletedAt === 'number' && serverItem.deletedAt > 0) ? serverItem.deletedAt : null;
      const localDeletedAt = (typeof localItem?.deletedAt === 'number' && localItem.deletedAt > 0) ? localItem.deletedAt : null;
      if (serverDeletedAt !== null || localDeletedAt !== null) {
        const maxDeletedAt = Math.max(serverDeletedAt ?? 0, localDeletedAt ?? 0);
        mergedItem = { ...mergedItem, deletedAt: maxDeletedAt };
      } else if (mergedItem.deletedAt !== undefined && !(typeof mergedItem.deletedAt === 'number' && mergedItem.deletedAt > 0)) {
        mergedItem = withoutDeletedAt(mergedItem);
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
  if (localState.ui || serverState.ui) {
    merged.ui = { ...serverState.ui, ...localState.ui };
  }
  // Merge libraries (symbols/pairs, sessions, models, customTags)
  if (localState.libraries || serverState.libraries) {
    const localLib = localState.libraries ?? {};
    const serverLib = serverState.libraries ?? {};
    merged.libraries = {
      ...serverLib,
      symbols: mergeArraysById(localLib.symbols, serverLib.symbols, isInitialLoad),
      sessions: mergeArraysById(localLib.sessions, serverLib.sessions, isInitialLoad),
      models: mergeArraysById(localLib.models, serverLib.models, isInitialLoad),
      customTags: mergeArraysById(localLib.customTags, serverLib.customTags, isInitialLoad),
    };
  }
  // Merge documents
  if (localState.documents || serverState.documents) {
    merged.documents = mergeArraysById(localState.documents, serverState.documents, isInitialLoad);
  }
  // Merge docFolders and docShares
  if (localState.docFolders || serverState.docFolders) {
    merged.docFolders = mergeArraysById(localState.docFolders, serverState.docFolders, isInitialLoad);
  }
  if (localState.docShares || serverState.docShares) {
    merged.docShares = mergeArraysById(localState.docShares, serverState.docShares, isInitialLoad);
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
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${b}, got ${a}`);
      }
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("\n=== Merge Libraries & Documents Tests ===\n");

// ── 1. Soft-deleted pair stays deleted after merge ─────────────────────────

test("mergeStates: soft-deleted symbol is preserved (not restored by server)", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_eurusd", name: "EURUSD", deletedAt: 1700000000000 },
        { id: "sym_gbpusd", name: "GBPUSD", deletedAt: null },
      ],
      sessions: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_eurusd", name: "EURUSD", deletedAt: null },
        { id: "sym_gbpusd", name: "GBPUSD", deletedAt: null },
      ],
      sessions: [],
    },
  };
  const merged = mergeStates(localState, serverState);
  const eurusd = merged.libraries.symbols.find((s) => s.id === "sym_eurusd");
  expect(eurusd.deletedAt).toBe(1700000000000);
});

// ── 2. Permanently deleted pair stays deleted ──────────────────────────────

test("mergeStates: permanently deleted symbol is not restored (non-initial load)", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_gbpusd", name: "GBPUSD", deletedAt: null },
      ],
      sessions: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_eurusd", name: "EURUSD", deletedAt: null },
        { id: "sym_gbpusd", name: "GBPUSD", deletedAt: null },
      ],
      sessions: [],
    },
  };
  // Non-initial load: server-only items should NOT be restored
  const merged = mergeStates(localState, serverState, false);
  expect(merged.libraries.symbols.length).toBe(1);
  expect(merged.libraries.symbols[0].id).toBe("sym_gbpusd");
});

// ── 3. Initial load preserves server-only pairs (multi-device) ─────────────

test("mergeStates: initial load preserves server-only symbols (multi-device)", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_gbpusd", name: "GBPUSD", deletedAt: null },
      ],
      sessions: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_eurusd", name: "EURUSD", deletedAt: null },
        { id: "sym_gbpusd", name: "GBPUSD", deletedAt: null },
      ],
      sessions: [],
    },
  };
  // Initial load: server-only items SHOULD be preserved
  const merged = mergeStates(localState, serverState, true);
  expect(merged.libraries.symbols.length).toBe(2);
});

// ── 4. New local document is preserved after merge ─────────────────────────

test("mergeStates: new local document is preserved when server does not have it", () => {
  const localState = {
    trades: [],
    accounts: [],
    documents: [
      { id: "doc1", title: "My Notes", content: "Hello", updatedAt: 1700000000000 },
      { id: "doc2", title: "New Doc", content: "World", updatedAt: 1700000001000 },
    ],
  };
  const serverState = {
    trades: [],
    accounts: [],
    documents: [
      { id: "doc1", title: "My Notes", content: "Hello", updatedAt: 1700000000000 },
    ],
  };
  const merged = mergeStates(localState, serverState, false);
  expect(merged.documents.length).toBe(2);
  const doc2 = merged.documents.find((d) => d.id === "doc2");
  expect(doc2.title).toBe("New Doc");
});

// ── 5. Archived document stays archived ────────────────────────────────────

test("mergeStates: archived document is preserved (not un-archived by server)", () => {
  const localState = {
    trades: [],
    accounts: [],
    documents: [
      { id: "doc1", title: "My Notes", content: "Hello", updatedAt: 1700000000000, archivedAt: 1700000002000 },
    ],
  };
  const serverState = {
    trades: [],
    accounts: [],
    documents: [
      { id: "doc1", title: "My Notes", content: "Hello", updatedAt: 1700000000000, archivedAt: null },
    ],
  };
  // Both have same updatedAt → local wins (tie goes to local)
  const merged = mergeStates(localState, serverState, false);
  expect(merged.documents[0].archivedAt).toBe(1700000002000);
});

// ── 6. Sessions merge similarly to symbols ─────────────────────────────────

test("mergeStates: soft-deleted session is preserved", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [
        { id: "ses_london", name: "London", deletedAt: 1700000000000 },
        { id: "ses_ny", name: "New York", deletedAt: null },
      ],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [
        { id: "ses_london", name: "London", deletedAt: null },
        { id: "ses_ny", name: "New York", deletedAt: null },
      ],
    },
  };
  const merged = mergeStates(localState, serverState);
  const london = merged.libraries.sessions.find((s) => s.id === "ses_london");
  expect(london.deletedAt).toBe(1700000000000);
});

// ── 7. Document with newer server updatedAt wins ───────────────────────────

test("mergeStates: document with newer server updatedAt takes server version", () => {
  const localState = {
    trades: [],
    accounts: [],
    documents: [
      { id: "doc1", title: "Old Title", content: "old", updatedAt: 1700000000000 },
    ],
  };
  const serverState = {
    trades: [],
    accounts: [],
    documents: [
      { id: "doc1", title: "New Title", content: "new", updatedAt: 1700000005000 },
    ],
  };
  const merged = mergeStates(localState, serverState, false);
  expect(merged.documents[0].title).toBe("New Title");
});

// ── 8. docFolders are merged ───────────────────────────────────────────────

test("mergeStates: docFolders are merged by ID", () => {
  const localState = {
    trades: [],
    accounts: [],
    docFolders: [
      { id: "folder1", name: "Folder A" },
      { id: "folder2", name: "Folder B" },
    ],
  };
  const serverState = {
    trades: [],
    accounts: [],
    docFolders: [
      { id: "folder1", name: "Folder A" },
    ],
  };
  const merged = mergeStates(localState, serverState, false);
  expect(merged.docFolders.length).toBe(2);
});

// ── 9. Without libraries in local state, server libraries are used ─────────

test("mergeStates: server libraries used when local has none", () => {
  const localState = {
    trades: [],
    accounts: [],
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_eurusd", name: "EURUSD", deletedAt: null },
      ],
      sessions: [],
    },
  };
  const merged = mergeStates(localState, serverState, false);
  expect(merged.libraries.symbols.length).toBe(1);
});

// ── 10. Locally added symbol is preserved ──────────────────────────────────

test("mergeStates: locally added symbol is preserved", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_eurusd", name: "EURUSD", deletedAt: null },
        { id: "sym_custom", name: "BTCUSD", deletedAt: null, createdAt: 1700000001000 },
      ],
      sessions: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_eurusd", name: "EURUSD", deletedAt: null },
      ],
      sessions: [],
    },
  };
  const merged = mergeStates(localState, serverState, false);
  expect(merged.libraries.symbols.length).toBe(2);
  const custom = merged.libraries.symbols.find((s) => s.id === "sym_custom");
  expect(custom.name).toBe("BTCUSD");
});

// ── 11. Symbol deleted with updatedAt: server has newer version without deletedAt ──

test("mergeStates: soft-deleted symbol with updatedAt preserved even when server is newer", () => {
  // This covers the fix: trashSymbol now sets updatedAt so local always wins
  // Even without the updatedAt fix, Math.max ensures deletedAt is preserved
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        { id: "sym_eurusd", name: "EURUSD", deletedAt: 2000, updatedAt: 2000 },
      ],
      sessions: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [
        // Server has a newer updatedAt (e.g. from another device) but no deletedAt
        { id: "sym_eurusd", name: "EURUSD Updated", updatedAt: 3000 },
      ],
      sessions: [],
    },
  };
  const merged = mergeStates(localState, serverState);
  const sym = merged.libraries.symbols.find((s) => s.id === "sym_eurusd");
  // deletedAt must be preserved regardless of which version wins timestamp comparison
  expect(sym.deletedAt).toBe(2000);
});

// ── 12. Document archivedAt preserved when local sets updatedAt ────────────

test("mergeStates: archived document (with updatedAt) not un-archived by newer server version", () => {
  // This covers the fix: deleteDocument now sets updatedAt so local wins timestamp
  const localState = {
    trades: [],
    accounts: [],
    documents: [
      { id: "doc1", title: "My Notes", content: "Hello", updatedAt: 3000, archivedAt: 3000 },
    ],
  };
  const serverState = {
    trades: [],
    accounts: [],
    documents: [
      // Server has older state without archivedAt
      { id: "doc1", title: "My Notes", content: "Hello", updatedAt: 2000, archivedAt: null },
    ],
  };
  // Local is newer (updatedAt 3000 > 2000) so local wins, archivedAt preserved
  const merged = mergeStates(localState, serverState, false);
  expect(merged.documents[0].archivedAt).toBe(3000);
});

// ── 13. Local-only model is preserved after merge ──────────────────────────

test("mergeStates: locally added model is preserved when server does not have it", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [
        { id: "mod_breakout", name: "Breakout", createdAt: 1700000001000 },
        { id: "mod_scalp", name: "Scalping", createdAt: 1700000002000 },
      ],
      customTags: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [
        { id: "mod_breakout", name: "Breakout", createdAt: 1700000001000 },
      ],
      customTags: [],
    },
  };
  const merged = mergeStates(localState, serverState, false);
  expect(merged.libraries.models.length).toBe(2);
  const scalp = merged.libraries.models.find((m) => m.id === "mod_scalp");
  expect(scalp.name).toBe("Scalping");
});

// ── 14. Soft-deleted model stays deleted ───────────────────────────────────

test("mergeStates: soft-deleted model is preserved (not restored by server)", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [
        { id: "mod_breakout", name: "Breakout", deletedAt: 1700000003000, updatedAt: 1700000003000 },
      ],
      customTags: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [
        { id: "mod_breakout", name: "Breakout", deletedAt: null, updatedAt: 1700000001000 },
      ],
      customTags: [],
    },
  };
  const merged = mergeStates(localState, serverState);
  const breakout = merged.libraries.models.find((m) => m.id === "mod_breakout");
  expect(breakout.deletedAt).toBe(1700000003000);
});

// ── 15. Local-only customTag is preserved after merge ──────────────────────

test("mergeStates: locally added customTag is preserved when server does not have it", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [],
      customTags: [
        { id: "tag_important", name: "Important", createdAt: 1700000001000 },
        { id: "tag_review", name: "Review", createdAt: 1700000002000 },
      ],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [],
      customTags: [
        { id: "tag_important", name: "Important", createdAt: 1700000001000 },
      ],
    },
  };
  const merged = mergeStates(localState, serverState, false);
  expect(merged.libraries.customTags.length).toBe(2);
  const review = merged.libraries.customTags.find((t) => t.id === "tag_review");
  expect(review.name).toBe("Review");
});

// ── 16. Soft-deleted customTag stays deleted ───────────────────────────────

test("mergeStates: soft-deleted customTag is preserved (not restored by server)", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [],
      customTags: [
        { id: "tag_review", name: "Review", deletedAt: 1700000003000, updatedAt: 1700000003000 },
      ],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [],
      customTags: [
        { id: "tag_review", name: "Review", deletedAt: null, updatedAt: 1700000001000 },
      ],
    },
  };
  const merged = mergeStates(localState, serverState);
  const review = merged.libraries.customTags.find((t) => t.id === "tag_review");
  expect(review.deletedAt).toBe(1700000003000);
});

// ── 17. Initial load preserves server-only models (multi-device) ───────────

test("mergeStates: initial load preserves server-only models (multi-device)", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [],
      customTags: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [
        { id: "mod_swing", name: "Swing Trading", createdAt: 1700000001000 },
      ],
      customTags: [
        { id: "tag_winner", name: "Winner", createdAt: 1700000001000 },
      ],
    },
  };
  const merged = mergeStates(localState, serverState, true);
  expect(merged.libraries.models.length).toBe(1);
  expect(merged.libraries.customTags.length).toBe(1);
});

// ── 18. Non-initial load ignores server-only models (treated as deleted) ───

test("mergeStates: non-initial load ignores server-only models (treated as deleted locally)", () => {
  const localState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [],
      customTags: [],
    },
  };
  const serverState = {
    trades: [],
    accounts: [],
    libraries: {
      symbols: [],
      sessions: [],
      models: [
        { id: "mod_swing", name: "Swing Trading", createdAt: 1700000001000 },
      ],
      customTags: [
        { id: "tag_winner", name: "Winner", createdAt: 1700000001000 },
      ],
    },
  };
  const merged = mergeStates(localState, serverState, false);
  expect(merged.libraries.models.length).toBe(0);
  expect(merged.libraries.customTags.length).toBe(0);
});

// ── Done ────────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
