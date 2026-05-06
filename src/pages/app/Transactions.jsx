import React, { useEffect, useMemo, useState } from "react";
import { Trash2, Pencil, ListTree, SlidersHorizontal } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import TransactionSheet from "@/pages/app/TransactionSheet.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { formatMoney } from "@/lib/money.js";
import { rangeFromPreset } from "@/lib/finance/range.js";
import RangeBar from "@/components/ui/RangeBar.jsx";

const TYPE_OPTIONS = ["all", "income", "expense", "transfer"];

export default function Transactions({ autoOpen = false }) {
  const { t, lang } = useI18n();
  const { state, remove } = useFinance();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [type, setType] = useState("all");
  const [walletId, setWalletId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [preset, setPreset] = useState("month");

  useEffect(() => {
    if (autoOpen) setSheetOpen(true);
  }, [autoOpen]);

  const cats = useMemo(() => new Map(active(state.categories).map((c) => [c.id, c])), [state.categories]);
  const wals = useMemo(() => new Map(active(state.wallets).map((w) => [w.id, w])), [state.wallets]);
  const range = useMemo(
    () => (typeof preset === "object" ? preset : rangeFromPreset(preset)),
    [preset]
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startMs = new Date(range.start).getTime();
    const endMs = new Date(range.end).getTime();
    return active(state.transactions)
      .filter((tx) => {
        const ts = new Date(tx.date).getTime();
        if (ts < startMs || ts >= endMs) return false;
        if (type !== "all" && tx.type !== type) return false;
        if (walletId !== "all" && tx.walletId !== walletId && tx.toWalletId !== walletId) return false;
        if (categoryId !== "all" && tx.categoryId !== categoryId) return false;
        if (q) {
          const cat = cats.get(tx.categoryId);
          const wal = wals.get(tx.walletId);
          const tags = Array.isArray(tx.tags) ? tx.tags.join(" ") : "";
          const blob = `${cat?.name || ""} ${wal?.name || ""} ${tx.note || ""} ${tags}`.toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [state.transactions, search, type, walletId, categoryId, range, cats, wals]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const tx of list) {
      const day = new Date(tx.date).toISOString().slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(tx);
    }
    return Array.from(groups.entries());
  }, [list]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const tx of list) {
      if (tx.type === "income") inc += tx.amount_cents || 0;
      else if (tx.type === "expense") exp += tx.amount_cents || 0;
    }
    return { inc, exp, net: inc - exp };
  }, [list]);

  const baseCurrency = state.prefs?.baseCurrency || "UAH";
  const filtersActive =
    type !== "all" || walletId !== "all" || categoryId !== "all" || preset !== "month" || typeof preset === "object";

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

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <RangeBar value={preset} onChange={setPreset} />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border ${
            filtersActive
              ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {t("tx.filters")}
        </button>
      </div>

      {showFilters && (
        <Card className="p-4 space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.income")} / {t("tx.expense")}</label>
            <div className="flex gap-2 flex-wrap">
              {TYPE_OPTIONS.map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setType(tp)}
                  className={`h-9 px-3 rounded-xl text-xs font-medium border ${
                    type === tp
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {tp === "all" ? t("common.all") : t(`tx.${tp}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.wallet")}</label>
              <select
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
              >
                <option value="all">{t("common.all")}</option>
                {Array.from(wals.values()).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.category")}</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
              >
                <option value="all">{t("common.all")}</option>
                {Array.from(cats.values()).map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setType("all");
                setWalletId("all");
                setCategoryId("all");
                setPreset("month");
                setSearch("");
              }}
            >
              {t("common.reset")}
            </Button>
          </div>
        </Card>
      )}

      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("tx.income")}</div>
            <div className="text-sm font-semibold tabular-nums text-indigo-600">
              {formatMoney(totals.inc, baseCurrency, lang)}
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("tx.expense")}</div>
            <div className="text-sm font-semibold tabular-nums text-red-600">
              {formatMoney(totals.exp, baseCurrency, lang)}
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Net</div>
            <div
              className={`text-sm font-semibold tabular-nums ${
                totals.net >= 0 ? "text-indigo-600" : "text-red-600"
              }`}
            >
              {formatMoney(totals.net, baseCurrency, lang)}
            </div>
          </div>
        </div>
      )}

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
                      ? "text-indigo-600"
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
                        {Array.isArray(tx.tags) && tx.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tx.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex h-5 items-center rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 text-[10px] font-medium"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
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
