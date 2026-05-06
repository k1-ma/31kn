import React, { useEffect, useRef, useState, useMemo } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

/**
 * @typedef {Object} SelectOption
 * @property {string} value
 * @property {string} label
 * @property {string} [icon]   leading icon (emoji or single character)
 * @property {string} [hint]   secondary text on the right
 * @property {string} [group]  group label
 */

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

function OptionRow({ opt, selected, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(opt.value)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition ${
        selected
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-medium"
          : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
      role="option"
      aria-selected={selected}
    >
      {opt.icon && <span className="text-lg shrink-0">{opt.icon}</span>}
      <span className="flex-1 min-w-0 truncate">{opt.label}</span>
      {opt.hint && (
        <span className="text-xs text-slate-400 shrink-0">{opt.hint}</span>
      )}
      {selected && <Check className="w-4 h-4 shrink-0" />}
    </button>
  );
}

/**
 * Animated, mobile-first dropdown that replaces native <select>.
 * Mobile (<768px): opens a BottomSheet with optional search.
 * Desktop: popup anchored to the trigger, click-outside / ESC to close.
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   options: SelectOption[],
 *   placeholder?: string,
 *   searchable?: boolean,
 *   title?: string,
 *   className?: string,
 *   id?: string,
 *   disabled?: boolean,
 * }} props
 */
export default function Select({
  value,
  onChange,
  options = [],
  placeholder,
  searchable = false,
  title,
  className = "",
  id,
  disabled,
  "aria-invalid": ariaInvalid,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isMobile = useIsMobile();
  const triggerRef = useRef(null);
  const popupRef = useRef(null);

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

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint || "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const o of filtered) {
      const g = o.group || "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(o);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const pick = (next) => {
    onChange(next);
    setOpen(false);
  };

  const triggerClasses = `h-12 w-full rounded-xl border bg-white dark:bg-slate-800 px-4 text-base text-left flex items-center gap-2 transition outline-none ${
    ariaInvalid
      ? "border-red-400 focus:ring-2 focus:ring-red-400/30"
      : "border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
  } ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((p) => !p)}
        className={triggerClasses}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid || undefined}
      >
        {selected?.icon && <span className="text-lg shrink-0">{selected.icon}</span>}
        <span className={`flex-1 min-w-0 truncate ${selected ? "" : "text-slate-400"}`}>
          {selected?.label || placeholder || ""}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${open && !isMobile ? "rotate-180" : ""}`}
        />
      </button>

      {/* Desktop popup */}
      {!isMobile && (
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popupRef}
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute z-50 mt-1 w-[var(--w,16rem)] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
              style={{
                "--w": triggerRef.current ? `${triggerRef.current.offsetWidth}px` : "16rem",
                left: triggerRef.current?.getBoundingClientRect().left,
                top: (triggerRef.current?.getBoundingClientRect().bottom || 0) + window.scrollY + 4,
                position: "absolute",
              }}
              role="listbox"
            >
              {searchable && (
                <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("common.search")}
                      className="w-full h-9 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                </div>
              )}
              <div className="max-h-72 overflow-y-auto py-1">
                {grouped.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-500">
                    {t("common.none")}
                  </div>
                ) : (
                  grouped.map(([g, opts], gi) => (
                    <div key={g || gi}>
                      {g && (
                        <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400">
                          {g}
                        </div>
                      )}
                      {opts.map((opt) => (
                        <OptionRow
                          key={opt.value}
                          opt={opt}
                          selected={opt.value === value}
                          onPick={pick}
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Mobile bottom sheet */}
      {isMobile && (
        <BottomSheet open={open} onClose={() => setOpen(false)} title={title || placeholder}>
          {searchable && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.search")}
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-emerald-400/30"
              />
            </div>
          )}
          <div className="max-h-[60vh] overflow-y-auto -mx-5">
            {grouped.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-500 text-center">
                {t("common.none")}
              </div>
            ) : (
              grouped.map(([g, opts], gi) => (
                <div key={g || gi}>
                  {g && (
                    <div className="px-5 pt-4 pb-1 text-[10px] uppercase tracking-wider text-slate-400">
                      {g}
                    </div>
                  )}
                  {opts.map((opt) => (
                    <OptionRow
                      key={opt.value}
                      opt={opt}
                      selected={opt.value === value}
                      onPick={pick}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </BottomSheet>
      )}
    </>
  );
}
