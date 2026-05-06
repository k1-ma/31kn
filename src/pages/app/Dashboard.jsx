import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Wallet as WalletIcon, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import AmountDisplay from "@/components/ui/AmountDisplay.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { walletBalance, rangeSummary, budgetProgress } from "@/lib/finance/calc.js";
import { formatMoney, totalInBase } from "@/lib/money.js";
import { useFxRates } from "@/lib/finance/useFxRates.js";

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { start, end };
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { state } = useFinance();

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

  const rates = useFxRates(baseCurrency);
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

  return (
    <div className="page-enter space-y-5">
      <PageHeader title={greeting} subtitle={new Date().toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US", { weekday: "long", day: "numeric", month: "long" })} />

      <Card className="p-5">
        <div className="text-sm text-slate-500">{t("dashboard.netWorth")}</div>
        <div className="mt-1">
          {baseTotal != null && otherCurrencies.length > 0 ? (
            <>
              <AmountDisplay cents={baseTotal} currency={baseCurrency} size="xl" />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                {Object.entries(totals).map(([currency, cents]) => (
                  <span key={currency} className="tabular-nums">
                    {formatMoney(cents, currency, lang)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-0.5">
              {Object.entries(totals).map(([currency, cents]) => (
                <div key={currency}>
                  <AmountDisplay cents={cents} currency={currency} size="xl" />
                </div>
              ))}
              {Object.keys(totals).length === 0 && (
                <AmountDisplay cents={0} currency={baseCurrency} size="xl" />
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <TrendingDown className="w-4 h-4 text-red-500" /> {t("dashboard.spentMonth")}
          </div>
          <div className="mt-2">
            <AmountDisplay cents={summary.expense} currency={baseCurrency} size="lg" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> {t("dashboard.earnedMonth")}
          </div>
          <div className="mt-2">
            <AmountDisplay cents={summary.income} currency={baseCurrency} size="lg" />
          </div>
        </Card>
      </div>

      {/* Wallets strip */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("nav.wallets")}</div>
          <Link to="/app/wallets" className="text-xs text-emerald-600 inline-flex items-center gap-1">
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

      {/* Active budgets */}
      {budgets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t("dashboard.activeBudgets")}
            </div>
            <Link to="/app/budgets" className="text-xs text-emerald-600 inline-flex items-center gap-1">
              {t("dashboard.seeAll")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {budgets.slice(0, 3).map((b) => {
              const pct = Math.min(1, budgetProgress(b, transactions));
              const over = budgetProgress(b, transactions) > 1;
              return (
                <Card key={b.id} className="p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{b.name}</span>
                    <span className={`tabular-nums ${over ? "text-red-600" : "text-slate-500"}`}>
                      {Math.round(pct * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${over ? "bg-red-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.round(pct * 100)}%` }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("dashboard.recent")}</div>
          <Link to="/app/transactions" className="text-xs text-emerald-600 inline-flex items-center gap-1">
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
                tx.type === "income" ? "text-emerald-600" : tx.type === "expense" ? "text-red-600" : "text-slate-500";
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
