import React, { useMemo, useState } from "react";
import { Target, Trash2, Plus } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { goalProgress } from "@/lib/finance/calc.js";
import { formatMoney, toCents, SUPPORTED_CURRENCIES } from "@/lib/money.js";

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

  React.useEffect(() => {
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("goals.progress")}</label>
            <Input type="number" step="0.01" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("goals.deadline")}</label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
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

export default function Goals() {
  const { t, lang } = useI18n();
  const { state, upsert, remove } = useFinance();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const goals = useMemo(() => active(state.goals), [state.goals]);

  const contribute = (g) => {
    const raw = window.prompt(`${t("goals.contribute")} (${g.currency})`, "0");
    if (!raw) return;
    const cents = toCents(raw);
    if (!cents) return;
    upsert("goals", { ...g, current_cents: (g.current_cents || 0) + cents });
  };

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
        <EmptyState icon={Target} title={t("goals.empty")} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {goals.map((g) => {
            const pct = goalProgress(g);
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{g.icon}</span>
                    <div>
                      <div className="font-semibold">{g.name}</div>
                      {g.target_date && (
                        <div className="text-xs text-slate-500">
                          {new Date(g.target_date).toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US")}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => remove("goals", g.id)}
                    className="p-2 text-slate-400 hover:text-red-500"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 text-sm text-slate-500">
                  {t("goals.contributedOf", {
                    current: formatMoney(g.current_cents || 0, g.currency, lang),
                    target: formatMoney(g.target_cents || 0, g.currency, lang),
                  })}
                </div>
                <div className="mt-2 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-sm font-semibold tabular-nums">
                    {Math.round(pct * 100)}%
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => contribute(g)}>
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
    </div>
  );
}
