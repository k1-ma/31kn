/**
 * DashboardEquityChart - Premium equity curve chart
 */

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import { LineChart, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

// Custom tooltip
function ChartTooltip({ active, payload, currency }) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === "Start") return "Start";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="bg-card/95 backdrop-blur-md border border-border/60 rounded-xl shadow-2xl px-4 py-3 min-w-[160px]">
      <div className="font-semibold text-foreground text-sm mb-2 border-b border-border/30 pb-2">
        {formatDate(data.date)}
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between items-center gap-4">
          <span className="text-muted-foreground">Equity:</span>
          <span className="font-semibold text-foreground tabular-nums">
            {fmtMoney(data.equity, currency)}
          </span>
        </div>
        {data.date !== "Start" && (
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Day P&L:</span>
            <span
              className={`font-semibold tabular-nums ${
                data.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {data.pnl >= 0 ? "+" : ""}
              {fmtMoney(data.pnl, currency)}
            </span>
          </div>
        )}
        {data.drawdownPct < 0 && (
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Drawdown:</span>
            <span className="font-semibold text-rose-400 tabular-nums">
              {data.drawdownPct.toFixed(1)}%
            </span>
          </div>
        )}
        {data.isPeak && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <span className="text-amber-400 text-[10px] font-medium uppercase tracking-wider">
              ★ Peak Equity
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardEquityChart({
  equityPoints,
  metrics,
  currency = "$",
  loading = false,
}) {
  const { t } = useI18n();
  const [showMode, setShowMode] = useState("equity"); // "equity" | "pnl"

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!equityPoints || equityPoints.length === 0) return [];
    return equityPoints;
  }, [equityPoints]);

  // Calculate chart statistics
  const stats = useMemo(() => {
    if (!chartData || chartData.length <= 1) {
      return {
        pnl: 0,
        pnlPct: 0,
        isPositive: true,
        minEquity: 0,
        maxEquity: 0,
      };
    }

    const start = chartData[0]?.equity || 0;
    const end = chartData[chartData.length - 1]?.equity || 0;
    const pnl = end - start;
    const pnlPct = start > 0 ? (pnl / start) * 100 : 0;
    const minEquity = Math.min(...chartData.map((d) => d.equity));
    const maxEquity = Math.max(...chartData.map((d) => d.equity));

    return {
      pnl,
      pnlPct,
      isPositive: pnl >= 0,
      minEquity,
      maxEquity,
    };
  }, [chartData]);

  const lineColor = stats.isPositive ? "rgb(16, 185, 129)" : "rgb(244, 63, 94)";
  const gradientId = stats.isPositive ? "equityGradientPositive" : "equityGradientNegative";

  // Y-axis domain with padding
  const yDomain = useMemo(() => {
    const range = stats.maxEquity - stats.minEquity;
    const padding = range * 0.1;
    return [
      Math.floor(stats.minEquity - padding),
      Math.ceil(stats.maxEquity + padding),
    ];
  }, [stats]);

  // Format date for axis
  const formatDateTick = (dateStr) => {
    if (!dateStr || dateStr === "Start") return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <LineChart className="h-4 w-4 text-accent" />
            Equity Curve
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  // Empty state - show chart frame with grid and axes, neutral values
  const isEmptyState = chartData.length <= 1;

  // For empty state, use placeholder domain showing a reasonable range
  const emptyYDomain = [0, 10000];
  // Placeholder data for empty chart to ensure proper chart initialization
  const placeholderData = [{ date: "", equity: 0, pnl: 0 }];

  if (isEmptyState) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
              <LineChart className="h-4 w-4 text-accent" />
              Equity Curve
            </CardTitle>

            {/* Legend - same as filled state */}
            <div className="flex items-center gap-2 sm:gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></span>
                Peak
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50"></span>
                Max DD
              </span>
            </div>
          </div>

          {/* Stats Header - neutral values for empty state */}
          <div className="flex items-center justify-between mt-2">
            <div>
              <div className="text-2xl font-bold leading-tight text-muted-foreground">
                {fmtMoney(0, currency)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                —
              </div>
            </div>

            {/* Max Drawdown badge - neutral */}
            <div className="text-right">
              <div className="text-sm font-semibold text-muted-foreground">
                —
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Max Drawdown
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="w-full h-[280px] relative">
            {/* Chart with grid and axes */}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={placeholderData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                {/* Grid */}
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgb(71, 85, 105)"
                  strokeOpacity={0.15}
                  vertical={false}
                />

                {/* X Axis */}
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgb(148, 163, 184)", fontSize: 11 }}
                />

                {/* Y Axis */}
                <YAxis
                  domain={emptyYDomain}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgb(148, 163, 184)", fontSize: 11 }}
                  tickFormatter={(val) => `${currency}${(val / 1000).toFixed(0)}k`}
                  width={60}
                />

                {/* Empty area (no data line) */}
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="transparent"
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Helper text overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center bg-card/80 backdrop-blur-sm px-4 py-3 rounded-xl border border-border/30">
                <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <div className="text-sm text-muted-foreground">Появится после первой сделки</div>
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
        <div className="flex items-center justify-between">
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <LineChart className="h-4 w-4 text-accent" />
            Equity Curve
          </CardTitle>

          {/* Legend */}
          <div className="flex items-center gap-2 sm:gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></span>
              Peak
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50"></span>
              Max DD
            </span>
          </div>
        </div>

        {/* Stats Header */}
        <div className="flex items-center justify-between mt-2 gap-2">
          <div className="min-w-0">
            <div
              className={`text-xl sm:text-2xl font-bold leading-tight ${
                stats.isPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {stats.isPositive ? "+" : ""}
              {fmtMoney(stats.pnl, currency)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {stats.isPositive ? "+" : ""}
              {stats.pnlPct.toFixed(1)}% return
            </div>
          </div>

          {/* Max Drawdown badge */}
          <div className="text-right">
            <div className="text-sm font-semibold text-rose-400">
              {metrics.maxDrawdownPct.toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Max Drawdown
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="w-full h-[220px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              {/* Gradient Definitions */}
              <defs>
                <linearGradient id="equityGradientPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity={0.35} />
                  <stop offset="50%" stopColor="rgb(16, 185, 129)" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="equityGradientNegative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(244, 63, 94)" stopOpacity={0.35} />
                  <stop offset="50%" stopColor="rgb(244, 63, 94)" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="rgb(244, 63, 94)" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              {/* Grid */}
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgb(71, 85, 105)"
                strokeOpacity={0.15}
                vertical={false}
              />

              {/* X Axis */}
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "rgb(148, 163, 184)", fontSize: 11 }}
                tickFormatter={formatDateTick}
                interval="preserveStartEnd"
                minTickGap={50}
              />

              {/* Y Axis */}
              <YAxis
                domain={yDomain}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "rgb(148, 163, 184)", fontSize: 11 }}
                tickFormatter={(val) => `${currency}${(val / 1000).toFixed(0)}k`}
                width={60}
              />

              {/* Tooltip */}
              <Tooltip
                content={<ChartTooltip currency={currency} />}
                cursor={{
                  stroke: "rgb(59, 130, 246)",
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                }}
              />

              {/* Zero line */}
              {chartData[0]?.equity && (
                <ReferenceLine
                  y={chartData[0].equity}
                  stroke="rgb(148, 163, 184)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.3}
                />
              )}

              {/* Area */}
              <Area
                type="monotone"
                dataKey="equity"
                stroke={lineColor}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 5,
                  fill: lineColor,
                  stroke: "rgb(30, 41, 59)",
                  strokeWidth: 2,
                }}
              />

              {/* Peak marker */}
              {chartData
                .filter((d) => d.isPeak)
                .map((d, idx) => (
                  <ReferenceDot
                    key={`peak-${idx}`}
                    x={d.date}
                    y={d.equity}
                    r={6}
                    fill="rgb(251, 191, 36)"
                    stroke="rgb(30, 41, 59)"
                    strokeWidth={2}
                  />
                ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
