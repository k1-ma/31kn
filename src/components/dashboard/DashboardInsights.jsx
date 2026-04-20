/**
 * DashboardInsights - Smart Insights block
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Clock,
  Trophy,
  AlertTriangle,
  Target,
  Award,
  Zap,
  Calendar,
  Flame,
  Info,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";

// Icon mapping
const ICON_MAP = {
  TrendingUp,
  TrendingDown,
  Clock,
  Trophy,
  AlertTriangle,
  Target,
  Award,
  Zap,
  Calendar,
  Flame,
  Info,
};

// Insight card
function InsightCard({ insight, index }) {
  const Icon = ICON_MAP[insight.icon] || Info;

  const severityStyles = {
    success: {
      bg: "bg-emerald-500/6",
      border: "border-emerald-500/15",
      iconColor: "text-emerald-400",
      hoverGlow: "hover:shadow-[0_4px_16px_rgba(16,185,129,0.06)]",
      dot: "bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.5)]",
    },
    warn: {
      bg: "bg-amber-500/6",
      border: "border-amber-500/15",
      iconColor: "text-amber-400",
      hoverGlow: "hover:shadow-[0_4px_16px_rgba(245,158,11,0.06)]",
      dot: "bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.5)]",
    },
    info: {
      bg: "bg-blue-500/6",
      border: "border-blue-500/15",
      iconColor: "text-blue-400",
      hoverGlow: "hover:shadow-[0_4px_16px_rgba(59,130,246,0.06)]",
      dot: "bg-blue-400 shadow-[0_0_4px_rgba(59,130,246,0.5)]",
    },
  };

  const style = severityStyles[insight.severity] || severityStyles.info;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`relative p-4 rounded-xl border ${style.border} ${style.bg} ${style.hoverGlow} transition-all duration-200 group`}
    >
      <div className="relative flex items-start gap-3">
        {/* Icon */}
        <div
          className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${style.bg} border ${style.border}`}
        >
          <Icon className={`h-4 w-4 ${style.iconColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-semibold text-foreground leading-tight">
            {insight.title}
          </h4>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            {insight.description}
          </p>
        </div>

        {/* Confidence indicator */}
        <div className="shrink-0 mt-1">
          <div
            className={`h-2 w-2 rounded-full ${style.dot}`}
            title={`Confidence: ${insight.severity === "success" ? "High" : insight.severity === "warn" ? "Medium" : "Info"}`}
          />
        </div>
      </div>
    </motion.div>
  );
}

export default function DashboardInsights({ insights, loading = false }) {
  const { t } = useI18n();

  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            Smart Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[80px] rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            Smart Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Появится после первых сделок</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Инсайты генерируются на основе ваших паттернов торговли
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            Smart Insights
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {insights.length} insight{insights.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AnimatePresence>
            {insights.map((insight, idx) => (
              <InsightCard key={insight.type + idx} insight={insight} index={idx} />
            ))}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
}
