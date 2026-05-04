/**
 * Performance Report Calculator
 * Computes comprehensive trading metrics for the premium Performance Report
 */

import { clampNum } from "@/lib/utils";
import { NO_ACCOUNT_ID, getTradeAccountKey } from "@/lib/noAccount.js";
import { calcWinRatePct, classifyTradeOutcome, isTradeBreakEven } from "@/lib/metrics/winRate.js";
import { getInitialBalance } from "@/lib/accountCalcs.js";
import { isDeleted } from "@/lib/syncDb.js";

// Placeholder value for infinity (when dividing by zero produces positive result)
const INFINITY_PLACEHOLDER = 999;

// Label for trades without account (used as key in breakdowns)
const NO_ACCOUNT_LABEL = "__NO_ACCOUNT__";

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
 */
function getTradePnL(trade, accountId = "all") {
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
 * Get RR for a trade
 */
function getTradeRR(trade) {
  return clampNum(trade?.rr);
}

/**
 * Determine if trade is a win/loss/BE
 * @param {Object} trade - Trade object
 * @param {string} [accountId="all"] - Account ID for filtering
 * @param {string} [winRateMode="ignore"] - Win rate mode: "ignore" | "loss"
 */
function getTradeOutcome(trade, accountId = "all", winRateMode = "ignore") {
  const pnl = getTradePnL(trade, accountId);
  const isBreakEven = isTradeBreakEven(trade);
  return classifyTradeOutcome({ pnl, isBreakEven, mode: winRateMode });
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

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Get RR bucket label
 */
function getRRBucket(rr) {
  const r = clampNum(rr);
  if (r < 0) {
    // Loss buckets
    if (r > -1) return "0 to -1R";
    if (r > -2) return "-1 to -2R";
    return "<-2R";
  }
  if (r < 1) return "<1R";
  if (r < 2) return "1-2R";
  if (r < 3) return "2-3R";
  return "3R+";
}

/**
 * Calculate max streak (win or loss)
 */
function calcStreaks(sortedTrades, accountId = "all", winRateMode = "ignore") {
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let currentWin = 0;
  let currentLoss = 0;

  for (const trade of sortedTrades) {
    const outcome = getTradeOutcome(trade, accountId, winRateMode);
    if (outcome === "win") {
      currentWin++;
      currentLoss = 0;
      maxWinStreak = Math.max(maxWinStreak, currentWin);
    } else if (outcome === "loss") {
      currentLoss++;
      currentWin = 0;
      maxLossStreak = Math.max(maxLossStreak, currentLoss);
    } else {
      currentWin = 0;
      currentLoss = 0;
    }
  }

  return { maxWinStreak, maxLossStreak };
}

/**
 * Calculate equity curve with drawdown (returns array for charts)
 */
function calcEquityCurve(sortedTrades, startingEquity = 0, accountId = "all") {
  const points = [];
  let cumulative = startingEquity;
  let peak = startingEquity;

  // Group by day for cleaner chart
  const byDay = new Map();
  for (const trade of sortedTrades) {
    const key = normalizeDateKey(trade?.date);
    if (!key) continue;
    const pnl = getTradePnL(trade, accountId);
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
function calcDailyPnL(sortedTrades, accountId = "all", winRateMode = "ignore") {
  const byDay = new Map();

  for (const trade of sortedTrades) {
    const key = normalizeDateKey(trade?.date);
    if (!key) continue;
    const pnl = getTradePnL(trade, accountId);
    const outcome = getTradeOutcome(trade, accountId, winRateMode);
    const existing = byDay.get(key) || { date: key, pnl: 0, trades: 0, wins: 0, losses: 0 };
    existing.pnl += pnl;
    existing.trades++;
    if (outcome === "win") existing.wins++;
    if (outcome === "loss") existing.losses++;
    byDay.set(key, existing);
  }

  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate breakdown metrics by a grouping key
 * @param {Array} trades - List of trades
 * @param {Function} getKey - Function to extract grouping key
 * @param {string} [accountId="all"] - Account ID for filtering
 * @param {Object} [libraries={}] - Optional libraries for name resolution
 * @param {string} [winRateMode="ignore"] - Win rate mode
 * @param {string} [avgRRMode="winsOnly"] - Average RR mode
 */
function calcBreakdown(trades, getKey, accountId = "all", libraries = {}, winRateMode = "ignore", avgRRMode = "winsOnly") {
  const groups = new Map();

  for (const trade of trades) {
    const key = getKey(trade, libraries);
    if (key === null || key === undefined || key === "") continue;

    const pnl = getTradePnL(trade, accountId);
    const rr = getTradeRR(trade);
    const outcome = getTradeOutcome(trade, accountId, winRateMode);

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
        beRR: 0,
        currentWinStreak: 0,
        currentLossStreak: 0,
        maxWinStreak: 0,
        maxLossStreak: 0,
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
      g.currentWinStreak++;
      g.currentLossStreak = 0;
      g.maxWinStreak = Math.max(g.maxWinStreak, g.currentWinStreak);
    } else if (outcome === "loss") {
      g.losses++;
      g.grossLoss += Math.abs(pnl);
      g.currentLossStreak++;
      g.currentWinStreak = 0;
      g.maxLossStreak = Math.max(g.maxLossStreak, g.currentLossStreak);
    } else {
      g.breakEvens++;
      g.beRR += rr;
      g.currentWinStreak = 0;
      g.currentLossStreak = 0;
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
      maxWinStreak: g.maxWinStreak,
      maxLossStreak: g.maxLossStreak,
    });
  }

  return result.sort((a, b) => b.netPnl - a.netPnl);
}

/**
 * Generate smart insights based on trade data
 */
function generateInsights(metrics, trades, accounts, accountId = "all") {
  const insights = [];

  // Find best pair
  const bestPair = metrics.breakdowns?.byPair?.[0];
  if (bestPair && bestPair.netPnl > 0) {
    insights.push({
      type: "best_pair",
      title: `Best pair: ${bestPair.key}`,
      description: `+$${bestPair.netPnl.toFixed(0)} with ${bestPair.winRate.toFixed(0)}% win rate`,
      severity: "success",
    });
  }

  // Find worst pair
  const worstPair = [...(metrics.breakdowns?.byPair || [])].sort((a, b) => a.netPnl - b.netPnl)[0];
  if (worstPair && worstPair.netPnl < 0) {
    insights.push({
      type: "worst_pair",
      title: `Weakest pair: ${worstPair.key}`,
      description: `-$${Math.abs(worstPair.netPnl).toFixed(0)} – consider reviewing strategy`,
      severity: "warn",
    });
  }

  // Find best session
  const bestSession = metrics.breakdowns?.bySession?.[0];
  if (bestSession && bestSession.netPnl > 0) {
    insights.push({
      type: "best_session",
      title: `Best session: ${bestSession.key}`,
      description: `+$${bestSession.netPnl.toFixed(0)} across ${bestSession.trades} trades`,
      severity: "success",
    });
  }

  // Long vs Short comparison
  const longStats = metrics.longStats;
  const shortStats = metrics.shortStats;
  if (longStats.trades >= 5 && shortStats.trades >= 5) {
    if (longStats.pnl > shortStats.pnl * 1.5 && longStats.pnl > 0) {
      insights.push({
        type: "direction_bias",
        title: "Longs outperform shorts",
        description: `Long PnL: +$${longStats.pnl.toFixed(0)} (${longStats.winRate.toFixed(0)}% WR) vs Short: $${shortStats.pnl.toFixed(0)}`,
        severity: "info",
      });
    } else if (shortStats.pnl > longStats.pnl * 1.5 && shortStats.pnl > 0) {
      insights.push({
        type: "direction_bias",
        title: "Shorts outperform longs",
        description: `Short PnL: +$${shortStats.pnl.toFixed(0)} (${shortStats.winRate.toFixed(0)}% WR) vs Long: $${longStats.pnl.toFixed(0)}`,
        severity: "info",
      });
    }
  }

  // Profit Factor insight
  if (metrics.profitFactor > 2) {
    const pfDisplay = metrics.profitFactor >= INFINITY_PLACEHOLDER ? "∞" : metrics.profitFactor.toFixed(2);
    insights.push({
      type: "profit_factor",
      title: "Excellent Profit Factor",
      description: `Your PF of ${pfDisplay} indicates strong edge`,
      severity: "success",
    });
  } else if (metrics.profitFactor < 1 && metrics.totalTrades > 5) {
    insights.push({
      type: "profit_factor",
      title: "Profit Factor needs work",
      description: `PF below 1.0 means overall losing. Review your strategy`,
      severity: "warn",
    });
  }

  // Max loss streak warning
  if (metrics.maxLossStreak >= 5) {
    insights.push({
      type: "loss_streak",
      title: `Max loss streak: ${metrics.maxLossStreak}`,
      description: "Consider adding a daily loss limit or cooldown rule",
      severity: "warn",
    });
  }

  // Best day insight
  if (metrics.bestDay.pnl > 0) {
    insights.push({
      type: "best_day",
      title: `Best day: +$${metrics.bestDay.pnl.toFixed(0)}`,
      description: `On ${metrics.bestDay.date}`,
      severity: "success",
    });
  }

  // Worst day insight
  if (metrics.worstDay.pnl < 0) {
    insights.push({
      type: "worst_day",
      title: `Worst day: -$${Math.abs(metrics.worstDay.pnl).toFixed(0)}`,
      description: `On ${metrics.worstDay.date}`,
      severity: "warn",
    });
  }

  // Weekday analysis
  const weekdayBreakdown = metrics.breakdowns?.byWeekday || [];
  const bestWeekday = weekdayBreakdown[0];
  const worstWeekday = [...weekdayBreakdown].sort((a, b) => a.netPnl - b.netPnl)[0];
  
  if (bestWeekday && bestWeekday.netPnl > 0 && bestWeekday.trades >= 3) {
    insights.push({
      type: "best_weekday",
      title: `Best day: ${bestWeekday.key}`,
      description: `+$${bestWeekday.netPnl.toFixed(0)} with ${bestWeekday.winRate.toFixed(0)}% win rate`,
      severity: "success",
    });
  }

  if (worstWeekday && worstWeekday.netPnl < 0 && worstWeekday.trades >= 3 && worstWeekday.key !== bestWeekday?.key) {
    insights.push({
      type: "worst_weekday",
      title: `Worst day: ${worstWeekday.key}`,
      description: `Consider reducing size or avoiding ${worstWeekday.key}s`,
      severity: "warn",
    });
  }

  // Win rate insight
  if (metrics.winRate >= 60) {
    insights.push({
      type: "win_rate",
      title: `Strong win rate: ${metrics.winRate.toFixed(0)}%`,
      description: "Keep up the great work on your entries!",
      severity: "success",
    });
  }

  return insights.slice(0, 10);
}

/**
 * Calculate consistency score (0-100)
 */
function calcConsistencyScore(metrics, dailyPnL) {
  let score = 50;

  // Factor 1: Win rate stability
  if (metrics.winRate >= 50) score += 10;
  if (metrics.winRate >= 60) score += 5;
  if (metrics.winRate < 40) score -= 10;

  // Factor 2: Profit factor
  if (metrics.profitFactor >= 1.5) score += 10;
  if (metrics.profitFactor >= 2.0) score += 5;
  if (metrics.profitFactor < 1) score -= 15;

  // Factor 3: Max drawdown impact
  if (metrics.maxDrawdownPct > -10) score += 5;
  if (metrics.maxDrawdownPct > -5) score += 5;
  if (metrics.maxDrawdownPct < -20) score -= 10;

  // Factor 4: Green/Red days ratio
  const totalDays = metrics.greenDays + metrics.redDays;
  if (totalDays > 0) {
    const greenRatio = metrics.greenDays / totalDays;
    if (greenRatio >= 0.6) score += 10;
    else if (greenRatio >= 0.5) score += 5;
    else if (greenRatio < 0.4) score -= 10;
  }

  // Factor 5: Daily PnL consistency
  if (dailyPnL.length >= 5) {
    const pnls = dailyPnL.map((d) => d.pnl);
    const avg = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const variance = pnls.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / pnls.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg !== 0 ? Math.abs(stdDev / avg) : 0;

    if (cv < 1) score += 5;
    if (cv < 0.5) score += 5;
    if (cv > 2) score -= 5;
  }

  // Factor 6: Win/loss streaks (penalize long loss streaks)
  if (metrics.maxLossStreak >= 5) score -= 10;
  if (metrics.maxLossStreak >= 8) score -= 5;
  if (metrics.maxWinStreak >= 5) score += 5;

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
 * Calculate average trades per day
 */
function calcAvgTradesPerDay(trades, dailyPnL) {
  if (dailyPnL.length === 0) return 0;
  return trades.length / dailyPnL.length;
}

/**
 * Detect overtrading warning
 */
function detectOvertradingWarning(dailyPnL, avgTradesPerDay) {
  // Overtrading: days with >2x average trades and negative PnL
  const overtradingDays = dailyPnL.filter(d => d.trades > avgTradesPerDay * 2 && d.pnl < 0);
  return overtradingDays.length > 0;
}

/**
 * Detect tilt warning (rapid trading after big loss)
 */
function detectTiltWarning(sortedTrades, accountId = "all") {
  // Look for patterns: big loss followed by multiple quick trades
  let tiltDetected = false;
  
  for (let i = 0; i < sortedTrades.length - 3; i++) {
    const trade = sortedTrades[i];
    const pnl = getTradePnL(trade, accountId);
    
    // If this is a big loss (> $100 or > 2R loss)
    if (pnl < -100 || trade.rr < -2) {
      // Check if next trades are on the same day and also losses
      const tradeDate = normalizeDateKey(trade.date);
      let sameDayLosses = 0;
      
      for (let j = i + 1; j < Math.min(i + 4, sortedTrades.length); j++) {
        const nextTrade = sortedTrades[j];
        const nextDate = normalizeDateKey(nextTrade.date);
        if (nextDate === tradeDate && getTradePnL(nextTrade, accountId) < 0) {
          sameDayLosses++;
        }
      }
      
      if (sameDayLosses >= 2) {
        tiltDetected = true;
        break;
      }
    }
  }
  
  return tiltDetected;
}

/**
 * Main function to calculate Performance Report data
 */
export function calcPerformanceReport(trades, accounts, libraries = {}, options = {}) {
  const { accountId = "all", startingEquity = 0, equityCorrection = 0, winRateMode = "ignore", avgRRMode = "winsOnly" } = options;

  // Filter out deleted trades
  const activeTrades = (trades || []).filter((t) => !isDeleted(t));

  // Sort trades by date
  const sortedTrades = [...activeTrades].sort((a, b) =>
    String(a?.date || "").localeCompare(String(b?.date || ""))
  );

  const totalTrades = sortedTrades.length;

  // Empty state
  if (totalTrades === 0) {
    return {
      kpis: {
        netPnl: 0,
        profitPct: 0,
        winRate: 0,
        totalTrades: 0,
        avgTrade: 0,
        avgWin: 0,
        avgLoss: 0,
        avgRR: 0,
        profitFactor: 0,
        expectancy: 0,
        wins: 0,
        losses: 0,
        breakEvens: 0,
        payoffRatio: 0,
        maxDrawdown: 0,
        tradingDays: 0,
        greenDays: 0,
        redDays: 0,
        bestDay: { date: "", pnl: 0 },
        worstDay: { date: "", pnl: 0 },
        maxWinStreak: 0,
        maxLossStreak: 0,
      },
      charts: {
        equity: [],
        daily: [],
        distribution: { wins: 0, losses: 0, breakEvens: 0 },
        longShort: { longPnl: 0, shortPnl: 0, longWr: 0, shortWr: 0 },
      },
      breakdowns: {
        byPair: [],
        bySession: [],
        byModel: [],
        byAccount: [],
        byWeekday: [],
        byRRBucket: [],
      },
      insights: [],
      discipline: {
        consistencyScore: 0,
        consistencyLabel: "Needs improvement",
        avgTradesPerDay: 0,
        planAdherence: null,
        overtradingWarning: false,
        tiltWarning: false,
      },
      longStats: { trades: 0, pnl: 0, winRate: 0 },
      shortStats: { trades: 0, pnl: 0, winRate: 0 },
    };
  }

  // Calculate PnL aggregates
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let totalRR = 0;
  let winRR = 0;
  let lossRR = 0;
  let beRR = 0;
  let totalPnlSum = 0;

  for (const trade of sortedTrades) {
    const pnl = getTradePnL(trade, accountId);
    const rr = getTradeRR(trade);
    totalRR += rr;
    totalPnlSum += pnl;

    // Use classifyTradeOutcome for consistent classification with isBreakEven and winRateMode
    const isBreakEven = isTradeBreakEven(trade);
    const outcome = classifyTradeOutcome({ pnl, isBreakEven, mode: winRateMode });
    
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

  // Use direct sum of all PnLs (avoids mismatch when isBreakEven reclassifies trades)
  const tradePnl = totalPnlSum;
  // Include equityCorrection (initial deficit/surplus before trade tracking) in account-level PnL
  const netPnl = tradePnl + clampNum(equityCorrection);
  const winRate = calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode });
  
  // Calculate profitPct: when all accounts selected, sum individual account profit percentages
  const profitPct = (() => {
    if (accountId !== "all") {
      // Single account: standard calculation with equityCorrection included
      return startingEquity > 0 ? (netPnl / startingEquity) * 100 : 0;
    }
    // All accounts: sum of per-trade profit percentages
    // Each trade's % is calculated from its account's base equity (via getInitialBalance).
    // Allocations are ignored — always use trade.pnl and trade.accountId.
    // equityCorrection is not included (it has no per-trade attribution).
    const accList = Array.isArray(accounts) ? accounts : [];
    const accountsMap = new Map(accList.map(a => [a?.id, a]));
    let totalPctSum = 0;
    for (const trade of sortedTrades) {
      const acc = accountsMap.get(trade?.accountId);
      const base = getInitialBalance(acc);
      if (base <= 0) continue;
      const pnl = clampNum(trade?.pnl);
      totalPctSum += (pnl / base) * 100;
    }
    return totalPctSum;
  })();
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
  const { maxWinStreak, maxLossStreak } = calcStreaks(sortedTrades, accountId, winRateMode);

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
  const dailyPnL = calcDailyPnL(sortedTrades, accountId, winRateMode);

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

  // Calculate breakdowns with library lookups
  const { symbols = [], sessions = [], models = [] } = libraries;
  const symbolsById = new Map(symbols.map(s => [s.id, s]));
  const sessionsById = new Map(sessions.map(s => [s.id, s]));
  const modelsById = new Map(models.map(m => [m.id, m]));
  const accountsById = new Map((accounts || []).map(a => [a.id, a]));

  const breakdowns = {
    byPair: calcBreakdown(sortedTrades, (t) => {
      const sym = symbolsById.get(t?.symbolId);
      return sym?.name || t?.pair || t?.symbol || sym?.id || "Pair";
    }, accountId, {}, winRateMode, avgRRMode),
    bySession: calcBreakdown(sortedTrades, (t) => {
      const ses = sessionsById.get(t?.sessionId);
      return ses?.name || t?.session || ses?.id || "Session";
    }, accountId, {}, winRateMode, avgRRMode),
    byModel: calcBreakdown(sortedTrades, (t) => {
      const mdl = modelsById.get(t?.modelId);
      return mdl?.name || mdl?.id || (t?.modelId ? "Model" : null);
    }, accountId, {}, winRateMode, avgRRMode),
    byAccount: calcBreakdown(sortedTrades, (t) => {
      // Use getTradeAccountKey for consistent no-account handling
      const accKey = getTradeAccountKey(t);
      if (accKey === NO_ACCOUNT_ID) {
        return NO_ACCOUNT_LABEL;
      }
      const acc = accountsById.get(accKey);
      return acc?.name || acc?.id || "Account";
    }, accountId, {}, winRateMode, avgRRMode),
    byWeekday: calcBreakdown(sortedTrades, (t) => {
      const idx = getWeekdayIndex(t?.date);
      return idx !== null ? WEEKDAY_NAMES[idx] : null;
    }, accountId, {}, winRateMode, avgRRMode),
    byRRBucket: calcBreakdown(sortedTrades, (t) => getRRBucket(t?.rr), accountId, {}, winRateMode, avgRRMode),
  };

  // Calculate long/short stats with break-even handling
  const longTrades = sortedTrades.filter((t) => String(t?.direction || "").toLowerCase() === "long");
  const shortTrades = sortedTrades.filter((t) => String(t?.direction || "").toLowerCase() === "short");

  const longPnl = longTrades.reduce((s, t) => s + getTradePnL(t, accountId), 0);
  const shortPnl = shortTrades.reduce((s, t) => s + getTradePnL(t, accountId), 0);
  
  let longWins = 0, longLosses = 0, longBreakEvens = 0;
  for (const t of longTrades) {
    const p = getTradePnL(t, accountId);
    const isBreakEven = isTradeBreakEven(t);
    const outcome = classifyTradeOutcome({ pnl: p, isBreakEven, mode: winRateMode });
    if (outcome === "win") longWins++;
    else if (outcome === "loss") longLosses++;
    else longBreakEvens++;
  }

  let shortWins = 0, shortLosses = 0, shortBreakEvens = 0;
  for (const t of shortTrades) {
    const p = getTradePnL(t, accountId);
    const isBreakEven = isTradeBreakEven(t);
    const outcome = classifyTradeOutcome({ pnl: p, isBreakEven, mode: winRateMode });
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

  // Build metrics object for insights
  const metrics = {
    netPnl,
    profitPct,
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
    breakdowns,
    longStats,
    shortStats,
  };

  // Calculate discipline metrics
  const avgTradesPerDay = calcAvgTradesPerDay(sortedTrades, dailyPnL);
  const consistencyScore = calcConsistencyScore(metrics, dailyPnL);
  const consistencyLabel = getConsistencyLabel(consistencyScore);
  const overtradingWarning = detectOvertradingWarning(dailyPnL, avgTradesPerDay);
  const tiltWarning = detectTiltWarning(sortedTrades, accountId);

  // Generate insights
  const insights = generateInsights(metrics, sortedTrades, accounts, accountId);

  return {
    kpis: {
      netPnl,
      profitPct,
      winRate,
      totalTrades,
      avgTrade,
      avgWin,
      avgLoss,
      avgRR,
      profitFactor: profitFactor,
      expectancy,
      wins,
      losses,
      breakEvens,
      payoffRatio: payoffRatio,
      maxDrawdown,
      tradingDays,
      greenDays,
      redDays,
      bestDay,
      worstDay,
      maxWinStreak,
      maxLossStreak,
    },
    charts: {
      equity: equityPoints,
      daily: dailyPnL,
      distribution: { wins, losses, breakEvens },
      longShort: {
        longPnl: longStats.pnl,
        shortPnl: shortStats.pnl,
        longWr: longStats.winRate,
        shortWr: shortStats.winRate,
        longTrades: longStats.trades,
        shortTrades: shortStats.trades,
      },
    },
    breakdowns,
    insights,
    discipline: {
      consistencyScore,
      consistencyLabel,
      avgTradesPerDay,
      planAdherence: null, // Not currently tracked in trade data
      overtradingWarning,
      tiltWarning,
    },
    longStats,
    shortStats,
  };
}

export default calcPerformanceReport;
