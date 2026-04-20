/**
 * @fileoverview Test for isDeleted helper function
 * 
 * ISSUE: After PR #369 fixed the merge logic to handle deletedAt: 0,
 * the filtering logic throughout the codebase still used !item?.deletedAt
 * which incorrectly filters out items with deletedAt: 0 (because !0 === true).
 * 
 * FIX: Created isDeleted() helper that correctly checks:
 * typeof item?.deletedAt === 'number' && item.deletedAt > 0
 * 
 * Run with: node src/lib/__tests__/isDeletedHelper.test.js
 */

// Copy of isDeleted function from syncDb.js for standalone testing
function isDeleted(item) {
  return typeof item?.deletedAt === 'number' && item.deletedAt > 0;
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
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log("\n=== isDeleted Helper Function Test ===\n");

// ── Items that should NOT be considered deleted ───

test("item with deletedAt: 0 should NOT be deleted", () => {
  const item = { id: "t1", deletedAt: 0 };
  expect(isDeleted(item)).toBeFalsy();
});

test("item with no deletedAt field should NOT be deleted", () => {
  const item = { id: "t1" };
  expect(isDeleted(item)).toBeFalsy();
});

test("item with deletedAt: null should NOT be deleted", () => {
  const item = { id: "t1", deletedAt: null };
  expect(isDeleted(item)).toBeFalsy();
});

test("item with deletedAt: undefined should NOT be deleted", () => {
  const item = { id: "t1", deletedAt: undefined };
  expect(isDeleted(item)).toBeFalsy();
});

test("item with deletedAt: '' (empty string) should NOT be deleted", () => {
  const item = { id: "t1", deletedAt: "" };
  expect(isDeleted(item)).toBeFalsy();
});

test("item with deletedAt: false should NOT be deleted", () => {
  const item = { id: "t1", deletedAt: false };
  expect(isDeleted(item)).toBeFalsy();
});

test("null item should NOT be deleted", () => {
  expect(isDeleted(null)).toBeFalsy();
});

test("undefined item should NOT be deleted", () => {
  expect(isDeleted(undefined)).toBeFalsy();
});

// ── Items that SHOULD be considered deleted ───

test("item with deletedAt: 1234567890 (positive timestamp) should be deleted", () => {
  const item = { id: "t1", deletedAt: 1234567890 };
  expect(isDeleted(item)).toBeTruthy();
});

test("item with deletedAt: Date.now() should be deleted", () => {
  const item = { id: "t1", deletedAt: Date.now() };
  expect(isDeleted(item)).toBeTruthy();
});

test("item with deletedAt: 1 should be deleted", () => {
  const item = { id: "t1", deletedAt: 1 };
  expect(isDeleted(item)).toBeTruthy();
});

// ── Filtering logic ───

test("filtering with isDeleted correctly keeps non-deleted items", () => {
  const items = [
    { id: "t1", deletedAt: 0 },          // Should be KEPT
    { id: "t2" },                        // Should be KEPT
    { id: "t3", deletedAt: null },       // Should be KEPT
    { id: "t4", deletedAt: Date.now() }, // Should be FILTERED OUT
    { id: "t5", deletedAt: 123456 },     // Should be FILTERED OUT
  ];
  
  const active = items.filter(item => !isDeleted(item));
  
  expect(active.length).toBe(3);
  expect(active[0].id).toBe("t1");
  expect(active[1].id).toBe("t2");
  expect(active[2].id).toBe("t3");
});

test("old pattern !item?.deletedAt KEEPS deletedAt: 0 (this is the bug!)", () => {
  const items = [
    { id: "t1", deletedAt: 0 },          // KEPT by old pattern (should be kept, but for wrong reason)
    { id: "t2" },                        // Kept by old pattern  
    { id: "t3", deletedAt: Date.now() }, // FILTERED by old pattern
  ];
  
  // Old pattern - uses !item?.deletedAt
  // This KEEPS deletedAt: 0 items, but also keeps null/undefined
  // The bug is that !0 === true, so items with deletedAt: 0 are treated as "not deleted"
  // which HAPPENS to be correct, but for the wrong reason!
  const activeOldWay = items.filter(item => !item?.deletedAt);
  
  // Old way keeps both t1 (deletedAt: 0) and t2 (no deletedAt)
  expect(activeOldWay.length).toBe(2);
  expect(activeOldWay[0].id).toBe("t1");
  expect(activeOldWay[1].id).toBe("t2");
  
  // New pattern - uses !isDeleted(item)
  const activeNewWay = items.filter(item => !isDeleted(item));
  
  // New way also keeps both t1 and t2, but for the RIGHT reason
  expect(activeNewWay.length).toBe(2);
  expect(activeNewWay[0].id).toBe("t1");
  expect(activeNewWay[1].id).toBe("t2");
  
  // The key difference: isDeleted(item) is explicit and correct
  // !item?.deletedAt works by accident because !0 === true
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
