/**
 * DashboardIdeasWinRate - Shows win rate of trading ideas for the current month.
 * Hidden when there are no ideas with results this month.
 */

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import { Lightbulb, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function DashboardIdeasWinRate({ ideas = [] }) {
  const { t } = useI18n();

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Filter ideas resolved this month with a definitive result
    const thisMonth = ideas.filter((idea) => {
      if (!idea.result || idea.result === "Unknown") return false;
      // Use resolved_at if available, otherwise created_at
      const dateStr = idea.resolved_at || idea.created_at;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= monthStart;
    });

    const worked = thisMonth.filter((i) => i.result === "Worked").length;
    const failed = thisMonth.filter((i) => i.result === "Failed").length;
    const partial = thisMonth.filter((i) => i.result === "Partial").length;
    const total = worked + failed + partial;
    const winRate = total > 0 ? Math.round((worked / total) * 100) : 0;

    return { worked, failed, partial, total, winRate };
  }, [ideas]);

  // Don't render if no ideas with results this month
  if (stats.total === 0) return null;

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          {t("pages.dashboard.ideasWinRate") || "Ideas Win Rate"}
          <span className="text-xs font-normal text-muted-foreground ml-auto normal-case tracking-normal">
            {t("pages.dashboard.thisMonth") || "this month"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4">
          {/* Win Rate Circle */}
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
              <circle
                cx="18" cy="18" r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-accent/10"
              />
              <circle
                cx="18" cy="18" r="15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${stats.winRate} ${100 - stats.winRate}`}
                strokeLinecap="round"
                className={stats.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-sm font-bold ${stats.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                {stats.winRate}%
              </span>
            </div>
          </div>

          {/* Stats breakdown */}
          <div className="flex-1 grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center p-2 rounded-lg bg-emerald-500/8 border border-emerald-500/15">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mb-1" />
              <span className="text-sm font-bold text-emerald-400">{stats.worked}</span>
              <span className="text-[10px] text-muted-foreground">{t("tradingIdeas.result.worked") || "Worked"}</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded-lg bg-rose-500/8 border border-rose-500/15">
              <XCircle className="h-3.5 w-3.5 text-rose-400 mb-1" />
              <span className="text-sm font-bold text-rose-400">{stats.failed}</span>
              <span className="text-[10px] text-muted-foreground">{t("tradingIdeas.result.failed") || "Failed"}</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded-lg bg-amber-500/8 border border-amber-500/15">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mb-1" />
              <span className="text-sm font-bold text-amber-400">{stats.partial}</span>
              <span className="text-[10px] text-muted-foreground">{t("tradingIdeas.result.partial") || "Partial"}</span>
            </div>
          </div>
        </div>

        {/* Total ideas count */}
        <div className="mt-3 text-center text-xs text-muted-foreground">
          {stats.total} {t("pages.dashboard.ideasEvaluated") || "ideas evaluated this month"}
        </div>
      </CardContent>
    </Card>
  );
}
