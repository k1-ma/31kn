import React, { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { RANGE_PRESETS, customRange, rangeFromPreset } from "@/lib/finance/range.js";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import Button from "@/components/ui/Button.jsx";
import DateField from "@/components/ui/DateField.jsx";

/**
 * Format the current range into a short, locale-aware sub-label.
 * "month" with March 2026 anchor → "Бер 2026" (uk) / "Mar 2026" (en).
 */
function formatRangeSubLabel(value, lang) {
  const range = typeof value === "object" ? value : rangeFromPreset(value);
  const start = new Date(range.start);
  const end = new Date(new Date(range.end).getTime() - 1);
  const locale = lang === "uk" ? "uk-UA" : "en-US";
  const fmtMonth = (d) => d.toLocaleDateString(locale, { month: "short", year: "numeric" });
  const fmtDay = (d) => d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  if (typeof value === "object") {
    return `${fmtDay(start)} – ${fmtDay(end)}`;
  }
  if (value === "today") return start.toLocaleDateString(locale, { day: "numeric", month: "long" });
  if (value === "week") return `${fmtDay(start)} – ${fmtDay(end)}`;
  if (value === "month") return fmtMonth(start);
  if (value === "quarter") {
    const q = Math.floor(start.getMonth() / 3) + 1;
    return `Q${q} ${start.getFullYear()}`;
  }
  if (value === "year") return String(start.getFullYear());
  return null;
}

export default function RangeBar({ value, onChange, showSubLabel = true }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const isCustom = typeof value === "object";
  const [startDate, setStartDate] = useState(() =>
    isCustom ? value.start.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(() =>
    isCustom
      ? new Date(new Date(value.end).getTime() - 86400000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );

  const subLabel = useMemo(() => formatRangeSubLabel(value, lang), [value, lang]);

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-fade-right -mx-4 px-4">
          {RANGE_PRESETS.map((p) => {
            const sel = !isCustom && value === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChange(p)}
                className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold border transition ${
                  sel
                    ? "bg-emerald-500 text-white border-emerald-500"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                {t(`ranges.${p}`)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border ${
              isCustom
                ? "bg-emerald-500 text-white border-emerald-500"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            }`}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            {t("ranges.custom")}
          </button>
        </div>
        {showSubLabel && subLabel && (
          <div className="text-[11px] text-slate-400 capitalize px-1">{subLabel}</div>
        )}
      </div>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("ranges.custom")}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("ranges.from")}</label>
              <DateField value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("ranges.to")}</label>
              <DateField value={endDate} onChange={setEndDate} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={new Date(startDate) > new Date(endDate)}
              onClick={() => {
                onChange(customRange(startDate, endDate));
                setOpen(false);
              }}
            >
              {t("common.apply")}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
