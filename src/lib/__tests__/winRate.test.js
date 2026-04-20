/**
 * @fileoverview Unit tests for win rate calculation utilities
 * Run with: node src/lib/__tests__/winRate.test.js
 */

// Use relative imports to avoid path alias issues
import {
  calcWinRatePct,
  countTradeOutcomes,
  getWinRateMode,
  getWinRatePrefs,
  getGlobalWinRateMode,
  classifyOutcomeByRRAndPnL,
  countTradeOutcomesWithPrefs,
} from "../metrics/winRate.js";

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
    toBeCloseTo(expected, precision = 2) {
      const diff = Math.abs(actual - expected);
      const threshold = Math.pow(10, -precision);
      if (diff > threshold) {
        throw new Error(`Expected ${actual} to be close to ${expected}`);
      }
    },
  };
}

console.log("\n=== Win Rate Helper Tests ===\n");

// Test classifyOutcomeByRRAndPnL
console.log("--- classifyOutcomeByRRAndPnL ---");

test("returns 'win' for positive pnl", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: 100, rr: 2 })).toBe("win");
});

test("returns 'loss' for negative pnl", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: -50, rr: -0.5 })).toBe("loss");
});

test("returns 'be' for zero pnl", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: 0 })).toBe("be");
});

// IMPORTANT: neutralRR does NOT override win/loss - PnL ALWAYS determines outcome
test("neutralRR does NOT turn small loss into BE", () => {
  // pnl < 0 is ALWAYS loss, even with small RR
  expect(classifyOutcomeByRRAndPnL({ pnl: -5, rr: -0.05, neutralRR: 0.2 })).toBe("loss");
});

test("neutralRR does NOT turn small win into BE", () => {
  // pnl > 0 is ALWAYS win, even with small RR
  expect(classifyOutcomeByRRAndPnL({ pnl: 10, rr: 0.1, neutralRR: 0.2 })).toBe("win");
});

test("returns 'win' for positive pnl (regardless of RR)", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: 20, rr: 0.2, neutralRR: 0.2 })).toBe("win");
});

test("returns 'win' for positive pnl with larger RR", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: 21, rr: 0.21, neutralRR: 0.2 })).toBe("win");
});

test("returns 'loss' for negative pnl (regardless of RR)", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: -30, rr: -0.3, neutralRR: 0.2 })).toBe("loss");
});

test("returns 'win' for positive pnl even with very small RR", () => {
  // pnl > 0 is ALWAYS win
  expect(classifyOutcomeByRRAndPnL({ pnl: 10, rr: 0.199, neutralRR: 0.2 })).toBe("win");
});

test("PnL determines outcome when rr is undefined", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: 10, neutralRR: 0.2 })).toBe("win");
  expect(classifyOutcomeByRRAndPnL({ pnl: -5, neutralRR: 0.2 })).toBe("loss");
});

test("PnL determines outcome when rr is NaN", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: 10, rr: NaN, neutralRR: 0.2 })).toBe("win");
});

test("PnL determines outcome when neutralRR = 0", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: 10, rr: 0.05, neutralRR: 0 })).toBe("win");
  expect(classifyOutcomeByRRAndPnL({ pnl: -5, rr: -0.05, neutralRR: 0 })).toBe("loss");
});

test("returns 'be' only when pnl === 0", () => {
  expect(classifyOutcomeByRRAndPnL({ pnl: 0, rr: 0.1, neutralRR: 0.2 })).toBe("be");
  expect(classifyOutcomeByRRAndPnL({ pnl: 0, rr: 0.5, neutralRR: 0.2 })).toBe("be");
});

// Test getWinRatePrefs (DEPRECATED - now returns fallback)
console.log("\n--- getWinRatePrefs (DEPRECATED) ---");

test("returns defaults when account is undefined", () => {
  const prefs = getWinRatePrefs(undefined);
  expect(prefs.mode).toBe("ignore");
  expect(prefs.neutralRR).toBe(0);
});

test("returns fallback (ignores account settings - DEPRECATED)", () => {
  // getWinRatePrefs is deprecated - it always returns fallback values
  const account = {
    metricsPrefs: {
      winRateBreakEvenMode: "loss",
      winRateNeutralRR: 0.2,
    }
  };
  const prefs = getWinRatePrefs(account);
  // DEPRECATED: Now returns fallback, not account settings
  expect(prefs.mode).toBe("ignore");
  expect(prefs.neutralRR).toBe(0);
});

test("uses fallback mode when not set", () => {
  const account = { metricsPrefs: {} };
  const prefs = getWinRatePrefs(account, "ignore");
  expect(prefs.mode).toBe("ignore");
});

// Test getGlobalWinRateMode
console.log("\n--- getGlobalWinRateMode ---");

test("returns 'ignore' when ui is undefined", () => {
  const mode = getGlobalWinRateMode(undefined);
  expect(mode).toBe("ignore");
});

test("returns 'ignore' when ui.winRateMode is undefined", () => {
  const mode = getGlobalWinRateMode({});
  expect(mode).toBe("ignore");
});

test("returns 'loss' when ui.winRateMode is 'loss'", () => {
  const mode = getGlobalWinRateMode({ winRateMode: "loss" });
  expect(mode).toBe("loss");
});

test("returns 'ignore' when ui.winRateMode is 'ignore'", () => {
  const mode = getGlobalWinRateMode({ winRateMode: "ignore" });
  expect(mode).toBe("ignore");
});

test("returns fallback for invalid ui.winRateMode", () => {
  const mode = getGlobalWinRateMode({ winRateMode: "invalid" });
  expect(mode).toBe("ignore");
});

// Test calcWinRatePct with mode
console.log("\n--- calcWinRatePct with mode ---");

test("calculates WR in ignore mode correctly", () => {
  // 2 wins, 1 loss, 1 BE -> WR = 2/3 = 66.67% (BE ignored)
  const wr = calcWinRatePct({ wins: 2, losses: 1, breakEvens: 1, mode: "ignore" });
  expect(wr).toBeCloseTo(66.67, 1);
});

test("calculates WR in loss mode correctly", () => {
  // 2 wins, 1 loss, 1 BE -> WR = 2/4 = 50% (BE counts as loss in denominator)
  const wr = calcWinRatePct({ wins: 2, losses: 1, breakEvens: 1, mode: "loss" });
  expect(wr).toBeCloseTo(50, 1);
});

// Acceptance Criteria Test Case - NEW LOGIC
console.log("\n--- Acceptance Criteria Test (NEW) ---");

test("PnL ALWAYS determines win/loss, neutralRR does NOT override", () => {
  const neutralRR = 0.2;
  
  // Classify each trade - PnL determines outcome, NOT RR
  const t1 = classifyOutcomeByRRAndPnL({ pnl: -5, rr: -0.05, neutralRR });  // loss (pnl < 0)
  const t2 = classifyOutcomeByRRAndPnL({ pnl: 20, rr: 0.2, neutralRR });    // win (pnl > 0)
  const t3 = classifyOutcomeByRRAndPnL({ pnl: 21, rr: 0.21, neutralRR });   // win (pnl > 0)
  const t4 = classifyOutcomeByRRAndPnL({ pnl: -30, rr: -0.3, neutralRR });  // loss (pnl < 0)
  const t5 = classifyOutcomeByRRAndPnL({ pnl: 0, rr: 0.1, neutralRR });     // be (pnl === 0)
  
  expect(t1).toBe("loss");  // pnl < 0 -> ALWAYS loss
  expect(t2).toBe("win");   // pnl > 0 -> ALWAYS win
  expect(t3).toBe("win");   // pnl > 0 -> ALWAYS win
  expect(t4).toBe("loss");  // pnl < 0 -> ALWAYS loss
  expect(t5).toBe("be");    // pnl === 0 -> be
  
  // Count outcomes for [t1, t2, t3, t4, t5]
  const outcomes = [t1, t2, t3, t4, t5];
  const wins = outcomes.filter(o => o === "win").length;
  const losses = outcomes.filter(o => o === "loss").length;
  const bes = outcomes.filter(o => o === "be").length;
  
  expect(wins).toBe(2);    // t2, t3
  expect(losses).toBe(2);  // t1, t4
  expect(bes).toBe(1);     // t5
  
  // WR in ignore mode: 2/(2+2) = 50%
  const wrIgnore = calcWinRatePct({ wins, losses, breakEvens: bes, mode: "ignore" });
  expect(wrIgnore).toBeCloseTo(50, 1);
  
  // WR in loss mode: 2/(2+2+1) = 40%
  const wrLoss = calcWinRatePct({ wins, losses, breakEvens: bes, mode: "loss" });
  expect(wrLoss).toBeCloseTo(40, 1);
});

// Summary
console.log("\n" + "=".repeat(40));
console.log(`Tests: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
console.log("=".repeat(40) + "\n");

if (failed > 0) {
  process.exit(1);
}
