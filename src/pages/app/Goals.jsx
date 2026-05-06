import React, { useEffect, useMemo, useState } from "react";
import { Target, Trash2, Plus, Pencil } from "lucide-react";
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
import { goalProgress } from "@/lib/finance/calc.js";
import { recordNotification } from "@/lib/finance/recordNotification.js";
import { useDeleteWithUndo } from "@/lib/finance/useDeleteWithUndo.js";
import { formatMoney, toCents, SUPPORTED_CURRENCIES } from "@/lib/money.js";

const ICONS = ["🎯", "🏠", "🚗", "✈️", "🎓", "💍", "👶", "💻", "🎁", "💰"];

function GoalForm({ open, onClose, initial }) {
  const { t } = useI18n();
  const { state, upsert } = useFinance();
  const [name, setName] = useState(initial?.name || "");
  const [target, setTarget] = useState(initial ? String((initial.target_cents || 0) / 100) : "0");
  const [current, setCurrent] = useState(initial ? String((initial.current_cents || 0) / 100) : "0");
  const [currency, setCurrency] = useState(initial?.currency || state.prefs?.baseCurrency || "UAH");
  const [deadline, setDeadline] = useState(
    initial?.target_date ? initial.target_date.slice(0, 10) : ""
  );
  const [icon, setIcon] = useState(initial?.icon || "🎯");

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setTarget(initial ? String((initial.target_cents || 0) / 100) : "0");
      setCurrent(initial ? String((initial.current_cents || 0) / 100) : "0");
      setCurrency(initial?.currency || state.prefs?.baseCurrency || "UAH");
      setDeadline(initial?.target_date ? initial.target_date.slice(0, 10) : "");
      setIcon(initial?.icon || "🎯");
    }
  }, [open, initial, state.prefs]);

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("common.edit") : t("goals.add")}>
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("wallets.name")} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("goals.target")}</label>
            <Input type="number" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("wallets.currency")}</label>
            <Select
              value={currency}
              onChange={setCurrency}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))}
              title={t("wallets.currency")}
              searchable
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("goals.progress")}</label>
            <Input type="number" step="0.01" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("goals.deadline")}</label>
            <DateField value={deadline} onChange={setDeadline} />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("wallets.icon")}</label>
          <div className="grid grid-cols-10 gap-2">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`h-10 rounded-xl text-xl border ${
                  icon === ic
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              if (!name.trim()) return;
              upsert("goals", {
                id: initial?.id,
                name: name.trim(),
                target_cents: toCents(target),
                current_cents: toCents(current),
                currency,
                target_date: deadline ? new Date(deadline).toISOString() : null,
                icon,
                color: initial?.color || "#10B981",
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

function ContributeSheet({ open, onClose, goal, onContribute }) {
  const { t, lang } = useI18n();
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (open) setAmount("");
  }, [open]);

  if (!goal) return null;

  const cents = toCents(amount);
  const newCurrent = (goal.current_cents || 0) + cents;
  const remaining = Math.max(0, (goal.target_cents || 0) - (goal.current_cents || 0));

  return (
    <BottomSheet open={open} onClose={onClose} title={`${t("goals.contribute")} · ${goal.name}`}>
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-sm text-slate-500">{t("goals.progress")}</div>
          <div className="text-3xl font-bold tabular-nums mt-1">
            {formatMoney(goal.current_cents || 0, goal.currency, lang)}
            <span className="text-base text-slate-400 ml-2">
              / {formatMoney(goal.target_cents || 0, goal.currency, lang)}
            </span>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">
            {t("tx.amount")} ({goal.currency})
          </label>
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            placeholder="0"
          />
        </div>
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setAmount(String(remaining / 100))}
            className="text-sm text-emerald-600 hover:text-emerald-700"
          >
            {t("budgets.remaining")}: {formatMoney(remaining, goal.currency, lang)}
          </button>
        )}
        {cents > 0 && (
          <div className="text-sm text-slate-500 text-center">
            →{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatMoney(newCurrent, goal.currency, lang)}
            </span>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            className="flex-1"
            disabled={cents <= 0}
            onClick={() => {
              onContribute(cents);
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

export default function Goals() {
  const { t, lang } = useI18n();
  const { state, upsert } = useFinance();
  const softDelete = useDeleteWithUndo();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [contributingGoal, setContributingGoal] = useState(null);
  const goals = useMemo(() => active(state.goals), [state.goals]);

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title={t("nav.goals")}
        right={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            {t("goals.add")}
          </Button>
        }
      />
      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title={t("goals.empty")}
          cta={{ label: t("goals.add"), onClick: () => { setEditing(null); setOpen(true); } }}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {goals.map((g) => {
            const pct = goalProgress(g);
            const completed = pct >= 1;
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl">{g.icon}</span>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{g.name}</div>
                      {g.target_date && (
                        <div className="text-xs text-slate-500">
                          {new Date(g.target_date).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setEditing(g); setOpen(true); }}
                      className="p-2 text-slate-400 hover:text-slate-600"
                      aria-label={t("common.edit")}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => softDelete("goals", g.id, g.name)}
                      className="p-2 text-slate-400 hover:text-red-500"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-500">
                  {t("goals.contributedOf", {
                    current: formatMoney(g.current_cents || 0, g.currency, lang),
                    target: formatMoney(g.target_cents || 0, g.currency, lang),
                  })}
                </div>
                <div className="mt-2 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${completed ? "bg-amber-400" : "bg-emerald-500"}`}
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-sm font-semibold tabular-nums">
                    {Math.round(pct * 100)}%
                    {completed && <span className="ml-2">🎉</span>}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setContributingGoal(g)}>
                    <Plus className="w-3.5 h-3.5" /> {t("goals.contribute")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <GoalForm
        key={editing?.id || "new"}
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        initial={editing}
      />
      <ContributeSheet
        open={!!contributingGoal}
        goal={contributingGoal}
        onClose={() => setContributingGoal(null)}
        onContribute={(cents) => {
          if (!contributingGoal) return;
          const before = contributingGoal.current_cents || 0;
          const after = before + cents;
          upsert("goals", { ...contributingGoal, current_cents: after });
          // Fire a one-shot inbox record the first time the goal hits 100%.
          if (
            contributingGoal.target_cents &&
            before < contributingGoal.target_cents &&
            after >= contributingGoal.target_cents
          ) {
            recordNotification(
              `goal:${contributingGoal.id}:reached`,
              "goal_reached",
              { name: contributingGoal.name }
            );
          }
        }}
      />
    </div>
  );
}
