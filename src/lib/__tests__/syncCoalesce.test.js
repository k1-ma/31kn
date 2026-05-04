/**
 * @fileoverview Logic tests for auto-resync coalescing in src/lib/syncDb.js.
 *
 * The hook itself isn't testable here (no React testing setup), so this
 * mirrors the post-success decision tree from syncDb.js useSyncedDb and
 * verifies the bounded auto-resync behavior.
 *
 * Run with: node src/lib/__tests__/syncCoalesce.test.js
 */

const MAX_AUTO_RESYNC = 3;

// ── Inline mirror of the coalescing state machine from syncDb.js ─────────────

function makeCoalescer() {
  const state = {
    pendingResyncRef: { current: false },
    autoResyncCountRef: { current: 0 },
    syncStatus: "idle",
    resyncScheduled: 0, // number of times an auto-resync was scheduled
  };

  // Mirrors the syncToServer concurrent-sync guard at line ~1777:
  //   if (syncInFlight.current) {
  //     pendingResyncRef.current = true;
  //     return { skipped: true };
  //   }
  function concurrentSyncSkipped() {
    state.pendingResyncRef.current = true;
  }

  // Mirrors the success branch in the debounced save callback at line ~2338:
  //   if (result.success) {
  //     if (pendingResyncRef.current && autoResyncCountRef.current < MAX_AUTO_RESYNC) {
  //       pendingResyncRef.current = false;
  //       autoResyncCountRef.current += 1;
  //       setSyncStatus("saving");
  //       /* schedule another syncToServer in 50ms */
  //       return;
  //     }
  //     pendingResyncRef.current = false;
  //     autoResyncCountRef.current = 0;
  //     setSyncStatus("synced");
  //   }
  function onSuccess() {
    if (
      state.pendingResyncRef.current &&
      state.autoResyncCountRef.current < MAX_AUTO_RESYNC
    ) {
      state.pendingResyncRef.current = false;
      state.autoResyncCountRef.current += 1;
      state.syncStatus = "saving";
      state.resyncScheduled += 1;
      return "resync_scheduled";
    }
    state.pendingResyncRef.current = false;
    state.autoResyncCountRef.current = 0;
    state.syncStatus = "synced";
    return "synced";
  }

  return { state, concurrentSyncSkipped, onSuccess };
}

// ── Mini test runner ─────────────────────────────────────────────────────────

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
        throw new Error(
          `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
      }
    },
    toBeLessThanOrEqual(expected) {
      if (!(actual <= expected)) {
        throw new Error(`Expected ${actual} <= ${expected}`);
      }
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("clean sync: no concurrent mutation -> synced, no resync scheduled", () => {
  const c = makeCoalescer();
  const result = c.onSuccess();
  expect(result).toBe("synced");
  expect(c.state.syncStatus).toBe("synced");
  expect(c.state.resyncScheduled).toBe(0);
  expect(c.state.pendingResyncRef.current).toBe(false);
  expect(c.state.autoResyncCountRef.current).toBe(0);
});

test("concurrent mutation during sync -> resync scheduled, status stays saving", () => {
  const c = makeCoalescer();
  // mutation B arrived during A's sync, hit the guard
  c.concurrentSyncSkipped();
  expect(c.state.pendingResyncRef.current).toBe(true);

  // A completes successfully — should trigger one resync
  const result = c.onSuccess();
  expect(result).toBe("resync_scheduled");
  expect(c.state.syncStatus).toBe("saving");
  expect(c.state.resyncScheduled).toBe(1);
  expect(c.state.autoResyncCountRef.current).toBe(1);
  // Flag was consumed
  expect(c.state.pendingResyncRef.current).toBe(false);
});

test("burst of concurrent mutations: each consecutive run is capped, then synced", () => {
  const c = makeCoalescer();

  // Re-arm the flag MAX_AUTO_RESYNC times in a row (simulates an unbroken
  // streak of concurrent mutations within a single sync burst).
  for (let i = 0; i < MAX_AUTO_RESYNC; i++) {
    c.concurrentSyncSkipped();
    const r = c.onSuccess();
    // Within a burst, every iteration schedules a resync until cap is hit.
    expect(r).toBe("resync_scheduled");
  }
  expect(c.state.autoResyncCountRef.current).toBe(MAX_AUTO_RESYNC);
  expect(c.state.resyncScheduled).toBe(MAX_AUTO_RESYNC);

  // One more concurrent — this one EXCEEDS the cap and the handler falls
  // through to "synced" so the natural debounced save path can take over
  // (preventing infinite auto-resync within a single burst).
  c.concurrentSyncSkipped();
  c.onSuccess();
  expect(c.state.syncStatus).toBe("synced");
  expect(c.state.resyncScheduled).toBe(MAX_AUTO_RESYNC); // not incremented
  // Counter resets so the next burst can also auto-resync.
  expect(c.state.autoResyncCountRef.current).toBe(0);
});

test("successful sync after burst resets the counter", () => {
  const c = makeCoalescer();
  // Burst of 3 concurrents -> resyncScheduled goes up to MAX_AUTO_RESYNC
  for (let i = 0; i < MAX_AUTO_RESYNC; i++) {
    c.concurrentSyncSkipped();
    c.onSuccess();
  }
  expect(c.state.autoResyncCountRef.current).toBe(MAX_AUTO_RESYNC);

  // 4th concurrent comes after cap was hit — onSuccess takes the "synced"
  // path because count reached cap; counter then resets.
  c.concurrentSyncSkipped();
  c.onSuccess();
  expect(c.state.syncStatus).toBe("synced");
  expect(c.state.autoResyncCountRef.current).toBe(0);

  // Now the system is healthy again — a fresh concurrent should trigger a
  // resync just like the very first one.
  c.concurrentSyncSkipped();
  const result = c.onSuccess();
  expect(result).toBe("resync_scheduled");
  expect(c.state.autoResyncCountRef.current).toBe(1);
});

test("flag is cleared on the first onSuccess after concurrent skip", () => {
  const c = makeCoalescer();
  c.concurrentSyncSkipped();
  c.onSuccess();
  // After processing, flag is consumed so a follow-up clean sync goes synced
  expect(c.state.pendingResyncRef.current).toBe(false);
  const result = c.onSuccess();
  expect(result).toBe("synced");
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
