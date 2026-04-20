import React, { useMemo, useState, useRef, useEffect } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import SessionBadge from "@/components/common/SessionBadge.jsx";
import SelectDropdown from "@/components/common/SelectDropdown.jsx";
import DateRangePicker from "@/components/common/DateRangePicker.jsx";
import { AvatarPill, AvatarBubble } from "@/components/common/Avatar.jsx";
import Press from "@/components/common/Press.jsx";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUp } from "@/components/common/motion";
import { clampNum, fmtMoney, fmtPct, fmtRR, sessionTone } from "@/lib/utils";
import { HOVER_GLOW } from "@/lib/ui.js";
import HauntedScoreCard from "@/components/analytics/HauntedScoreCard.jsx";
import TradePreviewDrawer from "@/components/analytics/TradePreviewDrawer.jsx";
import FilteredTradesTable from "@/components/analytics/FilteredTradesTable.jsx";
import { calcPerformanceReport } from "@/lib/analytics/performanceReport.js";
import { NO_ACCOUNT_ID, getTradeAccountKey, tradeHasAccount, hasTradesWithoutAccount, createNoAccountOption } from "@/lib/noAccount.js";
import { calcWinRatePct, getGlobalWinRateMode, getGlobalAvgRRMode, classifyTradeOutcome } from "@/lib/metrics/winRate.js";
import { isDeleted } from "@/lib/syncDb.js";
import { 
  KpiGrid, 
  BreakdownTabs, 
  DisciplineCard, 
  InsightsPanel,
  PremiumEquityChart,
  DailyPnlChart,
} from "@/components/analytics/performance-report";
import { 
  BarChart3, Filter, RotateCcw, DollarSign, CheckCircle2, Clock, 
  TrendingUp, TrendingDown, Target, Activity, Percent, Award,
  ArrowUpRight, ArrowDownRight, ChevronDown, Check,
  Trophy, XCircle, Wallet, Banknote, Search, Coins, Timer, ArrowRightLeft,
  CalendarDays, ChevronLeft, ChevronRight, Sparkles, LineChart, List, Brain
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { summarizePayouts, mergePropTemplates, isLivePropAccount } from "@/lib/prop.js";
import SmartInsights, { generateInsights } from "@/components/common/SmartInsights.jsx";
import { getInitialBalance } from "@/lib/accountCalcs.js";

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

function toMs(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function inRange(dateIso, fromIso, toIso) {
  const ms = toMs(dateIso);
  if (ms === null) return false;
  const from = toMs(fromIso);
  const to = toMs(toIso);
  if (from !== null && ms < from) return false;
  if (to !== null && ms > to) return false;
  return true;
}

function groupBy(list, keyFn) {
  const m = new Map();
  for (const it of list) {
    const k = keyFn(it);
    const arr = m.get(k) ?? [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT SMART INSIGHTS PANEL (for right side of Equity Curve)
// ─────────────────────────────────────────────────────────────────────────────

const CompactInsightRow = React.memo(function CompactInsightRow({ insight, index, reduceMotion }) {
  const Icon = insight.icon;
  
  const iconColors = {
    positive: "text-emerald-400",
    warning: "text-amber-400",
    info: "text-blue-400",
  };
  
  return (
    <div
      className="flex items-start gap-2 py-2.5 border-b border-accent/10 last:border-b-0"
    >
      <div className={`shrink-0 mt-0.5 ${iconColors[insight.type] || "text-muted-foreground"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-xs font-semibold leading-tight">{insight.title}</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{insight.description}</p>
      </div>
    </div>
  );
});

function CompactSmartInsightsPanel({ trades, accounts, reduceMotion, t }) {
  const insights = useMemo(() => {
    return generateInsights(trades, accounts);
  }, [trades, accounts]);
  
  // Limit to 3 insights for compact panel
  const displayInsights = insights.slice(0, 3);
  
  return (
    <div className="rounded-xl border border-accent/15 bg-card/50 p-3 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-accent/10">
        <Sparkles className="h-4 w-4 text-purple-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("insights.title")}
        </h3>
      </div>
      
      <div className="flex-1 space-y-0 overflow-y-auto">
        {displayInsights.length > 0 ? (
            displayInsights.map((insight, idx) => (
              <CompactInsightRow
                key={insight.title}
                insight={insight}
                index={idx}
                reduceMotion={reduceMotion}
              />
            ))
        ) : (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground">
              {t("insights.noData")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Custom Account Dropdown with avatars, search, and enhanced info
// Simple relative/absolute positioning (no portals) for reliable open/close behavior

function AccountDropdown({ accounts, value, onChange, allLabel, trades }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const { t } = useI18n();
  
  // Check if there are trades without account
  const showNoAccountOption = useMemo(() => hasTradesWithoutAccount(trades), [trades]);
  
  // DEV: Log accounts data for debugging
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("[AccountDropdown] accounts length:", accounts?.length ?? 0);
      if (!accounts?.length) {
        console.warn("[AccountDropdown] WARNING: accounts array is empty");
      }
    }
  }, [accounts]);
  
  // Handle click outside using document pointerdown (not onBlur which is unreliable)
  useEffect(() => {
    if (!open) return;
    
    function handlePointerDown(e) {
      // Close only if click is outside BOTH triggerRef and menuRef
      const clickedTrigger = triggerRef.current?.contains(e.target);
      const clickedMenu = menuRef.current?.contains(e.target);
      
      if (!clickedTrigger && !clickedMenu) {
        setOpen(false);
      }
    }
    
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    
    // Add listeners after a tick to avoid closing immediately from the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  
  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      // Small delay to ensure DOM is ready after animation starts
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    if (!open) setSearch("");
  }, [open]);
  
  // Generate stable unique ID for each account (fix for missing/duplicate IDs)
  const getAccId = (a) => String(a?.id ?? a?.accountId ?? a?._id ?? "");
  
  // Filter accounts by search
  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(a => 
      (a.name || "").toLowerCase().includes(q) ||
      (a.status || "").toLowerCase().includes(q)
    );
  }, [accounts, search]);
  
  // Convert value to string for consistent comparison
  const valueStr = String(value ?? "");
  const selectedAccount = valueStr === NO_ACCOUNT_ID 
    ? createNoAccountOption(t)
    : accounts.find(a => getAccId(a) === valueStr);
  const isNoAccountSelected = valueStr === NO_ACCOUNT_ID;
  
  // Get account info
  const getAccountInfo = (a) => {
    if (a?.isVirtual) {
      return { startEq: 0, curEq: 0, pnl: 0, pnlPct: 0, currency: "$", status: "" };
    }
    const startEq = clampNum(a?.startingEquity);
    const curEq = clampNum(a?.currentEquity || startEq);
    const pnl = curEq - startEq;
    const pnlPct = startEq > 0 ? (pnl / startEq) * 100 : 0;
    const currency = a?.currency || "$";
    const status = a?.status || "Live";
    
    return { startEq, curEq, pnl, pnlPct, currency, status };
  };
  
  
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-1 h-10 w-full rounded-xl border border-border bg-card/50 px-3 text-sm text-foreground outline-none flex items-center justify-between gap-2 hover:bg-muted/30 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          {valueStr === NO_ACCOUNT_ID ? (
            <>
              <AvatarBubble avatar={null} color="#F59E0B" size={24} isNoAccount={true} />
              <span className="truncate">{t("accounts.noAccount")}</span>
            </>
          ) : valueStr !== "all" && selectedAccount ? (
            <>
              <AvatarBubble avatar={selectedAccount.avatar} color={selectedAccount.color} size={24} />
              <span className="truncate">{selectedAccount.name}</span>
              <span className="text-xs text-muted-foreground">
                ({selectedAccount.status || "Live"})
              </span>
            </>
          ) : (
            <span>{allLabel}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      
      {/* Dropdown menu - simple absolute positioning, high z-index */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute top-full left-0 mt-2 w-full min-w-[320px] rounded-xl border border-border bg-card shadow-lg z-[9999] pointer-events-auto overflow-hidden"
          >
            {/* Search input */}
            {accounts.length > 3 && (
              <div className="p-2 border-b border-border/50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("common.search") + "..."}
                    className="w-full h-8 pl-8 pr-3 rounded-lg bg-muted/30 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </div>
            )}
            
            {/* Scrollable account list */}
            <div className="max-h-[280px] overflow-y-auto overscroll-contain">
              {/* All Accounts option */}
              <button
                type="button"
                onClick={() => { onChange("all"); setOpen(false); }}
                className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-muted/50 transition border-b border-border/30 ${valueStr === "all" ? "bg-accent/10" : ""}`}
              >
                <div className="h-8 w-8 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                  <BarChart3 className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{allLabel}</div>
                  <div className="text-xs text-muted-foreground">{accounts.length} accounts</div>
                </div>
                {valueStr === "all" && <Check className="h-4 w-4 text-accent shrink-0" />}
              </button>
              
              {/* No Account option - only show if there are trades without account */}
              {showNoAccountOption && (
                <button
                  type="button"
                  onClick={() => { onChange(NO_ACCOUNT_ID); setOpen(false); }}
                  className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-muted/50 transition border-b border-border/30 ${valueStr === NO_ACCOUNT_ID ? "bg-amber-500/10" : ""}`}
                >
                  <AvatarBubble avatar={null} color="#F59E0B" size={32} isNoAccount={true} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-amber-500">{t("accounts.noAccount")}</div>
                    <div className="text-xs text-muted-foreground">{t("pages.analytics.filters.tradesWithoutAccount") || "Trades without account"}</div>
                  </div>
                  {valueStr === NO_ACCOUNT_ID && <Check className="h-4 w-4 text-amber-500 shrink-0" />}
                </button>
              )}
              
              {/* Account items with enhanced info */}
              {filteredAccounts.map((a, idx) => {
                const accId = getAccId(a);
                const keyId = accId || `idx-${idx}`;
                const info = getAccountInfo(a);
                const isSelected = valueStr === accId;
                
                return (
                  <button
                    key={keyId}
                    type="button"
                    onClick={() => { onChange(accId); setOpen(false); }}
                    className={`w-full px-3 py-2.5 text-left flex items-center gap-3 hover:bg-muted/50 transition ${isSelected ? "bg-accent/10" : ""}`}
                  >
                    <AvatarBubble avatar={a.avatar} color={a.color} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{a.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                          info.status === "Live" ? "bg-emerald-500/15 text-emerald-400" :
                          info.status === "Failed" ? "bg-red-500/15 text-red-400" :
                          info.status?.includes("Phase") ? "bg-blue-500/15 text-blue-400" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {info.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{fmtMoney(info.curEq, info.currency)}</span>
                        <span className={info.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {info.pnl >= 0 ? "+" : ""}{fmtPct(info.pnlPct)}
                        </span>
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-accent shrink-0" />}
                  </button>
                );
              })}
              
              {filteredAccounts.length === 0 && search && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {t("common.nothingFound")}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const StatCard = React.memo(function StatCard({ title, value, sub, icon, reduceMotion, delay = 0, variant = "default", trend = null }) {
  const variants = {
    default: "from-muted/30 to-muted/10",
    positive: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/20",
    negative: "from-rose-500/15 to-rose-500/5 border-rose-500/20",
    accent: "from-accent/15 to-accent/5 border-accent/20",
    warning: "from-amber-500/15 to-amber-500/5 border-amber-500/20",
  };
  
  const textVariants = {
    default: "",
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-rose-600 dark:text-rose-400",
    accent: "text-accent",
    warning: "text-amber-600 dark:text-amber-400",
  };
  
  return (
    <motion.div className="h-full" {...fadeUp(reduceMotion, delay)}>
      <Card className={`rounded-xl overflow-hidden border-2 bg-gradient-to-br ${variants[variant]} hover:shadow-md transition-shadow duration-200 h-full min-h-[100px]`}>
        <CardContent className="!p-0 h-full">
          <div className="h-full flex flex-col items-center justify-center gap-1 px-4 py-5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
              <span className="opacity-70">{icon}</span>
              {title}
            </span>
            {/* Tabular numbers for consistent alignment */}
            <span className={`text-2xl font-semibold tabular-nums tracking-tight ${textVariants[variant]}`}>
              {value}
            </span>
            {sub && (
              <span className="text-xs text-muted-foreground">
                {sub}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// EQUITY CHART COMPONENT (Recharts-based)
// ─────────────────────────────────────────────────────────────────────────────

// Helper: Format currency with compact notation for large numbers
function fmtCompactMoney(n, currency = "$") {
  const x = Number(n);
  if (!Number.isFinite(x)) return `${currency}0`;
  const abs = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}${currency}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 10000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  if (abs >= 1000) return `${sign}${currency}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

// Helper: Format date for axis ticks based on data range
function formatDateTick(dateStr, dataLength) {
  if (!dateStr || dateStr === "Start") return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  
  // For very short ranges (<=7 days), show weekday + day
  if (dataLength <= 7) {
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  }
  // For medium ranges (8-30 days), show month + day
  if (dataLength <= 30) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  // For longer ranges (>30 days), show month only or month + year if spanning years
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Helper: Format full date for tooltip
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

// Custom Tooltip component for Haunted theme
function EquityChartTooltip({ active, payload, currency }) {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0]?.payload;
  if (!data) return null;
  
  return (
    <div className="bg-card/95 backdrop-blur-md border border-border/60 rounded-xl shadow-2xl px-4 py-3 min-w-[160px]">
      <div className="font-semibold text-foreground text-sm mb-2 border-b border-border/30 pb-2">
        {formatFullDate(data.date)}
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
            <span className="text-muted-foreground">Delta:</span>
            <span className={`font-semibold tabular-nums ${data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {data.pnl >= 0 ? '+' : ''}{fmtMoney(data.pnl, currency)}
            </span>
          </div>
        )}
        {data.drawdown < 0 && (
          <div className="flex justify-between items-center gap-4">
            <span className="text-muted-foreground">Drawdown:</span>
            <span className="font-semibold text-rose-400 tabular-nums">
              {data.drawdown.toFixed(1)}%
            </span>
          </div>
        )}
        {data.isPeak && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <span className="text-amber-400 text-[10px] font-medium uppercase tracking-wider">★ Peak Equity</span>
          </div>
        )}
        {data.isMaxDd && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <span className="text-rose-400 text-[10px] font-medium uppercase tracking-wider">⚠ Max Drawdown</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Custom dot for highlighting peak and max drawdown
function CustomActiveDot(props) {
  const { cx, cy, payload, dataKey } = props;
  if (!cx || !cy) return null;
  
  // Peak marker (amber)
  if (payload?.isPeak) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={8} fill="rgb(251, 191, 36)" fillOpacity={0.2} />
        <circle cx={cx} cy={cy} r={5} fill="rgb(251, 191, 36)" stroke="rgb(30, 41, 59)" strokeWidth={2} />
      </g>
    );
  }
  
  // Max Drawdown marker (rose)
  if (payload?.isMaxDd) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={8} fill="rgb(244, 63, 94)" fillOpacity={0.2} />
        <circle cx={cx} cy={cy} r={5} fill="rgb(244, 63, 94)" stroke="rgb(30, 41, 59)" strokeWidth={2} />
      </g>
    );
  }
  
  return <circle cx={cx} cy={cy} r={4} fill="rgb(16, 185, 129)" stroke="rgb(30, 41, 59)" strokeWidth={2} />;
}

function EquityChart({ trades, accountId, currency, reduceMotion, baseEquity = 0 }) {
  const { t } = useI18n();
  
  // Prepare chart data with proper aggregation
  const { chartData, markers, stats } = useMemo(() => {
    const list = [...trades].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    
    const pnlFor = (tr) => {
      if (accountId === "all") return clampNum(tr.pnl);
      const allocs = Array.isArray(tr?.allocations) ? tr.allocations : null;
      
      // Handle NO_ACCOUNT_ID filtering
      if (accountId === NO_ACCOUNT_ID) {
        if (!allocs) return (!tr?.accountId || tr?.accountId === "") ? clampNum(tr.pnl) : 0;
        return allocs.filter(a => !a?.accountId || a?.accountId === "").reduce((s, a) => s + clampNum(a?.pnl), 0);
      }
      
      if (!allocs) return tr?.accountId === accountId ? clampNum(tr.pnl) : 0;
      return allocs.filter(a => a?.accountId === accountId).reduce((s, a) => s + clampNum(a?.pnl), 0);
    };
    
    let cumulative = baseEquity;
    let peak = baseEquity;
    const points = [{ 
      x: 0, 
      equity: baseEquity, 
      peak: baseEquity, 
      drawdown: 0, 
      drawdownAbs: 0, 
      pnl: 0, 
      date: "Start",
      isPeak: false,
      isMaxDd: false,
    }];
    
    for (let i = 0; i < list.length; i++) {
      const pnl = pnlFor(list[i]);
      cumulative += pnl;
      peak = Math.max(peak, cumulative);
      const drawdown = peak > 0 ? ((cumulative - peak) / peak) * 100 : 0;
      const drawdownAbs = cumulative - peak;
      points.push({
        x: i + 1,
        equity: cumulative,
        peak,
        drawdown,
        drawdownAbs,
        pnl,
        date: list[i].date || "",
        isPeak: false,
        isMaxDd: false,
      });
    }
    
    // Aggregate by day if too many points (>60 points)
    let aggregatedPoints = points;
    if (points.length > 60) {
      const byDay = new Map();
      for (const p of points) {
        const dayKey = p.date === "Start" ? "Start" : (p.date ? p.date.split("T")[0] : "unknown");
        byDay.set(dayKey, p); // Keep last point of each day
      }
      aggregatedPoints = Array.from(byDay.values());
    }
    
    // Find peak and max drawdown indices
    let peakIdx = 0;
    let maxDdIdx = 0;
    for (let i = 1; i < aggregatedPoints.length; i++) {
      if (aggregatedPoints[i].equity > aggregatedPoints[peakIdx].equity) peakIdx = i;
      if (aggregatedPoints[i].drawdown < aggregatedPoints[maxDdIdx].drawdown) maxDdIdx = i;
    }
    
    // Mark peak and max drawdown points
    if (peakIdx > 0) {
      aggregatedPoints[peakIdx].isPeak = true;
    }
    if (aggregatedPoints[maxDdIdx].drawdown < 0 && maxDdIdx !== peakIdx) {
      aggregatedPoints[maxDdIdx].isMaxDd = true;
    }
    
    // Calculate stats
    const finalEquity = aggregatedPoints[aggregatedPoints.length - 1]?.equity ?? baseEquity;
    const maxEquity = Math.max(...aggregatedPoints.map(p => p.equity));
    const minEquity = Math.min(...aggregatedPoints.map(p => p.equity));
    const pnl = finalEquity - baseEquity;
    const pnlPct = baseEquity > 0 ? (pnl / baseEquity) * 100 : 0;
    const maxDrawdown = Math.min(...aggregatedPoints.map(p => p.drawdown));
    
    return {
      chartData: aggregatedPoints,
      markers: {
        peak: peakIdx > 0 ? aggregatedPoints[peakIdx] : null,
        maxDd: aggregatedPoints[maxDdIdx].drawdown < 0 ? aggregatedPoints[maxDdIdx] : null,
      },
      stats: {
        finalEquity,
        maxEquity,
        minEquity,
        pnl,
        pnlPct,
        maxDrawdown,
      },
    };
  }, [trades, accountId, baseEquity]);
  
  // Empty state
  if (chartData.length <= 1) {
    return (
      <div className="h-[380px] flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Activity className="h-14 w-14 mx-auto mb-3 opacity-30" />
          <div className="text-sm font-medium">{t("pages.analytics.equity.noData")}</div>
          <div className="text-xs text-muted-foreground/60 mt-1">Add trades to see your equity curve</div>
        </div>
      </div>
    );
  }
  
  // Determine line color based on overall performance
  const isPositive = stats.pnl >= 0;
  const lineColor = isPositive ? "rgb(16, 185, 129)" : "rgb(244, 63, 94)";
  const gradientId = isPositive ? "equityGradientPositive" : "equityGradientNegative";
  
  // Calculate Y-axis domain with padding
  const yMin = stats.minEquity - (stats.maxEquity - stats.minEquity) * 0.1;
  const yMax = stats.maxEquity + (stats.maxEquity - stats.minEquity) * 0.1;
  
  return (
    <div className="space-y-4">
      {/* Stats Header */}
      <div className="flex items-start justify-between">
        <div className="text-left">
          <div className={`text-2xl font-bold leading-tight ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : ''}{fmtMoney(stats.pnl, currency)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {isPositive ? '+' : ''}{stats.pnlPct.toFixed(1)}% return
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"></span>
            {t("pages.analytics.equity.peak")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50"></span>
            {t("pages.analytics.equity.maxDd")}
          </span>
        </div>
      </div>
      
      {/* Recharts Chart Container - Full Size */}
      <div className="w-full h-[320px]">
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
            
            {/* Subtle Grid */}
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="rgb(71, 85, 105)" 
              strokeOpacity={0.15}
              vertical={false}
            />
            
            {/* X Axis - Dates */}
            <XAxis 
              dataKey="date"
              tickFormatter={(val) => formatDateTick(val, chartData.length)}
              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              tickLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            
            {/* Y Axis - Currency */}
            <YAxis 
              tickFormatter={(val) => fmtCompactMoney(val, currency)}
              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              tickLine={{ stroke: 'rgb(71, 85, 105)', strokeOpacity: 0.3 }}
              domain={[yMin, yMax]}
              width={65}
            />
            
            {/* Baseline Reference Line */}
            <ReferenceLine 
              y={baseEquity} 
              stroke="rgb(148, 163, 184)" 
              strokeDasharray="4 4" 
              strokeOpacity={0.5}
              label={{ 
                value: 'Base', 
                position: 'left', 
                fill: 'rgb(148, 163, 184)', 
                fontSize: 10,
                fontStyle: 'italic'
              }}
            />
            
            {/* Custom Tooltip */}
            <Tooltip 
              content={<EquityChartTooltip currency={currency} />}
              cursor={{ 
                stroke: 'rgb(148, 163, 184)', 
                strokeWidth: 1, 
                strokeDasharray: '4 4',
                strokeOpacity: 0.6
              }}
              animationDuration={150}
            />
            
            {/* Equity Area + Line */}
            <Area
              type="monotone"
              dataKey="equity"
              stroke={lineColor}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={<CustomActiveDot />}
              animationDuration={reduceMotion ? 0 : 800}
              animationEasing="ease-out"
            />
            
            {/* Peak Marker */}
            {markers.peak && (
              <ReferenceDot
                x={markers.peak.date}
                y={markers.peak.equity}
                r={6}
                fill="rgb(251, 191, 36)"
                stroke="rgb(30, 41, 59)"
                strokeWidth={2}
                label={{
                  value: fmtCompactMoney(markers.peak.equity, currency),
                  position: 'top',
                  fill: 'rgb(251, 191, 36)',
                  fontSize: 10,
                  fontWeight: 600,
                  offset: 10,
                }}
              />
            )}
            
            {/* Max Drawdown Marker */}
            {markers.maxDd && (
              <ReferenceDot
                x={markers.maxDd.date}
                y={markers.maxDd.equity}
                r={6}
                fill="rgb(244, 63, 94)"
                stroke="rgb(30, 41, 59)"
                strokeWidth={2}
                label={{
                  value: `${markers.maxDd.drawdown.toFixed(1)}%`,
                  position: 'bottom',
                  fill: 'rgb(244, 63, 94)',
                  fontSize: 10,
                  fontWeight: 600,
                  offset: 10,
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {/* Stats Below Chart */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/20">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("pages.analytics.equity.start")}</div>
          <div className="text-sm font-semibold tabular-nums">{fmtCompactMoney(baseEquity, currency)}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/20">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("pages.analytics.equity.current")}</div>
          <div className="text-sm font-semibold tabular-nums">{fmtCompactMoney(stats.finalEquity, currency)}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("pages.analytics.equity.peak")}</div>
          <div className="text-sm font-semibold tabular-nums text-amber-400">{fmtCompactMoney(stats.maxEquity, currency)}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{t("pages.analytics.equity.maxDd")}</div>
          <div className="text-sm font-semibold tabular-nums text-rose-400">{stats.maxDrawdown.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}

const MiniBarRow = React.memo(function MiniBarRow({
  left,
  right,
  value,
  max,
  tone = "indigo",
  onClick,
  reduceMotion,
  hint = "",
}) {
  const pct = max > 0 ? Math.min(1, Math.abs(value) / max) : 0;
  const isNeg = value < 0;
  const barTone = isNeg ? "bg-rose-500/50" : tone === "orange" ? "bg-orange-500/45" : "bg-indigo-500/45";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]/40 glass px-3 py-2 text-left ${HOVER_GLOW}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="min-w-0">{left}</div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--muted))]/55">
            <div
              className={`h-full rounded-full ${barTone} ${reduceMotion ? "" : "transition-[width] duration-300"}`}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold">{right}</div>
          <div className="text-xs text-muted-foreground group-hover:text-[rgb(var(--fg))] transition-colors duration-150">
{hint}
          </div>
        </div>
      </div>
    </button>
  );
});

export default function Analytics({ trades, accounts, libraries, reduceMotion, onTradeClick, ui = {} }) {
  const { t } = useI18n();
  const [accountId, setAccountId] = useState("all");
  const [symbolId, setSymbolId] = useState("all");
  const [sessionId, setSessionId] = useState("all");
  const [modelId, setModelId] = useState("all");
  const [direction, setDirection] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  
  // New filters for plan adherence and best trades
  const [planFilter, setPlanFilter] = useState("all"); // "all" | "followed" | "not_followed"
  const [bestTradesOnly, setBestTradesOnly] = useState(false);
  
  // Equity filter state for chart filtering
  const [equityFilter, setEquityFilter] = useState("all");
  
  // Trade preview drawer state
  const [previewTrade, setPreviewTrade] = useState(null);
  
  // Chart mode state for equity/daily toggle
  const [chartMode, setChartMode] = useState("equity");

  const accById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const symById = useMemo(() => new Map((libraries.symbols ?? []).map((s) => [s.id, s])), [libraries]);
  const sesById = useMemo(() => new Map((libraries.sessions ?? []).map((s) => [s.id, s])), [libraries]);
  const mdlById = useMemo(() => new Map((libraries.models ?? []).map((m) => [m.id, m])), [libraries]);
  
  // Templates for checking if account is live
  const templates = useMemo(() => mergePropTemplates([]), []);

  const today = new Date();
  const currency = useMemo(() => {
    const a = accountId !== "all" ? accById.get(accountId) : accounts?.[0];
    return a?.currency ?? "$";
  }, [accountId, accById, accounts]);
  
  // Get GLOBAL win rate mode from UI settings
  const winRateMode = getGlobalWinRateMode(ui);
  const avgRRMode = getGlobalAvgRRMode(ui);

  const allocsFor = (t) => {
    const arr = Array.isArray(t?.allocations) ? t.allocations : null;
    if (arr && arr.length) return arr;
    // Always return at least one allocation, even if accountId is empty
    return [{ accountId: t?.accountId || "", pnl: t?.pnl || 0, rr: t?.rr || 0 }];
  };

  const accPnL = (t, accId) => {
    // Handle NO_ACCOUNT_ID filtering
    if (accId === NO_ACCOUNT_ID) {
      return allocsFor(t)
        .filter((a) => !a?.accountId || a?.accountId === "")
        .reduce((s, a) => s + clampNum(a?.pnl), 0);
    }
    return allocsFor(t)
      .filter((a) => a?.accountId === accId)
      .reduce((s, a) => s + clampNum(a?.pnl), 0);
  };

  const accRR = (t, accId) => {
    // Handle NO_ACCOUNT_ID filtering
    if (accId === NO_ACCOUNT_ID) {
      return allocsFor(t)
        .filter((a) => !a?.accountId || a?.accountId === "")
        .reduce((s, a) => s + clampNum(a?.rr), 0);
    }
    return allocsFor(t)
      .filter((a) => a?.accountId === accId)
      .reduce((s, a) => s + clampNum(a?.rr), 0);
  };

  const hasAcc = (t, accId) => {
    // Use centralized helper for consistent behavior
    return tradeHasAccount(t, accId);
  };

  const filtered = useMemo(() => {
    let result = (trades ?? [])
      .filter((t) => (accountId === "all" ? true : hasAcc(t, accountId)))
      .filter((t) => (symbolId === "all" ? true : t.symbolId === symbolId))
      .filter((t) => (sessionId === "all" ? true : t.sessionId === sessionId))
      .filter((t) => (modelId === "all" ? true : (modelId === "none" ? !t.modelId : t.modelId === modelId)))
      .filter((t) => (direction === "all" ? true : String(t.direction || "").toLowerCase() === direction))
      .filter((t) => (from || to ? inRange(t.date, from, to) : true));
    
    // Plan adherence filter
    if (planFilter === "followed") {
      result = result.filter((t) => t.followPlan === true);
    } else if (planFilter === "not_followed") {
      result = result.filter((t) => t.followPlan === false);
    }
    
    // Best trades filter - top 10 by PnL within current filters
    if (bestTradesOnly) {
      const pnlFor = (tr) => (accountId === "all" ? clampNum(tr.pnl) : accPnL(tr, accountId));
      result = [...result].sort((a, b) => pnlFor(b) - pnlFor(a)).slice(0, 10);
    }
    
    return result;
  }, [trades, accountId, symbolId, sessionId, modelId, direction, from, to, planFilter, bestTradesOnly]);

  const selectedAcc = useMemo(() => {
    if (accountId === NO_ACCOUNT_ID) return createNoAccountOption(t);
    return accountId !== "all" ? accById.get(accountId) : null;
  }, [accountId, accById, t]);

  const stats = useMemo(() => {
    const list = [...filtered].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const total = list.length;

    const pnlFor = (tr) => (accountId === "all" ? clampNum(tr.pnl) : accPnL(tr, accountId));
    const rrFor = (t) => (accountId === "all" ? clampNum(t.rr) : accRR(t, accountId));

    const wins = list.filter((t) => classifyTradeOutcome({ pnl: pnlFor(t), isBreakEven: Boolean(t?.isBreakEven), mode: winRateMode }) === "win");
    const losses = list.filter((t) => classifyTradeOutcome({ pnl: pnlFor(t), isBreakEven: Boolean(t?.isBreakEven), mode: winRateMode }) === "loss");
    const breakEvensCount = total - wins.length - losses.length;
    const winRate = calcWinRatePct({ wins: wins.length, losses: losses.length, breakEvens: breakEvensCount, mode: winRateMode });
    const net = list.reduce((s, t) => s + pnlFor(t), 0);
    const sumWin = wins.reduce((s, t) => s + pnlFor(t), 0);

    // Compute equityCorrection (initial deficit/surplus before trade tracking)
    const eqCorrection = (() => {
      const accList = Array.isArray(accounts) ? accounts : [];
      if (accountId !== "all") {
        const acc = accById.get(accountId);
        return clampNum(acc?.equityCorrection);
      }
      return accList.reduce((s, a) => s + clampNum(a?.equityCorrection), 0);
    })();

    // Only include equityCorrection when no trade-level sub-filters are active.
    // equityCorrection is an account-level adjustment unrelated to specific
    // pairs/sessions/models/directions, so it should not distort filtered views.
    const hasSubFilter = symbolId !== "all" || sessionId !== "all" || modelId !== "all" || direction !== "all" || planFilter !== "all" || bestTradesOnly || from || to;
    const effectiveEqCorrection = hasSubFilter ? 0 : eqCorrection;
    const adjustedNet = net + effectiveEqCorrection;

    // Profit % for the selected period.
    // Base equity is the equity *at the start of the selected date range* (or starting equity if no "From" date).
    // This makes the metric stable even when the user filters to a sub-period.
    const fromMs = toMs(from);

    const baseEquity = (() => {
      const accList = Array.isArray(accounts) ? accounts : [];
      if (accountId !== "all") {
        const acc = accById.get(accountId);
        const startEq = clampNum(acc?.startingEquity ?? acc?.currentEquity ?? 0);
        if (!fromMs) return startEq;
        const pnlBefore = (trades ?? [])
          .filter((t) => {
            const d = toMs(t?.date);
            return d !== null && d < fromMs;
          })
          .reduce((s, t) => s + accPnL(t, accountId), 0);
        return startEq + pnlBefore;
      }

      // accountId === "all"
      const startEq = accList.reduce((s, a) => s + clampNum(a?.startingEquity ?? 0), 0);
      if (!fromMs) return startEq;
      const pnlBefore = (trades ?? [])
        .filter((t) => {
          const d = toMs(t?.date);
          return d !== null && d < fromMs;
        })
        .reduce((s, t) => s + clampNum(t?.pnl), 0);
      return startEq + pnlBefore;
    })();

    // Calculate profitPct: when all accounts selected, sum individual account profit percentages
    const profitPct = (() => {
      if (accountId !== "all") {
        // Single account: use adjustedNet (includes equityCorrection)
        return baseEquity > 0 ? (adjustedNet / baseEquity) * 100 : 0;
      }
      // All accounts: sum of per-trade profit percentages
      // Each trade's % is calculated from its account's base equity (via getInitialBalance).
      // Allocations are ignored — always use trade.pnl and trade.accountId.
      // equityCorrection is not included (it has no per-trade attribution).
      const accList = Array.isArray(accounts) ? accounts : [];
      const accountsMap = new Map(accList.map(a => [a?.id, a]));
      let totalPctSum = 0;
      for (const t of list) {
        const acc = accountsMap.get(t?.accountId);
        const base = getInitialBalance(acc);
        if (base <= 0) continue;
        const pnl = clampNum(t?.pnl);
        totalPctSum += (pnl / base) * 100;
      }
      return totalPctSum;
    })();

    const avgR = total ? list.reduce((s, t) => s + rrFor(t), 0) / total : 0;
    const avgTrade = total ? net / total : 0;
    const avgWin = wins.length ? sumWin / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + pnlFor(t), 0) / losses.length : 0;

    // equity curve & max drawdown (simple)
    let eq = 0;
    let peak = 0;
    let maxDd = 0;
    for (const t of list) {
      eq += pnlFor(t);
      peak = Math.max(peak, eq);
      maxDd = Math.min(maxDd, eq - peak);
    }

    return { total, winRate, net: adjustedNet, profitPct, baseEquity, eqCorrection: effectiveEqCorrection, avgR, avgTrade, avgWin, avgLoss, maxDd };
  }, [filtered, accountId, symbolId, sessionId, modelId, direction, planFilter, bestTradesOnly, from, to, trades, accounts, accById, winRateMode]);
  
  // Calculate performance report data using the centralized calculator
  const reportData = useMemo(() => {
    return calcPerformanceReport(filtered, accounts, libraries, {
      accountId,
      startingEquity: stats.baseEquity,
      equityCorrection: stats.eqCorrection,
      winRateMode,
      avgRRMode,
    });
  }, [filtered, accounts, libraries, accountId, stats.baseEquity, stats.eqCorrection, winRateMode, avgRRMode]);
  
  // Handler for clicking on a trade in the filtered trades table
  const handleTradePreviewClick = (trade) => {
    setPreviewTrade(trade);
  };

  const byAccount = useMemo(() => {
    const rows = [];
    const m = new Map();

    for (const tr of filtered) {
      const allocs = allocsFor(tr);
      for (const a of allocs) {
        // Use NO_ACCOUNT_ID for allocations without accountId
        const key = getTradeAccountKey(a);
        
        // Apply account filter if not "all"
        if (accountId !== "all") {
          if (accountId === NO_ACCOUNT_ID) {
            if (key !== NO_ACCOUNT_ID) continue;
          } else {
            if (key !== accountId) continue;
          }
        }
        
        const prev = m.get(key) ?? { net: 0, total: 0, wins: 0, losses: 0, breakEvens: 0 };
        const pnl = clampNum(a?.pnl);
        const outcome = classifyTradeOutcome({ pnl, isBreakEven: Boolean(tr?.isBreakEven), mode: winRateMode });
        prev.net += pnl;
        prev.total += 1;
        if (outcome === "win") prev.wins += 1;
        else if (outcome === "loss") prev.losses += 1;
        else prev.breakEvens += 1;
        m.set(key, prev);
      }
    }

    for (const [id, v] of m.entries()) {
      const isNoAccount = id === NO_ACCOUNT_ID;
      rows.push({
        id,
        name: isNoAccount ? t("accounts.noAccount") : (accById.get(id)?.name ?? accById.get(id)?.id ?? "Account"),
        avatar: isNoAccount ? null : accById.get(id)?.avatar,
        color: isNoAccount ? "#F59E0B" : accById.get(id)?.color,
        net: v.net,
        total: v.total,
        winRate: calcWinRatePct({ wins: v.wins, losses: v.losses, breakEvens: v.breakEvens, mode: winRateMode }),
        isNoAccount,
      });
    }

    rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const max = rows.reduce((mx, r) => Math.max(mx, Math.abs(r.net)), 0);
    return { rows, max };
  }, [filtered, accById, accountId, t, winRateMode]);

  const byPair = useMemo(() => {
    const pnlFor = (tr) => (accountId === "all" ? clampNum(tr.pnl) : accPnL(tr, accountId));
    const m = groupBy(filtered, (tr) => tr.symbolId || "none");
    const rows = [];
    for (const [id, list] of m.entries()) {
      const net = list.reduce((s, tr) => s + pnlFor(tr), 0);
      const total = list.length;
      let wins = 0, losses = 0, breakEvens = 0;
      for (const tr of list) {
        const p = pnlFor(tr);
        const outcome = classifyTradeOutcome({ pnl: p, isBreakEven: Boolean(tr?.isBreakEven), mode: winRateMode });
        if (outcome === "win") wins++;
        else if (outcome === "loss") losses++;
        else breakEvens++;
      }
      rows.push({
        id,
        name: symById.get(id)?.name ?? (id === "none" ? "(no pair)" : symById.get(id)?.id ?? "Pair"),
        avatar: symById.get(id)?.avatar,
        color: symById.get(id)?.color,
        net,
        total,
        // Use global win rate mode from settings
        winRate: calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode }),
      });
    }
    rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const max = rows.reduce((mx, r) => Math.max(mx, Math.abs(r.net)), 0);
    return { rows, max };
  }, [filtered, symById, accountId, winRateMode]);

  const bySession = useMemo(() => {
    const pnlFor = (tr) => (accountId === "all" ? clampNum(tr.pnl) : accPnL(tr, accountId));
    const m = groupBy(filtered, (tr) => tr.sessionId || "none");
    const rows = [];
    for (const [id, list] of m.entries()) {
      const net = list.reduce((s, tr) => s + pnlFor(tr), 0);
      const total = list.length;
      let wins = 0, losses = 0, breakEvens = 0;
      for (const tr of list) {
        const p = pnlFor(tr);
        const outcome = classifyTradeOutcome({ pnl: p, isBreakEven: Boolean(tr?.isBreakEven), mode: winRateMode });
        if (outcome === "win") wins++;
        else if (outcome === "loss") losses++;
        else breakEvens++;
      }
      rows.push({
        id,
        name: sesById.get(id)?.name ?? (id === "none" ? "(no session)" : sesById.get(id)?.id ?? "Session"),
        net,
        total,
        // Use global win rate mode from settings
        winRate: calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode }),
      });
    }
    rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const max = rows.reduce((mx, r) => Math.max(mx, Math.abs(r.net)), 0);
    return { rows, max };
  }, [filtered, sesById, accountId, winRateMode]);

  const byModel = useMemo(() => {
    const pnlFor = (tr) => (accountId === "all" ? clampNum(tr.pnl) : accPnL(tr, accountId));
    const m = groupBy(filtered, (tr) => tr.modelId || "none");
    const rows = [];
    for (const [id, list] of m.entries()) {
      const net = list.reduce((s, tr) => s + pnlFor(tr), 0);
      const total = list.length;
      let wins = 0, losses = 0, breakEvens = 0;
      for (const tr of list) {
        const p = pnlFor(tr);
        const outcome = classifyTradeOutcome({ pnl: p, isBreakEven: Boolean(tr?.isBreakEven), mode: winRateMode });
        if (outcome === "win") wins++;
        else if (outcome === "loss") losses++;
        else breakEvens++;
      }
      rows.push({
        id,
        name: mdlById.get(id)?.name ?? (id === "none" ? t("pages.analytics.noModel") : mdlById.get(id)?.id ?? "Model"),
        net,
        total,
        winRate: calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode }),
      });
    }
    rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const max = rows.reduce((mx, r) => Math.max(mx, Math.abs(r.net)), 0);
    return { rows, max };
  }, [filtered, mdlById, accountId, t, winRateMode]);

  const quick = (days) => {
    const now = new Date();
    const toIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const fromD = new Date(Date.now() - 86400000 * days);
    const fromIso = `${fromD.getFullYear()}-${String(fromD.getMonth() + 1).padStart(2, "0")}-${String(fromD.getDate()).padStart(2, "0")}`;
    setFrom(fromIso);
    setTo(toIso);
  };

  const reset = () => {
    setAccountId("all");
    setSymbolId("all");
    setSessionId("all");
    setModelId("all");
    setDirection("all");
    setFrom("");
    setTo("");
    setPlanFilter("all");
    setBestTradesOnly(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ========== ANALYTICS SECTION ========== */}
      <Header
        title={t("pages.analytics.title")}
        subtitle={t("pages.analytics.subtitle")}
        reduceMotion={reduceMotion}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button variant="secondary" onClick={() => quick(7)}><Filter className="h-4 w-4" /> {t("pages.analytics.quick.d7")}</Button>
            </Press>
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button variant="secondary" onClick={() => quick(30)}><Filter className="h-4 w-4" /> {t("pages.analytics.quick.d30")}</Button>
            </Press>
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" /> {t("common.reset")}</Button>
            </Press>
          </div>
        }
      />

      <motion.div {...fadeUp(reduceMotion, 0.05)} className="relative z-30">
        <Card className={`rounded-xl overflow-visible ${HOVER_GLOW}`}>
          <CardContent className="p-4 pt-5 overflow-visible">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
              <div className="relative">
                <div className="text-xs font-semibold text-muted-foreground">{t("pages.analytics.filters.account")}</div>
                <AccountDropdown
                  accounts={accounts}
                  value={accountId}
                  onChange={setAccountId}
                  allLabel={t("pages.analytics.filters.all")}
                  trades={trades}
                />
              </div>

              <div className="relative">
                <div className="text-xs font-semibold text-muted-foreground">{t("pages.analytics.filters.pair")}</div>
                <SelectDropdown
                  label={t("pages.analytics.filters.pair")}
                  value={symbolId}
                  onChange={setSymbolId}
                  searchable
                  options={[
                    { value: "all", label: t("pages.analytics.filters.all"), icon: <Coins className="h-4 w-4 text-accent" /> },
                    ...(libraries.symbols || []).filter((s) => !isDeleted(s)).map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))
                  ]}
                />
              </div>

              <div className="relative">
                <div className="text-xs font-semibold text-muted-foreground">{t("pages.analytics.filters.session")}</div>
                <SelectDropdown
                  label={t("pages.analytics.filters.session")}
                  value={sessionId}
                  onChange={setSessionId}
                  searchable
                  options={[
                    { value: "all", label: t("pages.analytics.filters.all"), icon: <Timer className="h-4 w-4 text-accent" /> },
                    ...(libraries.sessions || []).filter((s) => !isDeleted(s)).map((s) => {
                      const tone = sessionTone(s.name);
                      const colorClass = tone === "green" ? "text-emerald-500" :
                        tone === "orange" ? "text-amber-500" :
                        tone === "purple" ? "text-violet-500" :
                        tone === "blue" ? "text-blue-500" : "text-accent";
                      return {
                        value: s.id,
                        label: s.name,
                        icon: <Timer className={`h-4 w-4 ${colorClass}`} />,
                      };
                    })
                  ]}
                />
              </div>

              {ui.modelsEnabled && (
              <div className="relative">
                <div className="text-xs font-semibold text-muted-foreground">{t("pages.analytics.filters.model")}</div>
                <SelectDropdown
                  label={t("pages.analytics.filters.model")}
                  value={modelId}
                  onChange={setModelId}
                  searchable
                  options={[
                    { value: "all", label: t("pages.analytics.filters.all"), icon: <Brain className="h-4 w-4 text-accent" /> },
                    ...(libraries.models || []).filter((m) => !isDeleted(m)).map((m) => ({
                      value: m.id,
                      label: m.name,
                      icon: <Brain className="h-4 w-4 text-violet-500" />,
                    }))
                  ]}
                />
              </div>
              )}

              <div className="relative">
                <div className="text-xs font-semibold text-muted-foreground">{t("pages.analytics.filters.direction")}</div>
                <SelectDropdown
                  label={t("pages.analytics.filters.direction")}
                  value={direction}
                  onChange={setDirection}
                  searchable={false}
                  options={[
                    { value: "all", label: t("pages.analytics.filters.all"), icon: <ArrowRightLeft className="h-4 w-4 text-accent" /> },
                    { value: "long", label: t("pages.analytics.filters.long"), icon: <TrendingUp className="h-4 w-4 text-emerald-500" /> },
                    { value: "short", label: t("pages.analytics.filters.short"), icon: <TrendingDown className="h-4 w-4 text-red-500" /> },
                  ]}
                />
              </div>

              <div className="relative">
                <div className="text-xs font-semibold text-muted-foreground">
                  {t("pages.analytics.filters.from")} / {t("pages.analytics.filters.to")}
                </div>
                <DateRangePicker
                  fromValue={from}
                  toValue={to}
                  onFromChange={setFrom}
                  onToChange={setTo}
                  fromLabel={t("pages.analytics.filters.from")}
                  toLabel={t("pages.analytics.filters.to")}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="rounded-full"><BarChart3 className="h-3.5 w-3.5" /> {t("pages.analytics.trades", { count: filtered.length })}</Badge>
              {accountId !== "all" ? (
                <>
                  <Badge variant="secondary" className="rounded-full">{t("pages.analytics.filters.account")}: {accById.get(accountId)?.name ?? "—"}</Badge>
                  {selectedAcc ? (
                    <Badge variant="secondary" className="rounded-full">
                      equity: {fmtMoney(selectedAcc.currentEquity ?? selectedAcc.startingEquity, currency)}
                    </Badge>
                  ) : null}
                </>
              ) : null}
              {symbolId !== "all" ? <Badge variant="secondary" className="rounded-full">{t("pages.analytics.filters.symbol")}: {symById.get(symbolId)?.name ?? "—"}</Badge> : null}
              {sessionId !== "all" ? <Badge variant="secondary" className="rounded-full">{t("pages.analytics.filters.session")}: {sesById.get(sessionId)?.name ?? "—"}</Badge> : null}
              {direction !== "all" ? <Badge variant="secondary" className="rounded-full">dir: {direction}</Badge> : null}
              {planFilter !== "all" ? (
                <Badge variant="secondary" className="rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5" /> 
                  {planFilter === "followed" ? t("pages.analytics.filters.followedPlan") : t("pages.analytics.filters.notFollowedPlan")}
                </Badge>
              ) : null}
              {bestTradesOnly ? (
                <Badge variant="secondary" className="rounded-full bg-amber-500/15 text-amber-500 border-amber-500/20">
                  <Trophy className="h-3.5 w-3.5" /> {t("pages.analytics.filters.bestTrades")}
                </Badge>
              ) : null}
            </div>
            
            {/* Additional filter chips */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setBestTradesOnly(!bestTradesOnly)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  bestTradesOnly 
                    ? "bg-amber-500 text-white shadow-md shadow-amber-500/25" 
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-accent/15"
                }`}
              >
                <Trophy className="h-3.5 w-3.5" />
                {t("pages.analytics.filters.bestTrades")}
              </button>
              <button
                onClick={() => setPlanFilter(planFilter === "followed" ? "all" : "followed")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  planFilter === "followed"
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/25"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-accent/15"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("pages.analytics.filters.followedPlan")}
              </button>
              <button
                onClick={() => setPlanFilter(planFilter === "not_followed" ? "all" : "not_followed")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  planFilter === "not_followed"
                    ? "bg-red-500 text-white shadow-md shadow-red-500/25"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-accent/15"
                }`}
              >
                <XCircle className="h-3.5 w-3.5" />
                {t("pages.analytics.filters.notFollowedPlan")}
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>



      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <motion.div {...fadeUp(reduceMotion, 0.24)}>
          <Card className="rounded-xl border-2 border-border/50 bg-gradient-to-br from-indigo-500/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-8 w-8 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-indigo-500" />
                </div>
                {t("pages.analytics.breakdown.byAccount")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byAccount.rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">{t("pages.analytics.noData")}</div>
              ) : (
                byAccount.rows.map((r) => (
                  <MiniBarRow
                    key={r.id}
                    left={
                      <div className="flex items-center gap-2">
                        <AvatarPill 
                          avatar={r.avatar} 
                          color={r.color} 
                          label={r.name} 
                          sub={`${t("pages.analytics.trades", { count: r.total })} • ${fmtPct(r.winRate)}`}
                          isNoAccount={r.isNoAccount}
                        />
                      </div>
                    }
                    right={fmtMoney(r.net, currency)}
                    value={r.net}
                    max={byAccount.max}
                    onClick={() => setAccountId(r.id || "all")}
                    reduceMotion={reduceMotion}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeUp(reduceMotion, 0.28)}>
          <Card className="rounded-xl border-2 border-border/50 bg-gradient-to-br from-orange-500/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-8 w-8 rounded-xl bg-orange-500/20 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-orange-500" />
                </div>
                {t("pages.analytics.breakdown.byPair")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byPair.rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">{t("pages.analytics.noData")}</div>
              ) : (
                byPair.rows.map((r) => (
                  <MiniBarRow
                    key={r.id}
                    left={<AvatarPill avatar={r.avatar} color={r.color} label={r.name} sub={`${t("pages.analytics.trades", { count: r.total })} • ${fmtPct(r.winRate)}`} />}
                    right={fmtMoney(r.net, currency)}
                    value={r.net}
                    max={byPair.max}
                    tone="orange"
                    onClick={() => setSymbolId(r.id || "all")}
                    reduceMotion={reduceMotion}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeUp(reduceMotion, 0.32)}>
          <Card className="rounded-xl border-2 border-border/50 bg-gradient-to-br from-purple-500/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-8 w-8 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-purple-500" />
                </div>
                {t("pages.analytics.breakdown.bySession")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {bySession.rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">{t("pages.analytics.noData")}</div>
              ) : (
                bySession.rows.map((r) => (
                  <MiniBarRow
                    key={r.id}
                    left={
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{t("pages.analytics.trades", { count: r.total })} • {fmtPct(r.winRate)}</div>
                        </div>
                        <SessionBadge name={r.name} reduceMotion={reduceMotion} />
                      </div>
                    }
                    right={fmtMoney(r.net, currency)}
                    value={r.net}
                    max={bySession.max}
                    tone="indigo"
                    onClick={() => setSessionId(r.id || "all")}
                    reduceMotion={reduceMotion}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeUp(reduceMotion, 0.36)}>
          <Card className="rounded-xl border-2 border-border/50 bg-gradient-to-br from-violet-500/5 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-8 w-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-violet-500" />
                </div>
                {t("pages.analytics.breakdown.byModel")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byModel.rows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">{t("pages.analytics.noData")}</div>
              ) : (
                byModel.rows.map((r) => (
                  <MiniBarRow
                    key={r.id}
                    left={
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{t("pages.analytics.trades", { count: r.total })} • {fmtPct(r.winRate)}</div>
                        </div>
                      </div>
                    }
                    right={fmtMoney(r.net, currency)}
                    value={r.net}
                    max={byModel.max}
                    tone="violet"
                    onClick={() => setModelId(r.id || "all")}
                    reduceMotion={reduceMotion}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          PREMIUM KPI GRID - Full metrics dashboard
          ───────────────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(reduceMotion, 0.28)}>
        <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/60 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {t("pages.performanceReport.title")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("pages.performanceReport.subtitle")}
              </p>
            </div>
          </div>
          <KpiGrid 
            kpis={reportData.kpis}
            currency={currency}
            reduceMotion={reduceMotion}
            t={t}
          />
        </div>
      </motion.div>

      {/* ─────────────────────────────────────────────────────────────────────
          DISCIPLINE & CONSISTENCY + SMART INSIGHTS
          ───────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_380px] gap-4">
        <motion.div {...fadeUp(reduceMotion, 0.30)}>
          <DisciplineCard 
            discipline={reportData.discipline}
            kpis={reportData.kpis}
            reduceMotion={reduceMotion}
            t={t}
          />
        </motion.div>
        <motion.div {...fadeUp(reduceMotion, 0.32)}>
          <InsightsPanel 
            insights={reportData.insights}
            reduceMotion={reduceMotion}
            t={t}
          />
        </motion.div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          PREMIUM BREAKDOWN TABS
          ───────────────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(reduceMotion, 0.34)}>
        <BreakdownTabs 
          breakdowns={reportData.breakdowns}
          currency={currency}
          reduceMotion={reduceMotion}
          t={t}
        />
      </motion.div>

      {/* ─────────────────────────────────────────────────────────────────────
          FILTERED TRADES LIST
          ───────────────────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <motion.div {...fadeUp(reduceMotion, 0.36)}>
          <FilteredTradesTable 
            trades={filtered}
            accounts={accounts}
            libraries={libraries}
            currency={currency}
            onTradeClick={handleTradePreviewClick}
            reduceMotion={reduceMotion}
            maxHeight="500px"
          />
        </motion.div>
      )}

      {/* Prop Analytics Section */}
      <PropAnalyticsSection accounts={accounts} currency={currency} reduceMotion={reduceMotion} t={t} />

      {/* Payouts Section */}
      <PayoutsSection accounts={accounts} currency={currency} reduceMotion={reduceMotion} t={t} />
      
      {/* Trade Preview Drawer */}
      <TradePreviewDrawer
        trade={previewTrade}
        accounts={accounts}
        libraries={libraries}
        currency={currency}
        onClose={() => setPreviewTrade(null)}
        onOpenFullTrade={(trade) => {
          setPreviewTrade(null);
          onTradeClick?.(trade);
        }}
        reduceMotion={reduceMotion}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP ANALYTICS SECTION
// ─────────────────────────────────────────────────────────────────────────────

function PropAnalyticsSection({ accounts, currency, reduceMotion, t }) {
  const templates = useMemo(() => mergePropTemplates([]), []);
  
  const propStats = useMemo(() => {
    let totalSpent = 0;
    let failedCount = 0;
    let passedCount = 0;
    let payoutCount = 0;
    let liveEarnings = 0;
    let totalPropAccounts = 0;
    
    for (const acc of accounts || []) {
      // Only count prop accounts
      if (!acc?.prop?.templateId) continue;
      totalPropAccounts++;
      
      // Sum challenge costs
      const cost = clampNum(acc.prop?.challengeCost ?? 0);
      totalSpent += cost;
      
      // Count by status
      const status = String(acc.status || "").toLowerCase();
      if (status === "failed") {
        failedCount++;
      } else if (status === "passed") {
        passedCount++;
      } else if (status === "on payout") {
        payoutCount++;
      }
      
      // Calculate live earnings from payouts (sum ALL paid payouts, not just current cycle)
      if (isLivePropAccount(acc, templates)) {
        const { payouts } = summarizePayouts(acc, templates);
        const allPaidPayouts = (payouts || []).filter(p => p.status === "paid");
        liveEarnings += allPaidPayouts.reduce((s, p) => s + clampNum(p.amountTrader), 0);
      }
    }
    
    // Calculate ROI
    const roi = totalSpent > 0 ? ((liveEarnings - totalSpent) / totalSpent) * 100 : 0;
    
    return {
      totalSpent,
      failedCount,
      passedCount,
      payoutCount,
      liveEarnings,
      totalPropAccounts,
      roi,
    };
  }, [accounts, templates]);
  
  // Don't show if no prop accounts
  if (propStats.totalPropAccounts === 0) {
    return null;
  }
  
  return (
    <motion.div {...fadeUp(reduceMotion, 0.20)}>
      <Card className={`rounded-xl border-2 border-accent/20 bg-gradient-to-br from-accent/5 to-transparent ${HOVER_GLOW}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-accent/20 flex items-center justify-center">
              <Banknote className="h-4 w-4 text-accent" />
            </div>
            <div>
              <div className="text-base">{t("pages.analytics.propAnalytics.title")}</div>
              <div className="text-xs font-normal text-muted-foreground">{t("pages.analytics.propAnalytics.subtitle")}</div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
            {/* Total Spent */}
            <div className="text-center p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Wallet className="h-4 w-4 text-rose-500" />
              </div>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
                {fmtMoney(propStats.totalSpent, currency)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                {t("pages.analytics.propAnalytics.totalSpent")}
              </div>
            </div>
            
            {/* Failed Accounts */}
            <div className="text-center p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <XCircle className="h-4 w-4 text-rose-500" />
              </div>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
                {propStats.failedCount}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                {t("pages.analytics.propAnalytics.failedAccounts")}
              </div>
            </div>
            
            {/* Passed Accounts */}
            <div className="text-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Trophy className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {propStats.passedCount}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                {t("pages.analytics.propAnalytics.passedAccounts")}
              </div>
            </div>
            
            {/* On Payout */}
            <div className="text-center p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {propStats.payoutCount}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                {t("pages.analytics.propAnalytics.payoutAccounts")}
              </div>
            </div>
            
            {/* Live Earnings */}
            <div className="text-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {fmtMoney(propStats.liveEarnings, currency)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                {t("pages.analytics.propAnalytics.liveEarnings")}
              </div>
            </div>
            
            {/* ROI */}
            <div className={`text-center p-3 rounded-xl ${propStats.roi >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-rose-500/10 border border-rose-500/20"}`}>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Percent className={`h-4 w-4 ${propStats.roi >= 0 ? "text-emerald-500" : "text-rose-500"}`} />
              </div>
              <div className={`text-xl font-bold ${propStats.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {propStats.roi >= 0 ? "+" : ""}{propStats.roi.toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                {t("pages.analytics.propAnalytics.roi")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYOUTS SECTION
// ─────────────────────────────────────────────────────────────────────────────

function PayoutsSection({ accounts, currency, reduceMotion, t }) {
  // Collect all payouts from all live accounts
  const templates = useMemo(() => mergePropTemplates([]), []);
  
  const payoutStats = useMemo(() => {
    let totalPaid = 0;
    let totalPending = 0;
    let payoutCount = 0;
    const allPayouts = [];
    const byAccount = new Map();
    
    for (const acc of accounts || []) {
      if (!acc?.prop?.payouts?.length) continue;
      
      const { pendingTrader, payouts } = summarizePayouts(acc, templates);
      
      // Count and sum ALL paid payouts (not just current cycle) for total statistics
      const paidPayouts = (payouts || []).filter(p => p.status === "paid");
      const paidTotal = paidPayouts.reduce((s, p) => s + clampNum(p.amountTrader), 0);
      totalPaid += paidTotal;
      totalPending += pendingTrader;
      payoutCount += paidPayouts.length;
      
      // Collect for history
      for (const p of payouts || []) {
        allPayouts.push({
          ...p,
          accountId: acc.id,
          accountName: acc.name,
          accountAvatar: acc.avatar,
          accountColor: acc.color,
          currency: acc.currency || "$",
        });
      }
      
      // By account breakdown
      if (paidTotal > 0 || pendingTrader > 0) {
        byAccount.set(acc.id, {
          id: acc.id,
          name: acc.name,
          avatar: acc.avatar,
          color: acc.color,
          paid: paidTotal,
          pending: pendingTrader,
          count: paidPayouts.length,
        });
      }
    }
    
    // Sort payouts by date (newest first)
    allPayouts.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
    
    // Recent payouts (last 10)
    const recentPayouts = allPayouts.slice(0, 10);
    
    // By account list
    const accountList = Array.from(byAccount.values()).sort((a, b) => b.paid - a.paid);
    const maxPaid = accountList.reduce((mx, a) => Math.max(mx, a.paid), 0);
    
    return {
      totalPaid,
      totalPending,
      payoutCount,
      recentPayouts,
      accountList,
      maxPaid,
    };
  }, [accounts, templates]);
  
  // Don't show if no payouts
  if (payoutStats.payoutCount === 0 && payoutStats.totalPending === 0) {
    return null;
  }
  
  return (
    <motion.div {...fadeUp(reduceMotion, 0.24)}>
      <Card className={`rounded-xl ${HOVER_GLOW}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t("pages.analytics.payouts.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
            <div className="text-center p-3 rounded-xl bg-emerald-500/10">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {fmtMoney(payoutStats.totalPaid, currency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{t("pages.analytics.payouts.totalPaid")}</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-amber-500/10">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {fmtMoney(payoutStats.totalPending, currency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{t("pages.analytics.payouts.pending")}</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-muted/30">
              <div className="text-2xl font-bold">{payoutStats.payoutCount}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("pages.analytics.payouts.count")}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Account */}
            {payoutStats.accountList.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-2">{t("pages.analytics.payouts.byAccount")}</div>
                <div className="space-y-2">
                  {payoutStats.accountList.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-muted/30">
                      <AvatarPill 
                        avatar={acc.avatar} 
                        color={acc.color} 
                        label={acc.name} 
                        sub={`${acc.count} ${t("pages.analytics.payouts.payouts")}`}
                      />
                      <div className="text-right">
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {fmtMoney(acc.paid, currency)}
                        </div>
                        {acc.pending > 0 && (
                          <div className="text-xs text-amber-500">+{fmtMoney(acc.pending, currency)} pending</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Recent History */}
            {payoutStats.recentPayouts.length > 0 && (
              <div>
                <div className="text-sm font-semibold mb-2">{t("pages.analytics.payouts.recent")}</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {payoutStats.recentPayouts.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.status === "paid" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : p.status === "requested" ? (
                          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                        ) : (
                          <span className="h-4 w-4 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{p.accountName}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(p.requestedAt).toLocaleDateString()}
                            {p.note && <span className="ml-1 italic">"{p.note}"</span>}
                          </div>
                        </div>
                      </div>
                      <div className={`font-semibold shrink-0 ${
                        p.status === "paid" ? "text-emerald-600 dark:text-emerald-400" : 
                        p.status === "requested" ? "text-amber-600 dark:text-amber-400" : 
                        "text-muted-foreground line-through"
                      }`}>
                        {fmtMoney(p.amountTrader, p.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
