/**
 * KpiGrid - Premium KPI cards grid for Performance Report
 * Haunted-style design with subtle glows and clean typography
 */

import React from "react";
import { motion } from "framer-motion";
import { 
  DollarSign, Percent, Target, Activity, Award, TrendingDown, 
  Calendar, Sun, Cloud, Trophy, Skull, Zap, BarChart3, 
  ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { fmtMoney, fmtPct, fmtRR } from "@/lib/utils";
import HelpTooltip from "@/components/ui/HelpTooltip.jsx";

// Single KPI Card — memoized to prevent re-renders when sibling cards change
const KpiCard = React.memo(function KpiCard({ 
  title, 
  value, 
  subtext, 
  icon: Icon, 
  trend, 
  trendValue,
  variant = "default",
  tooltip,
  delay = 0,
  reduceMotion,
}) {
  const variants = {
    default: {
      bg: "from-card/80 to-card/40",
      border: "border-accent/10",
      glow: "",
      iconBg: "bg-accent/10",
      iconColor: "text-accent",
    },
    positive: {
      bg: "from-emerald-500/8 to-card/40",
      border: "border-emerald-500/20",
      glow: "hover:shadow-[0_0_30px_rgba(16,185,129,0.08)]",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-500",
    },
    negative: {
      bg: "from-rose-500/8 to-card/40",
      border: "border-rose-500/20",
      glow: "hover:shadow-[0_0_30px_rgba(244,63,94,0.08)]",
      iconBg: "bg-rose-500/15",
      iconColor: "text-rose-500",
    },
    warning: {
      bg: "from-amber-500/8 to-card/40",
      border: "border-amber-500/20",
      glow: "hover:shadow-[0_0_30px_rgba(245,158,11,0.08)]",
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-500",
    },
    accent: {
      bg: "from-blue-500/8 to-card/40",
      border: "border-blue-500/20",
      glow: "hover:shadow-[0_0_30px_rgba(59,130,246,0.08)]",
      iconBg: "bg-blue-500/15",
      iconColor: "text-blue-500",
    },
  };

  const style = variants[variant] || variants.default;

  const textColors = {
    default: "text-foreground",
    positive: "text-emerald-500",
    negative: "text-rose-500",
    warning: "text-amber-500",
    accent: "text-blue-500",
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={`
        relative overflow-hidden rounded-xl border ${style.border} 
        bg-gradient-to-br ${style.bg} 
        p-4 transition-all duration-300 
        hover:border-accent/25 ${style.glow}
        group
      `}
    >
      {/* Background glow effect */}
      <div className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-gradient-to-br from-accent/10 to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {Icon && (
              <div className={`h-7 w-7 rounded-lg ${style.iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-3.5 w-3.5 ${style.iconColor}`} />
              </div>
            )}
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </span>
          </div>
          {tooltip && (
            <HelpTooltip 
              content={tooltip}
              ariaLabel={`Подсказка: ${title}`}
            />
          )}
        </div>

        {/* Value */}
        <div className={`mt-3 text-2xl font-bold tracking-tight tabular-nums ${textColors[variant] || textColors.default}`}>
          {value}
        </div>

        {/* Subtext with trend */}
        {(subtext || trend) && (
          <div className="mt-1 flex items-center gap-2">
            {subtext && (
              <span className="text-[11px] text-muted-foreground">{subtext}</span>
            )}
            {trend && (
              <span className={`flex items-center gap-0.5 text-[10px] font-medium ${
                trend === "up" ? "text-emerald-500" : trend === "down" ? "text-rose-500" : "text-muted-foreground"
              }`}>
                {trend === "up" ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : trend === "down" ? (
                  <ArrowDownRight className="h-3 w-3" />
                ) : null}
                {trendValue}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default function KpiGrid({ kpis, currency, reduceMotion, t, accountId = "all" }) {
  // Determine variants based on values
  const getNetPnlVariant = () => kpis.netPnl >= 0 ? "positive" : "negative";
  const getProfitPctVariant = () => kpis.profitPct >= 0 ? "positive" : "negative";
  const getWinRateVariant = () => kpis.winRate >= 50 ? "positive" : kpis.winRate >= 40 ? "warning" : "negative";
  const getAvgRRVariant = () => kpis.avgRR >= 1 ? "positive" : kpis.avgRR >= 0 ? "accent" : "negative";
  const getProfitFactorVariant = () => kpis.profitFactor >= 1.5 ? "positive" : kpis.profitFactor >= 1 ? "accent" : "negative";
  const getExpectancyVariant = () => kpis.expectancy >= 0 ? "positive" : "negative";

  // Format TP/BE/SL display string
  const tpBeSlValue = `${kpis.wins ?? 0} / ${kpis.breakEvens ?? 0} / ${kpis.losses ?? 0}`;

  const kpiCards = [
    // Row 1 - Primary metrics
    {
      title: t("pages.performanceReport.kpi.netPnl") || "Net PnL",
      value: fmtMoney(kpis.netPnl, currency),
      icon: DollarSign,
      variant: getNetPnlVariant(),
      tooltip: t("pages.performanceReport.kpi.netPnlTooltip") || "Total profit/loss for the period",
    },
    {
      title: t("pages.performanceReport.kpi.profitPct") || "Profit %",
      value: fmtPct(kpis.profitPct),
      icon: Percent,
      variant: getProfitPctVariant(),
      tooltip: accountId === "all"
        ? (t("pages.performanceReport.kpi.profitPctTooltipAll") || "Sum of trade returns (%) across accounts")
        : (t("pages.performanceReport.kpi.profitPctTooltip") || "Return on starting equity"),
    },
    {
      title: t("pages.performanceReport.kpi.winRate") || "Win Rate",
      value: fmtPct(kpis.winRate),
      icon: Target,
      variant: getWinRateVariant(),
      tooltip: t("pages.performanceReport.kpi.winRateTooltip") || "Percentage of winning trades",
    },
    {
      title: t("pages.performanceReport.kpi.totalTrades") || "Total Trades",
      value: kpis.totalTrades,
      icon: Activity,
      variant: "accent",
      tooltip: t("pages.performanceReport.kpi.totalTradesTooltip") || "Number of trades in period",
    },
    
    // Row 2 - Risk/Reward metrics
    {
      title: t("pages.performanceReport.kpi.avgRR") || "Avg RR",
      value: fmtRR(kpis.avgRR),
      icon: Award,
      variant: getAvgRRVariant(),
      tooltip: t("pages.performanceReport.kpi.avgRRTooltip") || "Average risk-reward ratio per trade",
    },
    {
      title: t("pages.performanceReport.kpi.maxDrawdown") || "Max Drawdown",
      value: fmtMoney(kpis.maxDrawdown, currency),
      icon: TrendingDown,
      variant: kpis.maxDrawdown < 0 ? "negative" : "default",
      tooltip: t("pages.performanceReport.kpi.maxDrawdownTooltip") || "Largest peak-to-trough decline",
    },
    {
      title: t("pages.performanceReport.kpi.avgTrade") || "Avg Trade",
      value: fmtMoney(kpis.avgTrade, currency),
      icon: BarChart3,
      variant: kpis.avgTrade >= 0 ? "positive" : "negative",
      tooltip: t("pages.performanceReport.kpi.avgTradeTooltip") || "Average PnL per trade",
    },
    {
      title: t("pages.performanceReport.kpi.tradingDays") || "Trading Days",
      value: kpis.tradingDays,
      icon: Calendar,
      variant: "default",
      tooltip: t("pages.performanceReport.kpi.tradingDaysTooltip") || "Number of days with trades",
    },

    // Row 3 - Advanced metrics
    {
      title: t("pages.performanceReport.kpi.profitFactor") || "Profit Factor",
      value: kpis.profitFactor >= 999 ? "∞" : kpis.profitFactor.toFixed(2),
      icon: Zap,
      variant: getProfitFactorVariant(),
      tooltip: t("pages.performanceReport.kpi.profitFactorTooltip") || "Gross profit / Gross loss",
    },
    {
      title: t("pages.performanceReport.kpi.tpBeSl") || "TP / BE / SL",
      value: tpBeSlValue,
      icon: Target,
      variant: "accent",
      tooltip: t("pages.performanceReport.kpi.tpBeSlTooltip") || "Take Profits / Break-Evens / Stop Losses",
    },
    {
      title: t("pages.performanceReport.kpi.avgWin") || "Avg Win",
      value: fmtMoney(kpis.avgWin, currency),
      icon: Trophy,
      variant: "positive",
      tooltip: t("pages.performanceReport.kpi.avgWinTooltip") || "Average winning trade",
    },
    {
      title: t("pages.performanceReport.kpi.avgLoss") || "Avg Loss",
      value: `-${fmtMoney(kpis.avgLoss, currency)}`,
      icon: Skull,
      variant: "negative",
      tooltip: t("pages.performanceReport.kpi.avgLossTooltip") || "Average losing trade",
    },

    // Row 4 - Additional insights
    {
      title: t("pages.performanceReport.kpi.payoffRatio") || "Payoff Ratio",
      value: kpis.payoffRatio >= 999 ? "∞" : kpis.payoffRatio.toFixed(2),
      icon: Award,
      variant: kpis.payoffRatio >= 1 ? "positive" : "negative",
      tooltip: t("pages.performanceReport.kpi.payoffRatioTooltip") || "Avg Win / Avg Loss",
    },
    {
      title: t("pages.performanceReport.kpi.greenDays") || "Green Days",
      value: kpis.greenDays,
      subtext: `/ ${kpis.greenDays + kpis.redDays} ${t("common.days") || "days"}`,
      icon: Sun,
      variant: "positive",
      tooltip: t("pages.performanceReport.kpi.greenDaysTooltip") || "Profitable trading days",
    },
    {
      title: t("pages.performanceReport.kpi.bestDay") || "Best Day",
      value: fmtMoney(kpis.bestDay?.pnl || 0, currency),
      subtext: kpis.bestDay?.date || "—",
      icon: Trophy,
      variant: "positive",
      tooltip: t("pages.performanceReport.kpi.bestDayTooltip") || "Best single trading day",
    },
    {
      title: t("pages.performanceReport.kpi.worstDay") || "Worst Day",
      value: fmtMoney(kpis.worstDay?.pnl || 0, currency),
      subtext: kpis.worstDay?.date || "—",
      icon: Cloud,
      variant: (kpis.worstDay?.pnl || 0) >= 0 ? "positive" : "negative",
      tooltip: t("pages.performanceReport.kpi.worstDayTooltip") || "Worst single trading day",
    },

    // Row 5 - Streaks
    {
      title: t("pages.performanceReport.kpi.maxWinStreak") || "Max Win Streak",
      value: kpis.maxWinStreak,
      icon: Zap,
      variant: kpis.maxWinStreak >= 5 ? "positive" : "default",
      tooltip: t("pages.performanceReport.kpi.maxWinStreakTooltip") || "Longest consecutive wins",
    },
    {
      title: t("pages.performanceReport.kpi.maxLossStreak") || "Max Loss Streak",
      value: kpis.maxLossStreak,
      icon: TrendingDown,
      variant: kpis.maxLossStreak >= 5 ? "negative" : "default",
      tooltip: t("pages.performanceReport.kpi.maxLossStreakTooltip") || "Longest consecutive losses",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {kpiCards.map((card, idx) => (
        <KpiCard
          key={card.title}
          {...card}
          delay={reduceMotion ? 0 : idx * 0.02}
          reduceMotion={reduceMotion}
        />
      ))}
    </div>
  );
}
