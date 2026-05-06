import React, { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Archive, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { walletBalance } from "@/lib/finance/calc.js";
import { formatMoney } from "@/lib/money.js";

export default function WalletDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { t, lang } = useI18n();
  const { state, upsert, remove } = useFinance();

  const wallet = useMemo(() => state.wallets.find((w) => w.id === id), [state.wallets, id]);
  const cats = useMemo(() => new Map(active(state.categories).map((c) => [c.id, c])), [state.categories]);

  const txns = useMemo(() => {
    if (!wallet) return [];
    return active(state.transactions)
      .filter((tx) => tx.walletId === wallet.id || tx.toWalletId === wallet.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [state.transactions, wallet]);

  if (!wallet) {
    return (
      <div className="page-enter space-y-4">
        <PageHeader title={t("errors.notFound")} />
        <Link to="/app/wallets" className="text-indigo-600 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> {t("nav.wallets")}
        </Link>
      </div>
    );
  }

  const balance = walletBalance(wallet, state.transactions);
  const monthIncome = txns
    .filter((tx) => {
      if (tx.type !== "income" && !(tx.type === "transfer" && tx.toWalletId === wallet.id)) return false;
      const d = new Date(tx.date);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((s, tx) => s + (tx.amount_cents || 0), 0);

  const monthExpense = txns
    .filter((tx) => {
      if (tx.type !== "expense" && !(tx.type === "transfer" && tx.walletId === wallet.id)) return false;
      const d = new Date(tx.date);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((s, tx) => s + (tx.amount_cents || 0), 0);

  return (
    <div className="page-enter space-y-4">
      <Link to="/app/wallets" className="text-sm text-slate-500 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> {t("nav.wallets")}
      </Link>

      <Card
        className="p-6"
        style={{
          background: wallet.color
            ? `linear-gradient(135deg, ${wallet.color}25, ${wallet.color}05)`
            : undefined,
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-3xl">{wallet.icon}</div>
            <h1 className="text-2xl font-bold tracking-tight mt-2">{wallet.name}</h1>
            <div className="text-xs text-slate-500 mt-1">
              {t(`wallets.types.${wallet.type}`)} · {wallet.currency}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              className="p-2 text-slate-500 hover:text-slate-700"
              onClick={() =>
                upsert("wallets", { ...wallet, isArchived: !wallet.isArchived })
              }
              aria-label={t("common.archive")}
            >
              <Archive className="w-4 h-4" />
            </button>
            <button
              className="p-2 text-slate-500 hover:text-red-500"
              onClick={() => {
                remove("wallets", wallet.id);
                nav("/app/wallets");
              }}
              aria-label={t("common.delete")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="mt-6 text-4xl font-bold tabular-nums">
          {formatMoney(balance, wallet.currency, lang)}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-slate-500">{t("dashboard.spentMonth")}</div>
          <div className="text-lg font-semibold tabular-nums text-red-600 mt-1">
            {formatMoney(monthExpense, wallet.currency, lang)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">{t("dashboard.earnedMonth")}</div>
          <div className="text-lg font-semibold tabular-nums text-indigo-600 mt-1">
            {formatMoney(monthIncome, wallet.currency, lang)}
          </div>
        </Card>
      </div>

      <div>
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          {t("dashboard.recent")}
        </div>
        {txns.length === 0 ? (
          <EmptyState title={t("tx.empty")} description={t("tx.emptyHint")} />
        ) : (
          <Card className="overflow-hidden">
            {txns.slice(0, 50).map((tx) => {
              const cat = cats.get(tx.categoryId);
              const isOutgoing =
                tx.type === "expense" || (tx.type === "transfer" && tx.walletId === wallet.id);
              const cls = isOutgoing ? "text-red-600" : "text-indigo-600";
              const sign = isOutgoing ? "-" : "+";
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                >
                  <span className="text-2xl">{cat?.icon || (tx.type === "transfer" ? "↔️" : "💸")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {cat?.name || (tx.type === "transfer" ? t("tx.transfer") : "—")}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {new Date(tx.date).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US")}
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
