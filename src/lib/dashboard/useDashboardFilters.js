/**
 * Dashboard Filters Hook
 * Manages filter state for the dashboard page
 */

import { useState, useMemo, useCallback } from "react";
import { NO_ACCOUNT_ID, getTradeAccountKey, hasTradesWithoutAccount } from "@/lib/noAccount.js";
import { isDeleted } from "@/lib/syncDb.js";

/**
 * Get date N days ago
 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

/**
 * Get start of year
 */
function startOfYear() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

/**
 * Date range presets
 */
export const DATE_PRESETS = [
  { id: "7d", label: "Last 7 days", getRange: () => ({ from: daysAgo(7), to: null }) },
  { id: "30d", label: "Last 30 days", getRange: () => ({ from: daysAgo(30), to: null }) },
  { id: "90d", label: "Last 90 days", getRange: () => ({ from: daysAgo(90), to: null }) },
  { id: "ytd", label: "YTD", getRange: () => ({ from: startOfYear(), to: null }) },
  { id: "all", label: "All time", getRange: () => ({ from: null, to: null }) },
  { id: "custom", label: "Custom", getRange: () => null },
];

/**
 * Direction options
 */
export const DIRECTION_OPTIONS = [
  { id: "all", label: "All" },
  { id: "Long", label: "Long" },
  { id: "Short", label: "Short" },
];

/**
 * Filter trades based on current filter state
 */
function filterTrades(trades, filters) {
  return trades.filter((trade) => {
    // Date filter
    if (filters.dateFrom || filters.dateTo) {
      const tradeDate = trade?.date?.split("T")[0];
      if (!tradeDate) return false;
      if (filters.dateFrom && tradeDate < filters.dateFrom) return false;
      if (filters.dateTo && tradeDate > filters.dateTo) return false;
    }

    // Account filter
    if (filters.accounts.length > 0) {
      const tradeAccounts = new Set();
      // Collect all account IDs from trade
      if (trade?.accountId) {
        tradeAccounts.add(trade.accountId);
      } else {
        // Trade has no account - add virtual NO_ACCOUNT_ID
        tradeAccounts.add(NO_ACCOUNT_ID);
      }
      if (Array.isArray(trade?.allocations)) {
        for (const alloc of trade.allocations) {
          if (alloc?.accountId) {
            tradeAccounts.add(alloc.accountId);
          } else {
            // Allocation has no account - add virtual NO_ACCOUNT_ID
            tradeAccounts.add(NO_ACCOUNT_ID);
          }
        }
      }
      const hasMatch = filters.accounts.some((id) => tradeAccounts.has(id));
      if (!hasMatch) return false;
    }

    // Pair filter
    if (filters.pairs.length > 0) {
      const tradePair = trade?.pair || trade?.symbol;
      if (!tradePair || !filters.pairs.includes(tradePair)) return false;
    }

    // Session filter
    if (filters.sessions.length > 0) {
      const tradeSession = trade?.session || trade?.sessionId;
      if (!tradeSession || !filters.sessions.includes(tradeSession)) return false;
    }

    // Model filter
    if (filters.models.length > 0) {
      const tradeModel = trade?.modelId;
      if (!tradeModel || !filters.models.includes(tradeModel)) return false;
    }

    // Direction filter
    if (filters.direction !== "all") {
      if (trade?.direction !== filters.direction) return false;
    }

    return true;
  });
}

/**
 * Extract unique values from trades for filter options
 */
function extractFilterOptions(trades, accounts) {
  const pairs = new Set();
  const sessions = new Set();
  const models = new Set();

  for (const trade of trades) {
    if (trade?.pair) pairs.add(trade.pair);
    if (trade?.symbol) pairs.add(trade.symbol);
    if (trade?.session) sessions.add(trade.session);
    if (trade?.sessionId) sessions.add(trade.sessionId);
    if (trade?.modelId) models.add(trade.modelId);
  }

  // Build accounts list with "No Account" option if there are trades without account
  const accountsList = accounts
    .filter((a) => !isDeleted(a))
    .map((a) => ({ id: a.id, name: a.name || "Unnamed" }));
  
  // Add "No Account" option if there are trades without account
  if (hasTradesWithoutAccount(trades)) {
    accountsList.unshift({ id: NO_ACCOUNT_ID, name: "No account", isVirtual: true });
  }

  return {
    pairs: Array.from(pairs).sort(),
    sessions: Array.from(sessions).sort(),
    models: Array.from(models).sort(),
    accounts: accountsList,
  };
}

/**
 * Main hook for dashboard filters
 */
export function useDashboardFilters(trades, accounts) {
  // Filter state
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [selectedPairs, setSelectedPairs] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [direction, setDirection] = useState("all");

  // Compute effective date range from preset
  const effectiveDateRange = useMemo(() => {
    if (datePreset === "custom") {
      return { from: dateFrom, to: dateTo };
    }
    const preset = DATE_PRESETS.find((p) => p.id === datePreset);
    if (!preset) return { from: null, to: null };
    const range = preset.getRange();
    return range || { from: null, to: null };
  }, [datePreset, dateFrom, dateTo]);

  // Extract filter options from trades
  const filterOptions = useMemo(
    () => extractFilterOptions(trades || [], accounts || []),
    [trades, accounts]
  );

  // Build filters object
  const filters = useMemo(
    () => ({
      dateFrom: effectiveDateRange.from,
      dateTo: effectiveDateRange.to,
      accounts: selectedAccounts,
      pairs: selectedPairs,
      sessions: selectedSessions,
      models: selectedModels,
      direction,
    }),
    [effectiveDateRange, selectedAccounts, selectedPairs, selectedSessions, selectedModels, direction]
  );

  // Filter trades
  const filteredTrades = useMemo(
    () => filterTrades(trades || [], filters),
    [trades, filters]
  );

  // Reset filters
  const resetFilters = useCallback(() => {
    setDatePreset("all");
    setDateFrom(null);
    setDateTo(null);
    setSelectedAccounts([]);
    setSelectedPairs([]);
    setSelectedSessions([]);
    setSelectedModels([]);
    setDirection("all");
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      datePreset !== "all" ||
      selectedAccounts.length > 0 ||
      selectedPairs.length > 0 ||
      selectedSessions.length > 0 ||
      selectedModels.length > 0 ||
      direction !== "all"
    );
  }, [datePreset, selectedAccounts, selectedPairs, selectedSessions, selectedModels, direction]);

  // Get last updated timestamp
  const lastUpdated = useMemo(() => new Date().toISOString(), [filteredTrades]);

  return {
    // Filter state
    datePreset,
    setDatePreset,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    selectedAccounts,
    setSelectedAccounts,
    selectedPairs,
    setSelectedPairs,
    selectedSessions,
    setSelectedSessions,
    selectedModels,
    setSelectedModels,
    direction,
    setDirection,

    // Computed values
    filters,
    filteredTrades,
    filterOptions,
    hasActiveFilters,
    lastUpdated,

    // Actions
    resetFilters,
  };
}

export default useDashboardFilters;
