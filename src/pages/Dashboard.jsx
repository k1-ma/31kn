// src/pages/Dashboard.jsx
import React, { useMemo, useState } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Button from "@/components/ui/Button.jsx";
import SmartInsights from "@/components/common/SmartInsights.jsx";
import { clampNum, fmtMoney, fmtPct } from "@/lib/utils";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { calcWinRatePct, getGlobalWinRateMode, classifyTradeOutcome, isTradeBreakEven } from "@/lib/metrics/winRate.js";

function localeFromLang(lang) {
  if (lang === "ru") return "ru-RU";
  if (lang === "uk") return "uk-UA";
  return "en-US";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeDateKey(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (!Number.isFinite(dt.getTime())) return null;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function startOfMonth(d) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), 1);
}

function addMonths(d, delta) {
  const dt = startOfMonth(d);
  return new Date(dt.getFullYear(), dt.getMonth() + delta, 1);
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function buildMonthGrid(viewMonth /* Date */) {
  const first = startOfMonth(viewMonth);
  // Sunday-based grid (0 = Sun)
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const weeks = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push( hookupWeek(week, viewMonth) );
  }

  // Drop trailing empty weeks (no days from this month)
  const m = viewMonth.getMonth();
  while (weeks.length > 4) {
    const last = weeks[weeks.length - 1];
    const hasMonthDay = last.some((d) => d.getMonth() === m);
    if (hasMonthDay) break;
    weeks.pop();
  }

  return weeks;
}

// small helper to ensure we're always working with Date objects (no mutation leakage)
function hookupWeek(week, viewMonth) {
  return week.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()));
}

function formatRange(start, end, locale) {
  const fmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function Ring({ value, label, sublabel, reduceMotion, stroke = "#3B82F6" }) {
  const pct = Math.max(0, Math.min(1, value));
  const size = 160;
  const r = 62;
  const c = 2 * Math.PI * r;
  const dash = pct * c;
  const gap = c - dash;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {/* Haunted glow behind ring */}
        <div className="absolute inset-0 rounded-full bg-[#3B82F6]/10 blur-xl" />
        <svg width={size} height={size} viewBox="0 0 160 160" className="block relative">
          <defs>
            <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="rgba(59,130,246,0.15)"
            strokeWidth="12"
          />
          <circle
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="url(#ringGradient)"
            strokeLinecap="round"
            strokeWidth="12"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={c * 0.25}
            style={{ 
              transition: reduceMotion ? "none" : "stroke-dasharray 420ms ease",
              filter: "drop-shadow(0 0 8px rgba(59,130,246,0.4))"
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-[#3B82F6] via-[#60A5FA] to-[#22D3EE] bg-clip-text text-transparent">{Math.round(pct * 100)}%</div>
          {sublabel ? <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div> : null}
        </div>
      </div>
      {label ? <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</div> : null}
    </div>
  );
}

function StatCard({ title, value, sub, icon: Icon, trend, accent }) {
  const isPositive = trend === "up" || (typeof value === "string" && value.startsWith("+"));
  const isNegative = trend === "down" || (typeof value === "string" && value.startsWith("-"));
  
  return (
    <div className="relative rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/70 p-4 transition-all duration-300 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)] hover:border-accent/30 overflow-hidden group">
      {/* Haunted glow overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#3B82F6]/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Content */}
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
          {Icon && <Icon className="h-4 w-4 text-[#3B82F6]/50" />}
        </div>
        <div className={`mt-2 text-2xl font-bold tracking-tight ${
          accent === "success" || isPositive ? "text-emerald-500" :
          accent === "danger" || isNegative ? "text-red-500" :
          "text-foreground"
        }`}>
          {value}
        </div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </div>
      
      {/* Haunted decorative glow element */}
      <div className="absolute -right-4 -bottom-4 h-20 w-20 rounded-full bg-gradient-to-br from-[#3B82F6]/15 to-[#22D3EE]/10 blur-2xl" />
    </div>
  );
}

export default function Dashboard({ trades = [], accounts = [], reduceMotion, toast, ui }) {
  const { t, lang } = useI18n();
  const locale = localeFromLang(lang);
  const currency = accounts?.[0]?.currency ?? "$";

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));

  const dailyAgg = useMemo(() => {
    const map = new Map();
    for (const tr of trades ?? []) {
      const key = normalizeDateKey(tr?.date);
      if (!key) continue;

      const pnl = clampNum(tr?.pnl);
      const dir = String(tr?.direction || "").toLowerCase();
      const allocs = Array.isArray(tr?.allocations) ? tr.allocations : [];
      const riskUsd = allocs.length
        ? allocs.reduce((s, a) => s + clampNum(a?.riskUsd), 0)
        : clampNum(tr?.riskUsd);

      const prev = map.get(key) || {
        pnl: 0,
        trades: 0,
        riskUsd: 0,
        wins: 0,
        losses: 0,
        longTrades: 0,
        shortTrades: 0,
        longPnl: 0,
        shortPnl: 0,
        longWins: 0,
        shortWins: 0,
      };

      const outcome = classifyTradeOutcome({ pnl, isBreakEven: isTradeBreakEven(tr), mode: "ignore" });
      const next = { ...prev };
      next.pnl += pnl;
      next.trades += 1;
      next.riskUsd += riskUsd;
      if (outcome === "win") next.wins += 1;
      else if (outcome === "loss") next.losses += 1;

      if (dir === "long") {
        next.longTrades += 1;
        next.longPnl += pnl;
        if (outcome === "win") next.longWins += 1;
      }
      if (dir === "short") {
        next.shortTrades += 1;
        next.shortPnl += pnl;
        if (outcome === "win") next.shortWins += 1;
      }

      map.set(key, next);
    }
    return map;
  }, [trades]);

  const monthTrades = useMemo(() => {
    const m = viewMonth.getMonth();
    const y = viewMonth.getFullYear();
    return (trades ?? []).filter((tr) => {
      const key = normalizeDateKey(tr?.date);
      if (!key) return false;
      const d = new Date(`${key}T00:00:00`);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [trades, viewMonth]);

  const monthMetrics = useMemo(() => {
    const uniqDays = new Set();
    let pnl = 0;
    let riskUsd = 0;
    let wins = 0;
    let losses = 0;
    let biggestWin = 0;
    let biggestLoss = 0;

    let longTrades = 0;
    let shortTrades = 0;
    let longPnl = 0;
    let shortPnl = 0;
    let longWins = 0;
    let shortWins = 0;
    let breakEvens = 0;
    let longBreakEvens = 0;
    let shortBreakEvens = 0;

    for (const tr of monthTrades) {
      const key = normalizeDateKey(tr?.date);
      if (key) uniqDays.add(key);
      const p = clampNum(tr?.pnl);
      pnl += p;
      const outcome = classifyTradeOutcome({ pnl: p, isBreakEven: isTradeBreakEven(tr), mode: "ignore" });
      if (outcome === "win") wins += 1;
      else if (outcome === "loss") losses += 1;
      else breakEvens += 1;

      if (p > biggestWin) biggestWin = p;
      if (p < biggestLoss) biggestLoss = p;

      const dir = String(tr?.direction || "").toLowerCase();
      if (dir === "long") {
        longTrades += 1;
        longPnl += p;
        if (outcome === "win") longWins += 1;
        else if (outcome === "be") longBreakEvens += 1;
      }
      if (dir === "short") {
        shortTrades += 1;
        shortPnl += p;
        if (outcome === "win") shortWins += 1;
        else if (outcome === "be") shortBreakEvens += 1;
      }

      const allocs = Array.isArray(tr?.allocations) ? tr.allocations : [];
      riskUsd += allocs.length ? allocs.reduce((s, a) => s + clampNum(a?.riskUsd), 0) : clampNum(tr?.riskUsd);
    }

    const totalTrades = monthTrades.length;
    const winRateMode = getGlobalWinRateMode(ui);
    const winRate = calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode });

    const longLosses = longTrades - longWins - longBreakEvens;
    const shortLosses = shortTrades - shortWins - shortBreakEvens;
    const longWinRate = calcWinRatePct({ wins: longWins, losses: longLosses, breakEvens: longBreakEvens, mode: winRateMode });
    const shortWinRate = calcWinRatePct({ wins: shortWins, losses: shortLosses, breakEvens: shortBreakEvens, mode: winRateMode });

    return {
      tradingDays: uniqDays.size,
      totalTrades,
      pnl,
      riskUsd,
      wins,
      losses,
      winRate,
      biggestWin,
      biggestLoss,
      longTrades,
      shortTrades,
      longPnl,
      shortPnl,
      longWinRate,
      shortWinRate,
    };
  }, [monthTrades, ui]);

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
  }, [gridWeeks, dailyAgg, locale]);

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const base = new Date(2025, 0, 5); // Sunday
    return Array.from({ length: 7 }).map((_, i) => fmt.format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)));
  }, [locale]);

  const today = new Date();

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* ========== SECTION A: Daily Summary Header ========== */}
      <Header
        title={t("pages.dashboard.dailySummary")}
        subtitle={t("pages.dashboard.dailySubtitle")}
      />

      {/* Month selector and badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t("common.pnl")}: {fmtMoney(monthMetrics.pnl, currency)}</Badge>
          <Badge variant="secondary">{t("common.days")}: {monthMetrics.tradingDays}</Badge>
        </div>
      </div>

      {/* ========== SECTION B: Performance Overview (Analytics Panel) ========== */}
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base uppercase tracking-wider">
            {t("pages.dashboard.performanceOverview")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Stats - Full width responsive grid */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard 
              title={t("pages.dashboard.stats.daysTraded")} 
              value={monthMetrics.tradingDays}
              sub={t("pages.dashboard.stats.thisMonth")}
              icon={CalendarDays}
            />
            <StatCard 
              title={t("pages.dashboard.stats.tradesTaken")} 
              value={monthMetrics.totalTrades}
              sub={`${monthMetrics.wins}W / ${monthMetrics.losses}L`}
            />
            <StatCard 
              title={t("pages.dashboard.stats.biggestWin")} 
              value={monthMetrics.biggestWin ? fmtMoney(monthMetrics.biggestWin, currency) : "—"} 
              sub={t("pages.dashboard.stats.bestSingleTrade")}
              accent="success"
            />
            <StatCard 
              title={t("pages.dashboard.stats.biggestLoss")} 
              value={monthMetrics.biggestLoss ? fmtMoney(monthMetrics.biggestLoss, currency) : "—"} 
              sub={t("pages.dashboard.stats.worstSingleTrade")}
              accent="danger"
            />
            <StatCard 
              title={t("pages.dashboard.stats.winRate")} 
              value={fmtPct(monthMetrics.winRate)} 
              sub={`${monthMetrics.wins}W / ${monthMetrics.losses}L`} 
            />
          </div>

          {/* Smart Insights + Dashboard Intelligence */}
          <SmartInsights trades={trades} accounts={accounts} reduceMotion={reduceMotion} />
        </CardContent>
      </Card>

      {/* ========== SECTION C: Calendar (Drill-down view at bottom) ========== */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        {/* Calendar Grid */}
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base uppercase tracking-wider">
              {t("pages.dashboard.calendarView")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {weekdays.map((w) => (
                <div key={w} className="px-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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

                // Haunted color scheme - cold blue for wins, muted red for losses
                const bg = pnl > 0 ? "rgba(59,130,246,0.12)" : pnl < 0 ? "rgba(220,90,90,0.10)" : "rgba(30,50,100,0.25)";
                const br = pnl > 0 ? "rgba(59,130,246,0.35)" : pnl < 0 ? "rgba(220,90,90,0.35)" : "rgba(59,130,246,0.15)";
                const txt = pnl > 0 ? "text-emerald-500" : pnl < 0 ? "text-red-500" : "text-muted-foreground";
                const glow = pnl > 0 ? "shadow-[0_0_12px_rgba(59,130,246,0.2)]" : pnl < 0 ? "shadow-[0_0_12px_rgba(220,90,90,0.15)]" : "";

                return (
                  <div
                    key={`${key}_${idx}`}
                    className={`relative min-h-[86px] rounded-xl border p-2 transition-all duration-200 hover:scale-[1.02] ${glow} ${
                      inMonth ? "" : "opacity-45"
                    } ${isToday ? "ring-2 ring-[#3B82F6]/50 shadow-[0_0_20px_rgba(59,130,246,0.25)]" : ""}`}
                    style={{ backgroundColor: bg, borderColor: br }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-semibold">{d.getDate()}</div>
                      {tradesCount ? (
                        <div className="text-[11px] font-semibold text-muted-foreground">{tradesCount} →</div>
                      ) : null}
                    </div>

                    <div className="absolute bottom-2 right-2 text-right">
                      {tradesCount ? (
                        <div className={`text-xs font-semibold ${txt}`}>{fmtMoney(pnl, currency)}</div>
                      ) : (
                        <div className="text-xs text-muted-foreground">—</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Summary */}
        <Card className="rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base uppercase tracking-wider">{t("pages.dashboard.weeklySummary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {weekSummaries.map((w) => {
              const pos = w.pnl >= 0;
              return (
                <div key={w.idx} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-accent/10 bg-card/30 hover:border-accent/25 hover:shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-all duration-200">
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
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
