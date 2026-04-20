/**
 * BacktestDashboard — Stripped-down dashboard for backtest workspace.
 * 
 * Includes ONLY:
 * - KPI Grid (key metrics)
 * - Equity Curve
 * - Daily PnL Chart
 * - Win/Loss Distribution
 * - Long vs Short
 * - Breakdown Tabs
 * - 2 Notes (a, b)
 * 
 * REMOVED from live dashboard:
 * - PropFirm Progress
 * - Consistency
 * - Insights
 * - Quick Stats
 * - Haunted Score
 */

import React, { useMemo, useState } from "react";
import Header from "@/components/common/Header.jsx";
import Button from "@/components/ui/Button.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { calcDashboardMetrics } from "@/lib/dashboard/calcDashboardMetrics.js";
import { getGlobalWinRateMode, getGlobalAvgRRMode } from "@/lib/metrics/winRate.js";
import {
  DashboardFilterBar,
  DashboardKPIGrid,
  DailyPnLChart,
  WinLossDistribution,
  LongShortComparison,
  DashboardBreakdownTabs,
} from "@/components/dashboard";
import { useDashboardFilters } from "@/lib/dashboard/useDashboardFilters.js";
import { LayoutDashboard, Plus, TrendingUp, StickyNote } from "lucide-react";
import { clampNum } from "@/lib/utils";

/* ── Simple textarea note card ── */
function NoteCard({ label, value, onChange }) {
  return (
    <Card className="h-full">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <StickyNote className="h-3.5 w-3.5 text-accent/60" />
          <span className="text-[12px] font-semibold text-foreground/80">{label}</span>
        </div>
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="Write a note..."
          className="w-full rounded-lg border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40 transition-all duration-200 focus:border-accent/50 focus:ring-1 focus:ring-accent/25 resize-none"
        />
      </CardContent>
    </Card>
  );
}

export default function BacktestDashboard({
  backtest,
  trades = [],
  accounts = [],
  libraries = {},
  reduceMotion = false,
  onAddTrade,
  onTradeClick,
  onNotesChange,
  ui = {},
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

  // Starting equity from backtest's single account
  const startingEquity = useMemo(() => {
    return clampNum(backtest?.account?.initialEquity || backtest?.initialEquity);
  }, [backtest]);

  const equityCorrection = 0;
  const currency = backtest?.account?.currency || "$";
  const winRateMode = getGlobalWinRateMode(ui);
  const avgRRMode = getGlobalAvgRRMode(ui);

  // Calculate metrics
  const metrics = useMemo(() => {
    return calcDashboardMetrics(filteredTrades, accounts, {
      accountId: backtest?.account?.id || "all",
      startingEquity,
      equityCorrection,
      symbols: libraries?.symbols || [],
      sessions: libraries?.sessions || [],
      winRateMode,
      avgRRMode,
    });
  }, [filteredTrades, accounts, backtest, startingEquity, libraries, winRateMode, avgRRMode]);

  const [loading] = useState(false);
  const isEmpty = trades.length === 0;

  // Notes
  const notes = backtest?.notes || { plan: "", description: "" };
  const handleNotePlan = (val) => onNotesChange?.({ plan: val });
  const handleNoteDesc = (val) => onNotesChange?.({ description: val });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <Header
        title={t("pages.dashboard.title") || "Dashboard"}
        subtitle={backtest?.name || "Backtest"}
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
        libraries={libraries}
        accounts={accounts}
      />

      {/* KPI Grid */}
      <section>
        <DashboardKPIGrid metrics={metrics} loading={loading} currency={currency} />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 items-start">
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
          <DailyPnLChart dailyPnL={metrics.dailyPnL} currency={currency} loading={loading} />
          <WinLossDistribution metrics={metrics} loading={loading} />
        </div>
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
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
        />
      </section>

      {/* 2 Notes */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <NoteCard label={t("backtests.strategyPlan") || "Strategy Plan"} value={notes.plan} onChange={handleNotePlan} />
        <NoteCard label={t("backtests.backtestDescription") || "Description"} value={notes.description} onChange={handleNoteDesc} />
      </section>

      {/* Empty state hint */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-16 w-16 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
            <TrendingUp className="h-8 w-8 text-accent/60" />
          </div>
          <h3 className="text-[15px] font-semibold text-foreground mb-1">
            {t("pages.dashboard.emptyTitle") || "No trades yet"}
          </h3>
          <p className="text-[13px] text-muted-foreground mb-4 max-w-xs">
            Add trades to see your backtest analytics
          </p>
          {onAddTrade && (
            <Button size="sm" onClick={onAddTrade}>
              <Plus className="h-3.5 w-3.5" />
              {t("pages.dashboard.addFirstTrade") || "Add Trade"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
