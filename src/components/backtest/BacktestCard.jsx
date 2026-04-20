import React, { useMemo } from "react";
import Badge from "@/components/ui/Badge.jsx";
import BacktestActionsMenu from "./BacktestActionsMenu.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { TrendingUp, TrendingDown, BarChart3, Clock, Calendar, DollarSign, Target } from "lucide-react";
import { isDeleted } from "@/lib/syncDb.js";

function relativeTime(ts) {
  if (!ts) return "—";
  const now = Date.now();
  const diff = now - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtCompact(n) {
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (abs >= 1000) return (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + "k";
  return n.toFixed(2);
}

export default function BacktestCard({ backtest, onOpen, onRename, onDuplicate, onArchive, onUnarchive, onDelete, onShare }) {
  const { t } = useI18n();
  const bt = backtest;
  const period = bt.period || {};
  const equity = bt.initialEquity || bt.account?.initialEquity || 0;

  const stats = useMemo(() => {
    const trades = (bt.trades || []).filter((tr) => !isDeleted(tr));
    const total = trades.length;
    if (total === 0) return { total: 0, wins: 0, losses: 0, breakeven: 0, winRate: 0, netPnl: 0, grossProfit: 0, grossLoss: 0 };

    let netPnl = 0, wins = 0, losses = 0, breakeven = 0, grossProfit = 0, grossLoss = 0;
    for (const trade of trades) {
      const allocs = Array.isArray(trade.allocations) ? trade.allocations : [];
      const tradePnl = allocs.length > 0
        ? allocs.reduce((s, a) => s + (Number(a?.pnl) || 0), 0)
        : (Number(trade.pnl) || 0);
      netPnl += tradePnl;
      if (tradePnl > 0) { wins++; grossProfit += tradePnl; }
      else if (tradePnl < 0) { losses++; grossLoss += Math.abs(tradePnl); }
      else breakeven++;
    }
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    return { total, wins, losses, breakeven, winRate, netPnl, grossProfit, grossLoss };
  }, [bt.trades]);

  const pnlPositive = stats.netPnl > 0;
  const pnlNegative = stats.netPnl < 0;
  const profitFactor = stats.grossLoss > 0 ? (stats.grossProfit / stats.grossLoss).toFixed(2) : stats.grossProfit > 0 ? "∞" : "—";
  const winBarPct = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
  const beBarPct = stats.total > 0 ? (stats.breakeven / stats.total) * 100 : 0;

  // Accent colour for the top indicator based on PnL
  const accentGrad = pnlPositive
    ? "from-emerald-500 to-emerald-400"
    : pnlNegative
      ? "from-red-500 to-red-400"
      : "from-accent to-accent/80";

  return (
    <div
      onClick={() => onOpen?.(bt.id)}
      className={
        "group relative rounded-2xl cursor-pointer transition-all duration-300 " +
        "border border-border/40 dark:border-white/[0.06] " +
        "bg-card dark:bg-[#131722] " +
        "shadow-sm dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)] " +
        "hover:shadow-lg dark:hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)] " +
        "hover:border-accent/25 dark:hover:border-accent/15 " +
        "hover:-translate-y-0.5 " +
        (bt.archivedAt ? "opacity-55 grayscale-[20%]" : "")
      }
    >
      {/* Top accent line – wrapped in overflow-hidden so the gradient is clipped to rounded corners */}
      <div className="rounded-t-2xl overflow-hidden">
        <div className={`h-[3px] w-full bg-gradient-to-r ${accentGrad} opacity-80 group-hover:opacity-100 transition-opacity`} />
      </div>

      <div className="p-4 pb-3.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-foreground truncate leading-tight group-hover:text-accent transition-colors duration-200">
              {bt.name || "Untitled"}
            </h3>
            {/* Period + Equity inline */}
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground/70">
              {equity > 0 && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-muted-foreground/50" />
                  <span className="font-medium">{equity.toLocaleString()}</span>
                </span>
              )}
              {(period.from || period.to) && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground/50" />
                  <span>{period.from || "…"} — {period.to || "…"}</span>
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
            <BacktestActionsMenu
              onOpen={() => onOpen?.(bt.id)}
              onRename={() => onRename?.(bt.id)}
              onDuplicate={() => onDuplicate?.(bt.id)}
              onArchive={() => onArchive?.(bt.id)}
              onUnarchive={() => onUnarchive?.(bt.id)}
              onDelete={() => onDelete?.(bt.id)}
              onShare={() => onShare?.(bt.id)}
              isArchived={!!bt.archivedAt}
            />
          </div>
        </div>

        {/* Stats block */}
        {stats.total > 0 ? (
          <div className="rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 dark:from-white/[0.03] dark:to-white/[0.01] border border-border/25 dark:border-white/[0.05] p-3 mb-3">
            {/* Primary metric: PnL */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${pnlPositive ? "bg-emerald-500/10" : pnlNegative ? "bg-red-500/10" : "bg-muted/30"}`}>
                  {pnlPositive
                    ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                    : pnlNegative
                      ? <TrendingDown className="h-4 w-4 text-red-400" />
                      : <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  }
                </div>
                <div>
                  <span className={`text-[17px] font-extrabold tracking-tight ${pnlPositive ? "text-emerald-400" : pnlNegative ? "text-red-400" : "text-muted-foreground"}`}>
                    {pnlPositive ? "+" : ""}{fmtCompact(stats.netPnl)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-1">PnL</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-[16px] font-bold ${stats.winRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                  {stats.winRate}%
                </span>
                <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Win rate</div>
              </div>
            </div>

            {/* Win/Loss/BE bar */}
            <div className="h-2 rounded-full bg-muted/30 dark:bg-white/[0.04] overflow-hidden flex mb-2.5">
              {winBarPct > 0 && (
                <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 ease-out" style={{ width: `${winBarPct}%` }} />
              )}
              {beBarPct > 0 && (
                <div className="h-full bg-slate-400/40 transition-all duration-700 ease-out" style={{ width: `${beBarPct}%` }} />
              )}
              {stats.losses > 0 && (
                <div className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-700 ease-out ml-auto" style={{ width: `${(stats.losses / stats.total) * 100}%` }} />
              )}
            </div>

            {/* Bottom stats row */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-foreground/80 font-medium">{stats.wins}<span className="text-muted-foreground/60 ml-px">W</span></span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-foreground/80 font-medium">{stats.losses}<span className="text-muted-foreground/60 ml-px">L</span></span>
                </span>
                {stats.breakeven > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-slate-400/60" />
                    <span className="text-muted-foreground/60">{stats.breakeven}BE</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 text-muted-foreground/60">
                <span className="flex items-center gap-1" title="Profit Factor">
                  <Target className="h-3 w-3" />
                  <span className="font-medium text-foreground/70">{profitFactor}</span>
                </span>
                <span className="flex items-center gap-1" title="Total trades">
                  <BarChart3 className="h-3 w-3" />
                  <span className="font-medium text-foreground/70">{stats.total}</span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-3 rounded-xl border border-dashed border-border/30 dark:border-white/[0.05] p-5 text-center">
            <BarChart3 className="h-5 w-5 text-muted-foreground/25 mx-auto mb-1.5" />
            <span className="text-[11px] text-muted-foreground/40 font-medium">No trades yet</span>
          </div>
        )}

        {/* Symbols + Timeframes */}
        {(bt.symbols?.length > 0 || bt.timeframes?.length > 0) && (
          <div className="flex flex-wrap gap-1 mb-3">
            {(bt.symbols || []).slice(0, 4).map((sym) => (
              <span
                key={sym}
                className="inline-flex items-center px-1.5 py-[3px] rounded-md text-[10px] font-bold bg-accent/[0.07] dark:bg-accent/[0.09] text-accent/90 border border-accent/15 tracking-wide"
              >
                {sym}
              </span>
            ))}
            {bt.symbols?.length > 4 && (
              <span className="inline-flex items-center px-1.5 py-[3px] rounded-md text-[10px] font-medium text-muted-foreground/60 bg-muted/20 dark:bg-white/[0.025]">
                +{bt.symbols.length - 4}
              </span>
            )}
            {(bt.timeframes || []).slice(0, 3).map((tf) => (
              <span
                key={tf}
                className="inline-flex items-center px-1.5 py-[3px] rounded-md text-[10px] font-semibold bg-blue-500/[0.06] dark:bg-blue-400/[0.08] text-blue-500/80 dark:text-blue-400/80 border border-blue-500/10 dark:border-blue-400/10"
              >
                {tf}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 pt-2.5 border-t border-border/15 dark:border-white/[0.04]">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(bt.updatedAt)}
          </span>
          {bt.archivedAt && <Badge variant="secondary">Archived</Badge>}
        </div>
      </div>
    </div>
  );
}
