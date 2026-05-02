/**
 * @fileoverview Round-trip tests for image extraction utilities (Phase 1).
 *
 * These tests are the foundation of dual-write safety: if extract() and
 * inline() are not bit-for-bit inverses, the runtime verify step in Phase 2
 * will start rejecting writes and the v2 path will silently never be trusted.
 *
 * Run with: node server/__tests__/imageExtraction.test.js
 */

import {
  extractImagesFromState,
  inlineImagesIntoState,
  jsonDeepEqual,
  isDataUrlImage,
  isImageRef,
  parseDataUrl,
  hashImageBase64,
} from "../utils/imageExtraction.js";

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
      if (!jsonDeepEqual(actual, expected)) {
        throw new Error(
          `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
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

// Tiny 1x1 transparent PNG in base64 (real, decodable bytes).
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
// Different image — single black pixel JPEG-ish payload (just needs to be
// valid base64; round-trip doesn't decode the bytes).
const JPEG_BLACK = "/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZw==";
const png = `data:image/png;base64,${PNG_1x1}`;
const jpeg = `data:image/jpeg;base64,${JPEG_BLACK}`;

test("isDataUrlImage detects valid base64 image data URLs", () => {
  expect(isDataUrlImage(png)).toBe(true);
  expect(isDataUrlImage(jpeg)).toBe(true);
  expect(isDataUrlImage("data:image/png;base64,")).toBe(false); // empty body
  expect(isDataUrlImage("hello")).toBe(false);
  expect(isDataUrlImage(null)).toBe(false);
  expect(isDataUrlImage(123)).toBe(false);
});

test("parseDataUrl extracts content type and base64 body", () => {
  const p = parseDataUrl(png);
  expect(p.contentType).toBe("image/png");
  expect(p.base64).toBe(PNG_1x1);
});

test("parseDataUrl strips whitespace from line-wrapped base64", () => {
  const wrapped = `data:image/png;base64,${PNG_1x1.slice(0, 20)}\n  ${PNG_1x1.slice(20)}`;
  const p = parseDataUrl(wrapped);
  expect(p.base64).toBe(PNG_1x1);
});

test("hashImageBase64 is deterministic", () => {
  expect(hashImageBase64(PNG_1x1)).toBe(hashImageBase64(PNG_1x1));
});

test("hashImageBase64 differs for different payloads", () => {
  const a = hashImageBase64(PNG_1x1);
  const b = hashImageBase64(JPEG_BLACK);
  expect(a !== b).toBe(true);
});

test("extract: leaves non-image state unchanged", () => {
  const s = { trades: [{ id: "t1", title: "EURUSD" }], settings: { theme: "dark" } };
  const r = extractImagesFromState(s);
  expect(r.state).toEqual(s);
  expect(r.extractedCount).toBe(0);
  expect(r.refCount).toBe(0);
  expect(Object.keys(r.images).length).toBe(0);
});

test("extract: replaces inline base64 with __imgRef object", () => {
  const s = { trades: [{ id: "t1", screenshot: png }] };
  const r = extractImagesFromState(s);
  expect(isImageRef(r.state.trades[0].screenshot)).toBe(true);
  expect(r.extractedCount).toBe(1);
  expect(r.refCount).toBe(1);
  const id = r.state.trades[0].screenshot.__imgRef;
  expect(r.images[id].base64).toBe(PNG_1x1);
  expect(r.images[id].contentType).toBe("image/png");
});

test("extract: dedupes identical images by sha256", () => {
  const s = {
    trades: [
      { id: "t1", screenshot: png },
      { id: "t2", screenshot: png },
      { id: "t3", screenshot: png },
    ],
  };
  const r = extractImagesFromState(s);
  expect(r.extractedCount).toBe(1);
  expect(r.refCount).toBe(3);
  const id = r.state.trades[0].screenshot.__imgRef;
  expect(r.state.trades[1].screenshot.__imgRef).toBe(id);
  expect(r.state.trades[2].screenshot.__imgRef).toBe(id);
});

test("extract: handles deeply nested structures + arrays", () => {
  const s = {
    accounts: [
      {
        id: "a1",
        documents: [
          { name: "plan", attachments: [png, jpeg] },
          { name: "log", attachments: [] },
        ],
      },
    ],
    misc: { logo: png },
  };
  const r = extractImagesFromState(s);
  expect(r.extractedCount).toBe(2);
  expect(r.refCount).toBe(3);
});

test("round-trip: extract then inline restores original state byte-for-byte", () => {
  const original = {
    trades: [
      { id: "t1", screenshot: png, notes: "hello" },
      { id: "t2", screenshot: jpeg, gallery: [png, jpeg, png] },
    ],
    settings: { theme: "dark" },
    misc: null,
    counters: { wins: 0, losses: 0 },
  };
  const e = extractImagesFromState(original);
  const i = inlineImagesIntoState(e.state, e.images);
  expect(i.missingRefs.length).toBe(0);
  expect(jsonDeepEqual(i.state, original)).toBe(true);
});

test("round-trip: empty state", () => {
  const e = extractImagesFromState({});
  const i = inlineImagesIntoState(e.state, e.images);
  expect(jsonDeepEqual(i.state, {})).toBe(true);
});

test("round-trip: state with no images", () => {
  const s = { a: 1, b: "two", c: [1, 2, 3], d: { nested: true } };
  const e = extractImagesFromState(s);
  const i = inlineImagesIntoState(e.state, e.images);
  expect(jsonDeepEqual(i.state, s)).toBe(true);
});

test("idempotency: extracting an already-extracted state is a no-op", () => {
  const original = { trades: [{ id: "t1", screenshot: png }] };
  const e1 = extractImagesFromState(original);
  const e2 = extractImagesFromState(e1.state);
  expect(e2.extractedCount).toBe(0);
  expect(e2.refCount).toBe(1);
  expect(jsonDeepEqual(e2.state, e1.state)).toBe(true);
});

test("inline: missing ref is reported and left as-is (no silent loss)", () => {
  const broken = { trades: [{ id: "t1", screenshot: { __imgRef: "img_does_not_exist", v: 1 } }] };
  const i = inlineImagesIntoState(broken, {});
  expect(i.missingRefs.length).toBe(1);
  expect(i.missingRefs[0]).toBe("img_does_not_exist");
  expect(isImageRef(i.state.trades[0].screenshot)).toBe(true);
});

test("non-image data URL strings are NOT extracted", () => {
  const s = { svg: "data:image/svg+xml;base64,PHN2Zy8+", txt: "data:text/plain;base64,aGk=" };
  // image/svg+xml currently passes content-type regex; that's intentional —
  // SVG is still an image. text/plain must NOT be extracted.
  const r = extractImagesFromState(s);
  expect(r.extractedCount).toBe(1);
  expect(typeof r.state.txt).toBe("string");
});

test("very large state with many images survives round-trip", () => {
  const trades = [];
  for (let i = 0; i < 100; i++) {
    trades.push({ id: `t${i}`, screenshot: i % 2 === 0 ? png : jpeg, n: i });
  }
  const original = { trades };
  const e = extractImagesFromState(original);
  // 100 trades × 1 image each, 2 unique → 2 extracted, 100 refs
  expect(e.extractedCount).toBe(2);
  expect(e.refCount).toBe(100);
  const back = inlineImagesIntoState(e.state, e.images);
  expect(back.missingRefs.length).toBe(0);
  expect(jsonDeepEqual(back.state, original)).toBe(true);
});

test("ref structure is stable: {__imgRef, v}", () => {
  const s = { x: png };
  const r = extractImagesFromState(s);
  const ref = r.state.x;
  expect(typeof ref.__imgRef).toBe("string");
  expect(ref.v).toBe(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
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
