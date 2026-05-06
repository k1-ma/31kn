import React, { useEffect, useMemo, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import Button from "@/components/ui/Button.jsx";
import NumPad from "@/components/ui/NumPad.jsx";
import Input from "@/components/ui/Input.jsx";
import TagsInput from "@/components/ui/TagsInput.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { toCents } from "@/lib/money.js";

const TYPES = [
  { id: "expense", labelKey: "tx.expense" },
  { id: "income", labelKey: "tx.income" },
  { id: "transfer", labelKey: "tx.transfer" },
];

export default function TransactionSheet({ open, onClose, initial = null }) {
  const { t } = useI18n();
  const { state, upsert } = useFinance();

  const [type, setType] = useState(initial?.type || "expense");
  const [amount, setAmount] = useState(initial ? String((initial.amount_cents || 0) / 100) : "0");
  const [walletId, setWalletId] = useState(initial?.walletId || "");
  const [toWalletId, setToWalletId] = useState(initial?.toWalletId || "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [note, setNote] = useState(initial?.note || "");
  const [tags, setTags] = useState(Array.isArray(initial?.tags) ? initial.tags : []);
  const [date, setDate] = useState(
    initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  const tagSuggestions = useMemo(() => {
    const counts = new Map();
    for (const tx of state.transactions || []) {
      if (tx.deletedAt) continue;
      for (const tag of tx.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 12);
  }, [state.transactions]);

  const wallets = useMemo(() => active(state.wallets).filter((w) => !w.isArchived), [state.wallets]);
  const categories = useMemo(
    () => active(state.categories).filter((c) => c.kind === (type === "income" ? "income" : "expense")),
    [state.categories, type]
  );

  useEffect(() => {
    if (!walletId && wallets.length) setWalletId(wallets[0].id);
  }, [walletId, wallets]);

  useEffect(() => {
    if (type !== "transfer" && !categoryId && categories.length) {
      setCategoryId(categories[0].id);
    }
  }, [type, categoryId, categories]);

  const reset = () => {
    setAmount("0");
    setNote("");
    setTags([]);
    setType("expense");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const submit = () => {
    const cents = toCents(amount);
    if (cents <= 0) return;
    if (!walletId) return;
    if (type === "transfer" && (!toWalletId || toWalletId === walletId)) return;
    upsert("transactions", {
      id: initial?.id,
      type,
      amount_cents: cents,
      currency: state.wallets.find((w) => w.id === walletId)?.currency || "UAH",
      walletId,
      toWalletId: type === "transfer" ? toWalletId : null,
      categoryId: type === "transfer" ? null : categoryId,
      date: new Date(date).toISOString(),
      note: note.trim(),
      tags,
    });
    reset();
    onClose?.();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("tx.editTitle") : t("tx.addTitle")}>
      <div className="space-y-4">
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1">
          {TYPES.map((tp) => (
            <button
              key={tp.id}
              type="button"
              onClick={() => setType(tp.id)}
              className={`flex-1 h-10 rounded-xl text-sm font-semibold transition ${
                type === tp.id
                  ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {t(tp.labelKey)}
            </button>
          ))}
        </div>

        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {amount} <span className="text-base text-slate-400 font-normal">
              {state.wallets.find((w) => w.id === walletId)?.currency || "UAH"}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">{t("tx.amount")}</div>
        </div>

        <NumPad value={amount} onChange={setAmount} />

        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">
            {type === "transfer" ? t("tx.fromWallet") : t("tx.wallet")}
          </label>
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base"
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.icon} {w.name} · {w.currency}
              </option>
            ))}
          </select>
        </div>

        {type === "transfer" ? (
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.toWallet")}</label>
            <select
              value={toWalletId}
              onChange={(e) => setToWalletId(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-base"
            >
              <option value="">—</option>
              {wallets
                .filter((w) => w.id !== walletId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.icon} {w.name} · {w.currency}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.category")}</label>
            <div className="grid grid-cols-4 gap-2">
              {categories.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-2xl border transition text-xs ${
                    categoryId === c.id
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="text-2xl" aria-hidden>{c.icon}</span>
                  <span className="truncate w-full text-center">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.date")}</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.note")}</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="—" />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.tags")}</label>
          <TagsInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="lg" className="flex-1" onClick={submit}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
