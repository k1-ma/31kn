/**
 * DashboardConsistency - Consistency & Discipline card
 */

import React, { useMemo, useId } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import {
  Shield,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Flame,
  Snowflake,
  Gauge,
  Crosshair,
  ArrowDownRight,
  Trophy,
  Skull,
} from "lucide-react";
import { fmtPct, fmtMoney, fmtPnl } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";

// Consistency Score Ring
function ConsistencyRing({ score, label, size = 90 }) {
  const filterId = useId();
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const remaining = circumference - progress;

  const getColor = (s) => {
    if (s >= 80) return { stroke: "rgb(16, 185, 129)", bg: "rgba(16, 185, 129, 0.15)" };
    if (s >= 60) return { stroke: "rgb(251, 191, 36)", bg: "rgba(251, 191, 36, 0.15)" };
    return { stroke: "rgb(244, 63, 94)", bg: "rgba(244, 63, 94, 0.15)" };
  };

  const colors = getColor(score);

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(255, 255, 255)"
          strokeOpacity={0.04}
          strokeWidth={7}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${remaining}`}
          filter={`url(#${filterId})`}
          style={{
            transition: "stroke-dasharray 0.5s ease",
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: colors.stroke }}>
          {score}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
    </div>
  );
}

// Stat row
function StatRow({ icon: Icon, label, value, variant = "default", warning = false }) {
  const variants = {
    default: "text-foreground",
    success: "text-emerald-400",
    danger: "text-rose-400",
    warning: "text-amber-400",
  };

  return (
    <div className={`flex items-center justify-between py-2 rounded-lg transition-colors duration-150 ${warning ? "bg-amber-500/8 -mx-3 px-3 border border-amber-500/10" : "hover:bg-white/[0.02] -mx-2 px-2"}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${warning ? "text-amber-400" : "text-dim"}`} />
        <span className="text-[13px] text-muted-foreground">{label}</span>
      </div>
      <span className={`text-[13px] font-semibold tabular-nums ${variants[variant]}`}>{value}</span>
    </div>
  );
}

export default function DashboardConsistency({ metrics, loading = false, currency = "$", pnlDisplayMode = "money" }) {
  const { t } = useI18n();

  // Calculate additional consistency metrics - handle empty state
  const consistencyData = useMemo(() => {
    // For empty state, return neutral values
    if (!metrics || metrics.totalTrades === 0) {
      return {
        avgTradesPerDay: 0,
        greenDaysPct: 0,
        overtradingWarning: false,
        planAdherence: 0,
      };
    }

    const avgTradesPerDay = metrics.tradingDays > 0 ? metrics.totalTrades / metrics.tradingDays : 0;
    const greenDaysPct = metrics.tradingDays > 0 ? (metrics.greenDays / metrics.tradingDays) * 100 : 0;

    // Overtrading warning (>5 trades per day on average)
    const overtradingWarning = avgTradesPerDay > 5;

    // Plan adherence (simplified - based on RR and win rate consistency)
    // In a real app, this would come from user's trading plan data
    const planAdherence = metrics.avgRR >= 1 && metrics.winRate >= 40 ? 85 : metrics.avgRR >= 0.5 ? 60 : 40;

    return {
      avgTradesPerDay,
      greenDaysPct,
      overtradingWarning,
      planAdherence,
    };
  }, [metrics]);

  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent" />
            Consistency & Discipline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  // For empty state, use neutral default metrics
  const displayMetrics = metrics || {
    consistencyScore: 0,
    consistencyLabel: "—",
    tradingDays: 0,
    greenDays: 0,
    redDays: 0,
    maxLossStreak: 0,
    totalTrades: 0,
    avgRR: 0,
    winRate: 0,
  };

  // Check if this is an empty state
  const isEmpty = !metrics || metrics.totalTrades === 0;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
          <Shield className="h-4 w-4 text-accent" />
          Consistency & Discipline
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
          {/* Consistency Score Ring */}
          <div className="shrink-0">
            <ConsistencyRing score={displayMetrics.consistencyScore} label={displayMetrics.consistencyLabel} />
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-1">
            <StatRow
              icon={Calendar}
              label="Trading Days"
              value={displayMetrics.tradingDays}
            />
            <StatRow
              icon={Flame}
              label="Green Days"
              value={isEmpty ? "0 (0%)" : `${displayMetrics.greenDays} (${fmtPct(consistencyData.greenDaysPct)})`}
              variant={isEmpty ? "default" : "success"}
            />
            <StatRow
              icon={Snowflake}
              label="Red Days"
              value={displayMetrics.redDays}
              variant={isEmpty ? "default" : "danger"}
            />
            <StatRow
              icon={Activity}
              label="Avg Trades/Day"
              value={consistencyData.avgTradesPerDay.toFixed(1)}
              warning={consistencyData.overtradingWarning}
            />
            <StatRow
              icon={CheckCircle2}
              label="Plan Adherence"
              value={isEmpty ? "—" : `${consistencyData.planAdherence}%`}
              variant={isEmpty ? "default" : (consistencyData.planAdherence >= 80 ? "success" : consistencyData.planAdherence >= 60 ? "warning" : "danger")}
            />
          </div>
        </div>

        {/* Warnings - only show when there's actual data and warning conditions are met */}
        {!isEmpty && consistencyData.overtradingWarning && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-amber-400">Overtrading Warning</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                You're averaging {consistencyData.avgTradesPerDay.toFixed(1)} trades per day. Consider setting a daily trade limit.
              </div>
            </div>
          </motion.div>
        )}

        {!isEmpty && displayMetrics.maxLossStreak >= 4 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-rose-400">Tilt Prevention</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Your max loss streak of {displayMetrics.maxLossStreak} suggests adding a cooldown rule after 3 consecutive losses.
              </div>
            </div>
          </motion.div>
        )}

        {/* Risk Metrics — fills the gap */}
        <div className="mt-4 pt-4 border-t border-border/40 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Risk Metrics
          </div>
          <StatRow
            icon={Gauge}
            label="Profit Factor"
            value={isEmpty ? "—" : (displayMetrics.profitFactor >= 999 ? "∞" : (displayMetrics.profitFactor?.toFixed(2) || "—"))}
            variant={isEmpty ? "default" : (displayMetrics.profitFactor >= 1.5 ? "success" : displayMetrics.profitFactor >= 1 ? "warning" : "danger")}
          />
          <StatRow
            icon={Crosshair}
            label="Avg RR"
            value={isEmpty ? "—" : `${displayMetrics.avgRR?.toFixed(2) || "0"}R`}
            variant={isEmpty ? "default" : (displayMetrics.avgRR >= 1.5 ? "success" : displayMetrics.avgRR >= 1 ? "warning" : "danger")}
          />
          <StatRow
            icon={ArrowDownRight}
            label="Max Drawdown"
            value={isEmpty ? "—" : fmtPnl(displayMetrics.maxDrawdown || 0, currency, pnlDisplayMode, metrics?.startingEquity || 0)}
            variant={isEmpty ? "default" : "danger"}
          />
          <StatRow
            icon={Trophy}
            label="Best Streak"
            value={isEmpty ? "—" : `${displayMetrics.maxWinStreak || 0}W`}
            variant={isEmpty ? "default" : "success"}
          />
          <StatRow
            icon={Skull}
            label="Worst Streak"
            value={isEmpty ? "—" : `${displayMetrics.maxLossStreak || 0}L`}
            variant={isEmpty ? "default" : (displayMetrics.maxLossStreak >= 4 ? "danger" : "default")}
          />
        </div>
      </CardContent>
    </Card>
  );
}
