import React, { useState, useRef, useEffect } from "react";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { SUPPORTED_LANGS } from "@/i18n/translations.js";

export default function LanguageSwitcher({ className = "" }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = SUPPORTED_LANGS.find((l) => l.id === lang) || SUPPORTED_LANGS[0];

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 hover:border-emerald-300 transition text-sm text-slate-700 dark:text-slate-200"
        aria-label="Change language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe className="h-4 w-4" />
        <span className="font-medium">{current.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 overflow-hidden"
          role="listbox"
        >
          {SUPPORTED_LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLang(l.id);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition ${
                lang === l.id
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-medium"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              role="option"
              aria-selected={lang === l.id}
            >
              <span>{l.label}</span>
              {lang === l.id && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
