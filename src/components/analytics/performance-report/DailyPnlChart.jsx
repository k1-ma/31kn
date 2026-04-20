/**
 * DailyPnlChart - Daily PnL bar chart for Performance Report
 * Recharts-based with Haunted-style design
 */

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { BarChart3 } from "lucide-react";
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

// Format date for axis
function formatDateTick(dateStr, dataLength) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  if (dataLength <= 10) {
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  }
  if (dataLength <= 31) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short" });
}

// Format full date for tooltip
function formatFullDate(dateStr) {
  if (!dateStr) return "";
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
  
  const isPositive = data.pnl >= 0;
  
  return (
    <div className="bg-card/95 backdrop-blur-md border border-accent/20 rounded-xl shadow-2xl px-4 py-3 min-w-[160px]">
      <div className="font-semibold text-foreground text-sm mb-2 border-b border-accent/15 pb-2">
        {formatFullDate(data.date)}
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between items-center gap-4">
          <span className="text-muted-foreground">PnL:</span>
          <span className={`font-semibold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : ''}{fmtMoney(data.pnl, currency)}
          </span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-muted-foreground">Trades:</span>
          <span className="font-semibold text-foreground tabular-nums">{data.trades}</span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-muted-foreground">W/L:</span>
          <span className="font-semibold tabular-nums">
            <span className="text-emerald-400">{data.wins}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-rose-400">{data.losses}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DailyPnlChart({ data, currency, reduceMotion, t }) {
  // Calculate stats
  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return { totalPnl: 0, avgPnl: 0, greenDays: 0, redDays: 0 };
    }

    let totalPnl = 0;
    let greenDays = 0;
    let redDays = 0;

    for (const day of data) {
      totalPnl += day.pnl;
      if (day.pnl > 0) greenDays++;
      if (day.pnl < 0) redDays++;
    }

    return {
      totalPnl,
      avgPnl: totalPnl / data.length,
      greenDays,
      redDays,
    };
  }, [data]);

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm font-medium">{t("pages.performanceReport.charts.noData") || "No data"}</div>
          <div className="text-xs text-muted-foreground/60 mt-1">Add trades to see daily PnL</div>
        </div>
      </div>
    );
  }

  // Determine Y-axis domain
  const maxAbs = Math.max(...data.map(d => Math.abs(d.pnl)));
  const yDomain = [-maxAbs * 1.1, maxAbs * 1.1];

  return (
    <div className="space-y-4">
      {/* Stats Header */}
      <div className="flex items-start justify-between">
        <div className="text-left">
          <div className={`text-2xl font-bold leading-tight tabular-nums ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {stats.totalPnl >= 0 ? '+' : ''}{fmtMoney(stats.totalPnl, currency)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t("pages.performanceReport.charts.avgDaily") || "Avg"}: {fmtMoney(stats.avgPnl, currency)}/day
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
            {stats.greenDays} {t("pages.performanceReport.charts.green") || "green"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
            {stats.redDays} {t("pages.performanceReport.charts.red") || "red"}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="rgb(71, 85, 105)" 
              strokeOpacity={0.15}
              vertical={false}
            />
            
            <XAxis 
              dataKey="date"
              tickFormatter={(val) => formatDateTick(val, data.length)}
              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              tickLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              interval={data.length > 20 ? "preserveStartEnd" : 0}
              minTickGap={30}
            />
            
            <YAxis 
              tickFormatter={(val) => fmtCompactMoney(val, currency)}
              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              tickLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              domain={yDomain}
              width={65}
            />
            
            <ReferenceLine 
              y={0} 
              stroke="rgb(71, 85, 105)" 
              strokeOpacity={0.5}
            />
            
            <Tooltip 
              content={<ChartTooltip currency={currency} />}
              cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
              animationDuration={150}
            />
            
            <Bar
              dataKey="pnl"
              radius={[4, 4, 0, 0]}
              animationDuration={reduceMotion ? 0 : 800}
              animationEasing="ease-out"
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`}
                  fill={entry.pnl >= 0 ? 'rgb(16, 185, 129)' : 'rgb(244, 63, 94)'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
