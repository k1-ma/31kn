import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Wallet as WalletIcon, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import AmountDisplay from "@/components/ui/AmountDisplay.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import Skeleton, { SkeletonCard } from "@/components/ui/Skeleton.jsx";
import ProgressRing from "@/components/ui/ProgressRing.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { walletBalance, rangeSummary, budgetProgress } from "@/lib/finance/calc.js";
import { formatMoney, totalInBase } from "@/lib/money.js";
import { useFxRates } from "@/lib/finance/useFxRates.js";
import { useSpotlight } from "@/lib/useSpotlight.js";

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { start, end };
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { state, loaded } = useFinance();

  const wallets = useMemo(() => active(state.wallets).filter((w) => !w.isArchived), [state.wallets]);
  const transactions = state.transactions;
  const baseCurrency = state.prefs?.baseCurrency || "UAH";

  const totals = useMemo(() => {
    const acc = {};
    for (const w of wallets) {
      const c = w.currency || "UAH";
      acc[c] = (acc[c] || 0) + walletBalance(w, transactions);
    }
    return acc;
  }, [wallets, transactions]);

  const { rates, stale: fxStale } = useFxRates(baseCurrency);
  const otherCurrencies = Object.keys(totals).filter((c) => c !== baseCurrency);
  const baseTotal = useMemo(() => {
    if (!rates) return null;
    return totalInBase(totals, baseCurrency, rates);
  }, [totals, baseCurrency, rates]);

  const { start, end } = monthRange();
  const summary = useMemo(() => rangeSummary(transactions, start, end), [transactions, start, end]);

  const budgets = active(state.budgets);
  const goals = active(state.goals);
  const recent = useMemo(() => {
    return active(transactions)
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6);
  }, [transactions]);

  const greeting = user?.nickname || user?.username
    ? t("dashboard.hello", { name: user.nickname || user.username })
    : t("dashboard.helloAnon");

  const catMap = useMemo(() => new Map(active(state.categories).map((c) => [c.id, c])), [state.categories]);
  const walMap = useMemo(() => new Map(wallets.map((w) => [w.id, w])), [wallets]);
  const onSpotlight = useSpotlight();

  if (!loaded) {
    return (
      <div className="page-enter space-y-5">
        <Skeleton className="w-48 mb-2" height="h-7" />
        <SkeletonCard />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="page-enter space-y-5">
      <PageHeader title={greeting} subtitle={new Date().toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US", { weekday: "long", day: "numeric", month: "long" })} />

      {/* Hero balance card with brand gradient — net worth front and center. */}
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient text-white p-6 shadow-brand">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 100% 0%, rgba(255,255,255,0.2), transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="text-xs uppercase tracking-wider opacity-85 font-mono">
            {t("dashboard.netWorth")}
          </div>
          <div className="mt-1.5 font-display font-mono-tabular text-4xl md:text-5xl font-bold tracking-tight">
            {baseTotal != null && otherCurrencies.length > 0
              ? formatMoney(baseTotal, baseCurrency, lang)
              : Object.keys(totals).length === 0
                ? formatMoney(0, baseCurrency, lang)
                : formatMoney(totals[baseCurrency] ?? Object.values(totals)[0], baseCurrency, lang)}
          </div>
          {otherCurrencies.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs opacity-85">
              {Object.entries(totals)
                .filter(([c]) => c !== baseCurrency)
                .map(([currency, cents]) => (
                  <span key={currency} className="tabular-nums">
                    {formatMoney(cents, currency, lang)}
                  </span>
                ))}
            </div>
          )}
          <div className="mt-3 flex gap-3 text-xs opacity-85">
            <span>{wallets.length} {t("nav.wallets").toLowerCase()}</span>
          </div>
        </div>
      </div>

      {fxStale && otherCurrencies.length > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/40 rounded-xl px-3 py-2">
          {t("dashboard.fxStale")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card onMouseMove={onSpotlight} className="spotlight lift p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-mono">
            <TrendingDown className="w-3.5 h-3.5 text-red-500" /> {t("dashboard.spentMonth")}
          </div>
          <div className="mt-2">
            <AmountDisplay cents={summary.expense} currency={baseCurrency} size="lg" />
          </div>
        </Card>
        <Card onMouseMove={onSpotlight} className="spotlight lift p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-mono">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> {t("dashboard.earnedMonth")}
          </div>
          <div className="mt-2">
            <span className="font-mono-tabular text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              +{formatMoney(summary.income, baseCurrency, lang)}
            </span>
          </div>
        </Card>
      </div>

      {/* Wallets strip */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("nav.wallets")}</div>
          <Link to="/app/wallets" className="text-xs text-indigo-600 inline-flex items-center gap-1">
            {t("dashboard.seeAll")} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {wallets.length === 0 ? (
          <EmptyState icon={WalletIcon} title={t("wallets.empty")} />
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
            {wallets.map((w) => {
              const balance = walletBalance(w, transactions);
              return (
                <Link
                  key={w.id}
                  to="/app/wallets"
                  className="shrink-0 w-44 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"
                  style={{ background: w.color ? `linear-gradient(135deg, ${w.color}15, ${w.color}05)` : undefined }}
                >
                  <div className="text-xl">{w.icon || "💼"}</div>
                  <div className="text-xs text-slate-500 mt-1 truncate">{w.name}</div>
                  <div className="font-semibold tabular-nums mt-1 text-slate-900 dark:text-slate-100">
                    {formatMoney(balance, w.currency, lang)}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Active budgets — horizontal ring strip */}
      {budgets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("dashboard.activeBudgets")}
            </div>
            <Link to="/app/budgets" className="text-xs text-indigo-600 inline-flex items-center gap-1 font-medium">
              {t("dashboard.seeAll")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4">
            {budgets.slice(0, 8).map((b) => {
              const raw = budgetProgress(b, transactions);
              const pct = Math.round(Math.max(0, Math.min(raw, 1.5)) * 100);
              const color = raw > 1 ? "var(--danger)" : raw > 0.8 ? "var(--warning)" : "var(--brand)";
              return (
                <Link
                  key={b.id}
                  to="/app/budgets"
                  className="shrink-0 w-28 flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                >
                  <ProgressRing
                    pct={pct}
                    size={56}
                    stroke={5}
                    color={color}
                    label={<span className="text-base">{b.icon || "💰"}</span>}
                  />
                  <div className="text-[11px] font-medium truncate max-w-full text-slate-900 dark:text-slate-100">
                    {b.name}
                  </div>
                  <div className="font-mono text-[10px]" style={{ color }}>
                    {pct}%
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("dashboard.recent")}</div>
          <Link to="/app/transactions" className="text-xs text-indigo-600 inline-flex items-center gap-1">
            {t("dashboard.seeAll")} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState title={t("tx.empty")} description={t("tx.emptyHint")} />
        ) : (
          <Card className="overflow-hidden">
            {recent.map((tx) => {
              const cat = catMap.get(tx.categoryId);
              const wal = walMap.get(tx.walletId);
              const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "↔";
              const cls =
                tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : tx.type === "expense" ? "text-slate-900 dark:text-slate-100" : "text-slate-500";
              return (
                <div key={tx.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                  <span className="text-2xl">{cat?.icon || "💸"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {cat?.name || (tx.type === "transfer" ? t("tx.transfer") : "—")}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {wal?.name} · {new Date(tx.date).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US")}
                      {tx.note ? ` · ${tx.note}` : ""}
                    </div>
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${cls}`}>
                    {sign} {formatMoney(tx.amount_cents, tx.currency, lang)}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
