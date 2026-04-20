/**
 * @file Shared account calculation utilities
 * 
 * Centralized logic for:
 * - PnL amount and percentage calculations
 * - Progress calculations for challenge accounts
 * - Safe fallbacks for missing data
 * 
 * This prevents duplication and ensures consistent behavior across:
 * - Accounts page (cards, detail modal)
 * - Trade creation selector
 * - Dashboard
 * - Analytics
 */

import { clampNum } from "./utils";

/**
 * Calculate PnL (Profit/Loss) for an account
 * 
 * @param {Object} account - Account object
 * @param {number} account.currentEquity - Current balance
 * @param {number} account.startingEquity - Starting balance (for display)
 * @param {number} account.prop.size - Initial account size for prop accounts (for calculations)
 * @returns {Object} - { pnlAmount, pnlPercent, isValid, initialBalance, currentEquity }
 */
export function calculateAccountPnL(account) {
  // Use getInitialBalance for calculations (prop.size for prop accounts, startingEquity for others)
  const initialBalance = getInitialBalance(account);
  const curEq = getCurrentEquity(account);
  
  const pnlAmount = curEq - initialBalance;
  
  // Guard against division by zero or invalid initial balance
  let pnlPercent = 0;
  let isValid = false;
  
  if (initialBalance > 0) {
    pnlPercent = (pnlAmount / initialBalance) * 100;
    isValid = Number.isFinite(pnlPercent);
  }
  
  // Ensure we never return NaN or Infinity
  if (!Number.isFinite(pnlPercent)) {
    pnlPercent = 0;
    isValid = false;
  }
  
  return {
    pnlAmount: clampNum(pnlAmount),
    pnlPercent: clampNum(pnlPercent),
    isValid,
    initialBalance,
    currentEquity: curEq,
  };
}

/**
 * Get the initial balance for profit/loss calculations and rule evaluations.
 * For prop accounts: ALWAYS uses prop.size (the account size the firm evaluates against)
 * For personal accounts: Uses startingEquity
 * 
 * This is the correct baseline for:
 * - Profit percentage calculations
 * - Profit target evaluations (e.g., 10% of initial size)
 * - Drawdown limit evaluations (e.g., max 10% loss from initial size)
 * 
 * @param {Object} account - Account object
 * @returns {number} - Initial balance value for calculations
 */
export function getInitialBalance(account) {
  if (!account) return 0;
  
  // For prop accounts, ALWAYS use prop.size as the baseline for calculations
  // This is the account size the prop firm evaluates against, regardless of
  // what starting balance the user set when they started tracking.
  const propSize = clampNum(account.prop?.size);
  if (propSize > 0) return propSize;
  
  // For non-prop accounts, use startingEquity
  const startEq = clampNum(account.startingEquity);
  if (startEq > 0) return startEq;
  
  // Last fallback to current equity (for legacy accounts)
  const curEq = clampNum(account.currentEquity);
  if (curEq > 0) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[accountCalcs] Account "${account.name || account.id}" missing startingEquity. ` +
        `Using currentEquity (${curEq}) as fallback. ` +
        `To fix: Edit the account and set a starting balance.`
      );
    }
    return curEq;
  }
  
  return 0;
}

/**
 * Get the effective starting equity for an account with fallbacks.
 * Priority: startingEquity > prop.size > currentEquity > 0
 * 
 * Note: For profit calculations and rule evaluations on prop accounts, 
 * use getInitialBalance() instead, which always returns prop.size.
 * 
 * @param {Object} account - Account object
 * @returns {number} - Starting equity value
 */
export function getStartingEquity(account) {
  if (!account) return 0;
  
  const startEq = clampNum(account.startingEquity);
  if (startEq > 0) return startEq;
  
  // Fallback to prop size for prop accounts
  const propSize = clampNum(account.prop?.size);
  if (propSize > 0) return propSize;
  
  // Last fallback to current equity (for legacy accounts)
  const curEq = clampNum(account.currentEquity);
  if (curEq > 0) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[accountCalcs] Account "${account.name || account.id}" missing startingEquity. ` +
        `Using currentEquity (${curEq}) as fallback. ` +
        `To fix: Edit the account and set a starting balance.`
      );
    }
    return curEq;
  }
  
  return 0;
}

/**
 * Get the effective current equity for an account with fallbacks.
 * Priority: currentEquity > startingEquity > prop.size > 0
 * 
 * @param {Object} account - Account object
 * @returns {number} - Current equity value
 */
export function getCurrentEquity(account) {
  if (!account) return 0;
  
  // Check if currentEquity is explicitly defined (including 0 as valid)
  if (account.currentEquity !== undefined && account.currentEquity !== null) {
    return clampNum(account.currentEquity);
  }
  
  // Fallback to starting equity
  return getStartingEquity(account);
}

/**
 * Calculate challenge progress metrics
 * 
 * @param {Object} params - Progress parameters
 * @param {number} params.profitPct - Current profit percentage
 * @param {number} params.targetPct - Target profit percentage (from phase rules)
 * @param {number} params.maxLossPct - Maximum allowed drawdown percentage
 * @param {number} params.minDays - Minimum trading days required
 * @param {number} params.tradedDays - Number of days traded
 * @returns {Object} - Progress metrics with clipped values (0-100 for display)
 */
export function calculateChallengeProgress({ profitPct, targetPct, maxLossPct, minDays, tradedDays }) {
  const safeProfitPct = clampNum(profitPct);
  const safeTargetPct = clampNum(targetPct);
  const safeMaxLossPct = clampNum(maxLossPct);
  const safeMinDays = clampNum(minDays);
  const safeTradedDays = clampNum(tradedDays);
  
  // Target progress (0 to 100%)
  let targetProgress = 0;
  if (safeTargetPct > 0) {
    targetProgress = Math.min(100, Math.max(0, (safeProfitPct / safeTargetPct) * 100));
  }
  const isTargetReached = safeTargetPct > 0 ? safeProfitPct >= safeTargetPct : false;
  
  // Drawdown progress (only shows negative PnL toward max loss)
  const drawdownPct = Math.abs(Math.min(0, safeProfitPct));
  let drawdownProgress = 0;
  if (safeMaxLossPct > 0) {
    drawdownProgress = Math.min(100, (drawdownPct / safeMaxLossPct) * 100);
  }
  const isDrawdownDanger = drawdownProgress > 70;
  const isDrawdownWarning = drawdownProgress > 50;
  const isDrawdownBreached = safeMaxLossPct > 0 && safeProfitPct < 0 && Math.abs(safeProfitPct) >= safeMaxLossPct;
  
  // Days progress
  let daysProgress = 100;
  if (safeMinDays > 0) {
    daysProgress = Math.min(100, (safeTradedDays / safeMinDays) * 100);
  }
  const isDaysReached = safeMinDays > 0 ? safeTradedDays >= safeMinDays : true;
  
  return {
    targetProgress: clampNum(targetProgress),
    isTargetReached,
    drawdownPct: clampNum(drawdownPct),
    drawdownProgress: clampNum(drawdownProgress),
    isDrawdownDanger,
    isDrawdownWarning,
    isDrawdownBreached,
    daysProgress: clampNum(daysProgress),
    isDaysReached,
    // For convenience
    canPassChallenge: isTargetReached && isDaysReached && !isDrawdownBreached,
  };
}

/**
 * Format account PnL display string with amount and percentage
 * Handles edge cases like missing starting equity
 * 
 * @param {Object} account - Account object
 * @param {string} currency - Currency symbol (default: "$")
 * @returns {Object} - { amountStr, percentStr, combined, color, currentEquity }
 */
export function formatAccountPnL(account, currency = "$") {
  const { pnlAmount, pnlPercent, isValid, currentEquity } = calculateAccountPnL(account);
  
  const sign = pnlAmount >= 0 ? "+" : "";
  const amountStr = `${sign}${currency}${Math.abs(pnlAmount).toFixed(2)}`;
  
  let percentStr;
  if (isValid) {
    percentStr = `${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%`;
  } else {
    percentStr = "—";
  }
  
  const combined = `${amountStr} (${percentStr})`;
  const color = pnlAmount >= 0 ? "green" : "red";
  
  return {
    amountStr,
    percentStr,
    combined,
    pnlAmount,
    pnlPercent,
    isValid,
    color,
    currentEquity,
  };
}

/**
 * Check if starting balance is valid and should be required
 * 
 * @param {Object} account - Account object or form data
 * @returns {Object} - { isValid, error }
 */
export function validateStartingBalance(account) {
  const startEq = clampNum(account?.startingEquity);
  const propSize = clampNum(account?.prop?.size || account?.propSize);
  const isProp = !!account?.isProp || !!account?.prop?.templateId;
  
  if (isProp && propSize > 0) {
    // Prop accounts use propSize as starting equity
    return { isValid: true, error: null };
  }
  
  if (!isProp && startEq <= 0) {
    return { 
      isValid: false, 
      error: "Starting balance is required and must be greater than 0" 
    };
  }
  
  return { isValid: true, error: null };
}
