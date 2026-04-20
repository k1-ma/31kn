/**
 * LongShortComparison - Win/Loss distribution and Long vs Short comparison
 * Premium compact charts for Performance Report
 */

import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Target, Percent } from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/utils";
import { calcWinRatePct } from "@/lib/metrics/winRate.js";

// Circular progress/donut component
function DonutProgress({ value, max, color, size = 60 }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
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
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        className="transition-all duration-700"
      />
    </svg>
  );
}

// Mini bar for comparison
function ComparisonBar({ leftValue, rightValue, leftColor, rightColor }) {
  const total = Math.abs(leftValue) + Math.abs(rightValue);
  const leftPct = total > 0 ? (Math.abs(leftValue) / total) * 100 : 50;

  return (
    <div className="h-2 w-full rounded-full overflow-hidden bg-muted/30 flex">
      <div 
        className="h-full transition-all duration-500"
        style={{ width: `${leftPct}%`, backgroundColor: leftColor }}
      />
      <div 
        className="h-full transition-all duration-500"
        style={{ width: `${100 - leftPct}%`, backgroundColor: rightColor }}
      />
    </div>
  );
}

export default function LongShortComparison({ data, distribution, currency, reduceMotion, t, winRateMode = "ignore" }) {
  // Distribution may include breakEvens from the updated performanceReport
  const wins = distribution.wins || 0;
  const losses = distribution.losses || 0;
  const breakEvens = distribution.breakEvens || 0;
  const totalTrades = wins + losses + breakEvens;
  const winRate = calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode });
  
  const totalLongShort = (data.longTrades || 0) + (data.shortTrades || 0);
  const longPct = totalLongShort > 0 ? ((data.longTrades || 0) / totalLongShort) * 100 : 50;

  return (
    <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/60 p-4 space-y-4">
      {/* Win/Loss Distribution */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t("pages.performanceReport.winLossDistribution") || "Win/Loss Distribution"}
        </h4>
        
        <div className="flex items-center gap-4">
          {/* Donut Chart */}
          <div className="relative">
            <DonutProgress 
              value={wins} 
              max={totalTrades}
              color="rgb(16, 185, 129)"
              size={70}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold tabular-nums">{fmtPct(winRate)}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-muted-foreground">{t("common.wins") || "Wins"}</span>
              </div>
              <span className="text-sm font-semibold text-emerald-500 tabular-nums">{wins}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-xs text-muted-foreground">{t("common.losses") || "Losses"}</span>
              </div>
              <span className="text-sm font-semibold text-rose-500 tabular-nums">{losses}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-accent/10" />

      {/* Long vs Short */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {t("pages.performanceReport.longVsShort") || "Long vs Short"}
        </h4>

        {/* PnL Comparison */}
        <div className="space-y-3">
          {/* Long Stats */}
          <div className="flex items-center gap-3">
            <div className="w-16 shrink-0">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-medium">{t("common.long") || "Long"}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{data.longTrades || 0} trades</span>
                <span className={`text-xs font-semibold tabular-nums ${data.longPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.longPnl >= 0 ? '+' : ''}{fmtMoney(data.longPnl, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{fmtPct(data.longWr)} WR</span>
              </div>
            </div>
          </div>

          {/* Short Stats */}
          <div className="flex items-center gap-3">
            <div className="w-16 shrink-0">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-xs font-medium">{t("common.short") || "Short"}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{data.shortTrades || 0} trades</span>
                <span className={`text-xs font-semibold tabular-nums ${data.shortPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.shortPnl >= 0 ? '+' : ''}{fmtMoney(data.shortPnl, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{fmtPct(data.shortWr)} WR</span>
              </div>
            </div>
          </div>

          {/* Comparison Bar */}
          <div className="pt-1">
            <ComparisonBar
              leftValue={Math.abs(data.longPnl)}
              rightValue={Math.abs(data.shortPnl)}
              leftColor={data.longPnl >= 0 ? 'rgb(16, 185, 129)' : 'rgb(244, 63, 94)'}
              rightColor={data.shortPnl >= 0 ? 'rgb(16, 185, 129)' : 'rgb(244, 63, 94)'}
            />
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
              <span>{longPct.toFixed(0)}%</span>
              <span>{(100 - longPct).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
