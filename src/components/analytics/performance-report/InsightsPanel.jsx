/**
 * InsightsPanel - Smart Insights panel for Performance Report
 * Displays rule-based trading insights with severity badges
 */

import React from "react";
import { 
  Sparkles, TrendingUp, TrendingDown, Clock, Calendar,
  Target, AlertTriangle, Award, BarChart3, Zap, Trophy,
  Info, CheckCircle, XCircle
} from "lucide-react";

// Icon mapping for insight types
const INSIGHT_ICONS = {
  best_pair: TrendingUp,
  worst_pair: TrendingDown,
  best_session: Clock,
  direction_bias: BarChart3,
  profit_factor: Zap,
  loss_streak: AlertTriangle,
  best_day: Trophy,
  worst_day: XCircle,
  best_weekday: Calendar,
  worst_weekday: Calendar,
  win_rate: Target,
  default: Info,
};

// Severity styles
const SEVERITY_STYLES = {
  success: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-500",
    icon: "text-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-400",
  },
  warn: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-500",
    icon: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-400",
  },
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-500",
    icon: "text-blue-400",
    badge: "bg-blue-500/20 text-blue-400",
  },
};

// Single insight row — memoized, no per-row animation
const InsightRow = React.memo(function InsightRow({ insight, index, reduceMotion }) {
  const Icon = INSIGHT_ICONS[insight.type] || INSIGHT_ICONS.default;
  const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border ${style.border} ${style.bg} transition-all duration-200 hover:shadow-sm`}
    >
      <div className={`shrink-0 mt-0.5 ${style.icon}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="text-xs font-semibold text-foreground leading-tight truncate">
            {insight.title}
          </h4>
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide ${style.badge}`}>
            {insight.severity === "success" ? "✓" : insight.severity === "warn" ? "!" : "i"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {insight.description}
        </p>
      </div>
    </div>
  );
});

export default function InsightsPanel({ insights, reduceMotion, t }) {
  return (
    <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/60 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-accent/10">
        <Sparkles className="h-4 w-4 text-purple-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          {t("pages.performanceReport.smartInsights") || "Smart Insights"}
        </h3>
        <span className="ml-auto text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/30">
          {insights.length} {t("pages.performanceReport.found") || "found"}
        </span>
      </div>

      {/* Insights List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {insights.length > 0 ? (
            insights.map((insight, idx) => (
              <InsightRow
                key={`${insight.type}-${idx}`}
                insight={insight}
                index={idx}
                reduceMotion={reduceMotion}
              />
            ))
        ) : (
          <div className="py-6 text-center">
            <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              {t("pages.performanceReport.noInsights") || "Add more trades to generate insights"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
