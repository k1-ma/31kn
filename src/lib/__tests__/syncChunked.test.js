/**
 * @fileoverview Unit tests for sync chunking utilities
 * Run with: node src/lib/__tests__/syncChunked.test.js
 */

import {
  getPayloadSize,
  formatBytes,
  MAX_CHUNK_SIZE_BYTES,
  chunkFullState,
  chunkOperations,
  createOperation,
  detectChanges,
  stripBase64Images,
  countBase64Images,
  getBase64ImageSize,
  generateId,
} from "../syncChunked.js";

// Simple test framework
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
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected ${actual} to be truthy`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected ${actual} to be falsy`);
      }
    },
    toHaveLength(expected) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected array of length ${expected}, got ${actual?.length ?? "non-array"}`);
      }
    },
  };
}

console.log("\n=== Sync Chunked Tests ===\n");

// ─────────────────────────────────────────────────────────────────────────────
// PAYLOAD SIZE TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("getPayloadSize: returns size in bytes", () => {
  const data = { hello: "world" };
  const size = getPayloadSize(data);
  expect(size).toBeGreaterThan(0);
  expect(size).toBe(JSON.stringify(data).length);
});

test("formatBytes: formats bytes correctly", () => {
  expect(formatBytes(500)).toBe("500 B");
  expect(formatBytes(1024)).toBe("1.0 KB");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(1048576)).toBe("1.00 MB");
});

// ─────────────────────────────────────────────────────────────────────────────
// OPERATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("createOperation: creates operation with unique ID", () => {
  const op1 = createOperation("create", "trades", "trade-1", { name: "Test" });
  const op2 = createOperation("create", "trades", "trade-2", { name: "Test2" });
  
  expect(op1.opId).toBeTruthy();
  expect(op2.opId).toBeTruthy();
  expect(op1.opId === op2.opId).toBeFalsy();
  expect(op1.type).toBe("create");
  expect(op1.collection).toBe("trades");
  expect(op1.entityId).toBe("trade-1");
});

test("detectChanges: detects created items", () => {
  const oldState = { trades: [] };
  const newState = { trades: [{ id: "trade-1", name: "New Trade" }] };
  
  const ops = detectChanges(oldState, newState);
  expect(ops.length).toBe(1);
  expect(ops[0].type).toBe("create");
  expect(ops[0].collection).toBe("trades");
  expect(ops[0].entityId).toBe("trade-1");
});

test("detectChanges: detects updated items", () => {
  const oldState = { trades: [{ id: "trade-1", name: "Old" }] };
  const newState = { trades: [{ id: "trade-1", name: "Updated" }] };
  
  const ops = detectChanges(oldState, newState);
  expect(ops.length).toBe(1);
  expect(ops[0].type).toBe("update");
  expect(ops[0].entityId).toBe("trade-1");
});

test("detectChanges: detects deleted items", () => {
  const oldState = { trades: [{ id: "trade-1", name: "To Delete" }] };
  const newState = { trades: [] };
  
  const ops = detectChanges(oldState, newState);
  expect(ops.length).toBe(1);
  expect(ops[0].type).toBe("delete");
  expect(ops[0].entityId).toBe("trade-1");
});

test("detectChanges: detects non-array changes", () => {
  const oldState = { ui: { theme: "dark" } };
  const newState = { ui: { theme: "light" } };
  
  const ops = detectChanges(oldState, newState);
  expect(ops.length).toBe(1);
  expect(ops[0].type).toBe("set");
  expect(ops[0].collection).toBe("ui");
});

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKING TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("chunkOperations: returns empty array for no operations", () => {
  const chunks = chunkOperations([]);
  expect(chunks).toHaveLength(0);
});

test("chunkOperations: keeps small operations together", () => {
  const ops = [
    createOperation("create", "trades", "1", { name: "Trade 1" }),
    createOperation("create", "trades", "2", { name: "Trade 2" }),
  ];
  
  const chunks = chunkOperations(ops, MAX_CHUNK_SIZE_BYTES);
  expect(chunks.length).toBe(1);
  expect(chunks[0]).toHaveLength(2);
});

test("chunkOperations: splits large operations into multiple chunks", () => {
  // Create operations that exceed chunk size
  const largeData = "x".repeat(100 * 1024); // 100KB
  const ops = [
    createOperation("create", "trades", "1", { data: largeData }),
    createOperation("create", "trades", "2", { data: largeData }),
    createOperation("create", "trades", "3", { data: largeData }),
  ];
  
  const chunks = chunkOperations(ops, 150 * 1024);
  expect(chunks.length).toBeGreaterThan(1);
});

test("chunkFullState: returns single chunk for small state", () => {
  const state = { trades: [{ id: "1", name: "Test" }] };
  const chunks = chunkFullState(state, MAX_CHUNK_SIZE_BYTES);
  expect(chunks).toHaveLength(1);
  expect(chunks[0].type).toBe("fullState");
});

test("chunkFullState: splits large state into multiple chunks", () => {
  // Create a state that exceeds chunk size
  const trades = [];
  for (let i = 0; i < 100; i++) {
    trades.push({ 
      id: `trade-${i}`, 
      name: `Trade ${i}`,
      notes: "x".repeat(5000) // Each trade is ~5KB
    });
  }
  
  const state = { trades };
  const chunks = chunkFullState(state, 100 * 1024); // 100KB limit
  expect(chunks.length).toBeGreaterThan(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// BASE64 IMAGE HANDLING TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("countBase64Images: counts images in object", () => {
  const obj = {
    name: "Test",
    image1: "data:image/png;base64,iVBORw0KGgo=",
    nested: {
      image2: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    },
    array: [
      { image3: "data:image/gif;base64,R0lGODlh" },
    ],
  };
  
  expect(countBase64Images(obj)).toBe(3);
});

test("stripBase64Images: replaces images with placeholder", () => {
  const obj = {
    name: "Test",
    image: "data:image/png;base64,iVBORw0KGgo=",
  };
  
  const stripped = stripBase64Images(obj);
  expect(stripped.name).toBe("Test");
  expect(stripped.image).toBe("[IMAGE_STRIPPED]");
});

test("getBase64ImageSize: calculates total image size", () => {
  const img1 = "data:image/png;base64," + "A".repeat(1000);
  const img2 = "data:image/jpeg;base64," + "B".repeat(2000);
  
  const obj = { img1, img2 };
  const size = getBase64ImageSize(obj);
  
  expect(size).toBe(img1.length + img2.length);
});

// ─────────────────────────────────────────────────────────────────────────────
// ID GENERATION TESTS
// ─────────────────────────────────────────────────────────────────────────────

test("generateId: generates unique IDs", () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    ids.add(generateId());
  }
  expect(ids.size).toBe(100);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
