import React, { useState, useMemo, useRef, useEffect } from "react";
import Modal from "@/components/common/Modal.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import DateRangePicker from "@/components/common/DateRangePicker.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { X, Check, ChevronDown, Search } from "lucide-react";

const TIMEFRAMES_LIST = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN"];

function FieldLabel({ label, required }) {
  return (
    <label className="text-[12px] font-semibold text-foreground/80 flex items-center gap-1 mb-1">
      {label}
      {required && <span className="text-red-400 text-[10px]">*</span>}
    </label>
  );
}

/* ── Multi-select dropdown for symbols ── */
function SymbolsMultiSelect({ options = [], selected = [], onChange, placeholder = "Select instruments..." }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (sym) => {
    const next = new Set(selectedSet);
    if (next.has(sym)) next.delete(sym);
    else next.add(sym);
    onChange([...next]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          "w-full h-9 flex items-center justify-between px-3 rounded-lg border text-[13px] transition-all duration-200 " +
          "border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] " +
          "hover:border-border dark:hover:border-white/[0.14] " +
          "focus:border-accent/50 focus:ring-1 focus:ring-accent/25 outline-none " +
          (selected.length > 0 ? "text-foreground" : "text-muted-foreground/50")
        }
      >
        <span className="truncate">
          {selected.length > 0 ? `${selected.length} selected` : placeholder}
        </span>
        <ChevronDown className={"h-3.5 w-3.5 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((sym) => (
            <span
              key={sym}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-accent/[0.08] text-accent border border-accent/15"
            >
              {sym}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(sym); }}
                className="text-accent/50 hover:text-accent transition-colors"
                aria-label={`Remove ${sym}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card dark:bg-[#1a1f2e] border border-border/50 dark:border-white/[0.08] rounded-xl shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] py-1 z-[9999] max-h-64 overflow-hidden flex flex-col">
          {options.length > 3 && (
            <div className="px-2 py-1.5 border-b border-border/20 dark:border-white/[0.04]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full h-8 pl-8 pr-3 rounded-lg bg-muted/30 dark:bg-white/[0.03] border border-border/30 dark:border-white/[0.06] text-[12px] text-foreground outline-none focus:border-accent/50"
                  autoFocus
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto max-h-52 py-0.5">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-muted-foreground text-center">No instruments found</div>
            ) : (
              filtered.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggle(sym)}
                  className={
                    "w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors " +
                    (selectedSet.has(sym) ? "bg-accent/[0.06] text-accent font-semibold" : "text-foreground hover:bg-accent/[0.04] dark:hover:bg-white/[0.04]")
                  }
                >
                  <div className={
                    "h-4 w-4 rounded border flex items-center justify-center transition-all " +
                    (selectedSet.has(sym) ? "bg-accent border-accent" : "border-border/50 dark:border-white/[0.12]")
                  }>
                    {selectedSet.has(sym) && <Check className="h-3 w-3 text-on-accent" />}
                  </div>
                  {sym}
                </button>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="px-2 py-1.5 border-t border-border/20 dark:border-white/[0.04]">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Timeframes multi-select as chips ── */
function TimeframeChips({ selected = [], onChange }) {
  const sel = new Set(selected);
  return (
    <div className="flex flex-wrap gap-1.5">
      {TIMEFRAMES_LIST.map((tf) => (
        <button
          key={tf}
          type="button"
          onClick={() => {
            const next = new Set(sel);
            if (next.has(tf)) next.delete(tf);
            else next.add(tf);
            onChange([...next]);
          }}
          className={
            "px-2.5 py-1 rounded-lg text-[12px] font-semibold transition-all duration-150 border " +
            (sel.has(tf)
              ? "bg-accent/15 dark:bg-accent/20 text-accent border-accent/30 shadow-sm"
              : "bg-muted/30 dark:bg-white/[0.03] text-muted-foreground border-border/30 dark:border-white/[0.06] hover:border-accent/20 hover:text-foreground")
          }
        >
          {tf}
        </button>
      ))}
    </div>
  );
}

export default function BacktestCreateModal({ open, onClose, onSave, editBacktest, availableSymbols = [] }) {
  const { t } = useI18n();
  const isEdit = !!editBacktest;

  const [form, setForm] = useState(() => ({
    name: editBacktest?.name || "",
    periodFrom: editBacktest?.period?.from || "",
    periodTo: editBacktest?.period?.to || "",
    symbols: editBacktest?.symbols || [],
    timeframes: editBacktest?.timeframes || [],
    initialEquity: editBacktest?.initialEquity || 10000,
    notesPlan: editBacktest?.notes?.plan || "",
    notesDescription: editBacktest?.notes?.description || "",
  }));

  const patch = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));
  const nameError = !form.name.trim();
  const periodError = form.periodFrom && form.periodTo && form.periodFrom > form.periodTo;

  const handleSave = () => {
    if (nameError) return;
    onSave({
      name: form.name.trim(),
      period: { from: form.periodFrom || "", to: form.periodTo || "" },
      symbols: form.symbols,
      timeframes: form.timeframes,
      initialEquity: Math.max(0, Number(form.initialEquity) || 0),
      notes: { plan: form.notesPlan.trim(), description: form.notesDescription.trim() },
    });
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("backtests.settings") : t("backtests.create")}
      size="md"
    >
      <div className="space-y-5">
        {/* Name */}
        <div>
          <FieldLabel label={t("backtests.name")} required />
          <Input
            value={form.name}
            onChange={(e) => patch("name", e.target.value)}
            placeholder="My backtest strategy"
            autoFocus
          />
          {nameError && form.name !== "" && (
            <p className="text-[11px] text-red-400 mt-1">{t("common.required")}</p>
          )}
        </div>

        {/* Period — using DateRangePicker */}
        <div>
          <FieldLabel label={t("backtests.period")} />
          <DateRangePicker
            fromValue={form.periodFrom}
            toValue={form.periodTo}
            onFromChange={(v) => patch("periodFrom", v)}
            onToChange={(v) => patch("periodTo", v)}
            fromLabel={t("backtests.period") + " (from)"}
            toLabel={t("backtests.period") + " (to)"}
          />
          {periodError && (
            <p className="text-[11px] text-red-400 mt-1">{t("backtests.periodError")}</p>
          )}
        </div>

        {/* Instruments (multi-select) */}
        <div>
          <FieldLabel label={t("backtests.symbols")} />
          <SymbolsMultiSelect
            options={availableSymbols}
            selected={form.symbols}
            onChange={(v) => patch("symbols", v)}
            placeholder={t("backtests.symbols") + "..."}
          />
        </div>

        {/* Timeframes (chips) */}
        <div>
          <FieldLabel label={t("backtests.timeframes")} />
          <TimeframeChips
            selected={form.timeframes}
            onChange={(v) => patch("timeframes", v)}
          />
        </div>

        {/* Initial deposit */}
        <div>
          <FieldLabel label={t("backtests.initialEquity")} required />
          <Input
            type="number"
            min="0"
            value={form.initialEquity}
            onChange={(e) => patch("initialEquity", e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Account will be created automatically with this balance
          </p>
        </div>

        {/* Notes / Plan */}
        <div>
          <FieldLabel label={t("backtests.strategyPlan") || "Strategy Plan"} />
          <textarea
            value={form.notesPlan}
            onChange={(e) => patch("notesPlan", e.target.value)}
            rows={3}
            placeholder={t("backtests.strategyPlanPlaceholder") || "Trading strategy, setups, entry/exit rules..."}
            className="w-full rounded-lg border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40 transition-all duration-200 focus:border-accent/50 focus:ring-1 focus:ring-accent/25 resize-none"
          />
        </div>

        <div>
          <FieldLabel label={t("backtests.backtestDescription") || "Description"} />
          <textarea
            value={form.notesDescription}
            onChange={(e) => patch("notesDescription", e.target.value)}
            rows={3}
            placeholder={t("backtests.backtestDescriptionPlaceholder") || "Goal, rules, what you want to test..."}
            className="w-full rounded-lg border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40 transition-all duration-200 focus:border-accent/50 focus:ring-1 focus:ring-accent/25 resize-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/20 dark:border-white/[0.04]">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={nameError}>
            {isEdit ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
