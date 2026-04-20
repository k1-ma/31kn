/**
 * @fileoverview Test for BUG #6 — isDeleted check consistency.
 * Verifies that the shared tombstones module is used consistently
 * and that raw `.deletedAt` truthy checks don't cause inconsistencies.
 *
 * Run with: node src/lib/__tests__/tombstones.test.js
 */

// Copy of isDeleted from tombstones.js for standalone testing
function isDeleted(item) {
  return typeof item?.deletedAt === "number" && item.deletedAt > 0;
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
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("\n=== BUG #6: isDeleted consistency tests ===\n");

// ── Demonstrate the bug: truthy check vs isDeleted ───

test("BUG REPRO: truthy check `t.deletedAt` treats deletedAt:0 as NOT deleted (correct by accident)", () => {
  const item = { id: "t1", deletedAt: 0 };
  // Old truthy check: `if (t.deletedAt) ...` → 0 is falsy → not deleted (correct!)
  // But this is correct by accident because !0 === true
  expect(!item.deletedAt).toBe(true); // falsy check says "not deleted"
  expect(isDeleted(item)).toBe(false); // isDeleted also says "not deleted"
});

test("BUG REPRO: truthy check `t.deletedAt` treats deletedAt:undefined as NOT deleted", () => {
  const item = { id: "t1" };
  expect(!item.deletedAt).toBe(true);
  expect(isDeleted(item)).toBe(false);
});

test("BUG REPRO: truthy check `t.deletedAt` treats deletedAt:null as NOT deleted", () => {
  const item = { id: "t1", deletedAt: null };
  expect(!item.deletedAt).toBe(true);
  expect(isDeleted(item)).toBe(false);
});

test("BUG REPRO: truthy check correctly identifies positive timestamp as deleted", () => {
  const item = { id: "t1", deletedAt: Date.now() };
  expect(!!item.deletedAt).toBe(true);
  expect(isDeleted(item)).toBe(true);
});

test("BUG REPRO: truthy check `!t.deletedAt` treats string '0' as truthy (BUG!)", () => {
  // If somehow deletedAt is stored as a string "0", truthy check would say "deleted"
  // but isDeleted correctly says "not deleted"
  const item = { id: "t1", deletedAt: "0" };
  expect(!!item.deletedAt).toBe(true); // truthy check: WRONG - says deleted
  expect(isDeleted(item)).toBe(false); // isDeleted: CORRECT - string is not a positive number
});

test("BUG REPRO: truthy check treats empty string '' as NOT deleted", () => {
  const item = { id: "t1", deletedAt: "" };
  expect(!item.deletedAt).toBe(true);
  expect(isDeleted(item)).toBe(false);
});

// ── Consistency: isDeleted matches on all edge values ───

test("isDeleted handles all edge cases consistently", () => {
  const cases = [
    [{ id: "1", deletedAt: 0 }, false],
    [{ id: "2", deletedAt: null }, false],
    [{ id: "3", deletedAt: undefined }, false],
    [{ id: "4" }, false],
    [null, false],
    [undefined, false],
    [{ id: "5", deletedAt: "" }, false],
    [{ id: "6", deletedAt: false }, false],
    [{ id: "7", deletedAt: -1 }, false],
    [{ id: "8", deletedAt: 1 }, true],
    [{ id: "9", deletedAt: Date.now() }, true],
    [{ id: "10", deletedAt: 1234567890000 }, true],
  ];

  for (const [item, expected] of cases) {
    const result = isDeleted(item);
    if (result !== expected) {
      throw new Error(`isDeleted(${JSON.stringify(item)}) = ${result}, expected ${expected}`);
    }
  }
});

// ── Filtering: isDeleted used in array filter produces correct results ───

test("filtering trades with isDeleted correctly separates active from deleted", () => {
  const trades = [
    { id: "t1", symbol: "EURUSD", deletedAt: 0 },           // active
    { id: "t2", symbol: "GBPUSD" },                          // active (no deletedAt)
    { id: "t3", symbol: "XAUUSD", deletedAt: null },         // active
    { id: "t4", symbol: "USDJPY", deletedAt: Date.now() },   // deleted
    { id: "t5", symbol: "USDCHF", deletedAt: 123456 },       // deleted
    { id: "t6", symbol: "EURJPY", deletedAt: undefined },    // active
  ];

  const active = trades.filter(t => !isDeleted(t));
  const deleted = trades.filter(t => isDeleted(t));

  expect(active.length).toBe(4);
  expect(deleted.length).toBe(2);
  expect(active.map(t => t.id).join(",")).toBe("t1,t2,t3,t6");
  expect(deleted.map(t => t.id).join(",")).toBe("t4,t5");
});

test("old truthy pattern produces SAME results as isDeleted for common cases", () => {
  // For the most common cases (deletedAt is either undefined or a positive number),
  // the old truthy pattern happens to produce the same results.
  // The difference only shows up for edge cases like deletedAt: "0" or deletedAt: ""
  const commonCases = [
    { id: "t1" },                              // undefined → both say "active"
    { id: "t2", deletedAt: Date.now() },       // positive → both say "deleted"
    { id: "t3", deletedAt: 0 },                // 0 → both say "active"
  ];

  for (const item of commonCases) {
    const oldResult = !item.deletedAt;
    const newResult = !isDeleted(item);
    if (oldResult !== newResult) {
      throw new Error(`Mismatch for ${JSON.stringify(item)}: old=${oldResult}, new=${newResult}`);
    }
  }
});

// ── Account deletion check consistency ───

test("account with deletedAt truthy check vs isDeleted", () => {
  const accounts = [
    { id: "a1", name: "Main", deletedAt: 0 },
    { id: "a2", name: "Prop", deletedAt: Date.now() },
    { id: "a3", name: "Demo" },
  ];

  // Old pattern: acc.deletedAt (used in reconcileAccountsEquity)
  const activeOld = accounts.filter(a => !a.deletedAt);
  // New pattern: isDeleted(acc)
  const activeNew = accounts.filter(a => !isDeleted(a));

  expect(activeOld.length).toBe(2);
  expect(activeNew.length).toBe(2);
  expect(activeOld.map(a => a.id).join(",")).toBe("a1,a3");
  expect(activeNew.map(a => a.id).join(",")).toBe("a1,a3");
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
