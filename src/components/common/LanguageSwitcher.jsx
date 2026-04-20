import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { SUPPORTED_LANGS } from "@/i18n/translations.js";

/**
 * Language switcher component for login/register pages.
 * Shows a globe icon with current language, and a dropdown to switch languages.
 */
export default function LanguageSwitcher({ className = "" }) {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Close on escape
  useEffect(() => {
    function handleEscape(e) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open]);

  const currentLang = SUPPORTED_LANGS.find((l) => l.id === lang) || SUPPORTED_LANGS[0];

  const handleSelect = (langId) => {
    setLang(langId);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm hover:border-accent/40 hover:bg-card/70 transition-all duration-200 text-sm text-muted-foreground hover:text-foreground"
        aria-label="Change language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe className="h-4 w-4" />
        <span className="font-medium">{currentLang.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-40 rounded-xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-lg z-50 overflow-hidden"
            role="listbox"
            aria-label="Select language"
          >
            {SUPPORTED_LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => handleSelect(l.id)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors duration-150 ${
                  lang === l.id
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-foreground hover:bg-muted/50"
                }`}
                role="option"
                aria-selected={lang === l.id}
              >
                <span>{l.label}</span>
                {lang === l.id && <Check className="h-4 w-4" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
