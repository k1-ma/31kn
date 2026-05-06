import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import Button from "@/components/ui/Button.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : true
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toIso(d) {
  // YYYY-MM-DD without timezone shift
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIso(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function CalendarGrid({ value, onPick, lang }) {
  const today = new Date();
  const [view, setView] = useState(() => startOfMonth(value || today));

  const monthLabel = view.toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US", {
    month: "long",
    year: "numeric",
  });

  const weekStart = lang === "uk" ? 1 : 0; // Mon-first for uk, Sun-first for en
  const dow = useMemo(() => {
    const labels = [];
    const ref = new Date(2024, 0, 7); // Sunday
    for (let i = 0; i < 7; i++) {
      const d = new Date(ref);
      d.setDate(ref.getDate() + ((i + weekStart) % 7));
      labels.push(d.toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US", { weekday: "narrow" }));
    }
    return labels;
  }, [lang, weekStart]);

  const cells = useMemo(() => {
    const first = startOfMonth(view);
    const total = daysInMonth(view);
    const firstDow = (first.getDay() - weekStart + 7) % 7;
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let i = 1; i <= total; i++) {
      arr.push(new Date(view.getFullYear(), view.getMonth(), i));
    }
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [view, weekStart]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-sm font-semibold capitalize">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-400 mb-1">
        {dow.map((d, i) => (
          <div key={i} className="h-7 flex items-center justify-center uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, idx) =>
          d ? (
            <button
              key={idx}
              type="button"
              onClick={() => onPick(d)}
              className={`h-9 rounded-lg text-sm transition ${
                value && sameDay(d, value)
                  ? "bg-emerald-500 text-white font-semibold"
                  : sameDay(d, today)
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-medium"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
              }`}
            >
              {d.getDate()}
            </button>
          ) : (
            <div key={idx} className="h-9" />
          )
        )}
      </div>
    </div>
  );
}

/**
 * Date input that looks consistent across browsers.
 *
 * @param {{
 *   value: string,            // YYYY-MM-DD
 *   onChange: (next: string) => void,
 *   placeholder?: string,
 *   className?: string,
 *   id?: string,
 *   max?: string,
 *   min?: string,
 * }} props
 */
export default function DateField({ value, onChange, placeholder, className = "", id, min, max }) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

  const date = fromIso(value);
  const display = date
    ? date.toLocaleDateString(lang === "uk" ? "uk-UA" : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  useEffect(() => {
    if (!open || isMobile) return;
    const onClick = (e) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target) &&
        !triggerRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isMobile]);

  const pick = (d) => {
    if (min && toIso(d) < min) return;
    if (max && toIso(d) > max) return;
    onChange(toIso(d));
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-base text-left flex items-center gap-2 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition ${className}`}
      >
        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${display ? "" : "text-slate-400"}`}>
          {display || placeholder || t("tx.date")}
        </span>
      </button>

      {!isMobile && (
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={{
                position: "absolute",
                left: triggerRef.current?.getBoundingClientRect().left,
                top: (triggerRef.current?.getBoundingClientRect().bottom || 0) + window.scrollY + 4,
              }}
              className="z-50 w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3"
            >
              <CalendarGrid value={date} onPick={pick} lang={lang} />
              <div className="mt-3 flex justify-between">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  {t("common.reset")}
                </button>
                <button
                  type="button"
                  onClick={() => pick(new Date())}
                  className="text-xs text-emerald-600 font-semibold"
                >
                  {t("common.today")}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {isMobile && (
        <BottomSheet open={open} onClose={() => setOpen(false)} title={t("tx.date")}>
          <CalendarGrid value={date} onPick={pick} lang={lang} />
          <div className="mt-3 flex gap-2">
            <Button
              variant="ghost"
              size="lg"
              className="flex-1"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {t("common.reset")}
            </Button>
            <Button size="lg" className="flex-1" onClick={() => pick(new Date())}>
              {t("common.today")}
            </Button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
