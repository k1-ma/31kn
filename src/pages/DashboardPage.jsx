/**
 * DashboardPage - Premium Trading Dashboard
 * 
 * A comprehensive dashboard showing key trading metrics, equity curve,
 * performance breakdowns, consistency metrics, prop firm progress,
 * and smart insights.
 */

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Header from "@/components/common/Header.jsx";
import Button from "@/components/ui/Button.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { calcDashboardMetrics } from "@/lib/dashboard/calcDashboardMetrics.js";
import { useDashboardFilters } from "@/lib/dashboard/useDashboardFilters.js";
import { getGlobalWinRateMode, getGlobalAvgRRMode } from "@/lib/metrics/winRate.js";
import {
  DashboardFilterBar,
  DailyPnLChart,
  WinLossDistribution,
  LongShortComparison,
  DashboardBreakdownTabs,
  DashboardConsistency,
  DashboardPropProgress,
  DashboardInsights,
  DashboardQuickStats,
  DashboardHauntedScore,
  DashboardIdeasWinRate,
} from "@/components/dashboard";
import { LayoutDashboard, Plus, TrendingUp } from "lucide-react";
import { clampNum } from "@/lib/utils";

// Empty state component
function EmptyState({ onAddTrade }) {
  const { t } = useI18n();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20"
    >
      <div className="h-20 w-20 rounded-xl bg-accent/10 flex items-center justify-center mb-6">
        <TrendingUp className="h-10 w-10 text-accent" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        {t("pages.dashboard.emptyTitle") || "Welcome to Your Dashboard"}
      </h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        {t("pages.dashboard.emptyDesc") || "Start tracking your trades to see powerful analytics, insights, and performance metrics."}
      </p>
      {onAddTrade && (
        <Button onClick={onAddTrade} className="gap-2">
          <Plus className="h-4 w-4" />
          {t("pages.dashboard.addFirstTrade") || "Add Your First Trade"}
        </Button>
      )}
    </motion.div>
  );
}

export default function DashboardPage({
  trades = [],
  accounts = [],
  libraries = {},
  propTemplates = [],
  reduceMotion = false,
  onAddTrade,
  onTradeClick,
  ui = {},
  demoMode = false,
  ideas = [],
}) {
  const { t } = useI18n();

  // Filter hook
  const {
    datePreset,
    setDatePreset,
    selectedAccounts,
    setSelectedAccounts,
    selectedPairs,
    setSelectedPairs,
    selectedSessions,
    setSelectedSessions,
    direction,
    setDirection,
    filteredTrades,
    filterOptions,
    hasActiveFilters,
    resetFilters,
    lastUpdated,
  } = useDashboardFilters(trades, accounts);

  // Calculate starting equity for equity curve
  const startingEquity = useMemo(() => {
    if (selectedAccounts.length === 1) {
      const acc = accounts.find((a) => a.id === selectedAccounts[0]);
      return clampNum(acc?.startingEquity);
    }
    // Sum of all accounts' starting equity
    return accounts.reduce((sum, a) => sum + clampNum(a?.startingEquity), 0);
  }, [accounts, selectedAccounts]);

  // Calculate equityCorrection (initial deficit/surplus before trade tracking)
  const equityCorrection = useMemo(() => {
    if (selectedAccounts.length === 1) {
      const acc = accounts.find((a) => a.id === selectedAccounts[0]);
      return clampNum(acc?.equityCorrection);
    }
    // Sum of all accounts' equityCorrections
    return accounts.reduce((sum, a) => sum + clampNum(a?.equityCorrection), 0);
  }, [accounts, selectedAccounts]);

  // Get currency from first account
  const currency = accounts[0]?.currency || "$";
  
  // Get GLOBAL win rate mode from UI settings
  const winRateMode = getGlobalWinRateMode(ui);
  const avgRRMode = getGlobalAvgRRMode(ui);
  const pnlDisplayMode = ui?.pnlDisplayMode || "money";

  // Calculate metrics with libraries for symbol/session name resolution
  const metrics = useMemo(() => {
    return calcDashboardMetrics(filteredTrades, accounts, {
      accountId: selectedAccounts.length === 1 ? selectedAccounts[0] : "all",
      startingEquity,
      equityCorrection,
      symbols: libraries?.symbols || [],
      sessions: libraries?.sessions || [],
      winRateMode,
      avgRRMode,
    });
  }, [filteredTrades, accounts, selectedAccounts, startingEquity, equityCorrection, libraries, winRateMode, avgRRMode]);

  // Loading state (for skeleton)
  const [loading, setLoading] = useState(false);

  // Export handler (placeholder)
  const handleExport = () => {
    // TODO: Implement PDF/CSV export
    alert("Export feature coming soon!");
  };

  // For empty accounts, we show all components with neutral values
  // No early return - all sections must render to show the full power of the product
  const isEmpty = trades.length === 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <Header
        title={t("pages.dashboard.title") || "Dashboard"}
        subtitle={t("pages.dashboard.subtitle") || "Your trading performance at a glance"}
        icon={<LayoutDashboard className="h-6 w-6" />}
      />

      {/* Filter Bar */}
      <DashboardFilterBar
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        selectedAccounts={selectedAccounts}
        setSelectedAccounts={setSelectedAccounts}
        selectedPairs={selectedPairs}
        setSelectedPairs={setSelectedPairs}
        selectedSessions={selectedSessions}
        setSelectedSessions={setSelectedSessions}
        direction={direction}
        setDirection={setDirection}
        filterOptions={filterOptions}
        hasActiveFilters={hasActiveFilters}
        resetFilters={resetFilters}
        lastUpdated={lastUpdated}
        onExport={demoMode ? undefined : handleExport}
        libraries={libraries}
        accounts={accounts}
      />

      {/* Consistency & Discipline + Smart Insights + Quick Stats (side by side) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
        <DashboardConsistency metrics={metrics} loading={loading} currency={currency} pnlDisplayMode={pnlDisplayMode} />
        <div className="flex flex-col gap-4 sm:gap-6">
          <DashboardInsights insights={metrics.insights} loading={loading} />
          <DashboardQuickStats metrics={metrics} loading={loading} currency={currency} pnlDisplayMode={pnlDisplayMode} />
          <DashboardIdeasWinRate ideas={ideas} />
        </div>
      </section>

      {/* Haunted Score (left - replacing Equity Curve) + Charts Column (right: Daily PnL, Win/Loss, Long vs Short) */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 items-start">
        {/* Left: Haunted Score - new informative UI without diamond radar */}
        <DashboardHauntedScore
          trades={filteredTrades}
          accountId={selectedAccounts.length === 1 ? selectedAccounts[0] : "all"}
          reduceMotion={reduceMotion}
        />
        
        {/* Right: Stacked charts column */}
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
          <DailyPnLChart dailyPnL={metrics.dailyPnL} currency={currency} loading={loading} pnlDisplayMode={pnlDisplayMode} startingEquity={startingEquity} />
          <WinLossDistribution metrics={metrics} loading={loading} />
          <LongShortComparison
            longStats={metrics.longStats}
            shortStats={metrics.shortStats}
            currency={currency}
            loading={loading}
          />
        </div>
      </section>

      {/* Breakdown Tabs */}
      <section>
        <DashboardBreakdownTabs
          breakdowns={metrics.breakdowns}
          currency={currency}
          loading={loading}
          onRowClick={undefined}
          pnlDisplayMode={pnlDisplayMode}
          startingEquity={startingEquity}
        />
      </section>

      {/* Prop Firm Progress (below Performance Breakdown) */}
      <section>
        <DashboardPropProgress
          accounts={accounts}
          trades={filteredTrades}
          propTemplates={propTemplates}
          loading={loading}
        />
      </section>

    </div>
  );
}
