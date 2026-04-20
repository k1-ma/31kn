/**
 * Haunted Score Calculator
 * Computes trading performance metrics and a composite score (0-100)
 * Based on: Consistency, SL usage/Risk discipline, RR, and Win Rate
 */

import { clampNum } from "@/lib/utils";
import { calcWinRatePct, classifyOutcomeByRRAndPnL } from "@/lib/metrics/winRate.js";
import { isDeleted } from "@/lib/syncDb.js";

/**
 * Normalize date string to YYYY-MM-DD format
 * @param {string|Date|null} d - Date input
 * @returns {string|null} - Normalized date string or null
 */
export function normalizeDateKey(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (!Number.isFinite(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get PnL for a trade (reuses logic from calcDashboardMetrics.js)
 * @param {Object} trade - Trade object
 * @param {string} accountId - Account ID filter ("all" for all accounts)
 * @returns {number} - PnL value
 */
export function getTradesPnL(trade, accountId = "all") {
  if (accountId === "all") {
    const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
    if (allocs.length > 0) {
      return allocs.reduce((sum, a) => sum + clampNum(a?.pnl), 0);
    }
    return clampNum(trade?.pnl);
  }
  const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
  if (allocs.length > 0) {
    return allocs
      .filter((a) => a?.accountId === accountId)
      .reduce((sum, a) => sum + clampNum(a?.pnl), 0);
  }
  return trade?.accountId === accountId ? clampNum(trade?.pnl) : 0;
}

/**
 * Get RR for a trade (reuses logic from calcDashboardMetrics.js)
 * @param {Object} trade - Trade object
 * @returns {number} - RR value
 */
export function getTradeRR(trade) {
  return clampNum(trade?.rr);
}

/**
 * Check if a trade has risk-defined parameters
 * A trade is risk-defined if it has: rr > 0 OR riskUsd > 0 OR riskPctOverride set OR allocation with riskUsd/rr
 * @param {Object} trade - Trade object
 * @returns {boolean} - True if trade has risk defined
 */
export function isRiskDefinedTrade(trade) {
  // Check top-level RR and riskUsd
  if (clampNum(trade?.rr) > 0) return true;
  if (clampNum(trade?.riskUsd) > 0) return true;
  if (trade?.riskPctOverride !== null && trade?.riskPctOverride !== undefined && trade?.riskPctOverride !== "") {
    return true;
  }

  // Check allocations for risk data
  const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
  for (const a of allocs) {
    if (clampNum(a?.rr) > 0) return true;
    if (clampNum(a?.riskUsd) > 0) return true;
    if (a?.riskPctOverride !== null && a?.riskPctOverride !== undefined && a?.riskPctOverride !== "") {
      return true;
    }
  }

  return false;
}

/**
 * Linear interpolation with clamping
 * @param {number} value - Input value
 * @param {Array<[number, number]>} points - Array of [input, output] pairs (sorted by input)
 * @returns {number} - Interpolated and clamped output (0-100)
 */
function linearInterpolate(value, points) {
  if (points.length === 0) return 50;
  if (points.length === 1) return points[0][1];

  // Clamp to first/last points
  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return points[points.length - 1][1];

  // Find the segment
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    if (value >= x1 && value <= x2) {
      const t = (value - x1) / (x2 - x1);
      return y1 + t * (y2 - y1);
    }
  }

  return points[points.length - 1][1];
}

/**
 * Calculate Haunted Score and sub-metrics from filtered trades
 * @param {Array} trades - Filtered trades array
 * @param {string} accountId - Account ID filter (default "all")
 * @param {string} winRateMode - Win rate calculation mode ("ignore" | "loss")
 * @param {number} neutralRR - Neutral zone threshold for RR (default 0)
 * @returns {Object} - { score, metrics: { consistency, slUsage, rr, wr } }
 */
export function computeHauntedScore(trades, accountId = "all", winRateMode = "ignore", neutralRR = 0, avgRRMode = "winsOnly") {
  const activeTrades = (trades || []).filter((t) => !isDeleted(t));

  // Empty state
  if (activeTrades.length === 0) {
    return {
      score: null,
      metrics: {
        consistency: null,
        slUsage: null,
        rr: null,
        wr: null,
      },
    };
  }

  // Calculate Win Rate with break-even handling and neutral zone
  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let totalRR = 0;
  let winRR = 0;
  let beRR = 0;
  let riskDefinedCount = 0;

  for (const trade of activeTrades) {
    const pnl = getTradesPnL(trade, accountId);
    const rr = getTradeRR(trade);
    totalRR += rr;

    // Use classifyOutcomeByRRAndPnL for consistent classification
    const outcome = classifyOutcomeByRRAndPnL({ pnl, rr: trade?.rr, neutralRR });
    if (outcome === "win") {
      wins++;
      winRR += rr;
    }
    else if (outcome === "loss") losses++;
    else {
      breakEvens++;
      beRR += rr;
    }
    if (isRiskDefinedTrade(trade)) riskDefinedCount++;
  }

  const totalTrades = activeTrades.length;
  const winRatePct = calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode });
  const avgRR = avgRRMode === "all"
    ? ((wins + breakEvens) > 0 ? (winRR + beRR) / (wins + breakEvens) : 0)
    : (wins > 0 ? winRR / wins : 0);
  const riskDefinedPct = totalTrades > 0 ? (riskDefinedCount / totalTrades) * 100 : 0;

  // Calculate daily PnL for consistency
  const byDay = new Map();
  for (const trade of activeTrades) {
    const key = normalizeDateKey(trade?.date);
    if (!key) continue;
    const pnl = getTradesPnL(trade, accountId);
    const existing = byDay.get(key) || 0;
    byDay.set(key, existing + pnl);
  }

  const dailyPnLs = Array.from(byDay.values());

  // Calculate consistency score based on coefficient of variation
  let consistencyRatio = 0;
  if (dailyPnLs.length >= 2) {
    const mean = dailyPnLs.reduce((a, b) => a + b, 0) / dailyPnLs.length;
    const variance = dailyPnLs.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / dailyPnLs.length;
    const stdDev = Math.sqrt(variance);
    const epsilon = 0.01; // Prevent division by zero
    consistencyRatio = stdDev / (Math.abs(mean) + epsilon);
  }

  // Normalize sub-scores to 0-100

  // WR (Win Rate) normalization:
  // - 40% WR is considered below average (30 points)
  // - 55% WR is good (70 points)  
  // - 65%+ WR is excellent (100 points)
  // These thresholds align with typical trading benchmarks
  const wrScore = linearInterpolate(winRatePct, [
    [0, 0],
    [40, 30],
    [55, 70],
    [65, 100],
  ]);

  // RR (Risk:Reward) normalization:
  // - 0.8 RR means risking more than reward (20 points)
  // - 1.5 RR is a solid risk/reward ratio (70 points)
  // - 2.0+ RR is excellent, risking half of potential reward (100 points)
  const rrScore = linearInterpolate(avgRR, [
    [0, 0],
    [0.8, 20],
    [1.5, 70],
    [2.0, 100],
  ]);

  // SL usage / Risk discipline normalization:
  // - 50% trades with defined risk is poor discipline (30 points)
  // - 75% is decent (70 points)
  // - 90%+ is excellent risk management (100 points)
  const slUsageScore = linearInterpolate(riskDefinedPct, [
    [0, 0],
    [50, 30],
    [75, 70],
    [90, 100],
  ]);

  // Consistency normalization (based on coefficient of variation):
  // - ratio <=1.0 means low variance relative to mean (100 points)
  // - ratio 2.0 means moderate variance (70 points)
  // - ratio 4.0 means high variance (30 points)
  // - ratio >=6.0 means very inconsistent (10 points minimum)
  const consistencyScore = linearInterpolate(consistencyRatio, [
    [0, 100],
    [1.0, 100],
    [2.0, 70],
    [4.0, 30],
    [6.0, 10],
  ]);

  // Calculate final weighted score
  // Weights reflect importance for sustainable trading:
  // - Consistency 35%: Most important for long-term success
  // - SL usage 25%: Critical for risk management
  // - RR 25%: Important for profitable expectancy
  // - WR 15%: Least weighted as it can be misleading alone
  const finalScore =
    consistencyScore * 0.35 +
    slUsageScore * 0.25 +
    rrScore * 0.25 +
    wrScore * 0.15;

  return {
    score: Math.round(finalScore),
    metrics: {
      consistency: Math.round(consistencyScore),
      slUsage: Math.round(slUsageScore),
      rr: Math.round(rrScore),
      wr: Math.round(wrScore),
    },
  };
}

/**
 * Calculate raw metrics from trades (for display purposes)
 * @param {Array} trades - Filtered trades array
 * @param {string} accountId - Account ID filter (default "all")
 * @param {string} winRateMode - Win rate calculation mode ("ignore" | "loss")
 * @param {number} neutralRR - Neutral zone threshold for RR (default 0)
 * @returns {Object} - { totalTrades, tradingDays, winRatePct, avgRR, riskDefinedPct }
 */
export function computeRawMetrics(trades, accountId = "all", winRateMode = "ignore", neutralRR = 0, avgRRMode = "winsOnly") {
  const activeTrades = (trades || []).filter((t) => !isDeleted(t));

  if (activeTrades.length === 0) {
    return {
      totalTrades: 0,
      tradingDays: 0,
      winRatePct: 0,
      avgRR: 0,
      riskDefinedPct: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let totalRR = 0;
  let winRR = 0;
  let beRR = 0;
  let riskDefinedCount = 0;
  const daysSet = new Set();

  for (const trade of activeTrades) {
    const pnl = getTradesPnL(trade, accountId);
    const rr = getTradeRR(trade);
    totalRR += rr;

    // Use classifyOutcomeByRRAndPnL for consistent classification
    const outcome = classifyOutcomeByRRAndPnL({ pnl, rr: trade?.rr, neutralRR });
    if (outcome === "win") {
      wins++;
      winRR += rr;
    }
    else if (outcome === "loss") losses++;
    else {
      breakEvens++;
      beRR += rr;
    }
    if (isRiskDefinedTrade(trade)) riskDefinedCount++;

    const dayKey = normalizeDateKey(trade?.date);
    if (dayKey) daysSet.add(dayKey);
  }

  const totalTrades = activeTrades.length;

  return {
    totalTrades,
    tradingDays: daysSet.size,
    winRatePct: calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode }),
    avgRR: avgRRMode === "all"
      ? ((wins + breakEvens) > 0 ? (winRR + beRR) / (wins + breakEvens) : 0)
      : (wins > 0 ? winRR / wins : 0),
    riskDefinedPct: totalTrades > 0 ? (riskDefinedCount / totalTrades) * 100 : 0,
  };
}

export default computeHauntedScore;
