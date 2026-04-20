/**
 * @fileoverview Unit tests for share payload optimization
 * Run with: node src/lib/__tests__/share.test.js
 */

// Use relative imports to avoid path alias issues
import { sanitizeTradeForPublic } from "../share.js";

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
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    toHaveLength(expected) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────────────────────

const mockLibraries = {
  symbols: [{ id: "sym1", name: "EURUSD", color: "#blue", avatar: null }],
  sessions: [{ id: "ses1", name: "London" }],
};

const mockAccounts = [
  { id: "acc1", name: "Demo Account", color: "#green", avatar: null },
];

const mockDocuments = [
  {
    id: "doc1",
    type: "note",
    title: "Trade Notes",
    contentText: "This is a long document with lots of content that should be truncated in preview mode. ".repeat(10),
    // Simulate real HTML content with TipTap JSON structure
    contentHtml: "<div class=\"ProseMirror\"><h1>Trade Analysis</h1><p>" + "Detailed analysis with lots of HTML tags and content. ".repeat(50) + "</p><ul><li>Point 1</li><li>Point 2</li></ul></div>",
    createdAt: Date.now(),
  },
];

const mockIdeas = [
  {
    id: "idea1",
    title: "EURUSD Long Setup",
    pair: "EURUSD",
    direction: "Long",
    timeframe: "1H",
    status: "Planned",
    result: "Unknown",
    notes_text: "Setup notes with details. ".repeat(10),
    // Simulate real HTML content
    notes_html: "<div class=\"ProseMirror\"><h2>Entry Plan</h2><p>" + "Detailed entry plan with lots of HTML formatting and content. ".repeat(50) + "</p><p>Risk management details...</p></div>",
    tags: ["breakout", "trend"],
    links: [{ label: "Chart", url: "https://example.com", kind: "chart" }],
    // Simulate base64 image (much larger than the simple test data)
    images: [{ title: "Setup", dataUrl: "data:image/png;base64," + "A".repeat(5000) }],
    created_at: Date.now(),
  },
];

const mockTrade = {
  id: "trade1",
  date: "2024-01-15",
  direction: "Long",
  outcome: "Profit",
  pnl: 100,
  rr: 2.5,
  symbolId: "sym1",
  sessionId: "ses1",
  notes: "Trade went well",
  positionNotes: "Entry at support",
  comments: "Good setup",
  journal: "Followed plan perfectly",
  followPlan: true,
  bestTrade: false,
  links: [{ title: "Chart", url: "https://chart.com" }],
  // Simulate base64 image
  images: [{ title: "Setup", dataUrl: "data:image/png;base64," + "B".repeat(5000) }],
  allocations: [{ accountId: "acc1", pnl: 100, rr: 2.5 }],
  docIds: ["doc1"],
  ideaIds: ["idea1"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n🧪 Testing Share Payload Optimization\n");

// Test 1: Single trade share includes all content
test("Single trade share includes full HTML content", () => {
  const result = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: true, includeIdeas: true, isMultiTrade: false }
  );

  // Should include full content for single trade
  expect(result.linkedDocuments[0].contentHtml).toBeTruthy();
  expect(result.linkedIdeas[0].notesHtml).toBeTruthy();
  expect(result.linkedIdeas[0].images).toHaveLength(1);
  expect(result.images).toHaveLength(1);
});

// Test 2: Multi-trade share excludes HTML content but keeps images
test("Multi-trade share excludes HTML content but keeps images", () => {
  const result = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: true, includeIdeas: true, isMultiTrade: true }
  );

  // Should exclude heavy HTML content for multi-trade shares
  expect(result.linkedDocuments[0].contentHtml).toBeNull();
  expect(result.linkedIdeas[0].notesHtml).toBeNull();
  // Images should still be included for multi-trade shares
  expect(result.linkedIdeas[0].images).toHaveLength(1);
  expect(result.images).toHaveLength(1);
  
  // But should still include text previews
  expect(result.linkedDocuments[0].contentText).toBeTruthy();
  expect(result.linkedIdeas[0].notesText).toBeTruthy();
});

// Test 3: includeDocs=false excludes documents
test("includeDocs=false excludes linked documents", () => {
  const result = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: false, includeIdeas: true, isMultiTrade: false }
  );

  expect(result.linkedDocuments).toHaveLength(0);
  expect(result.linkedIdeas).toHaveLength(1);
});

// Test 4: includeIdeas=false excludes ideas
test("includeIdeas=false excludes linked ideas", () => {
  const result = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: true, includeIdeas: false, isMultiTrade: false }
  );

  expect(result.linkedDocuments).toHaveLength(1);
  expect(result.linkedIdeas).toHaveLength(0);
});

// Test 5: Both flags false excludes all linked content
test("Both flags false excludes all linked content", () => {
  const result = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: false, includeIdeas: false, isMultiTrade: false }
  );

  expect(result.linkedDocuments).toHaveLength(0);
  expect(result.linkedIdeas).toHaveLength(0);
});

// Test 6: Payload size comparison (multi-trade excludes HTML but keeps images)
test("Multi-trade payload is smaller than single-trade due to HTML exclusion", () => {
  const singleTrade = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: true, includeIdeas: true, isMultiTrade: false }
  );

  const multiTrade = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: true, includeIdeas: true, isMultiTrade: true }
  );

  const singleSize = JSON.stringify(singleTrade).length;
  const multiSize = JSON.stringify(multiTrade).length;

  // Multi-trade should still be smaller (HTML content excluded)
  if (multiSize >= singleSize) {
    throw new Error(`Expected multi-trade payload to be smaller, got single=${singleSize}, multi=${multiSize}`);
  }
  
  const reduction = (singleSize - multiSize) / singleSize;
  console.log(`  → Single trade: ${singleSize} bytes`);
  console.log(`  → Multi trade:  ${multiSize} bytes`);
  console.log(`  → Reduction:    ${(reduction * 100).toFixed(1)}%`);
});

// Test 7: Trade basic data is always included
test("Trade basic data is always included regardless of flags", () => {
  const result = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: false, includeIdeas: false, isMultiTrade: true }
  );

  expect(result.id).toBe(mockTrade.id);
  expect(result.date).toBe(mockTrade.date);
  expect(result.direction).toBe(mockTrade.direction);
  expect(result.pnl).toBe(mockTrade.pnl);
  expect(result.rr).toBe(mockTrade.rr);
  expect(result.symbolName).toBe("EURUSD");
  expect(result.sessionName).toBe("London");
  expect(result.notes).toBe(mockTrade.notes);
  expect(result.followPlan).toBe(true);
  expect(result.allocations).toHaveLength(1);
});

// Test 8: Links are always included (they're small)
test("Links are always included in all modes", () => {
  const singleResult = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: true, includeIdeas: true, isMultiTrade: false }
  );

  const multiResult = sanitizeTradeForPublic(
    mockTrade,
    mockLibraries,
    mockAccounts,
    mockDocuments,
    mockIdeas,
    { includeDocs: true, includeIdeas: true, isMultiTrade: true }
  );

  expect(singleResult.links).toHaveLength(1);
  expect(multiResult.links).toHaveLength(1);
  expect(singleResult.linkedIdeas[0].links).toHaveLength(1);
  expect(multiResult.linkedIdeas[0].links).toHaveLength(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

// Exit with error code if any tests failed
if (failed > 0) {
  process.exit(1);
}
