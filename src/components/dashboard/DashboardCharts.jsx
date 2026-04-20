/**
 * DashboardCharts - Daily PnL, Win/Loss distribution, Long vs Short charts
 */

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { fmtMoney, fmtPct, fmtPnl } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";

// Custom tooltip for daily PnL
function DailyPnLTooltip({ active, payload, currency, pnlDisplayMode, startingEquity }) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border/60 rounded-xl shadow-2xl px-3 py-2 min-w-[140px]">
      <div className="font-semibold text-foreground text-sm mb-1.5 border-b border-border/30 pb-1.5">
        {formatDate(data.date)}
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between items-center gap-3">
          <span className="text-muted-foreground">P&L:</span>
          <span
            className={`font-semibold tabular-nums ${
              data.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {data.pnl >= 0 ? "+" : ""}
            {fmtPnl(data.pnl, currency, pnlDisplayMode || "money", startingEquity || 0)}
          </span>
        </div>
        <div className="flex justify-between items-center gap-3">
          <span className="text-muted-foreground">Trades:</span>
          <span className="font-semibold">{data.trades}</span>
        </div>
      </div>
    </div>
  );
}

// Daily PnL Bar Chart
export function DailyPnLChart({ dailyPnL, currency = "$", loading = false, pnlDisplayMode = "money", startingEquity = 0 }) {
  // Get last 30 days
  const chartData = useMemo(() => {
    if (!dailyPnL || dailyPnL.length === 0) return [];
    return dailyPnL.slice(-30);
  }, [dailyPnL]);

  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            Daily P&L
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[clamp(140px,20vw,220px)] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            Daily P&L
            <span className="text-[10px] text-muted-foreground font-normal ml-1">
              (Last 30 days)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="w-full h-[clamp(140px,20vw,220px)] min-w-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[]} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgb(71, 85, 105)"
                  strokeOpacity={0.15}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgb(148, 163, 184)", fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgb(148, 163, 184)", fontSize: 10 }}
                  tickFormatter={(val) => `${currency}${val}`}
                  width={50}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Helper text overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-xs text-muted-foreground bg-card/60 px-2 py-1 rounded">
                Появится после первой сделки
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-accent" />
          Daily P&L
          <span className="text-[10px] text-muted-foreground font-normal ml-1">
            (Last 30 days)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="w-full h-[clamp(140px,20vw,220px)] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgb(71, 85, 105)"
                strokeOpacity={0.15}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "rgb(148, 163, 184)", fontSize: 10 }}
                tickFormatter={(d) => {
                  const date = new Date(d);
                  return date.getDate().toString();
                }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "rgb(148, 163, 184)", fontSize: 10 }}
                tickFormatter={(val) => `${val >= 0 ? "" : "-"}${currency}${Math.abs(val)}`}
                width={50}
              />
              <Tooltip content={<DailyPnLTooltip currency={currency} pnlDisplayMode={pnlDisplayMode} startingEquity={startingEquity} />} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.pnl >= 0 ? "rgb(16, 185, 129)" : "rgb(244, 63, 94)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Win/Loss Distribution Donut
export function WinLossDistribution({ metrics, loading = false }) {
  // Check for empty state - no trades
  const isEmpty = !metrics || metrics.totalTrades === 0;

  const data = useMemo(() => {
    if (isEmpty) {
      // For empty state, show neutral placeholder data (0/0 or empty donut)
      return [
        { name: "Wins", value: 0, color: "rgb(71, 85, 105)" },
        { name: "Losses", value: 0, color: "rgb(51, 65, 85)" },
      ];
    }
    // Use win rate percentage for the donut chart
    return [
      { name: "Wins", value: Math.round(metrics.winRate), color: "rgb(16, 185, 129)" },
      { name: "Losses", value: Math.round(100 - metrics.winRate), color: "rgb(244, 63, 94)" },
    ];
  }, [metrics, isEmpty]);

  // Placeholder data for empty donut visual
  const placeholderData = [{ name: "Empty", value: 100, color: "rgb(51, 65, 85)" }];

  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-accent" />
            Win/Loss Ratio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[140px] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-accent" />
          Win/Loss Ratio
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 min-w-0">
          <div className="w-[clamp(80px,12vw,110px)] h-[clamp(80px,12vw,110px)] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={isEmpty ? placeholderData : data}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={isEmpty ? 0 : 2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {(isEmpty ? placeholderData : data).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 min-w-0 pl-2 sm:pl-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 shrink-0 rounded-full ${isEmpty ? "bg-slate-500" : "bg-emerald-500"}`} />
              <span className="text-xs text-muted-foreground truncate">Wins</span>
              <span className={`ml-auto text-sm font-semibold whitespace-nowrap ${isEmpty ? "text-muted-foreground" : "text-emerald-400"}`}>
                {isEmpty ? "0%" : fmtPct(metrics?.winRate || 0)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 shrink-0 rounded-full ${isEmpty ? "bg-slate-600" : "bg-rose-500"}`} />
              <span className="text-xs text-muted-foreground truncate">Losses</span>
              <span className={`ml-auto text-sm font-semibold whitespace-nowrap ${isEmpty ? "text-muted-foreground" : "text-rose-400"}`}>
                {isEmpty ? "0%" : fmtPct(100 - (metrics?.winRate || 0))}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Long vs Short Comparison
export function LongShortComparison({ longStats, shortStats, currency = "$", loading = false }) {
  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-accent" />
            Long vs Short
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[100px] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const totalTrades = (longStats?.trades || 0) + (shortStats?.trades || 0);

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-emerald-400" />
          <ArrowDownRight className="h-4 w-4 text-rose-400" />
          Long vs Short
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Long Stats */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider truncate">Long</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground shrink-0">P&L</span>
                <span
                  className={`font-semibold truncate ${
                    (longStats?.pnl || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmtMoney(longStats?.pnl || 0, currency)}
                </span>
              </div>
              <div className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground shrink-0">Win Rate</span>
                <span className="font-semibold truncate">{fmtPct(longStats?.winRate || 0)}</span>
              </div>
              <div className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground shrink-0">Trades</span>
                <span className="font-semibold">{longStats?.trades || 0}</span>
              </div>
            </div>
          </div>

          {/* Short Stats */}
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 shrink-0 text-rose-400" />
              <span className="text-xs font-medium text-rose-400 uppercase tracking-wider truncate">Short</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground shrink-0">P&L</span>
                <span
                  className={`font-semibold truncate ${
                    (shortStats?.pnl || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {fmtMoney(shortStats?.pnl || 0, currency)}
                </span>
              </div>
              <div className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground shrink-0">Win Rate</span>
                <span className="font-semibold truncate">{fmtPct(shortStats?.winRate || 0)}</span>
              </div>
              <div className="flex justify-between text-xs gap-2">
                <span className="text-muted-foreground shrink-0">Trades</span>
                <span className="font-semibold">{shortStats?.trades || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
