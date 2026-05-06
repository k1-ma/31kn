import React, { useState } from "react";
import { CalendarRange } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { RANGE_PRESETS, customRange } from "@/lib/finance/range.js";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";

/**
 * Horizontal pill row of range presets + a "Custom…" button that opens
 * a bottom sheet with two date inputs. Caller controls the active value
 * (a string preset like "month" or {start, end} object).
 */
export default function RangeBar({ value, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const isCustom = typeof value === "object";
  const [startDate, setStartDate] = useState(() =>
    isCustom ? value.start.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(() =>
    isCustom ? new Date(new Date(value.end).getTime() - 86400000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );

  return (
    <>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
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
      <BottomSheet open={open} onClose={() => setOpen(false)} title={t("ranges.custom")}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("ranges.from")}</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("ranges.to")}</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
