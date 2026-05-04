import React, { useMemo, useRef, useState, useEffect } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Modal from "@/components/common/Modal.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Switch from "@/components/ui/Switch.jsx";
import { AvatarBubble } from "@/components/common/Avatar.jsx";
import Sparkline, { calculateEquityCurve, getRecentEquity } from "@/components/common/Sparkline.jsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Search, Trash2, Image as ImageIcon, X, Check,
  DollarSign, ChevronDown, ArrowUpDown, Clock, TrendingUp, Wallet,
  MoreVertical, Edit2, History, CheckCircle2, AlertCircle, Target,
  Zap, Trophy, AlertTriangle, Calendar, Star, Pin, Filter,
  TrendingDown, Activity, ChevronRight, Sparkles, Layers,
  PlusCircle, Tag, EyeOff, Eye, MinusCircle, Archive, RotateCcw,
  LayoutGrid, List, CalendarDays, ChevronLeft, CalendarPlus
} from "lucide-react";
import { uid, clampNum, fmtMoney, resizeImageFileToDataUrl } from "@/lib/utils";
import { HOVER_GLOW } from "@/lib/ui.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { isDeleted } from "@/lib/syncDb.js";

import { calcWinRatePct, getGlobalWinRateMode, classifyTradeOutcome } from "@/lib/metrics/winRate.js";
import {
  mergePropTemplates,
  getTemplate,
  getPhase,
  getPhaseIndex,
  phaseStatusLabel,
  summarizePayouts,
  computePayoutForecast,
  isLivePropAccount,
  normalizePayout,
  BUILTIN_PROP_TEMPLATES,
  getFirmBranding,
} from "@/lib/prop.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleDateString(); } catch { return ""; }
}

function fmtDateTime(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString(); } catch { return ""; }
}

function round2(n) {
  const x = clampNum(n);
  return Math.round(x * 100) / 100;
}

// Import shared calendar utilities
import {
  localeFromLang,
  pad2,
  normalizeDateKey,
  startOfMonth,
  addMonths,
  isSameDay,
  buildMonthGrid,
  formatRange,
  getWeekdayLabels,
} from "@/lib/calendar.js";

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const { t } = useI18n();
  const s = String(status || "Live");
  // Match both old format "1 Phase" and new format "Phase 1"
  const mPhaseOld = s.match(/^(\d+)\s+Phase$/);
  const mPhaseNew = s.match(/^Phase\s+(\d+)$/);
  const mPhase = mPhaseOld || mPhaseNew;

  const label =
    s === "Live" ? t("pages.accounts.status.live") :
    s === "On payout" ? t("pages.accounts.status.payout") :
    s === "Failed" ? t("pages.accounts.status.failed") :
    s === "Passed" ? t("pages.accounts.status.passed") :
    mPhase && mPhase[1] === "1" ? t("pages.accounts.status.phase1") :
    mPhase && mPhase[1] === "2" ? t("pages.accounts.status.phase2") :
    mPhase && mPhase[1] === "3" ? t("pages.accounts.status.phase3") :
    mPhase ? t("pages.accounts.status.phaseN", { n: mPhase[1] }) : s;

  // Haunted styling with cold glow effects
  const cls =
    s === "Live" ? "border-[#3B82F6]/40 bg-[#3B82F6]/15 text-emerald-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]" :
    s === "On payout" ? "border-amber-500/40 bg-amber-500/15 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]" :
    s === "Passed" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.2)]" :
    s === "Failed" ? "border-red-500/40 bg-red-500/15 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.15)]" :
    mPhase && mPhase[1] === "1" ? "border-[#3B82F6]/40 bg-[#3B82F6]/15 text-emerald-500 shadow-[0_0_10px_rgba(59,130,246,0.15)]" :
    "border-[#22D3EE]/40 bg-[#22D3EE]/15 text-[#818CF8] shadow-[0_0_10px_rgba(79,70,229,0.15)]";

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:shadow-lg ${cls}`}>{label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENHANCED PROGRESS BAR (for challenges)
// ─────────────────────────────────────────────────────────────────────────────

function ChallengeProgress({ profitPct, targetPct, maxLossPct, minDays, tradedDays, t }) {
  // Target progress (0 to target)
  const targetProgress = targetPct > 0 ? Math.min(100, Math.max(0, (profitPct / targetPct) * 100)) : 0;
  const isTargetReached = profitPct >= targetPct;
  
  // Drawdown progress (0 to max loss) - only show if in drawdown
  const drawdownPct = Math.abs(Math.min(0, profitPct));
  const drawdownProgress = maxLossPct > 0 ? Math.min(100, (drawdownPct / maxLossPct) * 100) : 0;
  const isDrawdownDanger = drawdownProgress > 70;
  const isDrawdownWarning = drawdownProgress > 50;
  
  // Days progress
  const daysProgress = minDays > 0 ? Math.min(100, (tradedDays / minDays) * 100) : 100;
  const daysReached = tradedDays >= minDays;
  
  return (
    <div className="mt-3 space-y-3">
      {/* Target Progress - Haunted cold blue glow */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
            <Target className="h-3 w-3" />
            {t("pages.accounts.progress.target")}
          </span>
          <span className={`font-semibold ${isTargetReached ? "text-emerald-500" : profitPct > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {profitPct > 0 ? "+" : ""}{profitPct.toFixed(2)}% / {targetPct.toFixed(0)}%
          </span>
        </div>
        <div className="relative h-2.5 w-full rounded-full bg-[#0B1220] border border-accent/15 overflow-hidden shadow-[inset_0_0_10px_rgba(59,130,246,0.1)]">
          {/* Progress fill with Haunted glow */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${targetProgress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full relative overflow-hidden ${
              isTargetReached 
                ? "bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] shadow-[0_0_15px_rgba(59,130,246,0.4)]" 
                : "bg-gradient-to-r from-[#3B82F6] to-[#22D3EE] shadow-[0_0_12px_rgba(59,130,246,0.3)]"
            }`}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </motion.div>
          {/* Target marker */}
          <div className="absolute right-0 top-0 h-full w-0.5 bg-[#60A5FA]/50" />
        </div>
        {isTargetReached && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
            <Trophy className="h-3 w-3" />
            {t("pages.accounts.progress.targetReached")}
          </div>
        )}
      </div>
      
      {/* Drawdown Progress - only show if relevant */}
      {maxLossPct > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
              <TrendingDown className="h-3 w-3" />
              {t("pages.accounts.progress.drawdown")}
            </span>
            <span className={`font-semibold ${
              isDrawdownDanger ? "text-red-500" : 
              isDrawdownWarning ? "text-amber-400" : 
              "text-muted-foreground"
            }`}>
              {drawdownPct.toFixed(2)}% / {maxLossPct}%
            </span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-[#0B1220] border border-accent/10 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${drawdownProgress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full ${
                isDrawdownDanger 
                  ? "bg-gradient-to-r from-red-500 to-red-600 shadow-[0_0_10px_rgba(239,68,68,0.3)]" 
                  : isDrawdownWarning 
                  ? "bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.25)]" 
                  : "bg-gradient-to-r from-slate-400 to-slate-300"
              }`}
            />
            {/* Danger zone marker at 70% */}
            <div className="absolute top-0 h-full w-px bg-red-500/60" style={{ left: "70%" }} />
          </div>
          {isDrawdownDanger && (
            <div className="flex items-center gap-1 text-[10px] text-red-500 font-medium animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              {t("pages.accounts.progress.dangerZone")}
            </div>
          )}
        </div>
      )}
      
      {/* Trading Days Progress */}
      {minDays > 0 && (
        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-accent/10">
          <span className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
            <Calendar className="h-3 w-3" />
            {t("pages.accounts.progress.tradingDays")}
          </span>
          <span className={`font-semibold ${daysReached ? "text-emerald-500" : "text-muted-foreground"}`}>
            {tradedDays} / {minDays} {t("common.days").toLowerCase()}
            {daysReached && <CheckCircle2 className="inline h-3 w-3 ml-1" />}
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT EQUITY CURVE (for detail modal)
// ─────────────────────────────────────────────────────────────────────────────

function AccountEquityCurve({ trades, accountId, startingEquity, currency }) {
  const chartData = useMemo(() => {
    const list = [...trades]
      .filter(tr => !isDeleted(tr))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    
    let cumulative = startingEquity;
    let peak = startingEquity;
    const points = [{ x: 0, equity: startingEquity, drawdown: 0 }];
    
    for (let i = 0; i < list.length; i++) {
      const alloc = (list[i].allocations || []).find(a => a.accountId === accountId);
      const pnl = clampNum(alloc?.pnl || 0);
      cumulative += pnl;
      peak = Math.max(peak, cumulative);
      const drawdown = peak > 0 ? ((cumulative - peak) / peak) * 100 : 0;
      points.push({
        x: i + 1,
        equity: cumulative,
        drawdown,
        pnl,
        date: list[i].date || "",
      });
    }
    
    return points;
  }, [trades, accountId, startingEquity]);
  
  if (chartData.length <= 1) return null;
  
  const minEquity = Math.min(...chartData.map(p => p.equity));
  const maxEquity = Math.max(...chartData.map(p => p.equity));
  const range = maxEquity - minEquity || 1;
  const padding = range * 0.1;
  
  const chartMin = minEquity - padding;
  const chartMax = maxEquity + padding;
  const chartRange = chartMax - chartMin;
  
  const width = 100;
  const height = 60;
  
  const finalEquity = chartData[chartData.length - 1].equity;
  const pnl = finalEquity - startingEquity;
  const pnlPct = startingEquity > 0 ? (pnl / startingEquity) * 100 : 0;
  
  const equityPath = chartData.map((p, i) => {
    const x = (i / (chartData.length - 1)) * width;
    const y = height - ((p.equity - chartMin) / chartRange) * height;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  
  const areaPath = equityPath + ` L ${width} ${height} L 0 ${height} Z`;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{fmtMoney(startingEquity, currency)}</span>
        <span className={`font-semibold ${pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
          {pnl >= 0 ? '+' : ''}{fmtMoney(pnl, currency)} ({pnlPct.toFixed(1)}%)
        </span>
        <span className="font-medium">{fmtMoney(finalEquity, currency)}</span>
      </div>
      <div className="h-16 w-full">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id={`eqGradient-${accountId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={pnl >= 0 ? "rgb(16, 185, 129)" : "rgb(244, 63, 94)"} stopOpacity="0.3" />
              <stop offset="100%" stopColor={pnl >= 0 ? "rgb(16, 185, 129)" : "rgb(244, 63, 94)"} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Zero line */}
          {chartMin < startingEquity && chartMax > startingEquity && (
            <line
              x1="0"
              y1={height - ((startingEquity - chartMin) / chartRange) * height}
              x2={width}
              y2={height - ((startingEquity - chartMin) / chartRange) * height}
              stroke="rgb(var(--muted-foreground))"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              opacity="0.4"
            />
          )}
          <path d={areaPath} fill={`url(#eqGradient-${accountId})`} />
          <path
            d={equityPath}
            fill="none"
            stroke={pnl >= 0 ? "rgb(16, 185, 129)" : "rgb(244, 63, 94)"}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK STATS ROW
// ─────────────────────────────────────────────────────────────────────────────

function QuickStats({ trades, account, t, winRateMode = "ignore" }) {
  const stats = useMemo(() => {
    const accTrades = (trades || []).filter(tr => 
      !isDeleted(tr) && 
      (tr.allocations || []).some(a => a.accountId === account.id)
    );
    
    let wins = 0, losses = 0, breakEvens = 0;
    for (const tr of accTrades) {
      const alloc = (tr.allocations || []).find(a => a.accountId === account.id);
      if (alloc) {
        const pnl = clampNum(alloc.pnl);
        const isBE = Boolean(alloc.isBreakEven || tr.isBreakEven) || tr?.outcome === "BE";
        const outcome = classifyTradeOutcome({ pnl, isBreakEven: isBE, mode: "ignore" });
        if (outcome === "win") wins++;
        else if (outcome === "loss") losses++;
        else breakEvens++;
      }
    }
    
    const total = accTrades.length;
    // Use global winRateMode from props
    const mode = winRateMode === "loss" ? "loss" : "ignore";
    const winRate = calcWinRatePct({ wins, losses, breakEvens, mode });
    
    // Unique trading days + manual trading days
    const uniqueDays = new Set(accTrades.map(tr => tr.date?.slice(0, 10))).size;
    const manualDays = clampNum(account.manualTradingDays || 0);
    const days = uniqueDays + manualDays;
    
    return { total, winRate, days };
  }, [trades, account.id, account.manualTradingDays, winRateMode]);
  
  if (stats.total === 0 && stats.days === 0) return null;
  
  return (
    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30 text-[11px]">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Activity className="h-3 w-3" />
        <span>{stats.total} {t("common.trades").toLowerCase()}</span>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Target className="h-3 w-3" />
        <span>{stats.winRate.toFixed(0)}% WR</span>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Calendar className="h-3 w-3" />
        <span>{stats.days} {t("common.days").toLowerCase()}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT CARD
// ─────────────────────────────────────────────────────────────────────────────

function AccountCard({ account, templates, trades, onEdit, onPayout, onArchive, onTrash, onPin, onQuickTrade, onViewDetail, onProgressPhase, onAddTradingDay, onToggleHidden, isPinned, toast, winRateMode = "ignore" }) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  
  const tpl = getTemplate(templates, account?.prop?.templateId);
  const ph = tpl ? getPhase(tpl, account?.prop?.phaseId) : null;
  const isLive = ph?.kind === "funded";
  const isChallenge = tpl && !isLive;
  const isProp = !!tpl;
  
  // For profit calculations and rule evaluations:
  // - Prop accounts: ALWAYS use prop.size (the account size the firm evaluates against)
  // - Personal accounts: use startingEquity
  const initialBalance = isProp ? clampNum(account.prop?.size) : clampNum(account.startingEquity);
  const curEq = clampNum(account.currentEquity);
  const profit = curEq - initialBalance;
  const profitPct = initialBalance > 0 ? (profit / initialBalance) * 100 : 0;
  const currency = account.currency || "$";
  
  // Challenge progress data (prefer rulesOverride, then template base rules)
  const ov = account?.prop?.rulesOverride || {};
  const targetPct = ov.profitTargetPct ?? ph?.rules?.profitTargetPct ?? 0;
  const maxLossPct = ov.maxLossPct ?? ph?.rules?.maxLossPct ?? 0;
  const minDays = ov.minTradingDays ?? ph?.rules?.minTradingDays ?? 0;
  
  // Phase progression logic
  const phaseIndex = tpl ? getPhaseIndex(tpl, account?.prop?.phaseId) : -1;
  const nextPhase = tpl?.phases?.[phaseIndex + 1];
  
  // Count traded days and compute equity curve for this account
  const { tradedDays, equityCurve } = useMemo(() => {
    const accTrades = (trades || []).filter(tr => 
      !isDeleted(tr) && 
      (tr.allocations || []).some(a => a.accountId === account.id)
    );
    
    // Trading days = unique days from trades + manual trading days
    const uniqueDays = new Set(accTrades.map(tr => tr.date?.slice(0, 10))).size;
    const manualDays = clampNum(account.manualTradingDays || 0);
    const days = uniqueDays + manualDays;
    
    // Get PnL for this account from each trade
    const tradePnLs = accTrades.map(tr => {
      const alloc = (tr.allocations || []).find(a => a.accountId === account.id);
      return {
        date: tr.date || tr.createdAt,
        pnl: alloc ? clampNum(alloc.pnl) : 0
      };
    });
    
    // Calculate equity curve
    const curve = calculateEquityCurve(tradePnLs, initialBalance);
    const recentCurve = getRecentEquity(curve, 15);
    
    return { tradedDays: days, equityCurve: recentCurve };
  }, [trades, account.id, account.manualTradingDays, initialBalance]);
  
  // Payout info for Live
  const payoutForecast = isLive ? computePayoutForecast(account, templates) : null;
  const { paidTrader = 0, pendingTrader = 0, payouts: allPayouts = [] } = isLive ? summarizePayouts(account, templates) : {};
  const totalPaidAll = allPayouts.filter(p => p.status === "paid").reduce((s, p) => s + clampNum(p.amountTrader), 0);
  
  // Status indicators
  const isFailed = account.status === "Failed";
  const isPassed = account.status === "Passed";
  const isOnPayout = account.status === "On payout";
  
  // Check if phase can be progressed (target reached + days met)
  const canProgressPhase = useMemo(() => {
    if (!isChallenge || isLive || isFailed || isPassed) return false;
    const targetMet = targetPct > 0 ? profitPct >= targetPct : true;
    const daysMet = minDays > 0 ? tradedDays >= minDays : true;
    const notFailed = maxLossPct > 0 ? profitPct > -maxLossPct : true;
    return targetMet && daysMet && notFailed && !!nextPhase;
  }, [isChallenge, isLive, isFailed, isPassed, targetPct, profitPct, minDays, tradedDays, maxLossPct, nextPhase]);
  
  // Calculate alerts/notifications
  const alerts = useMemo(() => {
    const list = [];
    
    if ((isChallenge || isLive) && !isFailed && !isPassed) {
      // Check if phase can be progressed (use canProgressPhase logic)
      if (canProgressPhase) {
        // Phase passed - show congratulations with next phase
        list.push({
          type: "phase_passed",
          key: "phase_passed",
          message: t("pages.accounts.alerts.phasePassed", { phase: nextPhase.label || nextPhase.id }),
          icon: Trophy,
        });
      } else if (targetPct > 0 && profitPct >= targetPct * 0.8 && profitPct < targetPct) {
        // Near target (80-99% of profit target) - only show when NOT at 100%
        list.push({
          type: "success",
          key: "near_target",
          message: t("pages.accounts.alerts.nearTarget"),
          icon: Target,
        });
      }
      
      // MAX LOSS BREACH - account is failed
      if (maxLossPct > 0 && profitPct < 0 && Math.abs(profitPct) >= maxLossPct) {
        list.push({
          type: "breach",
          key: "max_loss_breach",
          message: t("pages.accounts.alerts.maxLossBreach"),
          icon: AlertTriangle,
        });
      }
      // Danger zone - close to max loss (70%+ of max loss)
      else if (maxLossPct > 0 && profitPct < 0 && Math.abs(profitPct) >= maxLossPct * 0.7) {
        list.push({
          type: "danger",
          key: "near_fail",
          message: t("pages.accounts.alerts.nearFail"),
          icon: AlertTriangle,
        });
      }
      
      // Trading days milestone - only show if phase not yet passed
      if (minDays > 0 && tradedDays >= minDays && tradedDays < minDays + 2 && !canProgressPhase) {
        list.push({
          type: "info",
          key: "days_reached",
          message: t("pages.accounts.alerts.daysReached"),
          icon: Calendar,
        });
      }
    }
    
    // Payout ready for Live accounts
    if (isLive && payoutForecast?.eligible && payoutForecast.availableTrader > 0) {
      list.push({
        type: "success",
        key: "payout_ready",
        message: t("pages.accounts.alerts.payoutReady"),
        icon: DollarSign,
      });
    }
    
    return list;
  }, [isChallenge, isLive, isFailed, isPassed, profitPct, targetPct, maxLossPct, minDays, tradedDays, payoutForecast, canProgressPhase, nextPhase, t]);
  
  // Check for breach
  const isBreached = alerts.some(a => a.key === "max_loss_breach");
  
  // Glow effect based on status
  const glowClass = isFailed || isBreached
    ? "ring-1 ring-rose-500/20" 
    : isPassed || isLive
    ? "ring-1 ring-emerald-500/20"
    : isOnPayout 
    ? "ring-1 ring-amber-500/20"
    : alerts.some(a => a.type === "danger")
    ? "ring-1 ring-rose-500/30 animate-pulse"
    : alerts.some(a => a.type === "success")
    ? "ring-1 ring-emerald-500/30"
    : "";
  
  return (
    <div 
      className={`relative rounded-xl border border-border bg-card/60 p-4 transition hover:border-border/80 cursor-pointer ${HOVER_GLOW} ${glowClass}`}
      onClick={(e) => {
        // Don't trigger if clicking on menu or buttons
        if (e.target.closest('button') || e.target.closest('[role="menu"]')) return;
        onViewDetail?.(account);
      }}
    >
      {/* Pinned indicator */}
      {isPinned && (
        <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-accent flex items-center justify-center shadow-lg">
          <Pin className="h-3 w-3 text-[rgb(var(--on-accent))]" />
        </div>
      )}
      
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <AvatarBubble avatar={account.avatar} color={account.color} size={48} />
            {/* Status icon overlay */}
            {(isPassed || isFailed) && (
              <div className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center ${
                isPassed ? "bg-emerald-500" : "bg-rose-500"
              }`}>
                {isPassed ? (
                  <Trophy className="h-3 w-3 text-white" />
                ) : (
                  <X className="h-3 w-3 text-white" />
                )}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{account.name || t("common.untitled")}</div>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={account.status} />
              {isLive && payoutForecast?.eligible && payoutForecast.availableTrader > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium animate-pulse">
                  <Sparkles className="h-3 w-3" />
                  {t("pages.accounts.payoutReady")}
                </span>
              )}
            </div>
            {/* Tags */}
            {account.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {account.tags.slice(0, 3).map((tag, idx) => (
                  <span
                    key={`${tag}-${idx}`}
                    className="px-1.5 py-0.5 rounded text-[9px] bg-muted/60 text-muted-foreground"
                  >
                    #{tag}
                  </span>
                ))}
                {account.tags.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{account.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions menu */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t("common.menu") || "Menu"}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-card p-1 shadow-xl">
                <button
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted/50"
                  onClick={() => { setMenuOpen(false); onViewDetail?.(account); }}
                >
                  <Activity className="h-4 w-4" /> {t("pages.accounts.viewDetails")}
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted/50"
                  onClick={() => { setMenuOpen(false); onEdit(account); }}
                >
                  <Edit2 className="h-4 w-4" /> {t("common.edit")}
                </button>
                {onPin && (
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => { setMenuOpen(false); onPin(account.id); }}
                  >
                    <Pin className="h-4 w-4" /> 
                    {isPinned ? t("pages.accounts.unpin") : t("pages.accounts.pin")}
                  </button>
                )}
                {onQuickTrade && (
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    onClick={() => { setMenuOpen(false); onQuickTrade(account.id); }}
                  >
                    <PlusCircle className="h-4 w-4" /> {t("pages.accounts.quickTrade")}
                  </button>
                )}
                {isLive && (
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => { setMenuOpen(false); onPayout(account); }}
                  >
                    <DollarSign className="h-4 w-4" /> {t("pages.accounts.payouts.title")}
                  </button>
                )}
                {onAddTradingDay && (
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    onClick={() => { setMenuOpen(false); onAddTradingDay(account); }}
                  >
                    <CalendarPlus className="h-4 w-4" /> {t("pages.accounts.addTradingDay", null, "Добавить торговый день")}
                  </button>
                )}
                {onToggleHidden && (
                  <button
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted/50"
                    onClick={() => { setMenuOpen(false); onToggleHidden(account); }}
                  >
                    {account.isHidden
                      ? <><Eye className="h-4 w-4" /> {t("pages.accounts.unhideAccount", null, "Unhide account")}</>
                      : <><EyeOff className="h-4 w-4" /> {t("pages.accounts.hideAccount", null, "Hide account")}</>
                    }
                  </button>
                )}
                <div className="my-1 border-t border-border/50" />
                <button
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-muted/50"
                  onClick={() => { setMenuOpen(false); onArchive(account.id); }}
                >
                  <Archive className="h-4 w-4" /> {t("common.archiveVerb")}
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger)/0.1)]"
                  onClick={() => { setMenuOpen(false); onTrash(account.id); }}
                >
                  <Trash2 className="h-4 w-4" /> {t("common.moveToTrash")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Balance Section */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{t("common.currentEquity")}</div>
          <div className="text-xl font-bold">{fmtMoney(curEq, currency)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">PnL</div>
          <div className={`text-xl font-bold flex items-center justify-end gap-1 ${
            profit > 0 ? "text-emerald-500" : profit < 0 ? "text-rose-500" : "text-muted-foreground"
          }`}>
            {profit > 0 ? <TrendingUp className="h-4 w-4" /> : profit < 0 ? <TrendingDown className="h-4 w-4" /> : null}
            <span>
              {profit >= 0 ? "+" : ""}{fmtMoney(profit, currency)}
            </span>
          </div>
          <div className={`text-xs ${
            profitPct > 0 ? "text-emerald-500/70" : profitPct < 0 ? "text-rose-500/70" : "text-muted-foreground"
          }`}>
            {profitPct >= 0 ? "+" : ""}{profitPct.toFixed(2)}%
          </div>
        </div>
      </div>
      
      {/* Equity Sparkline */}
      {equityCurve.length > 2 && (
        <div className="mt-3 -mx-1">
          <Sparkline 
            data={equityCurve} 
            width={280} 
            height={36}
            showArea={true}
            className="w-full"
          />
        </div>
      )}
      
      {/* Alerts/Notifications */}
      {alerts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {alerts.map(alert => (
            <motion.div
              key={alert.key}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium ${
                alert.type === "breach"
                  ? "bg-rose-500/25 text-rose-600 dark:text-rose-300 border border-rose-500/30"
                  : alert.type === "danger"
                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  : alert.type === "phase_passed"
                  ? "bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30"
                  : alert.type === "success"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
              }`}
            >
              <alert.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{alert.message}</span>
              {alert.type === "breach" && (
                <Button 
                  size="sm" 
                  variant="destructive"
                  className="h-5 text-[10px] px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive?.(account.id);
                  }}
                >
                  {t("pages.accounts.archiveAccount")}
                </Button>
              )}
              {alert.type === "phase_passed" && nextPhase && (
                <>
                  <Button 
                    size="sm" 
                    variant="default"
                    className="h-5 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onProgressPhase?.(account, nextPhase.id);
                    }}
                  >
                    {t("pages.accounts.progressTo")} {nextPhase.label}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    className="h-5 text-[10px] px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive?.(account.id);
                    }}
                  >
                    {t("pages.accounts.archiveAccount")}
                  </Button>
                </>
              )}
            </motion.div>
          ))}
        </div>
      )}
      
      {/* Challenge Progress - Enhanced */}
      {isChallenge && targetPct > 0 && (
        <ChallengeProgress
          profitPct={profitPct}
          targetPct={targetPct}
          maxLossPct={maxLossPct}
          minDays={minDays}
          tradedDays={tradedDays}
          t={t}
        />
      )}
      
      {/* Live Payout Section */}
      {isLive && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-emerald-500/10">
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium uppercase">
                {t("pages.accounts.payouts.available")}
              </div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {fmtMoney(payoutForecast?.availableTrader || 0, currency)}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-amber-500/10">
              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase">
                {t("pages.accounts.payouts.pending")}
              </div>
              <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                {fmtMoney(pendingTrader, currency)}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-muted/30">
              <div className="text-[10px] text-muted-foreground font-medium uppercase">
                {t("pages.accounts.payouts.totalPaid")}
              </div>
              <div className="text-sm font-bold">
                {fmtMoney(totalPaidAll, currency)}
              </div>
            </div>
          </div>
          
          {payoutForecast?.eligible && payoutForecast.availableTrader > 0 && (
            <Button 
              variant="accent" 
              className="w-full mt-3 gap-2 group"
              onClick={() => onPayout(account)}
            >
              <DollarSign className="h-4 w-4 group-hover:animate-bounce" />
              {t("pages.accounts.requestPayout")}
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>
          )}
          
          {/* Always show manage payouts button for Live accounts */}
          {(!payoutForecast?.eligible || !payoutForecast?.availableTrader) && !isOnPayout && (
            <Button 
              variant="outline" 
              className="w-full mt-3 gap-2"
              onClick={() => onPayout(account)}
            >
              <Wallet className="h-4 w-4" />
              {t("pages.accounts.payouts.manage")}
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>
          )}
          
          {isOnPayout && (
            <div className="mt-3 p-2 rounded-xl bg-amber-500/10 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
              <Clock className="h-4 w-4 animate-pulse" />
              <span className="font-medium">{t("pages.accounts.payouts.pendingRequest")}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-auto text-xs h-7"
                onClick={() => onPayout(account)}
              >
                {t("pages.accounts.payouts.viewDetails")}
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* Quick Stats (for non-prop accounts) */}
      {!isProp && trades && (
        <QuickStats trades={trades} account={account} t={t} winRateMode={winRateMode} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVED ACCOUNT CARD (simplified)
// ─────────────────────────────────────────────────────────────────────────────

function ArchivedAccountCard({ account, onRestore, onTrash }) {
  const { t } = useI18n();
  const currency = account.currency || "$";
  
  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 p-3 opacity-70 hover:opacity-100 transition">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AvatarBubble avatar={account.avatar} color={account.color} size={32} />
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{account.name}</div>
            <div className="text-xs text-muted-foreground">
              {t("pages.accounts.archived")} {fmtDate(account.archivedAt)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onRestore(account.id)}>
            {t("common.restore")}
          </Button>
          <Button variant="ghost" size="sm" className="text-[rgb(var(--danger))]" onClick={() => onTrash(account.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP TEMPLATE PICKER (inline in create modal)
// ─────────────────────────────────────────────────────────────────────────────

function PropTemplatePicker({ templates, selected, onSelect }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Group templates by firm
  const grouped = useMemo(() => {
    const list = Array.isArray(templates) ? templates : [];
    const byFirm = new Map();
    for (const tpl of list) {
      const firm = String(tpl.firm || "Other").trim();
      if (!byFirm.has(firm)) byFirm.set(firm, []);
      byFirm.get(firm).push(tpl);
    }
    return byFirm;
  }, [templates]);
  
  // Filter templates by search query
  const filteredGrouped = useMemo(() => {
    if (!searchQuery.trim()) return grouped;
    
    const q = searchQuery.toLowerCase().trim();
    const filtered = new Map();
    
    for (const [firm, tpls] of grouped.entries()) {
      const matchingTpls = tpls.filter(tpl => 
        tpl.name?.toLowerCase().includes(q) || 
        firm.toLowerCase().includes(q) ||
        tpl.type?.toLowerCase().includes(q)
      );
      if (matchingTpls.length > 0 || firm.toLowerCase().includes(q)) {
        filtered.set(firm, matchingTpls.length > 0 ? matchingTpls : tpls);
      }
    }
    return filtered;
  }, [grouped, searchQuery]);
  
  // Get program type label (2-Step, 3-Step, Instant, etc.)
  const getProgramTypeLabel = (tpl) => {
    const evalPhases = (tpl.phases || []).filter(p => p.kind === "evaluation");
    if (evalPhases.length === 0) return "Instant";
    if (evalPhases.length === 1) return "1-Step";
    if (evalPhases.length === 2) return "2-Step";
    if (evalPhases.length === 3) return "3-Step";
    return `${evalPhases.length}-Step`;
  };
  
  // Auto-expand firm when search matches
  useEffect(() => {
    if (searchQuery.trim() && filteredGrouped.size === 1) {
      setExpanded(Array.from(filteredGrouped.keys())[0]);
    }
  }, [searchQuery, filteredGrouped]);
  
  return (
    <div className="space-y-3">
      {/* Search input */}
      {grouped.size > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("common.search") + "..."}
            aria-label={t("common.search")}
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-border/50 bg-card/70 text-sm placeholder:text-muted-foreground/60 focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition-all duration-150"
          />
        </div>
      )}
      
      {/* Grouped templates */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {Array.from(filteredGrouped.entries()).map(([firm, tpls]) => (
          <div key={firm} className="rounded-xl overflow-hidden">
            <button
              type="button"
              className={`flex w-full items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-150 text-sm font-semibold ${
                expanded === firm 
                  ? "bg-accent/15 text-foreground border border-accent/30" 
                  : "bg-muted/30 hover:bg-muted/50 text-foreground/90 border border-transparent"
              }`}
              onClick={() => setExpanded(expanded === firm ? null : firm)}
            >
              <span>{firm}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-normal">{tpls.length}</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded === firm ? "rotate-180" : ""}`} />
              </div>
            </button>
            
            {expanded === firm && (
              <div className="mt-1 ml-1 space-y-0.5 pb-1">
                {tpls.map(tpl => {
                  const isSelected = selected === tpl.id;
                  const typeLabel = getProgramTypeLabel(tpl);
                  
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`flex w-full items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                        isSelected 
                          ? "bg-accent text-[rgb(var(--on-accent))] shadow-md shadow-accent/20" 
                          : "hover:bg-muted/40 text-foreground/90"
                      }`}
                      onClick={() => onSelect(tpl.id)}
                    >
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected 
                          ? "border-[rgb(var(--on-accent))] bg-[rgb(var(--on-accent))]/20" 
                          : "border-border/50"
                      }`}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium">{tpl.name}</div>
                        <div className={`text-xs mt-0.5 ${isSelected ? "opacity-80" : "text-muted-foreground"}`}>
                          {typeLabel} • {tpl.phases?.length || 0} {t("pages.accounts.phases")}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        
        {filteredGrouped.size === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            {t("common.nothingFound")}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE/EDIT ACCOUNT MODAL
// ─────────────────────────────────────────────────────────────────────────────

function AccountModal({ open, onClose, account, accounts = [], templates, onSave, toast }) {
  const { t } = useI18n();
  const isEdit = !!account?.id;
  const fileRef = useRef(null);
  
  const [form, setForm] = useState({
    name: "",
    currency: "$",
    startingEquity: "",
    currentEquity: "",
    status: "Live",
    notes: "",
    avatar: { type: "emoji", emoji: "💼" },
    color: "#6366f1",
    tags: [], // Custom tags
    isHidden: false, // Hidden accounts
    // Prop settings
    isProp: false,
    templateId: "",
    phaseId: "",
    propSize: "",
    challengeCost: "", // Cost paid for the challenge
    // Payout policy settings (for Live accounts)
    payoutCycleDays: "14",
    payoutFirstAfterDays: "14",
    payoutMinAmount: "50",
    payoutSplitPct: "",
    // Rules override
    profitTargetOverride: "",
    // Trading days management
    manualTradingDays: 0,
    // Metrics preferences
    winRateBreakEvenMode: "ignore", // "ignore" | "loss"
    winRateNeutralRR: 0, // Neutral zone threshold for RR
  });
  const [tagInput, setTagInput] = useState("");
  const [showRulesOverride, setShowRulesOverride] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  
  // Initialize form when opening
  useEffect(() => {
    if (open && account) {
      const policy = account?.prop?.payoutPolicyOverride || {};
      setForm({
        name: account.name || "",
        currency: account.currency || "$",
        startingEquity: String(account.startingEquity || ""),
        currentEquity: String(account.currentEquity || ""),
        status: account.status || "Live",
        notes: account.notes || "",
        avatar: account.avatar || { type: "emoji", emoji: "💼" },
        color: account.color || "#6366f1",
        tags: Array.isArray(account.tags) ? account.tags : [],
        isHidden: !!account.isHidden,
        isProp: !!account.prop?.templateId,
        templateId: account.prop?.templateId || "",
        phaseId: account.prop?.phaseId || "",
        propSize: String(account.prop?.size || account.startingEquity || ""),
        challengeCost: String(account.prop?.challengeCost ?? ""),
        // Payout policy
        payoutCycleDays: String(policy.cycleDays ?? "14"),
        payoutFirstAfterDays: String(policy.firstPayoutAfterDays ?? "14"),
        payoutMinAmount: String(policy.minPayoutTrader ?? "50"),
        payoutSplitPct: String(account.prop?.profitSplitPctOverride ?? ""),
        // Rules override
        profitTargetOverride: String(account.prop?.rulesOverride?.profitTargetPct ?? ""),
        // Trading days
        manualTradingDays: clampNum(account.manualTradingDays) || 0,
        // Metrics preferences - default to "ignore" for backward compatibility
        winRateBreakEvenMode: account.metricsPrefs?.winRateBreakEvenMode || "ignore",
        winRateNeutralRR: clampNum(account.metricsPrefs?.winRateNeutralRR) || 0,
      });
      setTagInput("");
    } else if (open) {
      // New account defaults - Prop-firm is default
      setForm({
        name: "",
        currency: "$",
        startingEquity: "",
        currentEquity: "",
        status: "Live",
        notes: "",
        avatar: { type: "emoji", emoji: "💼" },
        color: "#6366f1",
        tags: [],
        isHidden: false,
        isProp: true, // Default to Prop-firm
        templateId: "",
        phaseId: "",
        propSize: "",
        challengeCost: "",
        payoutCycleDays: "14",
        payoutFirstAfterDays: "14",
        payoutMinAmount: "50",
        payoutSplitPct: "",
        profitTargetOverride: "",
        manualTradingDays: 0,
        winRateBreakEvenMode: "ignore",
        winRateNeutralRR: 0,
      });
      setTagInput("");
      setShowRulesOverride(false);
      setShowAccountDetails(false);
    }
  }, [open, account]);
  
  // Get phases for selected template
  const selectedTemplate = form.templateId ? getTemplate(templates, form.templateId) : null;
  const phases = selectedTemplate?.phases || [];
  
  // Auto-select first phase when template changes
  useEffect(() => {
    if (form.templateId && phases.length > 0 && !form.phaseId) {
      // Default to first evaluation phase (not the last funded phase)
      const firstEvalPhase = phases.find(p => p.kind === "evaluation") || phases[0];
      setForm(f => ({ ...f, phaseId: firstEvalPhase.id }));
    }
  }, [form.templateId, phases]);
  
  const handleSave = () => {
    const startEq = clampNum(form.startingEquity);
    const curEq = form.currentEquity ? clampNum(form.currentEquity) : startEq;
    
    // Validate starting balance is required for personal accounts
    if (!form.isProp && startEq <= 0) {
      toast?.push({ 
        title: t("common.error"), 
        description: t("pages.accounts.errors.startingBalanceRequired") 
      });
      return;
    }
    
    // Validate prop account size
    if (form.isProp && form.templateId) {
      const propSize = form.propSize !== "" && form.propSize !== undefined 
        ? clampNum(form.propSize) 
        : startEq;
      if (propSize <= 0) {
        toast?.push({ 
          title: t("common.error"), 
          description: t("pages.accounts.errors.accountSizeRequired") 
        });
        return;
      }
    }
    
    // C5: Auto-generate account name if empty
    let accountName = form.name.trim();
    if (!accountName) {
      if (form.isProp && form.templateId) {
        const tpl = getTemplate(templates, form.templateId);
        const ph = getPhase(tpl, form.phaseId);
        const size = clampNum(form.propSize) || startEq;
        const firmName = tpl?.firm || "Prop";
        const phaseName = ph?.label || "Phase 1";
        accountName = `${firmName} ${Math.round(size)} • ${phaseName}`;
      } else {
        // Generate Account 1, Account 2, etc.
        const existingNumbers = (accounts || [])
          .map(a => a.name)
          .filter(name => /^Account \d+$/.test(name))
          .map(name => {
            const match = name.match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
          });
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        accountName = `Account ${nextNumber}`;
      }
    }
    
    // Get avatar - use prop firm logo if selecting prop and no custom avatar set
    let avatar = form.avatar;
    if (form.isProp && form.templateId && !isEdit) {
      const tpl = getTemplate(templates, form.templateId);
      const branding = tpl ? getFirmBranding(tpl.firm) : null;
      if (branding?.logoSrc && (!avatar || avatar.type === "emoji")) {
        avatar = { type: "image", imageData: branding.logoSrc };
      }
    }
    
    let newAccount = {
      id: account?.id || uid(),
      name: accountName,
      currency: form.currency || "$",
      startingEquity: startEq,
      currentEquity: curEq,
      status: form.status,
      notes: form.notes,
      avatar: avatar,
      tags: form.tags || [],
      color: form.color,
      isHidden: !!form.isHidden,
      manualTradingDays: clampNum(form.manualTradingDays),
      createdAt: account?.createdAt || Date.now(),
      // Metrics preferences
      metricsPrefs: {
        winRateBreakEvenMode: form.winRateBreakEvenMode || "ignore",
        winRateNeutralRR: Math.max(0, clampNum(form.winRateNeutralRR)),
      },
    };
    
    // Add prop settings if enabled
    if (form.isProp && form.templateId) {
      const tpl = getTemplate(templates, form.templateId);
      const ph = getPhase(tpl, form.phaseId);
      const size = clampNum(form.propSize) || startEq;
      const isLivePhase = ph?.kind === "funded";
      
      // For prop accounts, startingEquity can differ from prop.size.
      // Users may set a custom starting balance (e.g. if they started tracking
      // the account after an initial drawdown). Defaults to prop size.
      newAccount.startingEquity = startEq > 0 ? startEq : size;
      // Use form.currentEquity if provided, otherwise default to startingEquity for new accounts
      newAccount.currentEquity = form.currentEquity ? clampNum(form.currentEquity) : (isEdit ? curEq : newAccount.startingEquity);
      // Preserve existing payouts when determining status
      const existingPayouts = account?.prop?.payouts || [];
      newAccount.status = phaseStatusLabel(tpl, form.phaseId, existingPayouts);
      
      // Build payout policy override for Live accounts
      const payoutPolicyOverride = isLivePhase ? {
        cycleDays: form.payoutCycleDays !== "" ? clampNum(form.payoutCycleDays) : 14,
        firstPayoutAfterDays: form.payoutFirstAfterDays !== "" ? clampNum(form.payoutFirstAfterDays) : 14,
        minPayoutTrader: form.payoutMinAmount !== "" ? clampNum(form.payoutMinAmount) : 50,
      } : account?.prop?.payoutPolicyOverride || null;
      
      // Profit split override
      const profitSplitPctOverride = form.payoutSplitPct 
        ? clampNum(form.payoutSplitPct) 
        : account?.prop?.profitSplitPctOverride ?? null;
      
      // Challenge cost (amount paid for the challenge)
      const challengeCost = form.challengeCost 
        ? clampNum(form.challengeCost) 
        : account?.prop?.challengeCost ?? null;
      
      // Build rules override
      const baseRulesOverride = account?.prop?.rulesOverride || {};
      const profitTargetPctOverride = form.profitTargetOverride !== "" 
        ? clampNum(form.profitTargetOverride) 
        : null;
      const rulesOverride = {
        ...baseRulesOverride,
        profitTargetPct: profitTargetPctOverride,
      };
      // Clean up null values from rulesOverride
      if (rulesOverride.profitTargetPct === null) {
        delete rulesOverride.profitTargetPct;
      }
      
      newAccount.prop = {
        templateId: form.templateId,
        phaseId: form.phaseId || phases[0]?.id || "phase1",
        size: size,
        startedAt: account?.prop?.startedAt || Date.now(),
        autoProgress: true,
        rulesOverride: rulesOverride,
        profitSplitPctOverride: profitSplitPctOverride,
        challengeCost: challengeCost,
        payoutPolicyOverride: payoutPolicyOverride,
        previousAccountId: account?.prop?.previousAccountId || null,
        nextAccountId: account?.prop?.nextAccountId || null,
        autoProgressDone: account?.prop?.autoProgressDone || {},
        eval: null,
        payouts: account?.prop?.payouts || [],
      };
    }
    
    // Compute equityCorrection to preserve manual balance adjustments through reconciliation.
    // Reconciliation calculates: expectedEquity = startingEquity + tradePnl + equityCorrection
    // So equityCorrection = newCurrentEquity - newStartingEquity - tradePnl
    if (isEdit && account) {
      const oldCorrection = clampNum(account.equityCorrection);
      // Derive trade PnL from old state: oldCurrent = oldStarting + tradePnl + oldCorrection
      const tradePnl = clampNum(account.currentEquity) - clampNum(account.startingEquity) - oldCorrection;
      newAccount.equityCorrection = newAccount.currentEquity - newAccount.startingEquity - tradePnl;
    } else {
      // For new accounts: preserve manually set currentEquity through reconciliation.
      // At creation time tradePnl is assumed 0, so equityCorrection keeps the delta.
      const newStartEq = clampNum(newAccount.startingEquity);
      const newCurEq   = clampNum(newAccount.currentEquity);
      if (newCurEq > 0 && newStartEq > 0) {
        newAccount.equityCorrection = newCurEq - newStartEq;
      } else {
        newAccount.equityCorrection = 0;
      }
    }
    
    onSave(newAccount);
    onClose();
    toast?.push({ title: isEdit ? t("pages.accounts.toasts.updated") : t("pages.accounts.toasts.created") });
  };
  
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, { maxSize: 120, quality: 0.8 });
      setForm(f => ({ ...f, avatar: { type: "image", imageData: dataUrl } }));
    } catch (err) {
      toast?.push({ title: t("common.error"), description: String(err) });
    }
  };
  
  // Handle number input with comma/dot normalization
  const handleNumberInput = (field) => (e) => {
    const value = e.target.value.replace(/,/g, '.');
    setForm(f => ({ ...f, [field]: value }));
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t("pages.accounts.editTitle") : t("pages.accounts.add")}>
      <div className="space-y-4 sm:space-y-6">
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 1: ACCOUNT TYPE TOGGLE
        ═══════════════════════════════════════════════════════════════════════ */}
        {!isEdit && (
          <div className="p-1.5 rounded-xl bg-muted/30 border border-border/30">
            <div className="flex gap-1.5">
              <button
                type="button"
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  !form.isProp 
                    ? "bg-card shadow-lg shadow-accent/10 border border-accent/30 text-foreground" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => setForm(f => ({ ...f, isProp: false, templateId: "", phaseId: "" }))}
              >
                {t("pages.accounts.type.personal")}
              </button>
              <button
                type="button"
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  form.isProp 
                    ? "bg-card shadow-lg shadow-accent/10 border border-accent/30 text-foreground" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
                onClick={() => setForm(f => ({ ...f, isProp: true }))}
              >
                {t("pages.accounts.type.prop")}
              </button>
            </div>
          </div>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 2: PROGRAM & PHASE (Prop-firm only)
        ═══════════════════════════════════════════════════════════════════════ */}
        {form.isProp && !isEdit && (
          <div className="space-y-4 p-4 rounded-xl border border-border/40 bg-muted/10">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-foreground">{t("pages.accounts.selectProgram")}</span>
            </div>
            <PropTemplatePicker 
              templates={templates} 
              selected={form.templateId}
              onSelect={(id) => setForm(f => ({ ...f, templateId: id, phaseId: "" }))}
            />
            
            {/* Phase Selection (nested, shown when template selected) */}
            {form.templateId && phases.length > 0 && (
              <div className="space-y-2 pt-3 mt-3 border-t border-border/30">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("pages.accounts.selectPhase")}</label>
                <div className="flex flex-wrap gap-2">
                  {phases.map(ph => (
                    <button
                      key={ph.id}
                      type="button"
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
                        form.phaseId === ph.id
                          ? "bg-accent text-[rgb(var(--on-accent))] border-transparent shadow-md shadow-accent/20"
                          : "border-border/50 bg-card/50 hover:bg-muted/60 hover:border-border"
                      }`}
                      onClick={() => setForm(f => ({ ...f, phaseId: ph.id }))}
                    >
                      {ph.label}
                      {ph.kind === "funded" && <span className="ml-1.5">🎯</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Account Size (nested, shown when template selected) */}
            {form.templateId && (
              <div className="space-y-2 pt-3 mt-3 border-t border-border/30">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("pages.accounts.accountSize")}</label>
                {selectedTemplate?.sizes?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.sizes.map(size => (
                      <button
                        key={size}
                        type="button"
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
                          clampNum(form.propSize) === size
                            ? "bg-accent text-[rgb(var(--on-accent))] border-transparent shadow-md shadow-accent/20"
                            : "border-border/50 bg-card/50 hover:bg-muted/60 hover:border-border"
                        }`}
                        onClick={() => setForm(f => ({ ...f, propSize: String(size) }))}
                      >
                        {fmtMoney(size, form.currency)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{form.currency}</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={form.propSize}
                      onChange={handleNumberInput('propSize')}
                      placeholder="50000"
                      className="pl-7"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 2.5: RULES OVERRIDE (for evaluation phases) - COLLAPSIBLE
        ═══════════════════════════════════════════════════════════════════════ */}
        {form.isProp && form.templateId && (() => {
          const selectedPhase = phases.find(p => p.id === form.phaseId);
          return selectedPhase?.kind === "evaluation";
        })() && (
          <div className="rounded-xl border border-border/40 bg-muted/5 overflow-hidden">
            {/* Collapsible Header */}
            <button
              type="button"
              onClick={() => setShowRulesOverride(!showRulesOverride)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {t("pages.accounts.rulesOverride.title")}
                </span>
                <span className="text-xs text-muted-foreground/60 ml-1">
                  ({t("common.optional")})
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showRulesOverride ? "rotate-180" : ""}`} />
            </button>
            
            {/* Collapsible Content */}
            {showRulesOverride && (
              <div className="px-4 pb-4 space-y-4 border-t border-border/30">
                <p className="text-xs text-muted-foreground/80 pt-3">
                  {t("pages.accounts.rulesOverride.description")}
                </p>
                
                {/* Profit Target Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Target className="h-3 w-3" />
                    {t("pages.accounts.rulesOverride.profitTarget")}
                  </label>
                  
                  {/* Preset buttons (8%, 10%) + custom input */}
                  {(() => {
                    const isCustom = form.profitTargetOverride !== "" && ![8, 10].includes(clampNum(form.profitTargetOverride));
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        {[8, 10].map(pct => (
                          <button
                            key={pct}
                            type="button"
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
                              clampNum(form.profitTargetOverride) === pct
                                ? "bg-accent text-[rgb(var(--on-accent))] border-transparent shadow-md shadow-accent/20"
                                : "border-border/50 bg-card/50 hover:bg-muted/60 hover:border-border"
                            }`}
                            onClick={() => setForm(f => ({ ...f, profitTargetOverride: String(pct) }))}
                          >
                            {pct}%
                          </button>
                        ))}
                        <div className="relative max-w-[120px]">
                          <Input
                            type="text"
                            inputMode="decimal"
                            className={`h-[38px] pr-7 ${isCustom ? "border-accent ring-1 ring-accent/30" : ""}`}
                            value={isCustom ? form.profitTargetOverride : ""}
                            onChange={handleNumberInput('profitTargetOverride')}
                            placeholder={t("pages.accounts.rulesOverride.customTarget")}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm">%</span>
                        </div>
                      </div>
                    );
                  })()}
                  
                  <p className="text-[10px] text-muted-foreground/70">
                    {t("pages.accounts.rulesOverride.profitTargetHint", { 
                      default: (() => {
                        const selectedPhase = phases.find(p => p.id === form.phaseId);
                        return selectedPhase?.rules?.profitTargetPct ?? 8;
                      })() 
                    })}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 3: FINANCES (Cost & Balance)
        ═══════════════════════════════════════════════════════════════════════ */}
        {form.isProp && (
          <div className="space-y-4 p-4 rounded-xl border border-border/40 bg-muted/10">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold text-foreground">{t("pages.accounts.financeSection")}</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Challenge Cost */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" />
                  {t("pages.accounts.challengeCostInput")}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm">{form.currency}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={form.challengeCost || ""}
                    onChange={handleNumberInput('challengeCost')}
                    placeholder="0"
                    className="pl-7"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  {t("pages.accounts.challengeCostHint")}
                </p>
              </div>
              
              {/* Starting Balance */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Wallet className="h-3 w-3" />
                  {t("pages.accounts.startingBalanceInput")}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm">{form.currency}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={form.startingEquity || ""}
                    onChange={handleNumberInput('startingEquity')}
                    placeholder={t("pages.accounts.startingBalancePlaceholder")}
                    className="pl-7"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  {t("pages.accounts.startingBalanceHint")}
                </p>
              </div>
              
              {/* Current Balance */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  {t("pages.accounts.currentBalanceInput")}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm">{form.currency}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={form.currentEquity || ""}
                    onChange={handleNumberInput('currentEquity')}
                    placeholder={t("pages.accounts.currentBalancePlaceholder")}
                    className="pl-7"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  {t("pages.accounts.currentBalanceHint")}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 4: PAYOUT SETTINGS (for Live/Funded phase)
        ═══════════════════════════════════════════════════════════════════════ */}
        {form.isProp && form.templateId && (() => {
          const selectedPhase = phases.find(p => p.id === form.phaseId);
          return selectedPhase?.kind === "funded";
        })() && (
          <div className="space-y-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {t("pages.accounts.payoutSettings.title")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/80">
              {t("pages.accounts.payoutSettings.description")}
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("pages.accounts.payoutSettings.cycleDays")}</label>
                <select
                  value={form.payoutCycleDays}
                  onChange={e => setForm(f => ({ ...f, payoutCycleDays: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-border/50 bg-card/70 px-3 text-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition-all duration-150"
                >
                  <option value="7">7 {t("common.days")}</option>
                  <option value="14">14 {t("common.days")} ({t("pages.accounts.payoutSettings.biweekly")})</option>
                  <option value="30">30 {t("common.days")} ({t("pages.accounts.payoutSettings.monthly")})</option>
                  <option value="0">{t("pages.accounts.payoutSettings.anytime")}</option>
                </select>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("pages.accounts.payoutSettings.firstAfter")}</label>
                <select
                  value={form.payoutFirstAfterDays}
                  onChange={e => setForm(f => ({ ...f, payoutFirstAfterDays: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-border/50 bg-card/70 px-3 text-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition-all duration-150"
                >
                  <option value="0">{t("pages.accounts.payoutSettings.immediately")}</option>
                  <option value="7">7 {t("common.days")}</option>
                  <option value="14">14 {t("common.days")}</option>
                  <option value="30">30 {t("common.days")}</option>
                </select>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("pages.accounts.payoutSettings.minAmount")}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm">{form.currency}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-10 pl-7"
                    value={form.payoutMinAmount}
                    onChange={handleNumberInput('payoutMinAmount')}
                    placeholder="50"
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("pages.accounts.payoutSettings.profitSplit")}</label>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-10 pr-7"
                    value={form.payoutSplitPct}
                    onChange={handleNumberInput('payoutSplitPct')}
                    placeholder={String(selectedTemplate?.profitSplitPct || 80)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  {t("pages.accounts.payoutSettings.splitHint", { default: selectedTemplate?.profitSplitPct || 80 })}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 5: PERSONAL ACCOUNT FIELDS (only for personal accounts)
        ═══════════════════════════════════════════════════════════════════════ */}
        {!form.isProp && (
          <div className="space-y-4 p-4 rounded-xl border border-border/40 bg-muted/10">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-foreground">{t("pages.accounts.financeSection")}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.startingEquity")}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm">{form.currency}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={form.startingEquity}
                    onChange={handleNumberInput('startingEquity')}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.currentEquity")}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 text-sm">{form.currency}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={form.currentEquity}
                    onChange={handleNumberInput('currentEquity')}
                    placeholder={t("pages.accounts.form.currentBalanceHint")}
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.currency")}</label>
                <Input
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value.slice(0, 4) }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.status")}</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-border/50 bg-card/70 px-3 text-sm focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition-all duration-150"
                >
                  <option value="Live">Live</option>
                  <option value="Personal">Personal</option>
                </select>
              </div>
            </div>
          </div>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 6: DETAILS (Name, Avatar, Color, Notes) - COLLAPSIBLE FOR PROP
        ═══════════════════════════════════════════════════════════════════════ */}
        {form.isProp ? (
          /* Collapsible version for prop accounts */
          <div className="rounded-xl border border-border/40 bg-muted/5 overflow-hidden">
            {/* Collapsible Header */}
            <button
              type="button"
              onClick={() => setShowAccountDetails(!showAccountDetails)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {t("pages.accounts.detailsSection")}
                </span>
                <span className="text-xs text-muted-foreground/60 ml-1">
                  ({t("common.optional")})
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showAccountDetails ? "rotate-180" : ""}`} />
            </button>
            
            {/* Collapsible Content */}
            {showAccountDetails && (
              <div className="px-4 pb-4 space-y-4 border-t border-border/30">
                <p className="text-xs text-muted-foreground/80 pt-3">
                  {t("pages.accounts.detailsOptionalHint")}
                </p>
                
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.name")}</label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={t("pages.accounts.form.namePlaceholder")}
                  />
                </div>
                
                {/* Avatar & Color */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("pages.accounts.form.avatarColorLabel")}</label>
                  <div className="flex items-center gap-4">
                    <AvatarBubble avatar={form.avatar} color={form.color} size={44} />
                    <input
                      type="file"
                      ref={fileRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="h-9 px-3">
                      <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                      {t("common.upload")}
                    </Button>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.color}
                        onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                        aria-label={t("common.accentColor")}
                        className="h-9 w-9 rounded-lg cursor-pointer border border-border/50"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Notes */}
                <div className="space-y-1.5">
                  <label id="notes-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.notes")}</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    aria-labelledby="notes-label"
                    placeholder={t("pages.accounts.form.notesPlaceholder")}
                    rows={2}
                    className="w-full rounded-xl border border-border/50 bg-card/70 px-3 py-2 text-sm resize-none focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition-all duration-150 placeholder:text-muted-foreground/70"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Expanded version for personal accounts */
          <div className="space-y-4 p-4 rounded-xl border border-border/40 bg-muted/10">
            <div className="flex items-center gap-2 mb-1">
              <Edit2 className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-foreground">{t("pages.accounts.detailsSection")}</span>
            </div>
            
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.name")}</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t("pages.accounts.form.namePlaceholder")}
              />
            </div>
            
            {/* Avatar & Color - more compact layout */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("pages.accounts.form.avatarColorLabel")}</label>
              <div className="flex items-center gap-4">
                <AvatarBubble avatar={form.avatar} color={form.color} size={44} />
                <input
                  type="file"
                  ref={fileRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="h-9 px-3">
                  <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                  {t("common.upload")}
                </Button>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    aria-label={t("common.accentColor")}
                    className="h-9 w-9 rounded-lg cursor-pointer border border-border/50"
                  />
                </div>
              </div>
            </div>
            
            {/* Notes */}
            <div className="space-y-1.5">
              <label id="notes-label" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("common.notes")}</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                aria-labelledby="notes-label"
                placeholder={t("pages.accounts.form.notesPlaceholder")}
                rows={2}
                className="w-full rounded-xl border border-border/50 bg-card/70 px-3 py-2 text-sm resize-none focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition-all duration-150 placeholder:text-muted-foreground/70"
              />
            </div>
          </div>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 7: TAGS & OPTIONS
        ═══════════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4 p-4 rounded-xl border border-border/40 bg-muted/10">
          {/* Tags */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              {t("pages.accounts.form.tags")}
            </label>
            {(form.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {(form.tags || []).map((tag, idx) => (
                  <span
                    key={`${tag}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/15 text-accent-foreground text-xs font-medium border border-accent/20"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, i) => i !== idx) }))}
                      aria-label={`${t("common.remove")} ${tag}`}
                      className="hover:text-[rgb(var(--danger))] transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    const newTag = tagInput.trim().toLowerCase();
                    if (!form.tags.includes(newTag)) {
                      setForm(f => ({ ...f, tags: [...f.tags, newTag] }));
                    }
                    setTagInput("");
                  }
                }}
                placeholder={t("pages.accounts.form.tagsPlaceholder")}
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-10"
                onClick={() => {
                  if (tagInput.trim()) {
                    const newTag = tagInput.trim().toLowerCase();
                    if (!form.tags.includes(newTag)) {
                      setForm(f => ({ ...f, tags: [...f.tags, newTag] }));
                    }
                    setTagInput("");
                  }
                }}
              >
                {t("common.add")}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/70">{t("pages.accounts.form.tagsHint")}</p>
          </div>
          
          {/* Hidden Account Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/50 p-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
                {t("pages.accounts.form.hideAccount")}
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t("pages.accounts.form.hideAccountHint")}</p>
            </div>
            <Switch
              checked={!!form.isHidden}
              onCheckedChange={(v) => setForm(f => ({ ...f, isHidden: !!v }))}
            />
          </div>
        </div>
        
        {/* ═══════════════════════════════════════════════════════════════════════
            SECTION 8: MANUAL TRADING DAYS (for edit only)
        ═══════════════════════════════════════════════════════════════════════ */}
        {isEdit && (
          <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-muted/10">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {t("pages.accounts.form.manualTradingDays")}
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => setForm(f => ({ ...f, manualTradingDays: Math.max(0, (f.manualTradingDays || 0) - 1) }))}
                disabled={!form.manualTradingDays}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min="0"
                value={form.manualTradingDays || 0}
                onChange={e => setForm(f => ({ ...f, manualTradingDays: Math.max(0, clampNum(e.target.value)) }))}
                className="w-20 text-center"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                onClick={() => setForm(f => ({ ...f, manualTradingDays: (f.manualTradingDays || 0) + 1 }))}
              >
                <PlusCircle className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/70">{t("pages.accounts.form.manualTradingDaysHint")}</p>
          </div>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════════════
            ACTIONS
        ═══════════════════════════════════════════════════════════════════════ */}
        <div className="flex justify-end gap-3 pt-3 border-t border-border/30 mt-2">
          <Button variant="secondary" onClick={onClose} className="px-5">
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} className="px-5 shadow-md shadow-accent/20">
            {isEdit ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────

function AccountDetailModal({ open, onClose, account, templates, trades, symbols, onProgressPhase, onEdit, onPayout, onSave, onNavigateToTrade, toast, winRateMode = "ignore" }) {
  const { t, lang } = useI18n();
  const locale = localeFromLang(lang);
  
  // View mode: "gallery" (default - shows stats/progress), "list" (shows trades list), "calendar" (shows calendar)
  const [viewMode, setViewMode] = useState("gallery");
  
  // Calendar state
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(null); // For showing trades on a specific day
  
  if (!account) return null;
  
  // Symbol lookup map
  const symById = useMemo(() => {
    const m = new Map();
    for (const s of symbols || []) {
      if (s?.id) m.set(s.id, s);
    }
    return m;
  }, [symbols]);
  
  const tpl = getTemplate(templates, account?.prop?.templateId);
  const ph = tpl ? getPhase(tpl, account?.prop?.phaseId) : null;
  const phaseIndex = tpl ? getPhaseIndex(tpl, account?.prop?.phaseId) : -1;
  const isLive = ph?.kind === "funded";
  const isProp = !!tpl;
  
  // For profit calculations and rule evaluations:
  // - Prop accounts: ALWAYS use prop.size (the account size the firm evaluates against)
  // - Personal accounts: use startingEquity
  const initialBalance = isProp ? clampNum(account.prop?.size) : clampNum(account.startingEquity);
  const displayStartingEquity = clampNum(account.startingEquity); // For display purposes
  const curEq = clampNum(account.currentEquity);
  const profit = curEq - initialBalance;
  const profitPct = initialBalance > 0 ? (profit / initialBalance) * 100 : 0;
  const currency = account.currency || "$";
  
  // Get ALL account trades (for calendar)
  const allAccountTrades = useMemo(() => {
    return (trades || [])
      .filter(tr => !isDeleted(tr) && (tr.allocations || []).some(a => a.accountId === account.id))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [trades, account.id]);
  
  // Recent trades for gallery/list view (limited to 20)
  const accountTrades = useMemo(() => {
    return allAccountTrades.slice(0, 20);
  }, [allAccountTrades]);
  
  // Daily aggregation for calendar
  const dailyAgg = useMemo(() => {
    const map = new Map();
    for (const tr of allAccountTrades) {
      const key = normalizeDateKey(tr?.date);
      if (!key) continue;

      const alloc = (tr.allocations || []).find(a => a.accountId === account.id);
      const pnl = clampNum(alloc?.pnl);
      const isBE = Boolean(alloc?.isBreakEven || tr?.isBreakEven) || tr?.outcome === "BE";
      const outcome = classifyTradeOutcome({ pnl, isBreakEven: isBE, mode: "ignore" });

      const prev = map.get(key) || {
        pnl: 0,
        trades: 0,
        wins: 0,
        losses: 0,
      };

      const next = { ...prev };
      next.pnl += pnl;
      next.trades += 1;
      if (outcome === "win") next.wins += 1;
      else if (outcome === "loss") next.losses += 1;

      map.set(key, next);
    }
    return map;
  }, [allAccountTrades, account.id]);
  
  // Month trades for stats
  const monthTrades = useMemo(() => {
    const m = viewMonth.getMonth();
    const y = viewMonth.getFullYear();
    return allAccountTrades.filter((tr) => {
      const key = normalizeDateKey(tr?.date);
      if (!key) return false;
      const d = new Date(`${key}T00:00:00`);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [allAccountTrades, viewMonth]);

  const monthMetrics = useMemo(() => {
    const uniqDays = new Set();
    let pnl = 0;
    let wins = 0;
    let losses = 0;
    let biggestWin = 0;
    let biggestLoss = 0;
    let breakEvens = 0;

    for (const tr of monthTrades) {
      const key = normalizeDateKey(tr?.date);
      if (key) uniqDays.add(key);
      const alloc = (tr.allocations || []).find(a => a.accountId === account.id);
      const p = clampNum(alloc?.pnl);
      const isBE = Boolean(alloc?.isBreakEven || tr?.isBreakEven) || tr?.outcome === "BE";
      const outcome = classifyTradeOutcome({ pnl: p, isBreakEven: isBE, mode: "ignore" });
      pnl += p;
      if (outcome === "win") wins += 1;
      else if (outcome === "loss") losses += 1;
      else breakEvens += 1;

      if (p > biggestWin) biggestWin = p;
      if (p < biggestLoss) biggestLoss = p;
    }

    const totalTrades = monthTrades.length;
    // Use global winRateMode from props
    const mode = winRateMode === "loss" ? "loss" : "ignore";
    const winRate = calcWinRatePct({ wins, losses, breakEvens, mode });

    return {
      tradingDays: uniqDays.size,
      totalTrades,
      pnl,
      wins,
      losses,
      winRate,
      biggestWin,
      biggestLoss,
    };
  }, [monthTrades, account.id, winRateMode]);

  const gridWeeks = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
    const s = fmt.format(viewMonth);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [viewMonth, locale]);

  const weekSummaries = useMemo(() => {
    return gridWeeks.map((week, idx) => {
      let pnl = 0;
      let days = 0;
      for (const d of week) {
        const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const hit = dailyAgg.get(key);
        if (hit?.trades) days += 1;
        pnl += clampNum(hit?.pnl);
      }
      const start = week[0];
      const end = week[6];
      return {
        idx,
        title: t("pages.dashboard.week", { n: idx + 1 }),
        range: formatRange(start, end, locale),
        pnl,
        days,
      };
    });
  }, [gridWeeks, dailyAgg, locale, t]);

  const weekdays = useMemo(() => getWeekdayLabels(locale), [locale]);

  const today = new Date();
  
  // Trades for selected date
  const selectedDateTrades = useMemo(() => {
    if (!selectedDate) return [];
    return allAccountTrades.filter(tr => {
      const key = normalizeDateKey(tr?.date);
      return key === selectedDate;
    });
  }, [allAccountTrades, selectedDate]);
  
  // Stats
  const stats = useMemo(() => {
    let wins = 0, losses = 0, breakEvens = 0, totalPnl = 0;
    const days = new Set();
    
    for (const tr of trades || []) {
      if (isDeleted(tr)) continue;
      const allocs = tr.allocations || [];
      for (const a of allocs) {
        if (a.accountId !== account.id) continue;
        const pnl = clampNum(a.pnl);
        const isBE = Boolean(a.isBreakEven || tr.isBreakEven) || tr?.outcome === "BE";
        const outcome = classifyTradeOutcome({ pnl, isBreakEven: isBE, mode: "ignore" });
        totalPnl += pnl;
        if (outcome === "win") wins++;
        else if (outcome === "loss") losses++;
        else breakEvens++;
        if (tr.date) days.add(tr.date.slice(0, 10));
      }
    }
    
    const totalTrades = wins + losses + breakEvens;
    // Use global winRateMode from props
    const mode = winRateMode === "loss" ? "loss" : "ignore";
    const winRate = calcWinRatePct({ wins, losses, breakEvens, mode });
    // Include manual trading days
    const manualDays = clampNum(account.manualTradingDays);
    
    return { wins, losses, totalTrades, winRate, totalPnl, tradingDays: days.size + manualDays };
  }, [trades, account.id, account.manualTradingDays, winRateMode]);
  
  // Challenge progress (prefer rulesOverride, then template base rules)
  const ov2 = account?.prop?.rulesOverride || {};
  const targetPct = ov2.profitTargetPct ?? ph?.rules?.profitTargetPct ?? 0;
  const maxLossPct = ov2.maxLossPct ?? ph?.rules?.maxLossPct ?? 0;
  const minDays = ov2.minTradingDays ?? ph?.rules?.minTradingDays ?? 0;
  
  // Check if phase can be progressed
  const canProgress = useMemo(() => {
    if (!isProp || isLive) return false;
    // Check if target reached and days met
    const targetMet = targetPct > 0 ? profitPct >= targetPct : true;
    const daysMet = minDays > 0 ? stats.tradingDays >= minDays : true;
    const notFailed = profitPct > -maxLossPct;
    return targetMet && daysMet && notFailed;
  }, [isProp, isLive, targetPct, profitPct, minDays, stats.tradingDays, maxLossPct]);
  
  const nextPhase = tpl?.phases?.[phaseIndex + 1];
  
  // Payout info
  const payoutForecast = useMemo(() => {
    if (!isLive) return null;
    return computePayoutForecast(account, templates);
  }, [isLive, account, templates]);
  
  const { payouts = [] } = summarizePayouts(account, templates);
  const paidPayouts = payouts.filter(p => p.status === "paid");
  const pendingPayouts = payouts.filter(p => p.status === "requested");
  const totalPaid = paidPayouts.reduce((s, p) => s + clampNum(p.amountTrader), 0);
  
  // Handle marking payout as paid from detail view
  const handleMarkPaidFromDetail = (payoutId) => {
    if (!onSave) return;
    
    const now = Date.now();
    const updatedPayouts = (account?.prop?.payouts || []).map(p =>
      p.id === payoutId ? { ...p, status: "paid", paidAt: now } : p
    );
    
    const stillPending = updatedPayouts.some(p => p.status === "requested");
    const initialSize = account?.prop?.size || account?.startingEquity || 0;
    
    // Calculate equityCorrection to preserve reset balance after reconciliation
    const tradePnl = calculateAccountTradePnL(account?.id, trades);
    const startingEquity = clampNum(account?.startingEquity);
    const newEquityCorrection = initialSize - startingEquity - tradePnl;
    
    // IMPORTANT: When resetting equity, we also set lastPayoutResetAt.
    // This ensures that old paid payouts are NOT double-counted in future
    // payout calculations - only payouts after this timestamp are considered.
    onSave({
      ...account,
      status: stillPending ? "On payout" : "Live",
      currentEquity: initialSize,
      equityCorrection: newEquityCorrection,
      prop: {
        ...(account.prop || {}),
        payouts: updatedPayouts,
        // Mark the reset time so summarizePayouts knows to ignore older payouts
        lastPayoutResetAt: now,
      },
    });
    
    toast?.push({ title: t("pages.accounts.payouts.toasts.markedPaid") });
  };
  
  // View mode options
  const viewOptions = [
    { id: "gallery", icon: LayoutGrid, label: t("pages.accounts.views.gallery") || "Gallery" },
    { id: "list", icon: List, label: t("pages.accounts.views.list") || "List" },
    { id: "calendar", icon: CalendarDays, label: t("pages.accounts.views.calendar") || "Calendar" },
  ];
  
  // Handle day click in calendar
  const handleDayClick = (dateKey, hasData) => {
    if (hasData) {
      setSelectedDate(dateKey);
    }
  };
  
  // Render trade row for list view
  const renderTradeRow = (tr) => {
    const alloc = (tr.allocations || []).find(a => a.accountId === account.id);
    const pnl = clampNum(alloc?.pnl || 0);
    const rr = clampNum(alloc?.rr || 0);
    const isWin = pnl > 0;
    const isLoss = pnl < 0;
    const resultColor = isWin ? "border-emerald-500/30 bg-emerald-500/5" : isLoss ? "border-rose-500/30 bg-rose-500/5" : "border-border bg-muted/20";
    
    const handleClick = () => {
      if (onNavigateToTrade) {
        onClose?.();
        onNavigateToTrade(tr.id);
      }
    };
    
    return (
      <div
        key={tr.id}
        onClick={handleClick}
        className={`rounded-xl border p-3 ${resultColor} hover:shadow-sm transition ${onNavigateToTrade ? "cursor-pointer hover:border-accent/50" : ""}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Symbol icon */}
            {(() => {
              const sym = symById.get(tr.symbolId);
              return sym?.avatar ? (
                <div className="h-8 w-8 shrink-0 rounded-lg overflow-hidden flex items-center justify-center" style={{ backgroundColor: sym.color || '#6366f1' }}>
                  {sym.avatar?.type === "emoji" ? (
                    <span className="text-sm">{sym.avatar.emoji}</span>
                  ) : sym.avatar?.imageData ? (
                    <img src={sym.avatar.imageData} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-white font-bold">{(sym.name || "?")[0]}</span>
                  )}
                </div>
              ) : null;
            })()}
            
            {/* Date */}
            <div className="text-xs text-muted-foreground w-16 shrink-0 font-medium">
              {tr.date || "—"}
            </div>
            
            {/* Pair & Direction */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="font-semibold truncate">{symById.get(tr.symbolId)?.name || tr.pair || "—"}</div>
              <Badge 
                variant="outline" 
                className={`text-[10px] ${tr.direction === 'long' ? 'border-emerald-500/50 text-emerald-600' : tr.direction === 'short' ? 'border-rose-500/50 text-rose-600' : ''}`}
              >
                {tr.direction?.toUpperCase() || "—"}
              </Badge>
            </div>
          </div>
          
          {/* RR & PnL */}
          <div className="flex items-center gap-3 shrink-0">
            {rr !== 0 && (
              <div className={`text-xs font-medium px-2 py-1 rounded-lg ${isWin ? 'bg-emerald-500/20 text-emerald-600' : isLoss ? 'bg-rose-500/20 text-rose-600' : 'bg-muted'}`}>
                {rr > 0 ? '+' : ''}{rr.toFixed(2)}R
              </div>
            )}
            <div className={`text-sm font-bold ${isWin ? "text-emerald-600 dark:text-emerald-400" : isLoss ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
              {pnl >= 0 ? "+" : ""}{fmtMoney(pnl, currency)}
            </div>
          </div>
        </div>
        
        {/* Comments (if any) */}
        {tr.comments && (
          <div className="mt-2 text-xs text-muted-foreground italic truncate">
            "{tr.comments}"
          </div>
        )}
      </div>
    );
  };
  
  return (
    <Modal open={open} onClose={onClose} title={account.name || t("common.untitled")} size="xl">
      <div className="space-y-4 sm:space-y-6">
        {/* Header with avatar and basic info */}
        <div className="flex items-start gap-4">
          <AvatarBubble avatar={account.avatar} color={account.color} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isProp && <StatusBadge status={phaseStatusLabel(tpl, ph?.id, payouts)} />}
              {tpl && (
                <Badge variant="outline" className="text-xs">
                  {tpl.firm} • {tpl.name}
                </Badge>
              )}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("common.createdDate")}: {fmtDate(account.createdAt)}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { onClose(); onEdit(account); }}>
            <Edit2 className="h-4 w-4 mr-1" />
            {t("common.edit")}
          </Button>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card/30 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{t("common.startingEquity")}</div>
            <div className="text-lg font-semibold">{fmtMoney(displayStartingEquity, currency)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card/30 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{t("common.currentEquity")}</div>
            <div className="text-lg font-semibold">{fmtMoney(curEq, currency)}</div>
          </div>
          <div className="rounded-xl border border-border bg-card/30 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{t("common.pnl")}</div>
            <div className={`text-lg font-semibold ${profit >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {profit >= 0 ? "+" : ""}{fmtMoney(profit, currency)} ({profitPct.toFixed(2)}%)
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card/30 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{t("common.trades")}</div>
            <div className="text-lg font-semibold">{stats.totalTrades}</div>
            <div className="text-xs text-muted-foreground">
              {stats.wins}W / {stats.losses}L ({stats.winRate.toFixed(0)}%)
            </div>
          </div>
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex items-center justify-center">
          <div className="flex rounded-xl border border-accent/20 bg-card/50 p-1">
            {viewOptions.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => { setViewMode(id); setSelectedDate(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  viewMode === id
                    ? "bg-accent text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
                }`}
                title={label}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
        
        {/* =============== GALLERY VIEW =============== */}
        {viewMode === "gallery" && (
          <>
            {/* Challenge Progress */}
            {isProp && !isLive && (
          <div className="rounded-xl border border-border bg-card/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4" />
                {t("pages.accounts.progress.target")}
              </h4>
              {canProgress && nextPhase && (
                <Button size="sm" onClick={() => onProgressPhase(account, nextPhase.id)} className="gap-1">
                  <Zap className="h-3 w-3" />
                  {t("pages.accounts.progressTo")} {nextPhase.label}
                </Button>
              )}
            </div>
            <ChallengeProgress
              profitPct={profitPct}
              targetPct={targetPct}
              maxLossPct={maxLossPct}
              minDays={minDays}
              tradedDays={stats.tradingDays}
              t={t}
            />
          </div>
        )}
        
        {/* Equity Curve for Challenge/Live Accounts */}
        {isProp && accountTrades.length > 0 && (
          <div className="rounded-xl border border-border bg-card/30 p-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4" />
              {t("pages.accounts.equityCurve")}
            </h4>
            <AccountEquityCurve 
              trades={accountTrades}
              accountId={account.id}
              startingEquity={initialBalance}
              currency={currency}
            />
          </div>
        )}
        
        {/* Payout Info for Live */}
        {isLive && payoutForecast && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-emerald-600">
                <DollarSign className="h-4 w-4" />
                {t("pages.accounts.payouts.title")}
              </h4>
              {payoutForecast.eligible && (
                <Button size="sm" onClick={() => { onClose(); onPayout(account); }} className="gap-1">
                  <DollarSign className="h-3 w-3" />
                  {t("pages.accounts.payouts.requestNew")}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t("pages.accounts.payouts.available")}</div>
                <div className="font-semibold text-emerald-600">{fmtMoney(payoutForecast.availableTrader, currency)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t("pages.accounts.payouts.totalPaid")}</div>
                <div className="font-semibold">{fmtMoney(totalPaid, currency)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t("pages.accounts.payouts.pending")}</div>
                <div className="font-semibold">{fmtMoney(payoutForecast.pendingTrader, currency)}</div>
              </div>
            </div>
          </div>
        )}
        
        {/* Pending Payouts with Mark as Paid */}
        {isLive && pendingPayouts.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-600 mb-3">
              <Clock className="h-4 w-4" />
              {t("pages.accounts.payouts.pendingRequest")}
            </h4>
            <div className="space-y-2">
              {pendingPayouts.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-card/50 border border-border">
                  <div>
                    <div className="font-semibold">{fmtMoney(p.amountTrader, currency)}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.requestedAt).toLocaleDateString()}
                      {p.note && <span className="ml-2 italic">"{p.note}"</span>}
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => handleMarkPaidFromDetail(p.id)}
                    className="gap-1"
                  >
                    <Check className="h-3 w-3" />
                    {t("pages.accounts.payouts.paid")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Recent Trades in Gallery View */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <History className="h-4 w-4" />
            {t("pages.accounts.recentTrades")} ({accountTrades.length})
          </h4>
          {accountTrades.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              {t("pages.accounts.noTrades")}
            </div>
          ) : (
            <div className="space-y-2 max-h-[250px] overflow-auto">
              {accountTrades.slice(0, 5).map(renderTradeRow)}
            </div>
          )}
        </div>
        
        {/* Notes in Gallery View */}
        {account.notes && (
          <div>
            <h4 className="text-sm font-semibold mb-2">{t("common.notes")}</h4>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap rounded-xl bg-muted/30 p-3">
              {account.notes}
            </div>
          </div>
        )}
          </>
        )}
        
        {/* =============== LIST VIEW =============== */}
        {viewMode === "list" && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <History className="h-4 w-4" />
              {t("pages.accounts.recentTrades")} ({allAccountTrades.length})
            </h4>
            {allAccountTrades.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                {t("pages.accounts.noTrades")}
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-auto">
                {allAccountTrades.map(renderTradeRow)}
              </div>
            )}
          </div>
        )}
        
        {/* =============== CALENDAR VIEW =============== */}
        {viewMode === "calendar" && (
          <div className="space-y-4">
            {/* Month selector */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMonth((d) => addMonths(d, -1))}
                  aria-label={t("pages.dashboard.prevMonth")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMonth((d) => addMonths(d, 1))}
                  aria-label={t("pages.dashboard.nextMonth")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="px-2 text-sm font-semibold text-foreground/90">{monthLabel}</div>
                <Button
                  variant="secondary"
                  size="md"
                  className="rounded-xl"
                  onClick={() => setViewMonth(startOfMonth(new Date()))}
                >
                  <CalendarDays className="h-4 w-4" />
                  {t("pages.dashboard.today")}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{t("common.pnl")}: {fmtMoney(monthMetrics.pnl, currency)}</Badge>
                <Badge variant="secondary">{t("common.days")}: {monthMetrics.tradingDays}</Badge>
              </div>
            </div>
            
            {/* Month Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-card/30 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t("pages.dashboard.stats.daysTraded")}</div>
                <div className="text-lg font-semibold">{monthMetrics.tradingDays}</div>
              </div>
              <div className="rounded-xl border border-border bg-card/30 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t("pages.dashboard.stats.tradesTaken")}</div>
                <div className="text-lg font-semibold">{monthMetrics.totalTrades}</div>
                <div className="text-xs text-muted-foreground">{monthMetrics.wins}W / {monthMetrics.losses}L</div>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t("pages.dashboard.stats.biggestWin")}</div>
                <div className="text-lg font-semibold text-emerald-500">{monthMetrics.biggestWin ? fmtMoney(monthMetrics.biggestWin, currency) : "—"}</div>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{t("pages.dashboard.stats.biggestLoss")}</div>
                <div className="text-lg font-semibold text-rose-500">{monthMetrics.biggestLoss ? fmtMoney(monthMetrics.biggestLoss, currency) : "—"}</div>
              </div>
            </div>
            
            {/* Calendar Grid */}
            <div className="rounded-xl border border-border bg-card/30 p-4">
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {weekdays.map((w) => (
                  <div key={w} className="px-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
                    {w}
                  </div>
                ))}

                {gridWeeks.flat().map((d, idx) => {
                  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
                  const hit = dailyAgg.get(key);
                  const pnl = clampNum(hit?.pnl);
                  const tradesCount = hit?.trades ?? 0;

                  const inMonth = d.getMonth() === viewMonth.getMonth();
                  const isToday = isSameDay(d, today);
                  const isSelected = selectedDate === key;

                  const bg = pnl > 0 ? "rgba(59,130,246,0.12)" : pnl < 0 ? "rgba(220,90,90,0.10)" : "rgba(30,50,100,0.25)";
                  const br = pnl > 0 ? "rgba(59,130,246,0.35)" : pnl < 0 ? "rgba(220,90,90,0.35)" : "rgba(59,130,246,0.15)";
                  const txt = pnl > 0 ? "text-emerald-500" : pnl < 0 ? "text-red-500" : "text-muted-foreground";
                  const glow = pnl > 0 ? "shadow-[0_0_12px_rgba(59,130,246,0.2)]" : pnl < 0 ? "shadow-[0_0_12px_rgba(220,90,90,0.15)]" : "";

                  return (
                    <button
                      key={`${key}_${idx}`}
                      type="button"
                      onClick={() => handleDayClick(key, tradesCount > 0)}
                      className={`relative min-h-[70px] rounded-xl border p-2 transition-all duration-200 text-left ${
                        tradesCount > 0 ? "cursor-pointer hover:scale-[1.02]" : "cursor-default"
                      } ${glow} ${
                        inMonth ? "" : "opacity-45"
                      } ${isToday ? "ring-2 ring-[#3B82F6]/50 shadow-[0_0_20px_rgba(59,130,246,0.25)]" : ""} ${
                        isSelected ? "ring-2 ring-accent" : ""
                      }`}
                      style={{ backgroundColor: bg, borderColor: br }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-sm font-semibold">{d.getDate()}</div>
                        {tradesCount > 0 && (
                          <div className="text-[11px] font-semibold text-muted-foreground">{tradesCount} →</div>
                        )}
                      </div>

                      <div className="absolute bottom-2 right-2 text-right">
                        {tradesCount > 0 ? (
                          <div className={`text-xs font-semibold ${txt}`}>{fmtMoney(pnl, currency)}</div>
                        ) : (
                          <div className="text-xs text-muted-foreground">—</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Weekly Summary */}
            <div className="rounded-xl border border-border bg-card/30 p-4">
              <h4 className="text-sm font-semibold mb-3">{t("pages.dashboard.weeklySummary")}</h4>
              <div className="space-y-2">
                {weekSummaries.map((w) => {
                  const pos = w.pnl >= 0;
                  return (
                    <div key={w.idx} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-accent/10 bg-card/30 hover:border-accent/25 transition-all duration-200">
                      <div>
                        <div className="text-sm font-semibold">{w.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{w.range}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${pos ? "text-emerald-500" : "text-red-500"}`}>
                          {w.days ? fmtMoney(w.pnl, currency) : t("pages.dashboard.noTrades")}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{t("common.days")}: {w.days}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Selected Day Trades */}
            {selectedDate && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    {t("pages.accounts.tradesOnDay") || "Trades on"} {selectedDate}
                  </h4>
                  <button 
                    onClick={() => setSelectedDate(null)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("common.close") || "Close"}
                  </button>
                </div>
                {selectedDateTrades.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    {t("pages.accounts.noTrades")}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-auto">
                    {selectedDateTrades.map(renderTradeRow)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYOUT MODAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate total net PnL for an account from trades
 * This matches the logic in reconcileAccountsEquity (src/lib/syncDb.js:401-416)
 * to ensure consistency between payout calculations and equity reconciliation.
 * 
 * Note: This function is tested indirectly through the payout balance persistence test
 * which verifies the equityCorrection calculation produces correct results after reload.
 */
function calculateAccountTradePnL(accountId, trades = []) {
  let netPnl = 0;
  for (const t of trades) {
    if (isDeleted(t)) continue;
    const allocs = Array.isArray(t.allocations) ? t.allocations : [];
    for (const a of allocs) {
      if (a?.accountId !== accountId) continue;
      const net = clampNum(a.pnl) - Math.abs(clampNum(a.commission));
      netPnl += net;
    }
  }
  return netPnl;
}

function PayoutModal({ open, onClose, account, templates, trades = [], onSave, toast }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  
  const forecast = computePayoutForecast(account, templates);
  const { payouts = [], paidTrader = 0, pendingTrader = 0, splitPct = 80 } = summarizePayouts(account, templates);
  const totalPaidAll = payouts.filter(p => p.status === "paid").reduce((s, p) => s + clampNum(p.amountTrader), 0);
  const currency = account?.currency || "$";
  
  // Reset when opening
  useEffect(() => {
    if (open) {
      setAmount(String(round2(forecast?.availableTrader || 0)));
      setNote("");
      setShowHistory(false);
    }
  }, [open, forecast?.availableTrader]);
  
  const handleRequest = () => {
    const amountNum = clampNum(amount);
    if (amountNum <= 0) return;
    
    const newPayout = normalizePayout({
      id: uid(),
      amountTrader: amountNum,
      requestedAt: Date.now(),
      status: "requested",
      note: note.trim(),
    });
    
    const updatedPayouts = [...(account?.prop?.payouts || []), newPayout];
    
    onSave({
      ...account,
      status: "On payout",
      prop: {
        ...(account.prop || {}),
        payouts: updatedPayouts,
        cycleResetAt: null, // Clear one-time cycle reset after payout is requested
      },
    });
    
    onClose();
    toast?.push({ title: t("pages.accounts.payouts.toasts.requested") });
  };
  
  const handleMarkPaid = (payoutId) => {
    const now = Date.now();
    const updatedPayouts = (account?.prop?.payouts || []).map(p =>
      p.id === payoutId ? { ...p, status: "paid", paidAt: now } : p
    );
    
    // Check if there are still pending payouts
    const stillPending = updatedPayouts.some(p => p.status === "requested");
    
    // Get the initial account size to reset balance after payout
    const initialSize = account?.prop?.size || account?.startingEquity || 0;
    
    // Calculate trade PnL to determine correct equityCorrection
    // This ensures the balance persists after page reload when reconcileAccountsEquity runs
    const tradePnl = calculateAccountTradePnL(account?.id, trades);
    const startingEquity = clampNum(account?.startingEquity);
    
    // Formula: currentEquity = startingEquity + tradePnl + equityCorrection
    // We want currentEquity = initialSize after payout
    // Therefore: equityCorrection = initialSize - startingEquity - tradePnl
    const newEquityCorrection = initialSize - startingEquity - tradePnl;
    
    // IMPORTANT: When resetting equity, we also set lastPayoutResetAt.
    // This ensures that old paid payouts are NOT double-counted in future
    // payout calculations - only payouts after this timestamp are considered.
    // Both paidAt and lastPayoutResetAt are set to `now`, so the strict >
    // check in summarizePayouts (paidAt > lastPayoutResetAt) correctly
    // excludes this payout from the current cycle's paidTrader totals.
    onSave({
      ...account,
      status: stillPending ? "On payout" : "Live",
      // Reset current equity to initial account size after payout
      currentEquity: initialSize,
      // Set equityCorrection to preserve balance after page reload
      equityCorrection: newEquityCorrection,
      prop: {
        ...(account.prop || {}),
        payouts: updatedPayouts,
        // Mark the reset time so summarizePayouts knows to ignore older payouts
        lastPayoutResetAt: now,
        cycleResetAt: null, // Clear one-time cycle reset after payout is completed
      },
    });
    
    toast?.push({ title: t("pages.accounts.payouts.toasts.markedPaid") });
  };
  
  const handleCancel = (payoutId) => {
    const updatedPayouts = (account?.prop?.payouts || []).map(p =>
      p.id === payoutId ? { ...p, status: "canceled" } : p
    );
    
    const stillPending = updatedPayouts.some(p => p.status === "requested");
    
    onSave({
      ...account,
      status: stillPending ? "On payout" : "Live",
      prop: {
        ...(account.prop || {}),
        payouts: updatedPayouts,
        cycleResetAt: null, // Clear one-time cycle reset after payout is canceled
      },
    });
    
    toast?.push({ title: t("pages.accounts.payouts.toasts.canceled") });
  };
  
  const handleDelete = (payoutId) => {
    const updatedPayouts = (account?.prop?.payouts || []).filter(p => p.id !== payoutId);
    
    const stillPending = updatedPayouts.some(p => p.status === "requested");
    
    onSave({
      ...account,
      status: stillPending ? "On payout" : (account.status === "On payout" ? "Live" : account.status),
      prop: {
        ...(account.prop || {}),
        payouts: updatedPayouts,
      },
    });
    
    toast?.push({ title: t("pages.accounts.payouts.toasts.deleted") });
  };
  
  // Reset payout cycle - allows immediate payout for the current cycle (one-time use)
  const handleResetCycle = () => {
    const now = Date.now();
    onSave({
      ...account,
      prop: {
        ...(account.prop || {}),
        cycleResetAt: now, // Mark cycle as reset - will be cleared after payout is requested
      },
    });
    
    toast?.push({ title: t("pages.accounts.payouts.toasts.cycleReset") });
  };
  
  const sortedPayouts = [...payouts].sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
  
  return (
    <Modal open={open} onClose={onClose} title={t("pages.accounts.payouts.title")}>
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-muted/30">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">{t("pages.accounts.payouts.available")}</div>
            <div className="text-lg font-bold text-[rgb(var(--success))]">
              {fmtMoney(forecast?.availableTrader || 0, currency)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">{t("pages.accounts.payouts.pending")}</div>
            <div className="text-lg font-bold text-amber-500">{fmtMoney(pendingTrader, currency)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">{t("pages.accounts.payouts.totalPaid")}</div>
            <div className="text-lg font-bold">{fmtMoney(totalPaidAll, currency)}</div>
          </div>
        </div>
        
        {/* Request Form */}
        {forecast?.eligible && !forecast.pendingExists && (
          <div className="space-y-3 p-3 rounded-xl border border-border">
            <div className="text-sm font-medium">{t("pages.accounts.payouts.requestNew")}</div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("pages.accounts.payouts.amount")}</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAmount(String(round2(forecast?.availableTrader || 0)))}
                >
                  {t("pages.accounts.payouts.max")}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("pages.accounts.payouts.note")}</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t("pages.accounts.payouts.notePlaceholder")}
                rows={2}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm resize-none"
              />
            </div>
            
            <Button className="w-full" onClick={handleRequest}>
              <DollarSign className="h-4 w-4 mr-2" />
              {t("pages.accounts.payouts.request")}
            </Button>
          </div>
        )}
        
        {/* Eligibility Info */}
        {!forecast?.eligible && forecast?.reason && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-amber-700 dark:text-amber-300">
                  {t(`pages.accounts.payouts.reasons.${forecast.reason}`)}
                </div>
                {forecast.nextEligibleAt && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {t("pages.accounts.payouts.nextEligible")}: {fmtDateTime(forecast.nextEligibleAt)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Reset Payout Cycle Button */}
        {(() => {
          const cycleResetAt = account?.prop?.cycleResetAt;
          const isResetUsed = typeof cycleResetAt === 'number' && cycleResetAt > 0;
          const showResetSection = !forecast?.eligible && (forecast?.reason === "before_first_window" || forecast?.reason === "cooldown" || forecast?.reason === "cycle_limit");
          const resetUsedText = t("pages.accounts.payouts.resetCycleUsed") || "Already used for this cycle";
          
          if (!showResetSection && !isResetUsed) return null;
          
          return (
            <div className="p-3 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{t("pages.accounts.payouts.resetCycle")}</div>
                  <div className="text-xs text-muted-foreground">
                    {isResetUsed ? resetUsedText : t("pages.accounts.payouts.resetCycleHint")}
                  </div>
                </div>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleResetCycle}
                  disabled={isResetUsed}
                  className="gap-1"
                  title={isResetUsed ? resetUsedText : undefined}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("pages.accounts.payouts.resetNow")}
                </Button>
              </div>
            </div>
          );
        })()}
        
        {/* History Toggle */}
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="h-4 w-4" />
          {t("pages.accounts.payouts.history")}
          <ChevronDown className={`h-4 w-4 transition ${showHistory ? "rotate-180" : ""}`} />
        </button>
        
        {/* Payout History */}
        {showHistory && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sortedPayouts.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                {t("pages.accounts.payouts.noHistory")}
              </div>
            ) : (
              sortedPayouts.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fmtMoney(p.amountTrader, currency)}</span>
                      {p.status === "paid" && (
                        <span className="text-xs text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {t("pages.accounts.payouts.paid")}
                        </span>
                      )}
                      {p.status === "requested" && (
                        <span className="text-xs text-amber-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {t("pages.accounts.payouts.pending")}
                        </span>
                      )}
                      {p.status === "canceled" && (
                        <span className="text-xs text-muted-foreground">{t("pages.accounts.payouts.canceled")}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDateTime(p.requestedAt)}
                      {p.paidAt && ` → ${fmtDateTime(p.paidAt)}`}
                    </div>
                    {p.note && (
                      <div className="text-xs text-muted-foreground mt-1 italic">"{p.note}"</div>
                    )}
                  </div>
                  
                  <div className="flex gap-1">
                    {p.status === "requested" && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleMarkPaid(p.id)}>
                          <Check className="h-4 w-4 text-emerald-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleCancel(p.id)}>
                          <X className="h-4 w-4 text-rose-500" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} aria-label={t("common.delete")}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-rose-500" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { id: "recent", icon: Clock },
  { id: "balance", icon: Wallet },
  { id: "profit", icon: TrendingUp },
  { id: "name", icon: ArrowUpDown },
];

const FILTER_OPTIONS = [
  { id: "all", label: "all" },
  { id: "prop", label: "prop" },
  { id: "live", label: "live" },
  { id: "challenge", label: "challenge" },
  { id: "personal", label: "personal" },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function Accounts({
  accounts = [],
  trades = [],
  symbols = [],
  propTemplates = [],
  onSetPropTemplates,
  onUpsert,
  onTrash,
  onArchive,
  onQuickTrade,
  onNavigateToTrade,
  toast,
  ui = {},
}) {
  const { t } = useI18n();
  
  // Get GLOBAL win rate mode from UI settings
  const winRateMode = getGlobalWinRateMode(ui);
  
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [filterBy, setFilterBy] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [groupByFirm, setGroupByFirm] = useState(() => {
    try {
      return localStorage.getItem("tradej_group_by_firm") === "true";
    } catch { return false; }
  });
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("tradej_pinned_accounts") || "[]");
    } catch { return []; }
  });
  
  const [modalAccount, setModalAccount] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [payoutAccountId, setPayoutAccountId] = useState(null);
  const [detailAccountId, setDetailAccountId] = useState(null);
  const [archiveConfirmId, setArchiveConfirmId] = useState(null);
  const archiveTarget = useMemo(
    () => (archiveConfirmId ? accounts.find((a) => a.id === archiveConfirmId) : null),
    [archiveConfirmId, accounts]
  );

  // Wrap archive in a confirmation dialog so a single accidental click
  // doesn't hide an account from the active list.
  const requestArchive = (id) => setArchiveConfirmId(id);
  
  // Derive modal accounts from accounts prop using IDs
  // This ensures modals always have the latest account data after payout actions
  const payoutAccount = payoutAccountId && accounts.find(a => a.id === payoutAccountId);
  const detailAccount = detailAccountId && accounts.find(a => a.id === detailAccountId);
  
  // Save pinned accounts to localStorage
  useEffect(() => {
    localStorage.setItem("tradej_pinned_accounts", JSON.stringify(pinnedIds));
  }, [pinnedIds]);
  
  // Save group by firm preference
  useEffect(() => {
    localStorage.setItem("tradej_group_by_firm", String(groupByFirm));
  }, [groupByFirm]);
  
  const handlePin = (id) => {
    setPinnedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };
  
  // Merge built-in and user templates
  const templates = useMemo(() => mergePropTemplates(propTemplates), [propTemplates]);
  
  // Split active and archived
  const { activeAccounts, archivedAccounts } = useMemo(() => {
    const active = [];
    const archived = [];
    
    for (const acc of accounts) {
      if (acc.archivedAt) {
        archived.push(acc);
      } else {
        active.push(acc);
      }
    }
    
    return { activeAccounts: active, archivedAccounts: archived };
  }, [accounts]);
  
  // Filter and sort
  const filteredAccounts = useMemo(() => {
    let list = [...activeAccounts];
    
    // Filter hidden accounts unless showHidden is true
    if (!showHidden) {
      list = list.filter(acc => !acc.isHidden);
    }
    
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(acc => 
        acc.name?.toLowerCase().includes(q) ||
        acc.status?.toLowerCase().includes(q) ||
        // Search by prop firm name
        (getTemplate(templates, acc?.prop?.templateId)?.firm || "").toLowerCase().includes(q)
      );
    }
    
    // Type filter
    if (filterBy !== "all") {
      list = list.filter(acc => {
        const tpl = getTemplate(templates, acc?.prop?.templateId);
        const ph = tpl ? getPhase(tpl, acc?.prop?.phaseId) : null;
        const isProp = !!tpl;
        const isLive = ph?.kind === "funded";
        const isChallenge = isProp && !isLive;
        
        switch (filterBy) {
          case "prop": return isProp;
          case "live": return isLive;
          case "challenge": return isChallenge;
          case "personal": return !isProp;
          default: return true;
        }
      });
    }
    
    // Sort - pinned first, then by selected sort
    list.sort((a, b) => {
      // Pinned items first
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      
      switch (sortBy) {
        case "balance":
          return clampNum(b.currentEquity) - clampNum(a.currentEquity);
        case "profit":
          const profitA = clampNum(a.currentEquity) - clampNum(a.startingEquity);
          const profitB = clampNum(b.currentEquity) - clampNum(b.startingEquity);
          return profitB - profitA;
        case "name":
          return (a.name || "").localeCompare(b.name || "");
        case "recent":
        default:
          return (b.createdAt || 0) - (a.createdAt || 0);
      }
    });
    
    return list;
  }, [activeAccounts, search, sortBy, filterBy, templates, pinnedIds, showHidden]);
  
  // Group accounts by prop firm when enabled
  const groupedAccounts = useMemo(() => {
    if (!groupByFirm) return null;
    
    const groups = new Map();
    const personalGroup = { firm: null, firmLabel: t("pages.accounts.type.personal"), accounts: [] };
    
    for (const acc of filteredAccounts) {
      const tpl = getTemplate(templates, acc?.prop?.templateId);
      
      if (tpl && tpl.firm) {
        if (!groups.has(tpl.firm)) {
          groups.set(tpl.firm, { firm: tpl.firm, firmLabel: tpl.firm, accounts: [] });
        }
        groups.get(tpl.firm).accounts.push(acc);
      } else {
        personalGroup.accounts.push(acc);
      }
    }
    
    // Sort groups alphabetically, personal at end
    const sorted = Array.from(groups.values()).sort((a, b) => a.firmLabel.localeCompare(b.firmLabel));
    if (personalGroup.accounts.length > 0) {
      sorted.push(personalGroup);
    }
    
    return sorted;
  }, [filteredAccounts, groupByFirm, templates, t]);
  
  const handleOpenCreate = () => {
    setModalAccount(null);
    setModalOpen(true);
  };
  
  const handleEdit = (acc) => {
    setModalAccount(acc);
    setModalOpen(true);
  };
  
  const handlePayout = (acc) => {
    setPayoutAccountId(acc?.id || null);
  };
  
  const handleViewDetail = (acc) => {
    setDetailAccountId(acc?.id || null);
  };
  
  const handleAddTradingDay = (acc) => {
    if (!acc) return;
    const newManualDays = (clampNum(acc.manualTradingDays) || 0) + 1;
    onUpsert({ ...acc, manualTradingDays: newManualDays });
    toast?.push({ 
      title: t("pages.accounts.tradingDayAdded", null, "Торговый день добавлен"), 
      type: "success" 
    });
  };

  const handleToggleHidden = (acc) => {
    const next = { ...acc, isHidden: !acc.isHidden };
    onUpsert(next);
    toast?.push({
      title: next.isHidden
        ? t("pages.accounts.hiddenToast", null, "Account hidden")
        : t("pages.accounts.unhiddenToast", null, "Account unhidden"),
      type: "success",
    });
  };
  
  const handleProgressPhase = (acc, nextPhaseId) => {
    // Create new account for next phase
    const tpl = getTemplate(templates, acc?.prop?.templateId);
    const nextPhase = getPhase(tpl, nextPhaseId);
    if (!tpl || !nextPhase) return;
    
    // Check if an account for the next phase already exists
    const nextPhaseExists = accounts.some(
      (a) =>
        a.id !== acc.id &&
        !isDeleted(a) &&
        a.prop?.templateId === acc?.prop?.templateId &&
        String(a.prop?.phaseId) === String(nextPhaseId) &&
        a.prop?.previousAccountId === acc.id
    );
    if (nextPhaseExists) {
      toast?.push({ title: t("pages.accounts.phaseAlreadyExists") || "Phase already exists", type: "warning" });
      return;
    }
    
    const size = clampNum(acc?.prop?.size ?? acc?.startingEquity);
    const now = Date.now();
    
    // Create new account for next phase
    const newAccount = {
      id: uid(),
      name: `${tpl.firm || "Prop"} ${Math.round(size)}${nextPhase.label ? ` • ${nextPhase.label}` : ""}`.trim(),
      currency: acc.currency || "$",
      startingEquity: size,
      currentEquity: size,
      defaultRiskPct: acc.defaultRiskPct || 0,
      avatar: acc.avatar || { type: "emoji", emoji: "💼" },
      color: acc.color || "#6366f1",
      createdAt: now,
      status: phaseStatusLabel(tpl, nextPhaseId, []),
      notes: "",
      tags: acc.tags || [],
      prop: {
        templateId: tpl.id,
        phaseId: nextPhaseId,
        size,
        startedAt: now,
        isCurrent: true,
        completedAt: null,
        autoProgress: !!acc.prop?.autoProgress,
        rulesOverride: {},
        profitSplitPctOverride: acc.prop?.profitSplitPctOverride ?? null,
        previousAccountId: acc.id,
        nextAccountId: null,
        autoProgressDone: {},
        eval: null,
        payouts: [],
      },
    };
    
    // Mark old account as completed
    const updatedOld = {
      ...acc,
      prop: {
        ...acc.prop,
        isCurrent: false,
        completedAt: now,
        nextAccountId: newAccount.id,
      },
      status: "Passed",
    };
    
    onUpsert(updatedOld);
    onUpsert(newAccount);
    setDetailAccountId(null);
    toast?.push({ title: t("common.done"), description: t("pages.accounts.progressedTo", { phase: nextPhase.label }) });
  };
  
  const handleRestore = (id) => {
    const acc = archivedAccounts.find(a => a.id === id);
    if (acc) {
      onUpsert({ ...acc, archivedAt: null });
      toast?.push({ title: t("common.restored") });
    }
  };
  
  return (
    <div className="space-y-4">
      <Header
        title={t("pages.accounts.title")}
        subtitle={t("pages.accounts.subtitle")}
        right={
          <Button onClick={handleOpenCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("pages.accounts.add")}
          </Button>
        }
      />
      
      {/* Search, Filter & Sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="pl-9"
          />
        </div>
        
        {/* Type Filter */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40">
          <Filter className="h-4 w-4 text-muted-foreground ml-2" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              className={`px-3 py-1.5 rounded-xl text-sm transition ${
                filterBy === opt.id 
                  ? "bg-card shadow font-medium" 
                  : "hover:bg-muted/50 text-muted-foreground"
              }`}
              onClick={() => setFilterBy(opt.id)}
            >
              {t(`pages.accounts.filter.${opt.label}`)}
            </button>
          ))}
        </div>
        
        {/* Sort Options */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              title={t(`pages.accounts.sort.${opt.id}`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition ${
                sortBy === opt.id 
                  ? "bg-card shadow font-medium" 
                  : "hover:bg-muted/50 text-muted-foreground"
              }`}
              onClick={() => setSortBy(opt.id)}
            >
              <opt.icon className="h-4 w-4" />
              <span className="hidden lg:inline">{t(`pages.accounts.sort.${opt.id}`)}</span>
            </button>
          ))}
        </div>
        
        {/* Group by Firm Toggle */}
        <button
          type="button"
          title={t("pages.accounts.groupByFirm")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition border ${
            groupByFirm 
              ? "bg-accent/20 border-accent text-accent-foreground" 
              : "border-border hover:bg-muted/50 text-muted-foreground"
          }`}
          onClick={() => setGroupByFirm(!groupByFirm)}
        >
          <Layers className="h-4 w-4" />
          <span className="hidden sm:inline">{t("pages.accounts.groupByFirm")}</span>
        </button>
        
        {/* Show Hidden Toggle */}
        <button
          type="button"
          title={t("pages.accounts.form.showHidden")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition border ${
            showHidden 
              ? "bg-accent/20 border-accent text-accent-foreground" 
              : "border-border hover:bg-muted/50 text-muted-foreground"
          }`}
          onClick={() => setShowHidden(!showHidden)}
        >
          {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          <span className="hidden sm:inline">{t("pages.accounts.form.showHidden")}</span>
        </button>
      </div>
      
      {/* Active filters indicator */}
      {(filterBy !== "all" || search.trim()) && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("pages.accounts.showing")}:</span>
          {filterBy !== "all" && (
            <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground text-xs font-medium">
              {t(`pages.accounts.filter.${filterBy}`)}
            </span>
          )}
          {search.trim() && (
            <span className="px-2 py-0.5 rounded-full bg-muted/50 text-xs">
              "{search}"
            </span>
          )}
          <button 
            type="button"
            onClick={() => { setFilterBy("all"); setSearch(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {t("common.clear")}
          </button>
        </div>
      )}
      
      {/* Accounts Grid */}
      {filteredAccounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Wallet className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <div className="text-lg font-medium">{t("pages.accounts.empty")}</div>
          <div className="text-sm text-muted-foreground mt-1">{t("pages.accounts.emptyHint")}</div>
          <Button onClick={handleOpenCreate} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            {t("pages.accounts.add")}
          </Button>
        </div>
      ) : groupByFirm && groupedAccounts ? (
        // Grouped by prop firm
        <div className="space-y-4 sm:space-y-6">
          {groupedAccounts.map(group => (
            <div key={group.firmLabel}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`h-2 w-2 rounded-full ${group.firm ? "bg-accent" : "bg-muted-foreground"}`} />
                <h3 className="text-sm font-semibold text-foreground">
                  {group.firmLabel}
                </h3>
                <span className="text-xs text-muted-foreground">
                  ({group.accounts.length})
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {group.accounts.map(acc => (
                    <motion.div
                      key={acc.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <AccountCard
                        account={acc}
                        templates={templates}
                        trades={trades}
                        onEdit={handleEdit}
                        onPayout={handlePayout}
                        onArchive={requestArchive}
                        onTrash={onTrash}
                        onPin={handlePin}
                        onQuickTrade={onQuickTrade}
                        onViewDetail={handleViewDetail}
                        onProgressPhase={handleProgressPhase}
                        onAddTradingDay={handleAddTradingDay}
                        onToggleHidden={handleToggleHidden}
                        isPinned={pinnedIds.includes(acc.id)}
                        toast={toast}
                        winRateMode={winRateMode}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Normal grid mode
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredAccounts.map(acc => (
              <motion.div
                key={acc.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <AccountCard
                  account={acc}
                  templates={templates}
                  trades={trades}
                  onEdit={handleEdit}
                  onPayout={handlePayout}
                  onArchive={requestArchive}
                  onTrash={onTrash}
                  onPin={handlePin}
                  onQuickTrade={onQuickTrade}
                  onViewDetail={handleViewDetail}
                  onProgressPhase={handleProgressPhase}
                  onAddTradingDay={handleAddTradingDay}
                  onToggleHidden={handleToggleHidden}
                  isPinned={pinnedIds.includes(acc.id)}
                  toast={toast}
                  winRateMode={winRateMode}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      
      {/* Archived Section */}
      {archivedAccounts.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-4 w-4" />
            {t("pages.accounts.archivedSection")} ({archivedAccounts.length})
            <ChevronDown className={`h-4 w-4 transition ${showArchived ? "rotate-180" : ""}`} />
          </button>
          
          {showArchived && (
            <div className="mt-3 space-y-2">
              {archivedAccounts.map(acc => (
                <ArchivedAccountCard
                  key={acc.id}
                  account={acc}
                  onRestore={handleRestore}
                  onTrash={onTrash}
                />
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Modals */}
      <AccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        account={modalAccount}
        accounts={accounts}
        templates={templates}
        onSave={onUpsert}
        toast={toast}
      />
      
      {payoutAccount && (
        <PayoutModal
          open={!!payoutAccount}
          onClose={() => setPayoutAccountId(null)}
          account={payoutAccount}
          templates={templates}
          trades={trades}
          onSave={onUpsert}
          toast={toast}
        />
      )}
      
      {detailAccount && (
        <AccountDetailModal
          open={!!detailAccount}
          onClose={() => setDetailAccountId(null)}
          account={detailAccount}
          templates={templates}
          trades={trades}
          symbols={symbols}
          onProgressPhase={handleProgressPhase}
          onEdit={handleEdit}
          onPayout={handlePayout}
          onSave={onUpsert}
          onNavigateToTrade={onNavigateToTrade}
          toast={toast}
          winRateMode={winRateMode}
        />
      )}

      <ConfirmDialog
        open={!!archiveConfirmId}
        onOpenChange={(v) => { if (!v) setArchiveConfirmId(null); }}
        title={t("pages.accounts.archiveAccount") || "Archive account?"}
        description={
          (t("pages.accounts.archiveConfirmDescription") ||
            "This account will be hidden from the active list. You can restore it from the archive section later.") +
          (archiveTarget?.name ? `\n\n${archiveTarget.name}` : "")
        }
        confirmText={t("common.archiveVerb") || "Archive"}
        cancelText={t("common.cancel") || "Cancel"}
        tone="secondary"
        onConfirm={() => {
          if (archiveConfirmId) onArchive(archiveConfirmId);
          setArchiveConfirmId(null);
        }}
      />
    </div>
  );
}
