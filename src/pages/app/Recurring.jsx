import React, { useEffect, useMemo, useState } from "react";
import { Repeat, Trash2, Pencil, Bell } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import Select from "@/components/ui/Select.jsx";
import DateField from "@/components/ui/DateField.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { advance, dueRules, materialize } from "@/lib/finance/recurring.js";
import { recordNotification } from "@/lib/finance/recordNotification.js";
import { useDeleteWithUndo } from "@/lib/finance/useDeleteWithUndo.js";
import { formatMoney, toCents } from "@/lib/money.js";

const FREQS = ["daily", "weekly", "monthly", "yearly"];

function RecurringForm({ open, onClose, initial }) {
  const { t } = useI18n();
  const { state, upsert } = useFinance();
  const wallets = useMemo(() => active(state.wallets).filter((w) => !w.isArchived), [state.wallets]);
  const [name, setName] = useState(initial?.template?.note || "");
  const [type, setType] = useState(initial?.template?.type || "expense");
  const [amount, setAmount] = useState(
    initial ? String((initial.template?.amount_cents || 0) / 100) : "0"
  );
  const [walletId, setWalletId] = useState(
    initial?.template?.walletId || wallets[0]?.id || ""
  );
  const [categoryId, setCategoryId] = useState(initial?.template?.categoryId || "");
  const [frequency, setFrequency] = useState(initial?.frequency || "monthly");
  const [every, setEvery] = useState(initial?.every || 1);
  const [startDate, setStartDate] = useState(
    initial?.startDate ? initial.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  const cats = useMemo(
    () =>
      active(state.categories).filter(
        (c) => c.kind === (type === "income" ? "income" : "expense")
      ),
    [state.categories, type]
  );

  useEffect(() => {
    if (open) {
      setName(initial?.template?.note || "");
      setType(initial?.template?.type || "expense");
      setAmount(initial ? String((initial.template?.amount_cents || 0) / 100) : "0");
      setWalletId(initial?.template?.walletId || wallets[0]?.id || "");
      setCategoryId(initial?.template?.categoryId || "");
      setFrequency(initial?.frequency || "monthly");
      setEvery(initial?.every || 1);
      setStartDate(
        initial?.startDate ? initial.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
      );
    }
  }, [open, initial, wallets]);

  useEffect(() => {
    if (!categoryId && cats.length) setCategoryId(cats[0].id);
  }, [categoryId, cats]);

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("common.edit") : t("recurring.add")}>
      <div className="space-y-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("tx.note")}
        />
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "expense", label: t("tx.expense") },
            { id: "income", label: t("tx.income") },
          ].map((tp) => (
            <button
              key={tp.id}
              type="button"
              onClick={() => setType(tp.id)}
              className={`h-10 rounded-xl text-sm font-medium border ${
                type === tp.id
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              {tp.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.amount")}</label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.wallet")}</label>
            <Select
              value={walletId}
              onChange={setWalletId}
              options={wallets.map((w) => ({
                value: w.id,
                label: w.name,
                icon: w.icon || "💼",
                hint: w.currency,
              }))}
              title={t("tx.wallet")}
              searchable={wallets.length > 6}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.category")}</label>
          <Select
            value={categoryId}
            onChange={setCategoryId}
            options={cats.map((c) => ({ value: c.id, label: c.name, icon: c.icon }))}
            title={t("tx.category")}
            searchable={cats.length > 6}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("recurring.every")}</label>
            <Input
              type="number"
              min={1}
              value={every}
              onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("recurring.frequency")}</label>
            <Select
              value={frequency}
              onChange={setFrequency}
              options={FREQS.map((f) => ({
                value: f,
                label: t(`recurring.frequencies.${f}`),
              }))}
              title={t("recurring.frequency")}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("recurring.nextRun")}</label>
          <DateField value={startDate} onChange={setStartDate} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              const wallet = wallets.find((w) => w.id === walletId);
              if (!wallet) return;
              const cents = toCents(amount);
              if (cents <= 0) return;
              const nextRunIso = new Date(startDate).toISOString();
              upsert("recurring", {
                id: initial?.id,
                template: {
                  type,
                  amount_cents: cents,
                  currency: wallet.currency,
                  walletId,
                  categoryId,
                  note: name.trim(),
                },
                frequency,
                every,
                startDate: nextRunIso,
                nextRunAt: nextRunIso,
                active: true,
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

export default function Recurring() {
  const { t, lang } = useI18n();
  const { state, upsert } = useFinance();
  const softDelete = useDeleteWithUndo();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const rules = useMemo(() => active(state.recurring), [state.recurring]);
  const due = useMemo(() => dueRules(rules), [rules]);
  const cats = useMemo(() => new Map(active(state.categories).map((c) => [c.id, c])), [state.categories]);
  const wals = useMemo(() => new Map(active(state.wallets).map((w) => [w.id, w])), [state.wallets]);

  // Mirror due-rule notices to the server so the bell inbox keeps a record.
  useEffect(() => {
    for (const rule of due) {
      const dueDay = rule.nextRunAt ? rule.nextRunAt.slice(0, 10) : "now";
      const cat = cats.get(rule.template?.categoryId);
      const title = rule.template?.note || cat?.name || t("recurring.confirmRun");
      recordNotification(`recurring:${rule.id}:${dueDay}`, "recurring_due", { title });
    }
  }, [due, cats, t]);

  const runRule = (rule) => {
    const txn = materialize(rule, rule.nextRunAt || new Date());
    upsert("transactions", txn);
    upsert("recurring", {
      ...rule,
      nextRunAt: advance(rule.nextRunAt || new Date(), rule.frequency, rule.every).toISOString(),
    });
  };

  const skipRule = (rule) => {
    upsert("recurring", {
      ...rule,
      nextRunAt: advance(rule.nextRunAt || new Date(), rule.frequency, rule.every).toISOString(),
    });
  };

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title={t("nav.recurring")}
        right={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            {t("recurring.add")}
          </Button>
        }
      />

      {due.length > 0 && (
        <Card className="p-4 border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-900">
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                {t("recurring.confirmRun")}
              </div>
              <div className="mt-3 space-y-2">
                {due.map((rule) => {
                  const cat = cats.get(rule.template?.categoryId);
                  const wal = wals.get(rule.template?.walletId);
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center gap-2 text-sm bg-white dark:bg-slate-900 rounded-xl px-3 py-2"
                    >
                      <span className="text-lg">{cat?.icon || "💸"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {rule.template?.note || cat?.name || "—"}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {wal?.name} ·{" "}
                          {formatMoney(rule.template?.amount_cents || 0, rule.template?.currency, lang)}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => runRule(rule)}>
                        {t("common.confirm")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => skipRule(rule)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {rules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={t("recurring.empty")}
          cta={{ label: t("recurring.add"), onClick: () => { setEditing(null); setOpen(true); } }}
        />
      ) : (
        <Card className="overflow-hidden">
          {rules.map((rule) => {
            const cat = cats.get(rule.template?.categoryId);
            const wal = wals.get(rule.template?.walletId);
            const next = rule.nextRunAt
              ? new Date(rule.nextRunAt).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US", {
                  day: "numeric",
                  month: "short",
                })
              : "—";
            return (
              <div
                key={rule.id}
                className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
              >
                <span className="text-2xl">{cat?.icon || "🔁"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {rule.template?.note || cat?.name || "—"}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {wal?.name} ·{" "}
                    {formatMoney(rule.template?.amount_cents || 0, rule.template?.currency, lang)} ·{" "}
                    {t(`recurring.frequencies.${rule.frequency}`)} · {t("recurring.nextRun")}: {next}
                  </div>
                </div>
                <button
                  onClick={() => { setEditing(rule); setOpen(true); }}
                  className="p-2 text-slate-400 hover:text-slate-600"
                  aria-label={t("common.edit")}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => softDelete("recurring", rule.id, rule.template?.note || "")}
                  className="p-2 text-slate-400 hover:text-red-500"
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </Card>
      )}

      <RecurringForm
        key={editing?.id || "new"}
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        initial={editing}
      />
    </div>
  );
}
