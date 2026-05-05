import React, { useEffect, useMemo, useState } from "react";
import { Trash2, Pencil, ListTree } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import TransactionSheet from "@/pages/app/TransactionSheet.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { formatMoney } from "@/lib/money.js";

export default function Transactions({ autoOpen = false }) {
  const { t, lang } = useI18n();
  const { state, remove } = useFinance();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (autoOpen) setSheetOpen(true);
  }, [autoOpen]);

  const cats = useMemo(() => new Map(active(state.categories).map((c) => [c.id, c])), [state.categories]);
  const wals = useMemo(() => new Map(active(state.wallets).map((w) => [w.id, w])), [state.wallets]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return active(state.transactions)
      .filter((tx) => {
        if (!q) return true;
        const cat = cats.get(tx.categoryId);
        const wal = wals.get(tx.walletId);
        return (
          (cat?.name || "").toLowerCase().includes(q) ||
          (wal?.name || "").toLowerCase().includes(q) ||
          (tx.note || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [state.transactions, search, cats, wals]);

  // Group by day
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const tx of list) {
      const day = new Date(tx.date).toISOString().slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(tx);
    }
    return Array.from(groups.entries());
  }, [list]);

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title={t("nav.transactions")}
        right={
          <Button onClick={() => { setEditing(null); setSheetOpen(true); }}>
            {t("common.add")}
          </Button>
        }
      />
      <Input
        placeholder={t("tx.search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {grouped.length === 0 ? (
        <EmptyState icon={ListTree} title={t("tx.empty")} description={t("tx.emptyHint")} />
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 px-1">
                {new Date(day).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US", {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                })}
              </div>
              <Card className="overflow-hidden">
                {items.map((tx) => {
                  const cat = cats.get(tx.categoryId);
                  const wal = wals.get(tx.walletId);
                  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "↔";
                  const cls =
                    tx.type === "income"
                      ? "text-emerald-600"
                      : tx.type === "expense"
                        ? "text-red-600"
                        : "text-slate-500";
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                    >
                      <span className="text-2xl">{cat?.icon || (tx.type === "transfer" ? "↔️" : "💸")}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {cat?.name || (tx.type === "transfer" ? t("tx.transfer") : "—")}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {wal?.name}
                          {tx.note ? ` · ${tx.note}` : ""}
                        </div>
                      </div>
                      <div className={`text-sm font-semibold tabular-nums ${cls}`}>
                        {sign} {formatMoney(tx.amount_cents, tx.currency, lang)}
                      </div>
                      <button
                        onClick={() => {
                          setEditing(tx);
                          setSheetOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-slate-600"
                        aria-label={t("common.edit")}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove("transactions", tx.id)}
                        className="p-2 text-slate-400 hover:text-red-500"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
      <TransactionSheet
        key={editing?.id || "new"}
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        initial={editing}
      />
    </div>
  );
}
