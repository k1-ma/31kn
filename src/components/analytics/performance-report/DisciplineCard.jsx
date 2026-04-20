/**
 * DisciplineCard - Consistency & Discipline section for Performance Report
 * Shows consistency score, trading discipline metrics, and warnings
 */

import React, { useId } from "react";
import { motion } from "framer-motion";
import { 
  Shield, AlertTriangle, CheckCircle, TrendingUp, Activity,
  Calendar, Target, Zap, Clock
} from "lucide-react";

// Circular progress component for consistency score
function ConsistencyGauge({ score, label }) {
  const filterId = useId();
  const getColor = (s) => {
    if (s >= 80) return { stroke: "rgb(16, 185, 129)", text: "text-emerald-500" };
    if (s >= 60) return { stroke: "rgb(59, 130, 246)", text: "text-blue-500" };
    return { stroke: "rgb(245, 158, 11)", text: "text-amber-500" };
  };

  const color = getColor(score);
  const size = 110;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
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
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress circle with glow */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          filter={`url(#${filterId})`}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold tabular-nums ${color.text}`}>{score}</span>
        <span className={`text-[10px] uppercase tracking-widest mt-0.5 ${color.text} opacity-80`}>
          {label}
        </span>
      </div>
    </div>
  );
}

// Metric mini card
function DisciplineMetric({ icon: Icon, label, value, subtext, status }) {
  const statusStyles = {
    good: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-500",
    danger: "bg-rose-500/10 border-rose-500/20 text-rose-500",
    neutral: "bg-muted/30 border-border/50 text-foreground",
  };

  const style = statusStyles[status] || statusStyles.neutral;

  return (
    <div className={`rounded-xl border p-3 ${style} transition-all duration-200`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {subtext && <div className="text-[10px] text-muted-foreground mt-0.5">{subtext}</div>}
    </div>
  );
}

// Warning badge
function WarningBadge({ type, active, t }) {
  if (!active) return null;

  const warnings = {
    overtrading: {
      icon: AlertTriangle,
      title: t("pages.performanceReport.discipline.overtradingTitle") || "Overtrading Detected",
      description: t("pages.performanceReport.discipline.overtradingDesc") || "Some days have excessive trades with losses",
      color: "amber",
    },
    tilt: {
      icon: Zap,
      title: t("pages.performanceReport.discipline.tiltTitle") || "Tilt Warning",
      description: t("pages.performanceReport.discipline.tiltDesc") || "Pattern detected: rapid trades after big losses",
      color: "rose",
    },
  };

  const warning = warnings[type];
  if (!warning) return null;

  const Icon = warning.icon;
  const colorStyles = {
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    rose: "bg-rose-500/10 border-rose-500/30 text-rose-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-3 p-3 rounded-xl border ${colorStyles[warning.color]}`}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div>
        <div className="text-sm font-semibold">{warning.title}</div>
        <div className="text-xs opacity-80 mt-0.5">{warning.description}</div>
      </div>
    </motion.div>
  );
}

export default function DisciplineCard({ discipline, kpis, reduceMotion, t }) {
  const { 
    consistencyScore = 0, 
    consistencyLabel = "—",
    avgTradesPerDay = 0,
    planAdherence,
    overtradingWarning = false,
    tiltWarning = false,
  } = discipline;

  const greenRatio = (kpis.greenDays + kpis.redDays) > 0 
    ? (kpis.greenDays / (kpis.greenDays + kpis.redDays)) * 100 
    : 0;

  return (
    <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/60 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
          <Shield className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t("pages.performanceReport.discipline.title") || "Consistency & Discipline"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("pages.performanceReport.discipline.subtitle") || "Track your trading discipline and consistency"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        {/* Consistency Score Gauge */}
        <div className="flex justify-center lg:justify-start">
          <ConsistencyGauge score={consistencyScore} label={consistencyLabel} />
        </div>

        {/* Metrics Grid + Warnings */}
        <div className="space-y-4">
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DisciplineMetric
              icon={Activity}
              label={t("pages.performanceReport.discipline.tradesPerDay") || "Trades/Day"}
              value={avgTradesPerDay.toFixed(1)}
              status="neutral"
            />
            <DisciplineMetric
              icon={Calendar}
              label={t("pages.performanceReport.discipline.greenDays") || "Green Days"}
              value={`${kpis.greenDays}/${kpis.greenDays + kpis.redDays}`}
              subtext={`${greenRatio.toFixed(0)}%`}
              status={greenRatio >= 55 ? "good" : greenRatio >= 45 ? "neutral" : "warning"}
            />
            <DisciplineMetric
              icon={TrendingUp}
              label={t("pages.performanceReport.discipline.winStreak") || "Win Streak"}
              value={kpis.maxWinStreak}
              status={kpis.maxWinStreak >= 5 ? "good" : "neutral"}
            />
            <DisciplineMetric
              icon={Target}
              label={t("pages.performanceReport.discipline.lossStreak") || "Loss Streak"}
              value={kpis.maxLossStreak}
              status={kpis.maxLossStreak >= 5 ? "danger" : kpis.maxLossStreak >= 3 ? "warning" : "neutral"}
            />
          </div>

          {/* Warnings */}
          {(overtradingWarning || tiltWarning) && (
            <div className="space-y-2">
              <WarningBadge type="overtrading" active={overtradingWarning} t={t} />
              <WarningBadge type="tilt" active={tiltWarning} t={t} />
            </div>
          )}

          {/* No warnings - positive message */}
          {!overtradingWarning && !tiltWarning && consistencyScore >= 60 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <div>
                <div className="text-sm font-semibold">
                  {t("pages.performanceReport.discipline.goodJob") || "Good discipline!"}
                </div>
                <div className="text-xs opacity-80 mt-0.5">
                  {t("pages.performanceReport.discipline.goodJobDesc") || "No concerning patterns detected in your trading"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
