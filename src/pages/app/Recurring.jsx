import React, { useEffect, useMemo, useState } from "react";
import { Repeat, Trash2, Pencil, Bell } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import ConfirmDialog from "@/components/ui/ConfirmDialog.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import ListSkeleton from "@/components/common/ListSkeleton.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { advance, dueRules, materialize } from "@/lib/finance/recurring.js";
import { recordNotification } from "@/lib/finance/recordNotification.js";
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
  const [err, setErr] = useState("");

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
      setErr("");
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
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
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
            <Input type="number" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); if (err) setErr(""); }} invalid={!!err} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.wallet")}</label>
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.icon} {w.name} · {w.currency}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("tx.category")}</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
          >
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
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
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
            >
              {FREQS.map((f) => (
                <option key={f} value={f}>
                  {t(`recurring.frequencies.${f}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("recurring.nextRun")}</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              const wallet = wallets.find((w) => w.id === walletId);
              if (!wallet) { setErr(t("validation.selectWallet")); return; }
              const cents = toCents(amount);
              if (cents <= 0) { setErr(t("validation.amountRequired")); return; }
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
  const { state, loaded, upsert, remove } = useFinance();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

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

  // Materialize a transaction AND advance the rule's nextRunAt. Reads the live
  // rule from the current store state and no-ops if its nextRunAt already moved
  // past the period the UI rendered (e.g. on a double-click), so a rule can
  // never be run twice for the same period. The two writes are independent
  // per-entity upserts — O(change), not a whole-state rewrite.
  const runRule = (rule) => {
    const cur = (state.recurring || []).find((r) => r.id === rule.id);
    if (!cur) return;
    const renderedNext = rule.nextRunAt || null;
    const curNext = cur.nextRunAt || null;
    if (renderedNext !== curNext) return; // already materialized for this period
    const runAt = cur.nextRunAt || new Date();
    upsert("transactions", materialize(cur, runAt));
    upsert("recurring", {
      ...cur,
      nextRunAt: advance(cur.nextRunAt || new Date(), cur.frequency, cur.every).toISOString(),
    });
  };

  const skipRule = (rule) => {
    upsert("recurring", {
      ...rule,
      nextRunAt: advance(rule.nextRunAt || new Date(), rule.frequency, rule.every).toISOString(),
    });
  };

  if (!loaded) return <ListSkeleton title={t("nav.recurring")} />;
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
        <Card className="p-4 border-indigo-200 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-900">
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">
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
        <EmptyState icon={Repeat} title={t("recurring.empty")} />
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
                  onClick={() => setConfirmDelete(rule.id)}
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

      <ConfirmDialog
        open={!!confirmDelete}
        title={t("common.deleteTitle")}
        message={t("common.deleteMessage")}
        confirmLabel={t("common.delete")}
        onConfirm={() => { remove("recurring", confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
      <RecurringForm
        key={editing?.id || "new"}
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        initial={editing}
      />
    </div>
  );
}
