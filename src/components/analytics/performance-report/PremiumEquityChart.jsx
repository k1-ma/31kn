/**
 * PremiumEquityChart - Premium equity curve chart for Performance Report
 * Recharts-based with Haunted-style design
 */

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Activity } from "lucide-react";
import { fmtMoney } from "@/lib/utils";

// Format compact money for axis
function fmtCompactMoney(n, currency = "$") {
  const x = Number(n);
  if (!Number.isFinite(x)) return `${currency}0`;
  const abs = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}${currency}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 10000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  if (abs >= 1000) return `${sign}${currency}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `${sign}${currency}${abs.toFixed(0)}`;
}

// Format date tick based on data length
function formatDateTick(dateStr, dataLength) {
  if (!dateStr || dateStr === "Start") return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  if (dataLength <= 7) {
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  }
  if (dataLength <= 30) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Format full date for tooltip
function formatFullDate(dateStr) {
  if (!dateStr || dateStr === "Start") return "Start";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { 
    weekday: "short", 
    year: "numeric", 
    month: "short", 
    day: "numeric" 
  });
}

// Custom Tooltip
function ChartTooltip({ active, payload, currency }) {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0]?.payload;
  if (!data) return null;
  
  return (
    <div className="bg-card/95 backdrop-blur-md border border-accent/20 rounded-xl shadow-2xl px-4 py-3 min-w-[180px]">
      <div className="font-semibold text-foreground text-sm mb-2 border-b border-accent/15 pb-2">
        {formatFullDate(data.date)}
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between items-center gap-4">
          <span className="text-muted-foreground">Equity:</span>
          <span className="font-semibold text-foreground tabular-nums">
            {fmtMoney(data.equity, currency)}
          </span>
        </div>
        {data.pnl !== undefined && (
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Day PnL:</span>
            <span className={`font-semibold tabular-nums ${data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {data.pnl >= 0 ? '+' : ''}{fmtMoney(data.pnl, currency)}
            </span>
          </div>
        )}
        {data.trades > 0 && (
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Trades:</span>
            <span className="font-semibold text-foreground tabular-nums">{data.trades}</span>
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
          <div className="mt-2 pt-2 border-t border-accent/15">
            <span className="text-amber-400 text-[10px] font-medium uppercase tracking-wider">★ Peak Equity</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PremiumEquityChart({ 
  data, 
  currency, 
  baseEquity = 0,
  netPnl = 0,
  profitPct = 0,
  reduceMotion,
  t 
}) {
  // Process chart data
  const { chartData, stats } = useMemo(() => {
    if (!data || data.length === 0) {
      return { 
        chartData: [], 
        stats: { minEquity: 0, maxEquity: 0, finalEquity: 0, maxDrawdownPct: 0 } 
      };
    }

    // Find stats
    let minEquity = Infinity;
    let maxEquity = -Infinity;
    let maxDrawdownPct = 0;

    for (const point of data) {
      minEquity = Math.min(minEquity, point.equity);
      maxEquity = Math.max(maxEquity, point.equity);
      if (point.drawdownPct < maxDrawdownPct) {
        maxDrawdownPct = point.drawdownPct;
      }
    }

    const finalEquity = data[data.length - 1]?.equity || 0;

    return {
      chartData: data,
      stats: {
        minEquity: Number.isFinite(minEquity) ? minEquity : 0,
        maxEquity: Number.isFinite(maxEquity) ? maxEquity : 0,
        finalEquity,
        maxDrawdownPct,
      },
    };
  }, [data]);

  // Empty state
  if (chartData.length === 0) {
    return (
      <div className="h-[320px] flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm font-medium">{t("pages.performanceReport.charts.noData") || "No data"}</div>
          <div className="text-xs text-muted-foreground/60 mt-1">Add trades to see your equity curve</div>
        </div>
      </div>
    );
  }

  // Determine line color
  const isPositive = netPnl >= 0;
  const lineColor = isPositive ? "rgb(16, 185, 129)" : "rgb(244, 63, 94)";
  const gradientId = isPositive ? "equityGradientPos" : "equityGradientNeg";

  // Calculate Y-axis domain
  const range = stats.maxEquity - stats.minEquity;
  const padding = range * 0.1;
  const yMin = stats.minEquity - padding;
  const yMax = stats.maxEquity + padding;

  return (
    <div className="space-y-4">
      {/* Stats Header */}
      <div className="flex items-start justify-between">
        <div className="text-left">
          <div className={`text-2xl font-bold leading-tight tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : ''}{fmtMoney(netPnl, currency)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isPositive ? '+' : ''}{profitPct.toFixed(1)}% return
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></span>
            {t("pages.performanceReport.charts.peak") || "Peak"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50"></span>
            {t("pages.performanceReport.charts.maxDd") || "Max DD"}: {stats.maxDrawdownPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="equityGradientPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity={0.35} />
                <stop offset="50%" stopColor="rgb(16, 185, 129)" stopOpacity={0.1} />
                <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="equityGradientNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(244, 63, 94)" stopOpacity={0.35} />
                <stop offset="50%" stopColor="rgb(244, 63, 94)" stopOpacity={0.1} />
                <stop offset="100%" stopColor="rgb(244, 63, 94)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="rgb(71, 85, 105)" 
              strokeOpacity={0.15}
              vertical={false}
            />
            
            <XAxis 
              dataKey="date"
              tickFormatter={(val) => formatDateTick(val, chartData.length)}
              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              tickLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            
            <YAxis 
              tickFormatter={(val) => fmtCompactMoney(val, currency)}
              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              tickLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              domain={[yMin, yMax]}
              width={65}
            />
            
            {baseEquity > 0 && (
              <ReferenceLine 
                y={baseEquity} 
                stroke="rgb(148, 163, 184)" 
                strokeDasharray="4 4" 
                strokeOpacity={0.5}
              />
            )}
            
            <Tooltip 
              content={<ChartTooltip currency={currency} />}
              cursor={{ 
                stroke: 'rgb(148, 163, 184)', 
                strokeWidth: 1, 
                strokeDasharray: '4 4',
                strokeOpacity: 0.6
              }}
              animationDuration={150}
            />
            
            <Area
              type="monotone"
              dataKey="equity"
              stroke={lineColor}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              animationDuration={reduceMotion ? 0 : 800}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats Below Chart */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/20">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
            {t("pages.performanceReport.charts.start") || "Start"}
          </div>
          <div className="text-sm font-semibold tabular-nums">{fmtCompactMoney(baseEquity, currency)}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/20">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
            {t("pages.performanceReport.charts.current") || "Current"}
          </div>
          <div className="text-sm font-semibold tabular-nums">{fmtCompactMoney(stats.finalEquity, currency)}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
            {t("pages.performanceReport.charts.peak") || "Peak"}
          </div>
          <div className="text-sm font-semibold tabular-nums text-amber-400">{fmtCompactMoney(stats.maxEquity, currency)}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
            {t("pages.performanceReport.charts.maxDd") || "Max DD"}
          </div>
          <div className="text-sm font-semibold tabular-nums text-rose-400">{stats.maxDrawdownPct.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}
