/**
 * DashboardQuickStats - Key trading metrics summary card
 * Fills the empty space next to Consistency when Insights is shorter
 */

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Scale,
  Percent,
} from "lucide-react";
import { fmtMoney, fmtPct, fmtPnl } from "@/lib/utils";
import Skeleton from "@/components/common/Skeleton.jsx";

function MiniStat({ icon: Icon, label, value, subtext, variant = "default" }) {
  const colors = {
    default: "text-foreground",
    success: "text-emerald-400",
    danger: "text-rose-400",
    warning: "text-amber-400",
  };

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] dark:bg-white/[0.02] border border-border/30 hover:border-border/50 transition-colors">
      <div className="shrink-0 h-8 w-8 rounded-lg bg-accent/8 flex items-center justify-center">
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-sm font-bold tabular-nums ${colors[variant]}`}>{value}</div>
      </div>
      {subtext && (
        <span className="text-[11px] text-muted-foreground shrink-0">{subtext}</span>
      )}
    </div>
  );
}

export default function DashboardQuickStats({ metrics, loading = false, currency = "$", pnlDisplayMode = "money" }) {
  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            Key Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[120px] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !metrics || metrics.totalTrades === 0;
  const se = metrics?.startingEquity || 0;
  const fmt = (v) => fmtPnl(v, currency, pnlDisplayMode, se);

  return (
    <Card className="rounded-xl flex-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent" />
          Key Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 grid grid-cols-1 xs:grid-cols-2 gap-2">
        <MiniStat
          icon={DollarSign}
          label="Avg Win"
          value={isEmpty ? "—" : fmt(metrics.avgWin || 0)}
          variant={isEmpty ? "default" : "success"}
        />
        <MiniStat
          icon={DollarSign}
          label="Avg Loss"
          value={isEmpty ? "—" : fmt(metrics.avgLoss || 0)}
          variant={isEmpty ? "default" : "danger"}
        />
        <MiniStat
          icon={Scale}
          label="Expectancy"
          value={isEmpty ? "—" : fmt(metrics.expectancy || 0)}
          variant={isEmpty ? "default" : ((metrics.expectancy || 0) >= 0 ? "success" : "danger")}
        />
        <MiniStat
          icon={Percent}
          label="Payoff Ratio"
          value={isEmpty ? "—" : (metrics.payoffRatio || 0).toFixed(2)}
          subtext="W/L"
          variant={isEmpty ? "default" : ((metrics.payoffRatio || 0) >= 1 ? "success" : "warning")}
        />
        <MiniStat
          icon={TrendingUp}
          label="Best Day"
          value={isEmpty ? "—" : fmt(metrics.bestDay?.pnl || 0)}
          variant={isEmpty ? "default" : "success"}
        />
        <MiniStat
          icon={TrendingDown}
          label="Worst Day"
          value={isEmpty ? "—" : fmt(metrics.worstDay?.pnl || 0)}
          variant={isEmpty ? "default" : "danger"}
        />
      </CardContent>
    </Card>
  );
}
