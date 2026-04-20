/**
 * @fileoverview Unit tests for profitPct calculation in Performance Report
 * Run with: node src/lib/__tests__/performanceReport.test.js
 */

// Use relative imports to avoid path alias issues
import { calcPerformanceReport } from "../analytics/performanceReport.js";

// Simple test framework
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

function assertClose(actual, expected, message, tolerance = 0.01) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✅ ${message} (got ${actual}, expected ${expected})`);
  } else {
    failed++;
    console.error(`  ❌ ${message} (got ${actual}, expected ${expected}, diff ${diff})`);
  }
}

// ── Test 1: ALL mode — two accounts, sum of per-trade percentages ───────
console.log("\n🧪 Test 1: ALL mode — two accounts yield sum of trade %");
{
  const accounts = [
    { id: "accA", startingEquity: 10000 },
    { id: "accB", startingEquity: 90000 },
  ];
  const trades = [
    { accountId: "accA", pnl: 100, date: "2024-01-01" },   // +1%
    { accountId: "accB", pnl: 900, date: "2024-01-02" },   // +1%
  ];
  const result = calcPerformanceReport(trades, accounts, {}, { accountId: "all" });
  // Expected: 1% + 1% = 2%
  assertClose(result.kpis.profitPct, 2, "profitPct should be 2% (1% + 1%)");
}

// ── Test 2: ALL mode — allocations are ignored for profitPct ───────────
console.log("\n🧪 Test 2: ALL mode — allocations ignored for profitPct");
{
  const accounts = [
    { id: "accA", startingEquity: 10000 },
    { id: "accB", startingEquity: 50000 },
  ];
  const trades = [
    {
      accountId: "accA",
      pnl: 200,
      date: "2024-01-01",
      allocations: [
        { accountId: "accA", pnl: 50 },
        { accountId: "accB", pnl: 150 },
      ],
    },
  ];
  const result = calcPerformanceReport(trades, accounts, {}, { accountId: "all" });
  // Expected: trade.pnl=200 on accA base=10000 → 2%
  // Allocations should be completely ignored
  assertClose(result.kpis.profitPct, 2, "profitPct should be 2% (200/10000), ignoring allocations");
}

// ── Test 3: ALL mode — equityCorrection NOT included in profitPct ──────
console.log("\n🧪 Test 3: ALL mode — equityCorrection excluded from profitPct");
{
  const accounts = [
    { id: "accA", startingEquity: 10000, equityCorrection: 500 },
  ];
  const trades = [
    { accountId: "accA", pnl: 100, date: "2024-01-01" },
  ];
  const result = calcPerformanceReport(trades, accounts, {}, { accountId: "all" });
  // Expected: 100/10000 = 1%, equityCorrection 500 should NOT be included
  assertClose(result.kpis.profitPct, 1, "profitPct should be 1% without equityCorrection");
}

// ── Test 4: Single account — profitPct unchanged (with equityCorrection) ──
console.log("\n🧪 Test 4: Single account — profitPct includes equityCorrection");
{
  const accounts = [
    { id: "accA", startingEquity: 10000 },
  ];
  const trades = [
    { accountId: "accA", pnl: 100, date: "2024-01-01" },
  ];
  const result = calcPerformanceReport(trades, accounts, {}, {
    accountId: "accA",
    startingEquity: 10000,
    equityCorrection: 200,
  });
  // Single account: netPnl = tradePnl + equityCorrection = 100 + 200 = 300
  // profitPct = 300 / 10000 * 100 = 3%
  assertClose(result.kpis.profitPct, 3, "Single-account profitPct should be 3% (includes equityCorrection)");
}

// ── Test 5: ALL mode — prop account uses prop.size as base ─────────────
console.log("\n🧪 Test 5: ALL mode — prop account uses prop.size as base");
{
  const accounts = [
    { id: "accA", startingEquity: 5000, prop: { size: 100000 } },
  ];
  const trades = [
    { accountId: "accA", pnl: 1000, date: "2024-01-01" },
  ];
  const result = calcPerformanceReport(trades, accounts, {}, { accountId: "all" });
  // prop.size = 100000, pnl = 1000 → 1%
  assertClose(result.kpis.profitPct, 1, "profitPct should be 1% using prop.size as base");
}

// ── Test 6: ALL mode — trade without matching account is skipped ───────
console.log("\n🧪 Test 6: ALL mode — trade without matching account is skipped");
{
  const accounts = [
    { id: "accA", startingEquity: 10000 },
  ];
  const trades = [
    { accountId: "accA", pnl: 100, date: "2024-01-01" },
    { accountId: "accB", pnl: 500, date: "2024-01-02" }, // no matching account
  ];
  const result = calcPerformanceReport(trades, accounts, {}, { accountId: "all" });
  // Only accA trade counts: 100/10000 = 1%
  assertClose(result.kpis.profitPct, 1, "profitPct should be 1%, orphan trade skipped");
}

// ── Test 7: ALL mode — empty trades ────────────────────────────────────
console.log("\n🧪 Test 7: ALL mode — empty trades");
{
  const accounts = [
    { id: "accA", startingEquity: 10000 },
  ];
  const result = calcPerformanceReport([], accounts, {}, { accountId: "all" });
  assertClose(result.kpis.profitPct, 0, "profitPct should be 0 for empty trades");
}

// ── Test 8: avgRR calculation with winning trades only ────────────────
console.log("\n🧪 Test 8: avgRR only includes winning trades");
{
  const accounts = [
    { id: "accA", startingEquity: 10000 },
  ];
  const trades = [
    { accountId: "accA", pnl: 100, rr: 2.5, date: "2024-01-01" },  // Win: 2.5 RR
    { accountId: "accA", pnl: 150, rr: 3.0, date: "2024-01-02" },  // Win: 3.0 RR
    { accountId: "accA", pnl: -50, rr: -1.0, date: "2024-01-03" }, // Loss: -1.0 RR (should be excluded)
    { accountId: "accA", pnl: 75, rr: 1.5, date: "2024-01-04" },   // Win: 1.5 RR
  ];
  const result = calcPerformanceReport(trades, accounts, {}, { accountId: "accA" });
  // avgRR should be (2.5 + 3.0 + 1.5) / 3 = 7.0 / 3 = 2.333
  // Losses (-1.0 RR) should NOT be included
  assertClose(result.kpis.avgRR, 2.333, "avgRR should be 2.333 (only winning trades)", 0.01);
}

// ── Test 9: avgRR with only losing trades ─────────────────────────────
console.log("\n🧪 Test 9: avgRR with only losing trades");
{
  const accounts = [
    { id: "accA", startingEquity: 10000 },
  ];
  const trades = [
    { accountId: "accA", pnl: -50, rr: -1.0, date: "2024-01-01" },
    { accountId: "accA", pnl: -30, rr: -0.6, date: "2024-01-02" },
  ];
  const result = calcPerformanceReport(trades, accounts, {}, { accountId: "accA" });
  // avgRR should be 0 when there are no winning trades
  assertClose(result.kpis.avgRR, 0, "avgRR should be 0 when only losing trades");
}

// ── Test 10: avgRR with mixed trades and breakevens ───────────────────
console.log("\n🧪 Test 10: avgRR with mixed trades including breakevens");
{
  const accounts = [
    { id: "accA", startingEquity: 10000 },
  ];
  const trades = [
    { accountId: "accA", pnl: 100, rr: 2.0, date: "2024-01-01" },  // Win: 2.0 RR
    { accountId: "accA", pnl: 0, rr: 0, date: "2024-01-02" },      // Breakeven: 0 RR (excluded)
    { accountId: "accA", pnl: -50, rr: -1.0, date: "2024-01-03" }, // Loss: -1.0 RR (excluded)
    { accountId: "accA", pnl: 150, rr: 3.0, date: "2024-01-04" },  // Win: 3.0 RR
  ];
  const result = calcPerformanceReport(trades, accounts, {}, { accountId: "accA" });
  // avgRR should be (2.0 + 3.0) / 2 = 2.5
  assertClose(result.kpis.avgRR, 2.5, "avgRR should be 2.5 (only winning trades, excluding breakevens and losses)");
}

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed! ✅\n");
}
