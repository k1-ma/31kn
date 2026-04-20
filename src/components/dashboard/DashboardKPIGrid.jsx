/**
 * DashboardKPIGrid - Premium KPI cards grid for the dashboard
 */

import React from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Target,
  Activity,
  Calendar,
  Award,
  BarChart3,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Snowflake,
  Trophy,
  AlertTriangle,
} from "lucide-react";
import { fmtMoney, fmtPct, fmtPnl } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";

// Placeholder value for infinity (matches calcDashboardMetrics.js)
const INFINITY_PLACEHOLDER = 999;

// Premium KPI Card Component
function KPICard({ title, value, delta, trend, icon: Icon, variant = "default", tooltip, loading }) {
  if (loading) {
    return <Skeleton className="h-[92px] rounded-xl" />;
  }

  const variants = {
    default: {
      border: "border-border/30 dark:border-white/[0.06]",
      topBar: "from-accent/40 to-accent/10",
      iconBg: "bg-accent/10",
      iconColor: "text-accent",
      hoverBorder: "hover:border-accent/15",
      hoverGlow: "hover:shadow-md",
    },
    success: {
      border: "border-emerald-500/10",
      topBar: "from-emerald-500/50 to-emerald-500/10",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      hoverBorder: "hover:border-emerald-500/20",
      hoverGlow: "hover:shadow-md",
    },
    danger: {
      border: "border-rose-500/10",
      topBar: "from-rose-500/50 to-rose-500/10",
      iconBg: "bg-rose-500/10",
      iconColor: "text-rose-600 dark:text-rose-400",
      hoverBorder: "hover:border-rose-500/20",
      hoverGlow: "hover:shadow-md",
    },
    warning: {
      border: "border-amber-500/10",
      topBar: "from-amber-500/50 to-amber-500/10",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
      hoverBorder: "hover:border-amber-500/20",
      hoverGlow: "hover:shadow-md",
    },
    purple: {
      border: "border-purple-500/10",
      topBar: "from-purple-500/50 to-purple-500/10",
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-600 dark:text-purple-400",
      hoverBorder: "hover:border-purple-500/20",
      hoverGlow: "hover:shadow-md",
    },
  };

  const v = variants[variant] || variants.default;
  const isPositive = trend === "up";
  const isNegative = trend === "down";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-xl border ${v.border} bg-card/60 dark:bg-[#131722]/60 overflow-hidden transition-all duration-200 ${v.hoverBorder} ${v.hoverGlow}`}
      title={tooltip}
    >
      {/* Top accent bar */}
      <div className={`h-[2px] bg-gradient-to-r ${v.topBar}`} />
      
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">
            {title}
          </span>
          {Icon && (
            <div className={`h-7 w-7 rounded-lg ${v.iconBg} flex items-center justify-center shrink-0`}>
              <Icon className={`h-3.5 w-3.5 ${v.iconColor}`} />
            </div>
          )}
        </div>

        <div className="text-[22px] font-bold tracking-tight tabular-nums text-foreground leading-tight">
          {value}
        </div>

        {delta !== undefined && (
          <div className="mt-1.5 flex items-center gap-1">
            {isPositive && <ArrowUpRight className="h-3 w-3 text-emerald-400" />}
            {isNegative && <ArrowDownRight className="h-3 w-3 text-rose-400" />}
            <span className={`text-[11px] font-medium ${isPositive ? "text-emerald-400" : isNegative ? "text-rose-400" : "text-muted-foreground"}`}>
              {delta}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function DashboardKPIGrid({ metrics, currency = "$", loading = false, pnlDisplayMode = "money" }) {
  const { t } = useI18n();

  // Determine variants based on values - but use default for empty state
  const isEmpty = !metrics || metrics.totalTrades === 0;
  const getPnlVariant = (pnl) => isEmpty ? "default" : (pnl >= 0 ? "success" : "danger");
  const getWinRateVariant = (wr) => isEmpty ? "default" : (wr >= 50 ? "success" : wr >= 40 ? "warning" : "danger");
  const getDrawdownVariant = (dd) => isEmpty ? "default" : (dd > -10 ? "success" : dd > -20 ? "warning" : "danger");
  const getProfitFactorVariant = (pf) => isEmpty ? "default" : (pf >= 1.5 ? "success" : pf >= 1 ? "warning" : "danger");

  // Safe metric access with defaults
  const m = metrics || {};
  const safeMetric = (val, defaultVal = 0) => Number.isFinite(val) ? val : defaultVal;
  const se = m.startingEquity || 0;
  const fmt = (v) => fmtPnl(v, currency, pnlDisplayMode, se);

  const kpis = [
    {
      title: pnlDisplayMode === "percent" ? "Net P&L %" : "Net P&L",
      value: loading ? "—" : fmt(safeMetric(m.netPnl)),
      icon: DollarSign,
      variant: loading ? "default" : getPnlVariant(safeMetric(m.netPnl)),
      trend: isEmpty ? undefined : (safeMetric(m.netPnl) >= 0 ? "up" : "down"),
      tooltip: "Total realized profit/loss",
    },
    {
      title: "Win Rate",
      value: loading ? "—" : (isEmpty ? "0%" : fmtPct(safeMetric(m.winRate))),
      icon: Percent,
      variant: loading ? "default" : getWinRateVariant(safeMetric(m.winRate)),
      tooltip: "Percentage of winning trades",
    },
    {
      title: "Profit Factor",
      value: loading ? "—" : (isEmpty ? "—" : (safeMetric(m.profitFactor) >= INFINITY_PLACEHOLDER ? "∞" : safeMetric(m.profitFactor).toFixed(2))),
      icon: TrendingUp,
      variant: loading ? "default" : getProfitFactorVariant(safeMetric(m.profitFactor)),
      tooltip: "Gross profit / Gross loss",
    },
    {
      title: "Avg RR",
      value: loading ? "—" : (isEmpty ? "—" : `${safeMetric(m.avgRR).toFixed(2)}R`),
      icon: Target,
      variant: "default",
      tooltip: "Average risk:reward ratio",
    },
    {
      title: "Expectancy",
      value: loading ? "—" : fmt(safeMetric(m.expectancy)),
      icon: Zap,
      variant: loading ? "default" : getPnlVariant(safeMetric(m.expectancy)),
      tooltip: "Expected profit per trade",
    },
    {
      title: "Max Drawdown",
      value: loading ? "—" : (isEmpty ? "—" : `${safeMetric(m.maxDrawdownPct).toFixed(1)}%`),
      icon: TrendingDown,
      variant: loading ? "default" : getDrawdownVariant(safeMetric(m.maxDrawdownPct)),
      tooltip: "Maximum peak-to-trough decline",
    },
    {
      title: "Total Trades",
      value: loading ? "—" : safeMetric(m.totalTrades),
      icon: BarChart3,
      variant: "default",
      tooltip: "Number of completed trades",
    },
    {
      title: "Avg Trade",
      value: loading ? "—" : fmt(safeMetric(m.avgTrade)),
      icon: Activity,
      variant: loading ? "default" : getPnlVariant(safeMetric(m.avgTrade)),
      tooltip: "Average P&L per trade",
    },
    {
      title: "Trading Days",
      value: loading ? "—" : safeMetric(m.tradingDays),
      icon: Calendar,
      variant: "default",
      tooltip: "Days with at least one trade",
    },
    {
      title: "Avg Win",
      value: loading ? "—" : (isEmpty ? "—" : fmt(safeMetric(m.avgWin))),
      icon: Trophy,
      variant: isEmpty ? "default" : "success",
      tooltip: "Average profit on winning trades",
    },
    {
      title: "Avg Loss",
      value: loading ? "—" : (isEmpty ? "—" : `-${fmt(safeMetric(m.avgLoss))}`),
      icon: AlertTriangle,
      variant: isEmpty ? "default" : "danger",
      tooltip: "Average loss on losing trades",
    },
    {
      title: "Payoff Ratio",
      value: loading ? "—" : (isEmpty ? "—" : (safeMetric(m.payoffRatio) >= INFINITY_PLACEHOLDER ? "∞" : safeMetric(m.payoffRatio).toFixed(2))),
      icon: Award,
      variant: loading ? "default" : (isEmpty ? "default" : (safeMetric(m.payoffRatio) >= 1.5 ? "success" : "warning")),
      tooltip: "Avg Win / Avg Loss",
    },
    {
      title: "Green Days",
      value: loading ? "—" : `${safeMetric(m.greenDays)}`,
      delta: loading ? undefined : `/ ${safeMetric(m.greenDays) + safeMetric(m.redDays)} total`,
      icon: Flame,
      variant: isEmpty ? "default" : "success",
      tooltip: "Days ending with profit",
    },
    {
      title: "Red Days",
      value: loading ? "—" : `${safeMetric(m.redDays)}`,
      delta: loading ? undefined : `/ ${safeMetric(m.greenDays) + safeMetric(m.redDays)} total`,
      icon: Snowflake,
      variant: isEmpty ? "default" : "danger",
      tooltip: "Days ending with loss",
    },
    {
      title: "Best Day",
      value: loading ? "—" : (isEmpty ? "—" : fmt(m.bestDay?.pnl || 0)),
      delta: loading ? undefined : (isEmpty ? "" : (m.bestDay?.date || "")),
      icon: TrendingUp,
      variant: isEmpty ? "default" : "success",
      tooltip: "Highest single-day profit",
    },
    {
      title: "Worst Day",
      value: loading ? "—" : (isEmpty ? "—" : fmt(m.worstDay?.pnl || 0)),
      delta: loading ? undefined : (isEmpty ? "" : (m.worstDay?.date || "")),
      icon: TrendingDown,
      variant: isEmpty ? "default" : (safeMetric(m.worstDay?.pnl) >= 0 ? "success" : "danger"),
      tooltip: "Lowest single-day performance",
    },
    {
      title: "Win Streak",
      value: loading ? "—" : safeMetric(m.maxWinStreak),
      icon: Flame,
      variant: isEmpty ? "default" : (safeMetric(m.maxWinStreak) >= 5 ? "success" : "default"),
      tooltip: "Longest consecutive wins",
    },
    {
      title: "Loss Streak",
      value: loading ? "—" : safeMetric(m.maxLossStreak),
      icon: Snowflake,
      variant: isEmpty ? "default" : (safeMetric(m.maxLossStreak) >= 4 ? "danger" : "default"),
      tooltip: "Longest consecutive losses",
    },
  ];

  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3">
      {kpis.map((kpi, idx) => (
        <KPICard
          key={kpi.title}
          {...kpi}
          loading={loading}
        />
      ))}
    </div>
  );
}
