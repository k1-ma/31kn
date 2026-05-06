import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet as WalletIcon, Trash2, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { reorderSiblings } from "@/lib/finance/reorder.js";
import { walletBalance } from "@/lib/finance/calc.js";
import { formatMoney, SUPPORTED_CURRENCIES, toCents } from "@/lib/money.js";

const WALLET_TYPES = ["cash", "card", "bank", "crypto", "savings"];
const ICONS = ["💵", "💳", "🏦", "💰", "🪙", "🎁", "👛", "🏧"];

function WalletForm({ open, onClose, initial }) {
  const { t } = useI18n();
  const { upsert } = useFinance();
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState(initial?.type || "cash");
  const [currency, setCurrency] = useState(initial?.currency || "UAH");
  const [icon, setIcon] = useState(initial?.icon || "💵");
  const [balance, setBalance] = useState(initial ? String((initial.balance_cents || 0) / 100) : "0");

  React.useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setType(initial?.type || "cash");
      setCurrency(initial?.currency || "UAH");
      setIcon(initial?.icon || "💵");
      setBalance(initial ? String((initial.balance_cents || 0) / 100) : "0");
    }
  }, [open, initial]);

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("common.edit") : t("wallets.add")}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("wallets.name")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("wallets.type")}</label>
          <div className="grid grid-cols-5 gap-2">
            {WALLET_TYPES.map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setType(tp)}
                className={`h-10 rounded-xl text-xs font-medium border ${
                  type === tp
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                {t(`wallets.types.${tp}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("wallets.currency")}</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 inline-block">{t("wallets.balance")}</label>
            <Input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 inline-block">{t("wallets.icon")}</label>
          <div className="grid grid-cols-8 gap-2">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                className={`h-10 rounded-xl text-xl border ${
                  icon === ic ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-slate-200 dark:border-slate-700"
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
              upsert("wallets", {
                id: initial?.id,
                name: name.trim(),
                type,
                currency,
                icon,
                color: initial?.color || "#10B981",
                balance_cents: toCents(balance),
                isArchived: initial?.isArchived || false,
                sortOrder: initial?.sortOrder ?? 0,
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

export default function Wallets() {
  const { t, lang } = useI18n();
  const { state, upsert, remove } = useFinance();
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const wallets = useMemo(
    () =>
      active(state.wallets)
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id))),
    [state.wallets]
  );

  const move = (w, dir) => {
    const swap = reorderSiblings(state.wallets, w, dir);
    if (!swap) return;
    swap.forEach((x) => upsert("wallets", x));
  };

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title={t("nav.wallets")}
        right={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            {t("wallets.add")}
          </Button>
        }
      />
      {wallets.length === 0 ? (
        <EmptyState icon={WalletIcon} title={t("wallets.empty")} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {wallets.map((w, idx) => {
            const balance = walletBalance(w, state.transactions);
            return (
              <Card
                key={w.id}
                className="p-5"
                style={{ background: w.color ? `linear-gradient(135deg, ${w.color}15, ${w.color}05)` : undefined }}
              >
                <div className="flex items-start justify-between">
                  <Link to={`/app/wallets/${w.id}`} className="flex-1 min-w-0">
                    <div className="text-2xl">{w.icon}</div>
                    <div className="text-sm text-slate-500 mt-2">{w.name}</div>
                    <div className="text-2xl font-bold tabular-nums mt-1">
                      {formatMoney(balance, w.currency, lang)}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{t(`wallets.types.${w.type}`)}</div>
                  </Link>
                  <div className="flex flex-col gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => move(w, -1)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      disabled={idx === wallets.length - 1}
                      onClick={() => move(w, 1)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditing(w); setOpen(true); }}
                      className="p-2 text-slate-400 hover:text-slate-600"
                      aria-label={t("common.edit")}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove("wallets", w.id)}
                      className="p-2 text-slate-400 hover:text-red-500"
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <WalletForm
        key={editing?.id || "new"}
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        initial={editing}
      />
    </div>
  );
}
