import React, { useEffect, useMemo, useState } from "react";
import { Coins, Pencil, Trash2, CheckCircle2, RotateCcw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { formatMoney, toCents, SUPPORTED_CURRENCIES } from "@/lib/money.js";

function DebtForm({ open, onClose, initial }) {
  const { t } = useI18n();
  const { state, upsert } = useFinance();
  const [direction, setDirection] = useState(initial?.direction || "owe");
  const [counterparty, setCounterparty] = useState(initial?.counterparty || "");
  const [amount, setAmount] = useState(
    initial ? String((initial.amount_cents || 0) / 100) : "0"
  );
  const [currency, setCurrency] = useState(initial?.currency || state.prefs?.baseCurrency || "UAH");
  const [dueDate, setDueDate] = useState(initial?.due_date ? initial.due_date.slice(0, 10) : "");
  const [note, setNote] = useState(initial?.note || "");

  useEffect(() => {
    if (open) {
      setDirection(initial?.direction || "owe");
      setCounterparty(initial?.counterparty || "");
      setAmount(initial ? String((initial.amount_cents || 0) / 100) : "0");
      setCurrency(initial?.currency || state.prefs?.baseCurrency || "UAH");
      setDueDate(initial?.due_date ? initial.due_date.slice(0, 10) : "");
      setNote(initial?.note || "");
    }
  }, [open, initial, state.prefs]);

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("common.edit") : t("debts.add")}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "owe", label: t("debts.owe") },
            { id: "owed", label: t("debts.owed") },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDirection(d.id)}
              className={`h-11 rounded-xl text-sm font-medium border ${
                direction === d.id
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder={t("debts.counterparty")}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.amount")}</label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("wallets.currency")}</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("debts.dueDate")}</label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.note")}</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={!counterparty.trim() || toCents(amount) <= 0}
            onClick={() => {
              upsert("debts", {
                id: initial?.id,
                direction,
                counterparty: counterparty.trim(),
                amount_cents: toCents(amount),
                currency,
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
                note: note.trim(),
                is_settled: initial?.is_settled || false,
              });
              onClose();
            }}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}

export default function Debts() {
  const { t, lang } = useI18n();
  const { state, upsert, remove } = useFinance();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const debts = useMemo(
    () => active(state.debts).slice().sort((a, b) => new Date(a.due_date || "9999") - new Date(b.due_date || "9999")),
    [state.debts]
  );

  const open_ = debts.filter((d) => !d.is_settled);
  const settled = debts.filter((d) => d.is_settled);
  const owe = open_.filter((d) => d.direction === "owe").reduce((s, d) => s + (d.amount_cents || 0), 0);
  const owed = open_.filter((d) => d.direction === "owed").reduce((s, d) => s + (d.amount_cents || 0), 0);
  const baseCurrency = state.prefs?.baseCurrency || "UAH";

  const renderRow = (d) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = d.due_date ? new Date(d.due_date) : null;
    const overdue = due && !d.is_settled && due < today;
    return (
      <div
        key={d.id}
        className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
      >
        <span className="text-2xl shrink-0">{d.direction === "owe" ? "💸" : "💰"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {d.counterparty}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {due
              ? due.toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
            {overdue && <span className="ml-2 text-red-600 font-semibold">!</span>}
            {d.note ? ` · ${d.note}` : ""}
          </div>
        </div>
        <div
          className={`text-sm font-semibold tabular-nums ${
            d.direction === "owe" ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {d.direction === "owe" ? "-" : "+"} {formatMoney(d.amount_cents, d.currency, lang)}
        </div>
        <button
          onClick={() => upsert("debts", { ...d, is_settled: !d.is_settled })}
          className="p-2 text-slate-400 hover:text-emerald-600"
          aria-label={d.is_settled ? t("common.restore") : t("debts.settle")}
        >
          {d.is_settled ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
        </button>
        <button
          onClick={() => { setEditing(d); setOpen(true); }}
          className="p-2 text-slate-400 hover:text-slate-600"
          aria-label={t("common.edit")}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => remove("debts", d.id)}
          className="p-2 text-slate-400 hover:text-red-500"
          aria-label={t("common.delete")}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title={t("debts.title")}
        right={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>{t("debts.add")}</Button>
        }
      />

      {(owe > 0 || owed > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-xs text-slate-500">{t("debts.totalOwe")}</div>
            <div className="text-lg font-semibold tabular-nums text-red-600 mt-1">
              {formatMoney(owe, baseCurrency, lang)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-slate-500">{t("debts.totalOwed")}</div>
            <div className="text-lg font-semibold tabular-nums text-emerald-600 mt-1">
              {formatMoney(owed, baseCurrency, lang)}
            </div>
          </Card>
        </div>
      )}

      {debts.length === 0 ? (
        <EmptyState icon={Coins} title={t("debts.empty")} />
      ) : (
        <>
          {open_.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 px-1">
                {t("debts.open")}
              </div>
              <Card className="overflow-hidden">{open_.map(renderRow)}</Card>
            </div>
          )}
          {settled.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 mb-2 px-1">
                {t("debts.settled")}
              </div>
              <Card className="overflow-hidden opacity-60">{settled.map(renderRow)}</Card>
            </div>
          )}
        </>
      )}

      <DebtForm
        key={editing?.id || "new"}
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        initial={editing}
      />
    </div>
  );
}
