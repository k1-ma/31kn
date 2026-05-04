/**
 * @file Win Rate Calculation Helper
 *
 * Centralized functions for calculating Win Rate (WR) with configurable
 * break-even handling mode.
 *
 * Mode options:
 * - "ignore": BE trades don't affect WR. WR = wins / (wins + losses) * 100
 * - "loss": BE trades count as losses. WR = wins / (wins + losses + breakEvens) * 100
 *
 * Classification priority:
 * 1. isBreakEven flag is the SOURCE OF TRUTH — when set, the trade is "be"
 *    regardless of PnL sign (a BU trade stays BU even if commissions/swaps
 *    push the realized PnL above or below zero).
 * 2. Otherwise, PnL determines outcome:
 *    - pnl > 0 → "win"
 *    - pnl < 0 → "loss"
 *    - pnl === 0 → "be"
 *
 * The winRateMode is a GLOBAL journal setting (ui.winRateMode), not per-account.
 */

import { clampNum } from "@/lib/utils";
import { isDeleted } from "@/lib/syncDb.js";

/**
 * Calculate Win Rate percentage with configurable break-even mode.
 * 
 * @param {Object} params - Parameters
 * @param {number} params.wins - Number of winning trades (pnl > 0)
 * @param {number} params.losses - Number of losing trades (pnl < 0)
 * @param {number} params.breakEvens - Number of break-even trades (pnl === 0)
 * @param {string} [params.mode="ignore"] - Break-even mode: "ignore" | "loss"
 * @returns {number} - Win rate percentage (0-100)
 */
export function calcWinRatePct({ wins, losses, breakEvens = 0, mode = "ignore" }) {
  const w = clampNum(wins);
  const l = clampNum(losses);
  const be = clampNum(breakEvens);
  
  // Normalize mode - default to "ignore" for any invalid value
  const m = mode === "loss" ? "loss" : "ignore";
  
  // Calculate denominator based on mode
  const denom = m === "loss"
    ? (w + l + be)
    : (w + l);

  if (denom <= 0) return 0;
  
  const result = (w / denom) * 100;
  
  // Clamp result to 0-100 range
  return Math.max(0, Math.min(100, result));
}

/**
 * Count trade outcomes (wins, losses, breakEvens) from trade data.
 *
 * Honors the user-marked `isBreakEven` flag on the trade or any of its
 * allocations: a trade marked as break-even is classified as "be" (or as
 * "loss" when mode === "loss") regardless of PnL sign.
 *
 * @param {Array} trades - Array of trade objects
 * @param {Function} [getPnL] - Optional function to extract PnL from trade.
 *                              Defaults to trade.pnl or sum of allocation pnls.
 * @param {string} [mode="ignore"] - Break-even mode: "ignore" | "loss"
 * @returns {Object} - { wins, losses, breakEvens, total }
 */
export function countTradeOutcomes(trades, getPnL = null, mode = "ignore") {
  const activeTrades = (trades || []).filter(t => !isDeleted(t));

  let wins = 0;
  let losses = 0;
  let breakEvens = 0;

  const defaultGetPnL = (trade) => {
    const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
    if (allocs.length > 0) {
      return allocs.reduce((sum, a) => sum + clampNum(a?.pnl), 0);
    }
    return clampNum(trade?.pnl);
  };

  const pnlFn = typeof getPnL === "function" ? getPnL : defaultGetPnL;

  for (const trade of activeTrades) {
    const pnl = pnlFn(trade);
    const isBreakEven = isTradeBreakEven(trade);
    const outcome = classifyTradeOutcome({ pnl, isBreakEven, mode });
    if (outcome === "win") wins++;
    else if (outcome === "loss") losses++;
    else breakEvens++;
  }

  return {
    wins,
    losses,
    breakEvens,
    total: activeTrades.length,
  };
}

/**
 * Returns true if the trade is user-marked as break-even (БУ).
 *
 * BU is recognised from any of these signals (legacy data may have only one):
 * - trade.isBreakEven === true
 * - trade.outcome === "BE" (the UI button selection — set on every saved trade)
 * - any allocation has isBreakEven === true
 *
 * @param {Object} trade - Trade object
 * @returns {boolean}
 */
export function isTradeBreakEven(trade) {
  if (!trade) return false;
  if (trade.isBreakEven === true) return true;
  if (trade.outcome === "BE") return true;
  const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
  for (const a of allocs) {
    if (a?.isBreakEven === true) return true;
  }
  return false;
}

/**
 * Get the GLOBAL win rate mode from UI settings.
 * This is the single source of truth for win rate calculation mode.
 * 
 * @param {Object} ui - UI settings object (from db.ui)
 * @param {string} [fallback="ignore"] - Fallback mode if not set
 * @returns {string} - "ignore" | "loss"
 */
export function getGlobalWinRateMode(ui, fallback = "ignore") {
  const mode = ui?.winRateMode;
  return mode === "loss" ? "loss" : fallback;
}

/**
 * Get the GLOBAL average RR mode from UI settings.
 * This is the single source of truth for average RR calculation mode.
 * 
 * Mode options:
 * - "winsOnly": avgRR = winRR / wins (only winning trades)
 * - "all": avgRR = (winRR + beRR) / (wins + breakEvens) (include BE trades)
 * 
 * @param {Object} ui - UI settings object (from db.ui)
 * @param {string} [fallback="winsOnly"] - Fallback mode if not set
 * @returns {string} - "winsOnly" | "all"
 */
export function getGlobalAvgRRMode(ui, fallback = "winsOnly") {
  const mode = ui?.avgRRMode;
  return mode === "all" ? "all" : fallback;
}

/**
 * @deprecated Use getGlobalWinRateMode(ui) instead. 
 * Win rate mode is now a global setting, not per-account.
 * 
 * Get the win rate mode from an account object, with fallback to default.
 * 
 * @param {Object} account - Account object
 * @param {string} [fallback="ignore"] - Fallback mode if not set
 * @returns {string} - "ignore" | "loss"
 */
export function getWinRateMode(account, fallback = "ignore") {
  // Deprecated: now returns fallback since mode is global
  return fallback;
}

/**
 * @deprecated Use getGlobalWinRateMode(ui) instead.
 * Win rate mode is now a global setting, not per-account.
 * 
 * Get win rate preferences from an account object.
 * 
 * @param {Object} account - Account object
 * @param {string} [fallbackMode="ignore"] - Fallback mode if not set
 * @returns {Object} - { mode: "ignore" | "loss", neutralRR: number }
 */
export function getWinRatePrefs(account, fallbackMode = "ignore") {
  // Deprecated: now returns fallback since mode is global
  return {
    mode: fallbackMode,
    neutralRR: 0,
  };
}

/**
 * Classify a trade outcome based on PnL, with optional isBreakEven override.
 *
 * See {@link classifyTradeOutcome} for the full ruleset.
 *
 * @param {Object} params - Parameters
 * @param {number} params.pnl - Profit/Loss value
 * @param {boolean} [params.isBreakEven=false] - User-marked break-even flag
 * @param {string} [params.mode="ignore"] - Break-even mode: "ignore" | "loss"
 * @returns {string} - "win" | "loss" | "be"
 */
export function classifyOutcomeByPnL({ pnl, isBreakEven = false, mode = "ignore" }) {
  return classifyTradeOutcome({ pnl, isBreakEven, mode });
}

/**
 * Classify a trade outcome based on PnL and optional isBreakEven flag.
 *
 * This is the unified classifier for trade outcomes. It handles:
 * - The user-set isBreakEven flag (highest priority)
 * - PnL-based classification when not flagged as break-even
 * - Mode-based treatment of break-evens
 *
 * Classification rules (IMPORTANT — isBreakEven is the source of truth):
 * 1. If isBreakEven === true → "be" (or "loss" when mode === "loss"),
 *    regardless of PnL sign. A trade the user marked as BU stays BU even if
 *    commissions/swaps/execution errors push realized PnL above or below zero.
 * 2. If pnl > 0 → "win"
 * 3. If pnl < 0 → "loss"
 * 4. If pnl === 0 → "be" (break-even by definition)
 *
 * Note: RR thresholds do NOT override win/loss based on PnL.
 *
 * @param {Object} params - Parameters
 * @param {number} params.pnl - Profit/Loss value
 * @param {boolean} [params.isBreakEven=false] - Whether trade is manually marked as break-even
 * @param {string} [params.mode="ignore"] - Break-even mode: "ignore" | "loss"
 * @returns {string} - "win" | "loss" | "be"
 */
export function classifyTradeOutcome({ pnl, isBreakEven = false, mode = "ignore" }) {
  const pnlVal = clampNum(pnl);
  const m = mode === "loss" ? "loss" : "ignore";

  // Rule 1: explicit BE flag wins over PnL sign in either direction.
  if (isBreakEven) {
    return m === "loss" ? "loss" : "be";
  }

  if (pnlVal > 0) return "win";
  if (pnlVal < 0) return "loss";
  return "be";
}

/**
 * Count outcomes from an array of trades using the unified classifier.
 * 
 * @param {Array} trades - Array of trade objects
 * @param {string} [mode="ignore"] - Break-even mode: "ignore" | "loss"
 * @param {Object} [options] - Additional options
 * @param {string} [options.accountId="all"] - Filter by account ID
 * @returns {Object} - { wins, losses, breakEvens, total }
 */
export function countOutcomes(trades, mode = "ignore", options = {}) {
  const { accountId = "all" } = options;
  const activeTrades = (trades || []).filter(t => !isDeleted(t));
  
  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  
  for (const trade of activeTrades) {
    // BU is a trade-level concept — propagate it to every allocation so
    // statistics treat per-account splits of a BU trade as BU too.
    const tradeIsBE = trade?.outcome === "BE" || trade?.isBreakEven === true;
    // Handle allocation-based trades
    const allocs = Array.isArray(trade?.allocations) && trade.allocations.length > 0
      ? trade.allocations
      : [{ accountId: trade?.accountId, pnl: trade?.pnl, isBreakEven: trade?.isBreakEven }];

    for (const alloc of allocs) {
      // Filter by accountId if specified
      if (accountId !== "all") {
        const allocAccId = alloc?.accountId || "";
        if (accountId === "__NO_ACCOUNT__") {
          if (allocAccId && allocAccId !== "") continue;
        } else {
          if (allocAccId !== accountId) continue;
        }
      }

      const pnl = clampNum(alloc?.pnl);
      const isBreakEven = tradeIsBE || Boolean(alloc?.isBreakEven);
      const outcome = classifyTradeOutcome({ pnl, isBreakEven, mode });

      if (outcome === "win") wins++;
      else if (outcome === "loss") losses++;
      else breakEvens++;
    }
  }
  
  return {
    wins,
    losses,
    breakEvens,
    total: wins + losses + breakEvens,
  };
}

/**
 * Classify a trade outcome based on PnL, with optional isBreakEven override.
 *
 * @deprecated Use classifyTradeOutcome instead. The rr and neutralRR parameters
 * are kept for backward compatibility but have no effect on classification.
 *
 * IMPORTANT: PnL ALWAYS determines win/loss. neutralRR does NOT override win/loss.
 * If isBreakEven is true and pnl < 0, the trade is treated as break-even
 * (or as loss when mode === "loss").
 *
 * @param {Object} params - Parameters
 * @param {number} params.pnl - Profit/Loss value
 * @param {number} [params.rr] - Risk/Reward value (DEPRECATED - not used)
 * @param {number} [params.neutralRR=0] - Neutral zone threshold (DEPRECATED - not used)
 * @param {boolean} [params.isBreakEven=false] - User-marked break-even flag
 * @param {string} [params.mode="ignore"] - Break-even mode: "ignore" | "loss"
 * @returns {string} - "win" | "loss" | "be"
 */
export function classifyOutcomeByRRAndPnL({ pnl, rr, neutralRR = 0, isBreakEven = false, mode = "ignore" }) {
  return classifyTradeOutcome({ pnl, isBreakEven, mode });
}

/**
 * Count trade outcomes with account filtering.
 * Uses PnL-based classification but honors per-allocation isBreakEven.
 *
 * @param {Array} trades - Array of trade objects
 * @param {Object} options - Options
 * @param {string} [options.accountId="all"] - Filter by account ID
 * @param {Object} [options.prefs] - Win rate preferences (DEPRECATED - not used)
 * @param {string} [options.mode="ignore"] - Break-even mode: "ignore" | "loss"
 * @returns {Object} - { wins, losses, breakEvens, total }
 */
export function countTradeOutcomesWithPrefs(trades, { accountId = "all", prefs = {}, mode = "ignore" } = {}) {
  const activeTrades = (trades || []).filter(t => !isDeleted(t));

  let wins = 0;
  let losses = 0;
  let breakEvens = 0;

  for (const trade of activeTrades) {
    // BU is a trade-level concept — propagate it to every allocation.
    const tradeIsBE = trade?.outcome === "BE" || trade?.isBreakEven === true;
    const allocs = Array.isArray(trade?.allocations) && trade.allocations.length > 0
      ? trade.allocations
      : [{ accountId: trade?.accountId, pnl: trade?.pnl, rr: trade?.rr, isBreakEven: trade?.isBreakEven }];

    for (const alloc of allocs) {
      // Filter by accountId if specified
      if (accountId !== "all") {
        const allocAccId = alloc?.accountId || "";
        if (accountId === "__NO_ACCOUNT__") {
          // Match trades without account
          if (allocAccId && allocAccId !== "") continue;
        } else {
          if (allocAccId !== accountId) continue;
        }
      }

      const pnl = clampNum(alloc?.pnl);
      const isBreakEven = tradeIsBE || Boolean(alloc?.isBreakEven);
      const outcome = classifyTradeOutcome({ pnl, isBreakEven, mode });

      if (outcome === "win") wins++;
      else if (outcome === "loss") losses++;
      else breakEvens++;
    }
  }

  return {
    wins,
    losses,
    breakEvens,
    total: wins + losses + breakEvens,
  };
}

export default calcWinRatePct;
