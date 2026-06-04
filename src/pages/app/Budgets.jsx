import React, { useMemo, useState } from "react";
import { PiggyBank, Trash2 } from "lucide-react";
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
import { budgetSpent, budgetProgress } from "@/lib/finance/calc.js";
import { formatMoney, toCents } from "@/lib/money.js";

function BudgetForm({ open, onClose, initial }) {
  const { t } = useI18n();
  const { state, upsert } = useFinance();
  const cats = useMemo(
    () => active(state.categories).filter((c) => c.kind === "expense"),
    [state.categories]
  );
  const [name, setName] = useState(initial?.name || "");
  const [period, setPeriod] = useState(initial?.period || "monthly");
  const [limit, setLimit] = useState(initial ? String((initial.limit_cents || 0) / 100) : "0");
  const [currency, setCurrency] = useState(initial?.currency || state.prefs?.baseCurrency || "UAH");
  const [categoryIds, setCategoryIds] = useState(initial?.categoryIds || []);
  const [alertAt, setAlertAt] = useState(initial?.alertAt || 80);
  const [err, setErr] = useState("");

  React.useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setPeriod(initial?.period || "monthly");
      setLimit(initial ? String((initial.limit_cents || 0) / 100) : "0");
      setCurrency(initial?.currency || state.prefs?.baseCurrency || "UAH");
      setCategoryIds(initial?.categoryIds || []);
      setAlertAt(initial?.alertAt || 80);
      setErr("");
    }
  }, [open, initial, state.prefs]);

  const toggleCat = (id) => {
    setCategoryIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("common.edit") : t("budgets.add")}>
      <div className="space-y-3">
        <div>
          <Input value={name} onChange={(e) => { setName(e.target.value); if (err) setErr(""); }} invalid={!!err} placeholder={t("wallets.name")} />
          {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("budgets.limit")}</label>
            <Input type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("budgets.period")}</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
            >
              {["weekly", "monthly", "yearly"].map((p) => (
                <option key={p} value={p}>
                  {t(`budgets.periods.${p}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("nav.categories")}</label>
          <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCat(c.id)}
                className={`p-2 rounded-2xl border text-xs flex items-center gap-2 ${
                  categoryIds.includes(c.id)
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <span className="text-lg">{c.icon}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("budgets.alertAt")}</label>
          <Input
            type="number"
            min={50}
            max={100}
            value={alertAt}
            onChange={(e) => setAlertAt(Number(e.target.value) || 80)}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              if (!name.trim()) { setErr(t("validation.nameRequired")); return; }
              if (categoryIds.length === 0) { setErr(t("validation.categoriesRequired")); return; }
              upsert("budgets", {
                id: initial?.id,
                name: name.trim(),
                period,
                limit_cents: toCents(limit),
                currency,
                categoryIds,
                alertAt,
                rollover: initial?.rollover || false,
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

export default function Budgets() {
  const { t, lang } = useI18n();
  const { state, loaded, remove } = useFinance();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const budgets = useMemo(() => active(state.budgets), [state.budgets]);

  if (!loaded) return <ListSkeleton title={t("nav.budgets")} />;
  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title={t("nav.budgets")}
        right={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            {t("budgets.add")}
          </Button>
        }
      />
      {budgets.length === 0 ? (
        <EmptyState icon={PiggyBank} title={t("budgets.empty")} />
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => {
            const spent = budgetSpent(b, state.transactions);
            const pct = budgetProgress(b, state.transactions);
            const over = pct > 1;
            const limit = b.limit_cents || 0;
            const remaining = Math.max(0, limit - spent);
            return (
              <Card key={b.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-semibold">{b.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t(`budgets.periods.${b.period}`)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditing(b); setOpen(true); }}
                      className="p-2 text-slate-400 text-xs"
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(b.id)}
                      className="p-2 text-slate-400 hover:text-red-500"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className={`text-xl font-bold tabular-nums ${over ? "text-red-600" : ""}`}>
                    {formatMoney(spent, b.currency, lang)}
                  </span>
                  <span className="text-sm text-slate-500 tabular-nums">
                    / {formatMoney(limit, b.currency, lang)}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      over ? "bg-red-500" : pct > b.alertAt / 100 ? "bg-amber-500" : "bg-indigo-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {over ? t("budgets.alert100", { name: b.name }) : `${t("budgets.remaining")}: ${formatMoney(remaining, b.currency, lang)}`}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title={t("common.deleteTitle")}
        message={t("common.deleteMessage")}
        confirmLabel={t("common.delete")}
        onConfirm={() => { remove("budgets", confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
      <BudgetForm
        key={editing?.id || "new"}
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        initial={editing}
      />
    </div>
  );
}
