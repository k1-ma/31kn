/**
 * @file Account entity helpers
 * 
 * Centralized functions for account-related calculations and filtering.
 * Provides selectors for trades, stats, and status by account.
 */

import { clampNum } from "./utils";
import { NO_ACCOUNT_ID, getTradeAccountKey, normalizeAccountId } from "./noAccount.js";
import { calculateAccountPnL, getCurrentEquity, getStartingEquity, getInitialBalance } from "./accountCalcs.js";
import { calcWinRatePct, classifyOutcomeByPnL } from "./metrics/winRate.js";
import { isDeleted } from "./syncDb.js";

/**
 * Get all trades for a specific account.
 * Supports filtering by accountId, NO_ACCOUNT_ID, or "all".
 * 
 * @param {Object} db - Database object with trades and accounts arrays
 * @param {string} accountId - Account ID, NO_ACCOUNT_ID, or "all"
 * @returns {Array} Filtered trades
 */
export function getTradesForAccount(db, accountId) {
  const trades = Array.isArray(db?.trades) ? db.trades : [];
  
  // Filter out deleted trades
  const activeTrades = trades.filter(t => !isDeleted(t));
  
  // Return all trades if "all" is selected
  if (accountId === "all" || !accountId) {
    return activeTrades;
  }
  
  return activeTrades.filter(trade => {
    // Get all allocations for the trade
    const allocs = Array.isArray(trade?.allocations) && trade.allocations.length > 0
      ? trade.allocations
      : trade?.accountId !== undefined
        ? [{ accountId: trade.accountId }]
        : [{ accountId: "" }];
    
    // Check if any allocation matches the accountId
    if (accountId === NO_ACCOUNT_ID) {
      return allocs.some(a => {
        const accId = a?.accountId;
        return !accId || accId === "" || accId === null || accId === undefined;
      });
    }
    
    // Use normalizeAccountId and getTradeAccountKey for consistent comparison
    const targetId = normalizeAccountId(accountId);
    return allocs.some(a => getTradeAccountKey(a) === targetId);
  });
}

/**
 * Calculate PnL for an account from its trades within an optional date range.
 * 
 * @param {Object} db - Database object with trades and accounts arrays
 * @param {string} accountId - Account ID
 * @param {Object} dateRange - Optional { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 * @returns {Object} - { pnlAmount, pnlPercent, trades, currency }
 */
export function calcAccountPnL(db, accountId, dateRange) {
  const accounts = Array.isArray(db?.accounts) ? db.accounts : [];
  const account = accounts.find(a => a?.id === accountId);
  const currency = account?.currency || "$";
  
  let trades = getTradesForAccount(db, accountId);
  
  // Apply date range filter if provided
  if (dateRange) {
    const fromTs = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).getTime() : 0;
    const toTs = dateRange.to ? new Date(`${dateRange.to}T23:59:59`).getTime() : Infinity;
    
    trades = trades.filter(t => {
      if (!t?.date) return false;
      const ts = new Date(`${t.date}T00:00:00`).getTime();
      return ts >= fromTs && ts <= toTs;
    });
  }
  
  // Calculate total PnL from allocations for this account
  let pnlAmount = 0;
  
  for (const trade of trades) {
    const allocs = Array.isArray(trade?.allocations) && trade.allocations.length > 0
      ? trade.allocations
      : [{ accountId: trade?.accountId || "", pnl: trade?.pnl || 0, commission: trade?.commission || 0 }];
    
    for (const alloc of allocs) {
      // Check if this allocation belongs to the target account
      const allocAccId = alloc?.accountId;
      const isNoAccount = !allocAccId || allocAccId === "" || allocAccId === null;
      
      if (accountId === NO_ACCOUNT_ID) {
        if (isNoAccount) {
          const grossPnl = clampNum(alloc?.pnl);
          const commission = Math.abs(clampNum(alloc?.commission));
          pnlAmount += grossPnl - commission;
        }
      } else {
        // Use normalizeAccountId for consistent comparison
        const targetId = normalizeAccountId(accountId);
        if (getTradeAccountKey(alloc) === targetId) {
          const grossPnl = clampNum(alloc?.pnl);
          const commission = Math.abs(clampNum(alloc?.commission));
          pnlAmount += grossPnl - commission;
        }
      }
    }
  }
  
  // Calculate percentage based on initial balance (prop.size for prop accounts, startingEquity for others)
  const initialBalance = account ? getInitialBalance(account) : 0;
  const pnlPercent = initialBalance > 0 ? (pnlAmount / initialBalance) * 100 : 0;
  
  return {
    pnlAmount: clampNum(pnlAmount),
    pnlPercent: clampNum(pnlPercent),
    tradesCount: trades.length,
    currency,
  };
}

/**
 * Calculate comprehensive stats for an account.
 * 
 * @param {Object} db - Database object with trades and accounts arrays
 * @param {string} accountId - Account ID
 * @param {string} [winRateMode="ignore"] - Global win rate mode from UI settings
 * @returns {Object} - Stats object with WR, avgRR, totalTrades, lastTradeDate, currentDrawdown
 */
export function calcAccountStats(db, accountId, winRateMode = "ignore", avgRRMode = "winsOnly") {
  const accounts = Array.isArray(db?.accounts) ? db.accounts : [];
  const account = accounts.find(a => a?.id === accountId);
  const trades = getTradesForAccount(db, accountId);
  
  // Normalize mode - default to "ignore" for any invalid value
  const mode = winRateMode === "loss" ? "loss" : "ignore";
  
  const totalTrades = trades.length;
  
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakEvens: 0,
      winRate: 0,
      avgRR: 0,
      totalPnL: 0,
      lastTradeDate: null,
      currentDrawdown: 0,
      currentDrawdownPct: 0,
      currency: account?.currency || "$",
    };
  }
  
  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let totalPnL = 0;
  let totalRR = 0;
  let winRR = 0;
  let winRRCount = 0;
  let beRR = 0;
  let beRRCount = 0;
  let lastTradeDate = null;
  
  // Track equity for drawdown calculation
  const initialBalance = account ? getInitialBalance(account) : 0;
  let peakEquity = initialBalance;
  let currentEquity = initialBalance;
  
  // Sort trades by date for drawdown calculation
  const sortedTrades = [...trades].sort((a, b) => {
    const dateA = a?.date || "";
    const dateB = b?.date || "";
    return dateA.localeCompare(dateB);
  });
  
  for (const trade of sortedTrades) {
    // Calculate PnL for this account's allocations
    const allocs = Array.isArray(trade?.allocations) && trade.allocations.length > 0
      ? trade.allocations
      : [{ accountId: trade?.accountId || "", pnl: trade?.pnl || 0, rr: trade?.rr || 0, commission: trade?.commission || 0 }];
    
    for (const alloc of allocs) {
      const allocAccId = alloc?.accountId;
      const isNoAccount = !allocAccId || allocAccId === "" || allocAccId === null;
      // Use normalizeAccountId for consistent comparison
      const targetId = normalizeAccountId(accountId);
      const matchesAccount = accountId === NO_ACCOUNT_ID ? isNoAccount : getTradeAccountKey(alloc) === targetId;
      
      if (matchesAccount) {
        const grossPnl = clampNum(alloc?.pnl);
        const commission = Math.abs(clampNum(alloc?.commission));
        const netPnl = grossPnl - commission;
        const rr = alloc?.rr;
        
        totalPnL += netPnl;
        
        // Classify outcome — honor user-marked break-even flag on the allocation
        const isBreakEven = Boolean(alloc?.isBreakEven);
        const outcome = classifyOutcomeByPnL({ pnl: grossPnl, isBreakEven, mode });
        if (outcome === "win") {
          wins++;
          // Only count positive RR values for winning trades
          if (Number.isFinite(rr) && rr > 0) {
            winRR += rr;
            winRRCount++;
          }
        }
        else if (outcome === "loss") losses++;
        else {
          breakEvens++;
          if (Number.isFinite(rr)) {
            beRR += rr;
            beRRCount++;
          }
        }
        
        // Update equity curve for drawdown
        currentEquity += netPnl;
        if (currentEquity > peakEquity) {
          peakEquity = currentEquity;
        }
      }
    }
    
    // Track last trade date
    if (trade?.date) {
      if (!lastTradeDate || trade.date > lastTradeDate) {
        lastTradeDate = trade.date;
      }
    }
  }
  
  // Use global win rate mode (passed as parameter)
  const winRate = calcWinRatePct({ wins, losses, breakEvens, mode });
  const avgRR = avgRRMode === "all"
    ? ((winRRCount + beRRCount) > 0 ? (winRR + beRR) / (winRRCount + beRRCount) : 0)
    : (winRRCount > 0 ? winRR / winRRCount : 0);
  const currentDrawdown = Math.max(0, peakEquity - currentEquity);
  const currentDrawdownPct = peakEquity > 0 ? (currentDrawdown / peakEquity) * 100 : 0;
  
  return {
    totalTrades,
    wins,
    losses,
    breakEvens,
    winRate: clampNum(winRate),
    avgRR: clampNum(avgRR),
    totalPnL: clampNum(totalPnL),
    lastTradeDate,
    currentDrawdown: clampNum(currentDrawdown),
    currentDrawdownPct: clampNum(currentDrawdownPct),
    currency: account?.currency || "$",
  };
}

/**
 * Determine account status based on account data and stats.
 * 
 * @param {Object} account - Account object
 * @param {Object} stats - Stats from calcAccountStats
 * @returns {Object} - { status: "OK" | "warning" | "danger", reason: string | null }
 */
export function getAccountStatus(account, stats) {
  if (!account) {
    return { status: "OK", reason: null };
  }
  
  // Check if account has limits from prop rules
  const limits = account?.limits || {};
  const propRules = account?.prop?.rulesOverride || {};
  
  const maxLossPct = clampNum(limits.maxLossPct || propRules.maxLossPct);
  const dailyLossPct = clampNum(limits.dailyLossPct || propRules.maxDailyLossPct);
  const profitTargetPct = clampNum(limits.profitTargetPct || propRules.profitTargetPct);
  
  const currentDrawdownPct = clampNum(stats?.currentDrawdownPct);
  const initialBalance = getInitialBalance(account);
  const currentEquity = getCurrentEquity(account);
  const pnlPct = initialBalance > 0 ? ((currentEquity - initialBalance) / initialBalance) * 100 : 0;
  
  // Check for limit breach
  if (maxLossPct > 0 && pnlPct < 0 && Math.abs(pnlPct) >= maxLossPct) {
    return { status: "danger", reason: "maxLossBreached" };
  }
  
  // Check for approaching max loss (70%+)
  if (maxLossPct > 0 && pnlPct < 0 && Math.abs(pnlPct) >= maxLossPct * 0.7) {
    return { status: "warning", reason: "approachingMaxLoss" };
  }
  
  // Check for profit target reached
  if (profitTargetPct > 0 && pnlPct >= profitTargetPct) {
    return { status: "OK", reason: "profitTargetReached" };
  }
  
  return { status: "OK", reason: null };
}

/**
 * Normalize account data to ensure all required fields exist.
 * Used for migration and data integrity.
 * 
 * @param {Object} account - Raw account object
 * @returns {Object} - Normalized account with defaults
 */
export function normalizeAccount(account) {
  if (!account) return null;
  
  return {
    ...account,
    id: account.id,
    name: account.name || "Unnamed Account",
    propFirm: account.propFirm || null,
    currency: account.currency || "$",
    startingEquity: clampNum(account.startingEquity),
    currentEquity: account.currentEquity !== undefined ? clampNum(account.currentEquity) : null,
    defaultRiskPct: clampNum(account.defaultRiskPct),
    // Initialize limits structure if not present
    limits: {
      dailyLossPct: clampNum(account.limits?.dailyLossPct),
      maxLossPct: clampNum(account.limits?.maxLossPct),
      profitTargetPct: clampNum(account.limits?.profitTargetPct),
      ...account.limits,
    },
  };
}

/**
 * Get account options for dropdowns, including "All accounts" and "No account".
 * 
 * @param {Array} accounts - Array of account objects
 * @param {Function} t - Translation function
 * @param {Object} options - { includeAll: boolean, includeNoAccount: boolean }
 * @returns {Array} - Array of { value, label, account? } options
 */
export function getAccountFilterOptions(accounts, t, options = {}) {
  const { includeAll = true, includeNoAccount = true } = options;
  const result = [];
  
  if (includeAll) {
    result.push({
      value: "all",
      label: t?.("accounts.allAccounts") || "All accounts",
      account: null,
    });
  }
  
  if (includeNoAccount) {
    result.push({
      value: NO_ACCOUNT_ID,
      label: t?.("accounts.noAccount") || "No account",
      account: null,
    });
  }
  
  // Add active accounts (not archived, not deleted)
  const activeAccounts = (accounts || []).filter(a => !isDeleted(a) && !a?.archivedAt);
  
  for (const acc of activeAccounts) {
    result.push({
      value: acc.id,
      label: acc.name || acc.id,
      account: acc,
    });
  }
  
  return result;
}
