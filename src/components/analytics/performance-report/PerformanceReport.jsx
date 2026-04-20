/**
 * Performance Report - Premium Trading Report Component
 * Haunted-style premium fintech design
 */

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { calcPerformanceReport } from "@/lib/analytics/performanceReport.js";
import { fadeUp } from "@/components/common/motion";
import { 
  FileText, Download, Clock, RefreshCw, ChevronDown, 
  TrendingUp, TrendingDown, Plus
} from "lucide-react";
import Button from "@/components/ui/Button.jsx";

import KpiGrid from "./KpiGrid.jsx";
import PremiumEquityChart from "./PremiumEquityChart.jsx";
import DailyPnlChart from "./DailyPnlChart.jsx";
import LongShortComparison from "./LongShortComparison.jsx";
import BreakdownTabs from "./BreakdownTabs.jsx";
import DisciplineCard from "./DisciplineCard.jsx";
import InsightsPanel from "./InsightsPanel.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PerformanceReport({ 
  trades, 
  accounts, 
  libraries, 
  reduceMotion,
  accountId = "all",
  baseEquity = 0,
  equityCorrection = 0,
  currency = "$",
  onTradeClick,
}) {
  const { t } = useI18n();
  const [chartMode, setChartMode] = useState("equity"); // "equity" | "daily"
  
  // Calculate performance report data
  const reportData = useMemo(() => {
    return calcPerformanceReport(trades, accounts, libraries, {
      accountId,
      startingEquity: baseEquity,
      equityCorrection,
    });
  }, [trades, accounts, libraries, accountId, baseEquity, equityCorrection]);

  // Last updated timestamp
  const lastUpdated = useMemo(() => {
    return new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [trades]);

  // Empty state
  if (!trades || trades.length === 0) {
    return (
      <motion.div {...fadeUp(reduceMotion, 0.1)}>
        <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/60 p-12 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-xl bg-accent/10 flex items-center justify-center">
            <FileText className="h-8 w-8 text-accent/50" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {t("pages.performanceReport.emptyTitle") || "No trades yet"}
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            {t("pages.performanceReport.emptySubtitle") || "Add your first trade to generate your Performance Report"}
          </p>
          <Button variant="default">
            <Plus className="h-4 w-4 mr-2" />
            {t("pages.performanceReport.addTrade") || "Add Trade"}
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────
          HEADER SECTION
          ───────────────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(reduceMotion, 0.05)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {t("pages.performanceReport.title") || "Performance Report"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("pages.performanceReport.subtitle") || "Summary of your trading performance for selected period"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{t("pages.performanceReport.lastUpdated") || "Updated"}: {lastUpdated}</span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="rounded-xl"
              disabled
            >
              <Download className="h-4 w-4 mr-1.5" />
              {t("pages.performanceReport.export") || "Export"}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* ─────────────────────────────────────────────────────────────────────
          KPI GRID - Main metrics
          ───────────────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(reduceMotion, 0.10)}>
        <KpiGrid 
          kpis={reportData.kpis} 
          currency={currency} 
          reduceMotion={reduceMotion}
          t={t}
          accountId={accountId}
        />
      </motion.div>

      {/* ─────────────────────────────────────────────────────────────────────
          CHARTS SECTION - 2 column layout
          ───────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        {/* Main Chart (Left) */}
        <motion.div {...fadeUp(reduceMotion, 0.15)}>
          <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/60 p-6 h-full">
            {/* Chart Toggle */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                {chartMode === "equity" ? (
                  <TrendingUp className="h-4 w-4 text-accent" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-accent" />
                )}
                {chartMode === "equity" 
                  ? (t("pages.performanceReport.charts.equity") || "Equity Curve")
                  : (t("pages.performanceReport.charts.dailyPnl") || "Daily PnL")
                }
              </h3>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40">
                <button
                  type="button"
                  onClick={() => setChartMode("equity")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                    chartMode === "equity" 
                      ? "bg-card shadow text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("pages.performanceReport.charts.equityTab") || "Equity"}
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("daily")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                    chartMode === "daily" 
                      ? "bg-card shadow text-foreground" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("pages.performanceReport.charts.dailyTab") || "Daily"}
                </button>
              </div>
            </div>

            {/* Chart Content */}
            <AnimatePresence mode="wait">
              {chartMode === "equity" ? (
                <motion.div
                  key="equity"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <PremiumEquityChart 
                    data={reportData.charts.equity}
                    currency={currency}
                    baseEquity={baseEquity}
                    netPnl={reportData.kpis.netPnl}
                    profitPct={reportData.kpis.profitPct}
                    reduceMotion={reduceMotion}
                    t={t}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="daily"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <DailyPnlChart 
                    data={reportData.charts.daily}
                    currency={currency}
                    reduceMotion={reduceMotion}
                    t={t}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Right Column - Compact charts + Insights */}
        <div className="space-y-4">
          {/* Win/Loss Distribution + Long/Short */}
          <motion.div {...fadeUp(reduceMotion, 0.18)}>
            <LongShortComparison 
              data={reportData.charts.longShort}
              distribution={reportData.charts.distribution}
              currency={currency}
              reduceMotion={reduceMotion}
              t={t}
            />
          </motion.div>

          {/* Smart Insights */}
          <motion.div {...fadeUp(reduceMotion, 0.20)}>
            <InsightsPanel 
              insights={reportData.insights}
              reduceMotion={reduceMotion}
              t={t}
            />
          </motion.div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          DISCIPLINE & CONSISTENCY SECTION
          ───────────────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(reduceMotion, 0.22)}>
        <DisciplineCard 
          discipline={reportData.discipline}
          kpis={reportData.kpis}
          reduceMotion={reduceMotion}
          t={t}
        />
      </motion.div>

      {/* ─────────────────────────────────────────────────────────────────────
          BREAKDOWN TABS
          ───────────────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(reduceMotion, 0.25)}>
        <BreakdownTabs 
          breakdowns={reportData.breakdowns}
          currency={currency}
          reduceMotion={reduceMotion}
          onTradeClick={onTradeClick}
          t={t}
        />
      </motion.div>
    </div>
  );
}
