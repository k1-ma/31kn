/**
 * @fileoverview Tests for the Phase 3 read path (readStateV2).
 *
 * Uses a hand-rolled pool mock so we can drive query() responses
 * deterministically and assert the validation gates fire correctly.
 *
 * Run with: node server/__tests__/readStateV2.test.js
 */

import { readStateV2, isReadFromV2Enabled } from "../services/imageStore.service.js";

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) { tests.push({ name, fn }); }

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
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
  };
}

function makePool(stateRow, imgRows = []) {
  return {
    query: async (sql /*, params */) => {
      if (/FROM states/i.test(sql)) {
        return { rows: stateRow ? [stateRow] : [] };
      }
      if (/FROM user_images/i.test(sql)) {
        return { rows: imgRows };
      }
      throw new Error(`Unexpected SQL in test pool: ${sql.slice(0, 60)}`);
    },
  };
}

const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const png = `data:image/png;base64,${PNG_1x1}`;

test("returns ok=false when no state row", async () => {
  const pool = makePool(null);
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe("no_state_row");
});

test("returns ok=false when state_json_v2 is null", async () => {
  const pool = makePool({
    state_json: { trades: [] },
    state_json_v2: null,
    state_v2_updated_at: null,
    state_v2_verify_failed_at: null,
    updated_at: new Date(),
    version: 1,
  });
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe("v2_null");
});

test("returns ok=false when verify_failed_at stamp is set", async () => {
  const pool = makePool({
    state_json: { trades: [] },
    state_json_v2: { trades: [] },
    state_v2_updated_at: new Date(),
    state_v2_verify_failed_at: new Date(),
    updated_at: new Date(),
    version: 1,
  });
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe("v2_verify_failed_stamp");
});

test("returns ok=false when v2 lags more than 30s behind v1", async () => {
  const v1 = new Date();
  const v2 = new Date(v1.getTime() - 60_000);
  const pool = makePool({
    state_json: { trades: [] },
    state_json_v2: { trades: [] },
    state_v2_updated_at: v2,
    state_v2_verify_failed_at: null,
    updated_at: v1,
    version: 1,
  });
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe("v2_stale");
});

test("returns ok=false when an image ref is missing in user_images", async () => {
  const now = new Date();
  const pool = makePool(
    {
      state_json: { trades: [{ id: "t1", screenshot: png }] },
      state_json_v2: { trades: [{ id: "t1", screenshot: { __imgRef: "img_missing", v: 1 } }] },
      state_v2_updated_at: now,
      state_v2_verify_failed_at: null,
      updated_at: now,
      version: 1,
    },
    [] // image fetch returns nothing
  );
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe("missing_refs");
});

test("returns ok=false when collection counts diverge between v1 and v2", async () => {
  const now = new Date();
  const pool = makePool(
    {
      state_json: { trades: [{ id: "t1" }, { id: "t2" }] },
      state_json_v2: { trades: [{ id: "t1" }] }, // missing t2
      state_v2_updated_at: now,
      state_v2_verify_failed_at: null,
      updated_at: now,
      version: 1,
    },
    []
  );
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe("count_mismatch_trades");
});

test("returns ok=true with rehydrated state when everything checks out", async () => {
  const now = new Date();
  const pool = makePool(
    {
      state_json: {
        trades: [{ id: "t1", screenshot: png }, { id: "t2" }],
        accounts: [{ id: "a1" }],
        documents: [],
        backtests: [],
      },
      state_json_v2: {
        trades: [{ id: "t1", screenshot: { __imgRef: "img_42", v: 1 } }, { id: "t2" }],
        accounts: [{ id: "a1" }],
        documents: [],
        backtests: [],
      },
      state_v2_updated_at: now,
      state_v2_verify_failed_at: null,
      updated_at: now,
      version: 7,
    },
    [
      // PG-style: encode(bytea, 'base64') may wrap with newlines; readStateV2
      // strips whitespace and re-equality holds.
      {
        image_id: "img_42",
        content_type: "image/png",
        base64: PNG_1x1.match(/.{1,76}/g).join("\n"),
      },
    ]
  );
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(true);
  expect(r.version).toBe(7);
  expect(r.state.trades.length).toBe(2);
  expect(r.state.trades[0].screenshot).toBe(png);
  expect(r.state.trades[1].id).toBe("t2");
  expect(r.metrics.refs).toBe(1);
});

test("PG-style line-wrapped base64 correctly round-trips through read path", async () => {
  // This is the same regression that hit production on first IMAGE_DUAL_WRITE
  // enable, but for the read path. encode(bytea, 'base64') wraps at 76 chars
  // with '\n'; we strip whitespace before rebuilding the data URL.
  const longBase64 = PNG_1x1.repeat(20);
  const wrapped = longBase64.match(/.{1,76}/g).join("\n");
  const longPng = `data:image/png;base64,${longBase64}`;
  const now = new Date();
  const pool = makePool(
    {
      state_json: { trades: [{ id: "t1", screenshot: longPng }] },
      state_json_v2: { trades: [{ id: "t1", screenshot: { __imgRef: "img_x", v: 1 } }] },
      state_v2_updated_at: now,
      state_v2_verify_failed_at: null,
      updated_at: now,
      version: 1,
    },
    [{ image_id: "img_x", content_type: "image/png", base64: wrapped }]
  );
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(true);
  expect(r.state.trades[0].screenshot).toBe(longPng);
});

test("v2 read survives transient query exception by returning ok=false (no throw)", async () => {
  const pool = {
    query: async () => { throw new Error("connection reset"); },
  };
  const r = await readStateV2({ pool, userId: 5 });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe("query_failed");
});

test("isReadFromV2Enabled correctly reads env at module load", async () => {
  // Module-load behaviour: with READ_FROM_V2_USER_IDS unset (default in tests),
  // every userId returns false. This is the safe-by-default contract.
  expect(isReadFromV2Enabled(5)).toBe(false);
  expect(isReadFromV2Enabled(0)).toBe(false);
  expect(isReadFromV2Enabled("5")).toBe(false);
});

(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${t.name}\n      ${err.message}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
