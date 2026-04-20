/**
 * Dashboard Metrics Calculator
 * Computes comprehensive trading metrics from filtered trade data
 */

import { clampNum } from "@/lib/utils";
import { NO_ACCOUNT_ID, getTradeAccountKey } from "@/lib/noAccount.js";
import { calcWinRatePct, getWinRateMode, classifyOutcomeByRRAndPnL } from "@/lib/metrics/winRate.js";
import { isDeleted } from "@/lib/syncDb.js";

// Placeholder value for infinity (when dividing by zero produces positive result)
const INFINITY_PLACEHOLDER = 999;

// Session ID prefix pattern (raw IDs that shouldn't be displayed)
const RAW_SESSION_ID_PREFIX = "ses_";

/**
 * Check if a string looks like a raw session ID (not a human-readable name)
 */
function isRawSessionId(s) {
  return typeof s === "string" && s.startsWith(RAW_SESSION_ID_PREFIX);
}

/**
 * Normalize date string to YYYY-MM-DD format
 */
function normalizeDateKey(d) {
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
 * Get PnL for a trade, optionally filtering by accountId
 * Supports NO_ACCOUNT_ID for trades without account
 * Returns net P&L (gross P&L - commission)
 */
function getTradesPnL(trade, accountId = "all") {
  if (accountId === "all") {
    const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
    if (allocs.length > 0) {
      return allocs.reduce((sum, a) => {
        const grossPnl = clampNum(a?.pnl);
        const commission = Math.abs(clampNum(a?.commission));
        return sum + (grossPnl - commission);
      }, 0);
    }
    // Fallback for legacy trades without allocations
    const grossPnl = clampNum(trade?.pnl);
    const commission = Math.abs(clampNum(trade?.commission));
    return grossPnl - commission;
  }
  
  const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
  
  // Handle NO_ACCOUNT_ID filtering
  if (accountId === NO_ACCOUNT_ID) {
    if (allocs.length > 0) {
      return allocs
        .filter((a) => !a?.accountId || a?.accountId === "")
        .reduce((sum, a) => {
          const grossPnl = clampNum(a?.pnl);
          const commission = Math.abs(clampNum(a?.commission));
          return sum + (grossPnl - commission);
        }, 0);
    }
    if (!trade?.accountId || trade?.accountId === "") {
      const grossPnl = clampNum(trade?.pnl);
      const commission = Math.abs(clampNum(trade?.commission));
      return grossPnl - commission;
    }
    return 0;
  }
  
  if (allocs.length > 0) {
    return allocs
      .filter((a) => a?.accountId === accountId)
      .reduce((sum, a) => {
        const grossPnl = clampNum(a?.pnl);
        const commission = Math.abs(clampNum(a?.commission));
        return sum + (grossPnl - commission);
      }, 0);
  }
  if (trade?.accountId === accountId) {
    const grossPnl = clampNum(trade?.pnl);
    const commission = Math.abs(clampNum(trade?.commission));
    return grossPnl - commission;
  }
  return 0;
}

/**
 * Get RR for a trade
 */
function getTradeRR(trade) {
  return clampNum(trade?.rr);
}

/**
 * Determine if trade is a win/loss/BE (with optional neutral zone support)
 * @param {Object} trade - Trade object
 * @param {number} [neutralRR=0] - Neutral zone threshold
 */
function getTradeOutcome(trade, neutralRR = 0) {
  const pnl = getTradesPnL(trade);
  const rr = trade?.rr;
  return classifyOutcomeByRRAndPnL({ pnl, rr, neutralRR });
}

/**
 * Get weekday index from date (0=Sunday, 1=Monday, ... 6=Saturday)
 */
function getWeekdayIndex(dateStr) {
  const key = normalizeDateKey(dateStr);
  if (!key) return null;
  const d = new Date(`${key}T12:00:00`);
  return d.getDay();
}

/**
 * Get weekday name from index
 */
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Get RR bucket label
 */
function getRRBucket(rr) {
  const r = Math.abs(clampNum(rr));
  if (r < 1) return "<1R";
  if (r < 2) return "1-2R";
  if (r < 3) return "2-3R";
  return "3R+";
}

/**
 * Calculate max streak (win or loss)
 */
function calcStreaks(sortedTrades, accountId = "all") {
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let currentWin = 0;
  let currentLoss = 0;

  for (const trade of sortedTrades) {
    const pnl = getTradesPnL(trade, accountId);
    if (pnl > 0) {
      currentWin++;
      currentLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, currentWin);
    } else if (pnl < 0) {
      currentLoss++;
      currentWin = 0;
      maxLossStreak = Math.max(maxLossStreak, currentLoss);
    } else {
      // BE doesn't break streaks but doesn't continue them
      currentWin = 0;
      currentLoss = 0;
    }
  }

  return { maxWinStreak, maxLossStreak };
}

/**
 * Calculate equity curve with drawdown
 */
function calcEquityCurve(sortedTrades, startingEquity = 0, accountId = "all") {
  const points = [];
  let cumulative = startingEquity;
  let peak = startingEquity;

  // Add starting point
  points.push({
    date: "Start",
    equity: startingEquity,
    pnl: 0,
    drawdown: 0,
    drawdownPct: 0,
    isPeak: false,
  });

  // Group by day for cleaner chart
  const byDay = new Map();
  for (const trade of sortedTrades) {
    const key = normalizeDateKey(trade?.date);
    if (!key) continue;
    const pnl = getTradesPnL(trade, accountId);
    const existing = byDay.get(key) || { date: key, pnl: 0, trades: 0 };
    existing.pnl += pnl;
    existing.trades++;
    byDay.set(key, existing);
  }

  // Sort by date and compute equity curve
  const dailyData = Array.from(byDay.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  for (const day of dailyData) {
    cumulative += day.pnl;
    const isPeak = cumulative > peak;
    if (isPeak) peak = cumulative;
    const drawdown = cumulative - peak;
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;

    points.push({
      date: day.date,
      equity: cumulative,
      pnl: day.pnl,
      trades: day.trades,
      drawdown,
      drawdownPct,
      isPeak,
    });
  }

  return points;
}

/**
 * Calculate daily PnL data
 */
function calcDailyPnL(sortedTrades, accountId = "all") {
  const byDay = new Map();

  for (const trade of sortedTrades) {
    const key = normalizeDateKey(trade?.date);
    if (!key) continue;
    const pnl = getTradesPnL(trade, accountId);
    const existing = byDay.get(key) || { date: key, pnl: 0, trades: 0, wins: 0, losses: 0 };
    existing.pnl += pnl;
    existing.trades++;
    if (pnl > 0) existing.wins++;
    if (pnl < 0) existing.losses++;
    byDay.set(key, existing);
  }

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate breakdown metrics by a grouping key
 * @param {Array} trades - List of trades
 * @param {Function} getKey - Function to extract grouping key from trade
 * @param {string} accountId - Account ID for PnL filtering ("all" for all accounts)
 * @param {string} winRateMode - Win rate calculation mode ("ignore" | "loss")
 * @param {number} [neutralRR=0] - Neutral zone threshold for RR
 */
function calcBreakdown(trades, getKey, accountId = "all", winRateMode = "ignore", neutralRR = 0, avgRRMode = "winsOnly") {
  const groups = new Map();

  for (const trade of trades) {
    const key = getKey(trade);
    if (key === null || key === undefined || key === "") continue;

    const pnl = getTradesPnL(trade, accountId);
    const rr = getTradeRR(trade);
    // Determine outcome with neutral zone support
    const outcome = classifyOutcomeByRRAndPnL({ pnl, rr: trade?.rr, neutralRR });

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        trades: 0,
        netPnl: 0,
        grossProfit: 0,
        grossLoss: 0,
        wins: 0,
        losses: 0,
        breakEvens: 0,
        totalRR: 0,
        winRR: 0,
        lossRR: 0,
        beRR: 0,
      });
    }

    const g = groups.get(key);
    g.trades++;
    g.netPnl += pnl;
    g.totalRR += rr;

    if (outcome === "win") {
      g.wins++;
      g.grossProfit += pnl;
      g.winRR += rr;
    } else if (outcome === "loss") {
      g.losses++;
      g.grossLoss += Math.abs(pnl);
      g.lossRR += rr;
    } else {
      g.breakEvens++;
      g.beRR += rr;
    }
  }

  // Calculate derived metrics for each group
  const result = [];
  for (const [key, g] of groups) {
    const winRate = calcWinRatePct({ wins: g.wins, losses: g.losses, breakEvens: g.breakEvens, mode: winRateMode });
    const avgRR = avgRRMode === "all"
      ? ((g.wins + g.breakEvens) > 0 ? (g.winRR + g.beRR) / (g.wins + g.breakEvens) : 0)
      : (g.wins > 0 ? g.winRR / g.wins : 0);
    const avgWin = g.wins > 0 ? g.grossProfit / g.wins : 0;
    const avgLoss = g.losses > 0 ? g.grossLoss / g.losses : 0;
    const profitFactor = g.grossLoss > 0 ? g.grossProfit / g.grossLoss : g.grossProfit > 0 ? INFINITY_PLACEHOLDER : 0;
    const expectancy = g.trades > 0
      ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss
      : 0;

    result.push({
      key,
      trades: g.trades,
      netPnl: g.netPnl,
      winRate,
      avgRR,
      avgWin,
      avgLoss,
      profitFactor: Number.isFinite(profitFactor) ? profitFactor : INFINITY_PLACEHOLDER,
      expectancy,
    });
  }

  return result.sort((a, b) => b.netPnl - a.netPnl);
}

/**
 * Generate smart insights based on trade data
 */
function generateSmartInsights(metrics, trades, accounts) {
  const insights = [];

  // Find best pair
  const bestPair = metrics.breakdowns.byPair[0];
  if (bestPair && bestPair.netPnl > 0) {
    insights.push({
      type: "best_pair",
      title: `Best pair: ${bestPair.key}`,
      description: `+$${bestPair.netPnl.toFixed(0)} with ${bestPair.winRate.toFixed(0)}% win rate`,
      severity: "success",
      icon: "TrendingUp",
    });
  }

  // Find best session
  const bestSession = metrics.breakdowns.bySession[0];
  if (bestSession && bestSession.netPnl > 0) {
    insights.push({
      type: "best_session",
      title: `Best session: ${bestSession.key}`,
      description: `+$${bestSession.netPnl.toFixed(0)} across ${bestSession.trades} trades`,
      severity: "success",
      icon: "Clock",
    });
  }

  // Long vs Short comparison
  const longTrades = trades.filter((t) => t?.direction === "Long");
  const shortTrades = trades.filter((t) => t?.direction === "Short");
  if (longTrades.length >= 5 && shortTrades.length >= 5) {
    const longPnl = longTrades.reduce((s, t) => s + getTradesPnL(t), 0);
    const shortPnl = shortTrades.reduce((s, t) => s + getTradesPnL(t), 0);
    const longWR = (longTrades.filter((t) => getTradesPnL(t) > 0).length / longTrades.length) * 100;
    const shortWR = (shortTrades.filter((t) => getTradesPnL(t) > 0).length / shortTrades.length) * 100;

    if (longPnl > shortPnl * 1.5 && longPnl > 0) {
      insights.push({
        type: "direction_bias",
        title: "Longs outperform shorts",
        description: `Long PnL: +$${longPnl.toFixed(0)} (${longWR.toFixed(0)}% WR) vs Short: $${shortPnl.toFixed(0)}`,
        severity: "info",
        icon: "TrendingUp",
      });
    } else if (shortPnl > longPnl * 1.5 && shortPnl > 0) {
      insights.push({
        type: "direction_bias",
        title: "Shorts outperform longs",
        description: `Short PnL: +$${shortPnl.toFixed(0)} (${shortWR.toFixed(0)}% WR) vs Long: $${longPnl.toFixed(0)}`,
        severity: "info",
        icon: "TrendingDown",
      });
    }
  }

  // Profit Factor insight
  if (metrics.profitFactor > 2) {
    insights.push({
      type: "profit_factor",
      title: "Excellent Profit Factor",
      description: `Your PF of ${metrics.profitFactor.toFixed(2)} indicates strong edge`,
      severity: "success",
      icon: "Award",
    });
  } else if (metrics.profitFactor < 1) {
    insights.push({
      type: "profit_factor",
      title: "Profit Factor needs work",
      description: `PF below 1.0 means you're losing money. Review your strategy`,
      severity: "warn",
      icon: "AlertTriangle",
    });
  }

  // Max loss streak warning
  if (metrics.maxLossStreak >= 5) {
    insights.push({
      type: "loss_streak",
      title: `Max loss streak: ${metrics.maxLossStreak}`,
      description: "Consider adding a daily loss limit or cooldown rule",
      severity: "warn",
      icon: "AlertTriangle",
    });
  }

  // Overtrading detection (by weekday)
  const weekdayBreakdown = metrics.breakdowns.byWeekday;
  const avgTradesPerDay = trades.length / (metrics.tradingDays || 1);
  const overtradingDays = weekdayBreakdown.filter(
    (d) => d.trades > avgTradesPerDay * 2 && d.netPnl < 0
  );
  if (overtradingDays.length > 0) {
    insights.push({
      type: "overtrading",
      title: `Overtrading on ${overtradingDays[0].key}s`,
      description: `${overtradingDays[0].trades} trades with -$${Math.abs(overtradingDays[0].netPnl).toFixed(0)} loss`,
      severity: "warn",
      icon: "AlertTriangle",
    });
  }

  // Best day insight
  if (metrics.bestDay.pnl > 0) {
    insights.push({
      type: "best_day",
      title: `Best day: $${metrics.bestDay.pnl.toFixed(0)}`,
      description: `On ${metrics.bestDay.date}`,
      severity: "success",
      icon: "Trophy",
    });
  }

  // RR bucket insight
  const highRRBucket = metrics.breakdowns.byRRBucket.find((b) => b.key === "3R+");
  if (highRRBucket && highRRBucket.trades >= 3 && highRRBucket.winRate > 40) {
    insights.push({
      type: "high_rr",
      title: "High RR trades performing well",
      description: `3R+ trades: ${highRRBucket.winRate.toFixed(0)}% WR with +$${highRRBucket.netPnl.toFixed(0)}`,
      severity: "success",
      icon: "Target",
    });
  }

  return insights.slice(0, 8); // Limit to 8 insights
}

/**
 * Calculate consistency score (0-100)
 */
function calcConsistencyScore(metrics, dailyPnL) {
  let score = 50; // Base score

  // Factor 1: Win rate stability (+/- 15 points)
  if (metrics.winRate >= 50) score += 10;
  if (metrics.winRate >= 60) score += 5;
  if (metrics.winRate < 40) score -= 10;

  // Factor 2: Profit factor (+/- 15 points)
  if (metrics.profitFactor >= 1.5) score += 10;
  if (metrics.profitFactor >= 2.0) score += 5;
  if (metrics.profitFactor < 1) score -= 15;

  // Factor 3: Max drawdown impact (+/- 10 points)
  if (metrics.maxDrawdownPct > -10) score += 5;
  if (metrics.maxDrawdownPct > -5) score += 5;
  if (metrics.maxDrawdownPct < -20) score -= 10;

  // Factor 4: Green/Red days ratio (+/- 10 points)
  const totalDays = metrics.greenDays + metrics.redDays;
  if (totalDays > 0) {
    const greenRatio = metrics.greenDays / totalDays;
    if (greenRatio >= 0.6) score += 10;
    else if (greenRatio >= 0.5) score += 5;
    else if (greenRatio < 0.4) score -= 10;
  }

  // Factor 5: Daily PnL consistency (standard deviation)
  if (dailyPnL.length >= 5) {
    const pnls = dailyPnL.map((d) => d.pnl);
    const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const variance = pnls.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / pnls.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg !== 0 ? Math.abs(stdDev / avg) : 0;

    // Lower coefficient of variation = more consistent
    if (cv < 1) score += 5;
    if (cv < 0.5) score += 5;
    if (cv > 2) score -= 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get consistency label from score
 */
function getConsistencyLabel(score) {
  if (score >= 80) return "Stable";
  if (score >= 60) return "Good";
  return "Needs improvement";
}

/**
 * Main function to calculate all dashboard metrics
 */
export function calcDashboardMetrics(trades, accounts, options = {}) {
  const { accountId = "all", startingEquity = 0, equityCorrection = 0, symbols = [], sessions = [], winRateMode = "ignore", neutralRR = 0, avgRRMode = "winsOnly" } = options;
  
  // Create lookup maps for symbols and sessions
  const symbolMap = new Map();
  for (const s of symbols) {
    if (s?.id) symbolMap.set(String(s.id), s.name || s.symbol || s.id);
  }
  const sessionMap = new Map();
  for (const s of sessions) {
    if (s?.id) sessionMap.set(String(s.id), s.name || s.label || s.id);
  }

  // Filter out deleted trades
  const activeTrades = trades.filter((t) => !isDeleted(t));

  // Sort trades by date
  const sortedTrades = [...activeTrades].sort((a, b) =>
    String(a?.date || "").localeCompare(String(b?.date || ""))
  );

  // Basic counts
  const totalTrades = sortedTrades.length;

  if (totalTrades === 0) {
    return {
      netPnl: 0,
      profitPct: 0,
      startingEquity: 0,
      winRate: 0,
      totalTrades: 0,
      avgTrade: 0,
      avgWin: 0,
      avgLoss: 0,
      avgRR: 0,
      profitFactor: 0,
      expectancy: 0,
      payoffRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      greenDays: 0,
      redDays: 0,
      tradingDays: 0,
      bestDay: { date: "", pnl: 0 },
      worstDay: { date: "", pnl: 0 },
      maxWinStreak: 0,
      maxLossStreak: 0,
      equityPoints: [],
      dailyPnL: [],
      breakdowns: {
        byPair: [],
        bySession: [],
        byAccount: [],
        byWeekday: [],
        byRRBucket: [],
      },
      insights: [],
      consistencyScore: 0,
      consistencyLabel: "Needs improvement",
      longStats: { trades: 0, pnl: 0, winRate: 0 },
      shortStats: { trades: 0, pnl: 0, winRate: 0 },
    };
  }

  // Calculate PnL aggregates with neutral zone support
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let totalRR = 0;
  let winRR = 0;
  let lossRR = 0;
  let beRR = 0;

  for (const trade of sortedTrades) {
    const pnl = getTradesPnL(trade, accountId);
    const rr = getTradeRR(trade);
    totalRR += rr;

    // Use classifyOutcomeByRRAndPnL for consistent classification with neutral zone
    const outcome = classifyOutcomeByRRAndPnL({ pnl, rr: trade?.rr, neutralRR });
    
    if (outcome === "win") {
      grossProfit += pnl;
      wins++;
      winRR += rr;
    } else if (outcome === "loss") {
      grossLoss += Math.abs(pnl);
      losses++;
      lossRR += rr;
    } else {
      breakEvens++;
      beRR += rr;
    }
  }

  const tradePnl = grossProfit - grossLoss;
  // Include equityCorrection (initial deficit/surplus before trade tracking) in account-level PnL
  const netPnl = tradePnl + clampNum(equityCorrection);
  const profitPct = startingEquity > 0 ? (netPnl / startingEquity) * 100 : 0;
  const winRate = calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode });
  const avgTrade = totalTrades > 0 ? tradePnl / totalTrades : 0;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const avgRR = avgRRMode === "all"
    ? ((wins + breakEvens) > 0 ? (winRR + beRR) / (wins + breakEvens) : 0)
    : (wins > 0 ? winRR / wins : 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? INFINITY_PLACEHOLDER : 0;
  const expectancy = (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? INFINITY_PLACEHOLDER : 0;

  // Calculate streaks
  const { maxWinStreak, maxLossStreak } = calcStreaks(sortedTrades, accountId);

  // Calculate equity curve (starts at actual balance: startingEquity + equityCorrection)
  const equityPoints = calcEquityCurve(sortedTrades, startingEquity + clampNum(equityCorrection), accountId);

  // Calculate max drawdown from equity points
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  for (const point of equityPoints) {
    if (point.drawdown < maxDrawdown) {
      maxDrawdown = point.drawdown;
      maxDrawdownPct = point.drawdownPct;
    }
  }

  // Calculate daily PnL
  const dailyPnL = calcDailyPnL(sortedTrades, accountId);

  // Calculate green/red days and best/worst day
  let greenDays = 0;
  let redDays = 0;
  let bestDay = { date: "", pnl: -Infinity };
  let worstDay = { date: "", pnl: Infinity };

  for (const day of dailyPnL) {
    if (day.pnl > 0) greenDays++;
    if (day.pnl < 0) redDays++;
    if (day.pnl > bestDay.pnl) bestDay = { date: day.date, pnl: day.pnl };
    if (day.pnl < worstDay.pnl) worstDay = { date: day.date, pnl: day.pnl };
  }

  if (!Number.isFinite(bestDay.pnl)) bestDay = { date: "", pnl: 0 };
  if (!Number.isFinite(worstDay.pnl)) worstDay = { date: "", pnl: 0 };

  const tradingDays = dailyPnL.length;

  // Calculate breakdowns with accountId filtering and proper name resolution
  const breakdowns = {
    byPair: calcBreakdown(sortedTrades, (t) => {
      // Try to resolve symbolId to name first
      if (t?.symbolId) {
        const name = symbolMap.get(String(t.symbolId));
        if (name) return name;
      }
      // Fall back to pair or symbol property
      const fallback = t?.pair || t?.symbol;
      // Skip if no valid name found
      return fallback || null;
    }, accountId, winRateMode, neutralRR, avgRRMode),
    bySession: calcBreakdown(sortedTrades, (t) => {
      // Try to resolve sessionId to name first
      if (t?.sessionId) {
        const name = sessionMap.get(String(t.sessionId));
        if (name) return name;
      }
      // Fall back to session property
      const fallback = t?.session;
      // Skip if no valid name or if it looks like a raw ID
      if (!fallback) return null;
      if (isRawSessionId(fallback)) return null;
      return fallback;
    }, accountId, winRateMode, neutralRR, avgRRMode),
    byAccount: calcBreakdown(sortedTrades, (t) => {
      const accId = t?.accountId || t?.allocations?.[0]?.accountId;
      const acc = accounts.find((a) => a?.id === accId);
      return acc?.name || null;
    }, accountId, winRateMode, neutralRR, avgRRMode),
    byWeekday: calcBreakdown(sortedTrades, (t) => {
      const idx = getWeekdayIndex(t?.date);
      return idx !== null ? WEEKDAY_NAMES[idx] : null;
    }, accountId, winRateMode, neutralRR, avgRRMode),
    byRRBucket: calcBreakdown(sortedTrades, (t) => getRRBucket(t?.rr), accountId, winRateMode, neutralRR, avgRRMode),
  };

  // Calculate long/short stats with break-even handling and neutral zone
  const longTrades = sortedTrades.filter((t) => t?.direction === "Long");
  const shortTrades = sortedTrades.filter((t) => t?.direction === "Short");

  const longPnl = longTrades.reduce((s, t) => s + getTradesPnL(t, accountId), 0);
  const shortPnl = shortTrades.reduce((s, t) => s + getTradesPnL(t, accountId), 0);
  
  let longWins = 0, longLosses = 0, longBreakEvens = 0;
  for (const t of longTrades) {
    const p = getTradesPnL(t, accountId);
    const outcome = classifyOutcomeByRRAndPnL({ pnl: p, rr: t?.rr, neutralRR });
    if (outcome === "win") longWins++;
    else if (outcome === "loss") longLosses++;
    else longBreakEvens++;
  }
  
  let shortWins = 0, shortLosses = 0, shortBreakEvens = 0;
  for (const t of shortTrades) {
    const p = getTradesPnL(t, accountId);
    const outcome = classifyOutcomeByRRAndPnL({ pnl: p, rr: t?.rr, neutralRR });
    if (outcome === "win") shortWins++;
    else if (outcome === "loss") shortLosses++;
    else shortBreakEvens++;
  }

  const longStats = {
    trades: longTrades.length,
    pnl: longPnl,
    winRate: calcWinRatePct({ wins: longWins, losses: longLosses, breakEvens: longBreakEvens, mode: winRateMode }),
  };

  const shortStats = {
    trades: shortTrades.length,
    pnl: shortPnl,
    winRate: calcWinRatePct({ wins: shortWins, losses: shortLosses, breakEvens: shortBreakEvens, mode: winRateMode }),
  };

  // Build metrics object
  const metrics = {
    netPnl,
    profitPct,
    startingEquity,
    winRate,
    totalTrades,
    avgTrade,
    avgWin,
    avgLoss,
    avgRR,
    profitFactor: Number.isFinite(profitFactor) ? profitFactor : 0,
    expectancy,
    payoffRatio: Number.isFinite(payoffRatio) ? payoffRatio : 0,
    maxDrawdown,
    maxDrawdownPct,
    greenDays,
    redDays,
    tradingDays,
    bestDay,
    worstDay,
    maxWinStreak,
    maxLossStreak,
    equityPoints,
    dailyPnL,
    breakdowns,
    longStats,
    shortStats,
  };

  // Calculate consistency score
  const consistencyScore = calcConsistencyScore(metrics, dailyPnL);
  const consistencyLabel = getConsistencyLabel(consistencyScore);

  // Generate insights
  const insights = generateSmartInsights(metrics, sortedTrades, accounts);

  return {
    ...metrics,
    consistencyScore,
    consistencyLabel,
    insights,
  };
}

export default calcDashboardMetrics;
