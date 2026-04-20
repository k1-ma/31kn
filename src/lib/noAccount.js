/**
 * No Account Helper
 * Centralized logic for handling trades without account attachment
 */

// Virtual account ID for trades without real account
export const NO_ACCOUNT_ID = "__NO_ACCOUNT__";

/**
 * Normalize a raw accountId value to match getTradeAccountKey behavior.
 * Empty/null/undefined becomes NO_ACCOUNT_ID, otherwise returns string.
 * Use this when you have a raw accountId to compare against getTradeAccountKey results.
 * @param {string|number|null|undefined} accountId - Raw account ID value
 * @returns {string} NO_ACCOUNT_ID or the stringified value
 */
export function normalizeAccountId(accountId) {
  if (!accountId || accountId === "" || accountId === null || accountId === undefined) {
    return NO_ACCOUNT_ID;
  }
  return String(accountId);
}

/**
 * Get the account key for a trade or allocation.
 * If accountId is null/undefined/"", returns NO_ACCOUNT_ID.
 * @param {Object} tradeOrAlloc - Trade or allocation object with accountId
 * @returns {string} The account ID or NO_ACCOUNT_ID
 */
export function getTradeAccountKey(tradeOrAlloc) {
  const accId = tradeOrAlloc?.accountId;
  if (!accId || accId === "" || accId === null || accId === undefined) {
    return NO_ACCOUNT_ID;
  }
  return String(accId);
}

/**
 * Check if a trade or allocation belongs to the "no account" virtual account
 * @param {Object} tradeOrAlloc - Trade or allocation object
 * @returns {boolean}
 */
export function isNoAccount(tradeOrAlloc) {
  return getTradeAccountKey(tradeOrAlloc) === NO_ACCOUNT_ID;
}

/**
 * Check if a trade has any allocation matching the given accountId
 * Supports NO_ACCOUNT_ID for filtering trades without account
 * @param {Object} trade - Trade object
 * @param {string} accountId - Account ID to check (or NO_ACCOUNT_ID)
 * @returns {boolean}
 */
export function tradeHasAccount(trade, accountId) {
  if (accountId === "all") return true;
  
  // Get all allocations
  const allocs = Array.isArray(trade?.allocations) && trade.allocations.length > 0
    ? trade.allocations
    : trade?.accountId !== undefined
      ? [{ accountId: trade.accountId }]
      : [{ accountId: "" }];
  
  // Check if any allocation matches
  if (accountId === NO_ACCOUNT_ID) {
    return allocs.some(a => isNoAccount(a));
  }
  
  return allocs.some(a => a?.accountId === accountId);
}

/**
 * Create the virtual "No Account" object for display in dropdowns
 * @param {Function} t - Translation function
 * @returns {Object} Virtual account object
 */
export function createNoAccountOption(t) {
  return {
    id: NO_ACCOUNT_ID,
    name: t?.("accounts.noAccount") || t?.("pages.trades.editor.labels.noAccount") || "No account",
    avatar: null,
    color: "#F59E0B", // amber color
    status: "",
    isVirtual: true,
  };
}

/**
 * Check if there are any trades without account in the trades list
 * @param {Array} trades - Array of trade objects
 * @returns {boolean}
 */
export function hasTradesWithoutAccount(trades) {
  if (!Array.isArray(trades)) return false;
  return trades.some(trade => {
    const allocs = Array.isArray(trade?.allocations) && trade.allocations.length > 0
      ? trade.allocations
      : [{ accountId: trade?.accountId }];
    return allocs.some(a => isNoAccount(a));
  });
}

/**
 * Get account info for display, handling no-account case
 * @param {Object} account - Account object or null
 * @param {Function} t - Translation function
 * @returns {Object} Account display info
 */
export function getAccountDisplayInfo(account, t) {
  if (!account || account.id === NO_ACCOUNT_ID) {
    return {
      name: t?.("accounts.noAccount") || t?.("pages.trades.editor.labels.noAccount") || "No account",
      avatar: null,
      color: "#F59E0B",
      isNoAccount: true,
    };
  }
  return {
    name: account.name || account.id || "Account",
    avatar: account.avatar,
    color: account.color,
    isNoAccount: false,
  };
}
