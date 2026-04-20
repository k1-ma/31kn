/**
 * DashboardFilterBar - Top sticky filter bar for the dashboard
 * Enhanced dropdowns with search, proper z-index, and localization
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import {
  Calendar,
  ChevronDown,
  Filter,
  RotateCcw,
  Download,
  Check,
  X,
  Clock,
  Search,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { DATE_PRESETS, DIRECTION_OPTIONS } from "@/lib/dashboard/useDashboardFilters.js";

// Session ID prefix pattern (raw IDs that shouldn't be displayed)
const RAW_SESSION_ID_PREFIX = "ses_";

/**
 * Check if a string looks like a raw session ID (not a human-readable name)
 */
function isRawSessionId(s) {
  return typeof s === "string" && s.startsWith(RAW_SESSION_ID_PREFIX);
}

// Enhanced multi-select dropdown with search (similar to Analytics)
function MultiSelectDropdown({ label, icon: Icon, options, selected, onChange, placeholder, showSearch = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Delay to avoid closing immediately from the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener("pointerdown", handleClick);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("pointerdown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    if (!open) setSearch("");
  }, [open]);

  // Filter options by search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(opt =>
      (opt.label || opt.name || opt.id || "").toLowerCase().includes(q)
    );
  }, [options, search]);

  const toggleOption = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  // Use localized "N selected" text
  const displayLabel = useMemo(() => {
    if (selected.length === 0) return placeholder || label;
    if (selected.length === 1) {
      const opt = options.find((o) => o.id === selected[0]);
      return opt?.label || opt?.name || selected[0];
    }
    // Use translation with count interpolation
    const template = t("common.selected") || "{count} selected";
    return template.replace("{count}", selected.length);
  }, [selected, options, placeholder, label, t]);

  // Determine if search should be shown
  const shouldShowSearch = showSearch || options.length > 3;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-medium transition-all duration-200 ${
          selected.length > 0
            ? "bg-accent/10 border border-accent/30 text-foreground shadow-[0_1px_4px_rgba(59,130,246,0.08)]"
            : "bg-muted/30 dark:bg-white/[0.03] border border-border/50 dark:border-white/[0.08] text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05] hover:border-border dark:hover:border-white/[0.14] hover:text-foreground"
        }`}
      >
        {Icon && <Icon className="h-4 w-4" />}
        <span className="max-w-[140px] truncate">{displayLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute top-full left-0 mt-2 min-w-[260px] sm:min-w-[320px] rounded-xl border border-border/50 dark:border-white/[0.08] bg-card/98 dark:bg-[#131722]/95 backdrop-blur-xl shadow-xl z-[9999] overflow-hidden"
          >
            {/* Search input */}
            {shouldShowSearch && (
              <div className="p-2 border-b border-border/50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`${t("common.search") || "Search"}...`}
                    className="w-full h-8 pl-8 pr-3 rounded-lg bg-muted/30 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </div>
            )}

            {/* Scrollable options list */}
            <div className="max-h-[220px] sm:max-h-[280px] overflow-y-auto overscroll-contain">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {t("common.nothingFound") || "Nothing found"}
                </div>
              ) : (
                filteredOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => toggleOption(opt.id)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 text-left text-[13px] transition-colors duration-150 ${
                      selected.includes(opt.id) ? "bg-accent/8" : "hover:bg-muted/30 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all duration-150 ${
                        selected.includes(opt.id)
                          ? "bg-accent border-accent text-on-accent"
                          : "border-border/50 dark:border-white/[0.15] hover:border-border dark:hover:border-white/[0.25]"
                      }`}
                    >
                      {selected.includes(opt.id) && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{opt.label || opt.name || opt.id}</span>
                      {opt.subtitle && (
                        <span className="text-xs text-muted-foreground truncate block">{opt.subtitle}</span>
                      )}
                    </div>
                    {opt.badge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${opt.badgeClass || "bg-muted text-muted-foreground"}`}>
                        {opt.badge}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Clear selection footer */}
            {selected.length > 0 && (
              <div className="border-t border-border/50 p-2">
                <button
                  onClick={() => onChange([])}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition"
                >
                  <X className="h-3.5 w-3.5" />
                  {t("common.clearSelection") || "Clear"}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Single select dropdown with localization
function SingleSelectDropdown({ label, icon: Icon, options, value, onChange }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener("pointerdown", handleClick);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("pointerdown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectedOption = options.find((o) => o.id === value);

  // Localize the label
  const getLocalizedLabel = (opt) => {
    // For direction options, use localized labels
    if (opt.id === "all") return t("common.all") || "All";
    if (opt.id === "Long") return t("common.long") || "Long";
    if (opt.id === "Short") return t("common.short") || "Short";
    return opt.label;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-medium transition-all duration-200 ${
          value && value !== "all"
            ? "bg-accent/10 border border-accent/30 text-foreground shadow-[0_1px_4px_rgba(59,130,246,0.08)]"
            : "bg-muted/30 dark:bg-white/[0.03] border border-border/50 dark:border-white/[0.08] text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05] hover:border-border dark:hover:border-white/[0.14] hover:text-foreground"
        }`}
      >
        {Icon && <Icon className="h-4 w-4" />}
        <span>{selectedOption ? getLocalizedLabel(selectedOption) : label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute top-full left-0 mt-2 min-w-[180px] rounded-xl border border-border/50 dark:border-white/[0.08] bg-card/98 dark:bg-[#131722]/95 backdrop-blur-xl shadow-xl z-[9999]"
          >
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-2.5 text-left text-[13px] transition-colors duration-150 ${
                  value === opt.id ? "bg-accent/8 text-foreground" : "hover:bg-muted/30 dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className="flex-1">{getLocalizedLabel(opt)}</span>
                {value === opt.id && <Check className="h-4 w-4 text-accent" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DashboardFilterBar({
  datePreset,
  setDatePreset,
  selectedAccounts,
  setSelectedAccounts,
  selectedPairs,
  setSelectedPairs,
  selectedSessions,
  setSelectedSessions,
  direction,
  setDirection,
  filterOptions,
  hasActiveFilters,
  resetFilters,
  lastUpdated,
  onExport,
  libraries = {},
  accounts = [],
}) {
  const { t } = useI18n();

  // Create session name lookup map from libraries
  const sessionNameMap = useMemo(() => {
    const map = new Map();
    for (const s of (libraries?.sessions || [])) {
      if (s?.id) map.set(String(s.id), s.name || s.label || s.id);
    }
    return map;
  }, [libraries?.sessions]);

  // Enhanced account options with status badges
  const accountOptions = useMemo(() => {
    return filterOptions.accounts.map((a) => {
      const fullAccount = accounts.find(acc => acc?.id === a.id);
      const status = fullAccount?.status || "Live";
      const badgeClass = 
        status === "Live" || status === "Funded" ? "bg-emerald-500/15 text-emerald-400" :
        status === "Failed" ? "bg-rose-500/15 text-rose-400" :
        status?.includes("Phase") ? "bg-blue-500/15 text-blue-400" :
        "bg-muted text-muted-foreground";
      
      return {
        id: a.id,
        label: a.name,
        badge: status,
        badgeClass,
      };
    });
  }, [filterOptions.accounts, accounts]);

  const pairOptions = filterOptions.pairs.map((p) => ({
    id: p,
    label: p,
  }));

  // Enhanced session options with proper name resolution
  const sessionOptions = useMemo(() => {
    return filterOptions.sessions
      .filter(s => {
        // Filter out raw IDs unless we have a name for them
        if (isRawSessionId(s)) {
          return sessionNameMap.has(s);
        }
        return true;
      })
      .map((s) => {
        // Try to get a nice name from the library
        const name = sessionNameMap.get(String(s)) || s;
        // Skip if still looks like a raw ID
        if (isRawSessionId(name)) return null;
        return {
          id: s,
          label: name,
        };
      })
      .filter(Boolean);
  }, [filterOptions.sessions, sessionNameMap]);

  return (
    <div className="sticky top-0 z-30 mb-3 sm:mb-4">
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card/95 dark:bg-[#131722]/95 overflow-visible px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm dark:shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {/* Date Range */}
        <SingleSelectDropdown
          label="Date Range"
          icon={Calendar}
          options={DATE_PRESETS.filter((p) => p.id !== "custom")}
          value={datePreset}
          onChange={setDatePreset}
        />

        {/* Account Filter */}
        {accountOptions.length > 0 && (
          <MultiSelectDropdown
            label="Accounts"
            icon={null}
            options={accountOptions}
            selected={selectedAccounts}
            onChange={setSelectedAccounts}
            placeholder="All Accounts"
          />
        )}

        {/* Pair Filter */}
        {pairOptions.length > 0 && (
          <MultiSelectDropdown
            label="Pairs"
            icon={null}
            options={pairOptions}
            selected={selectedPairs}
            onChange={setSelectedPairs}
            placeholder="All Pairs"
          />
        )}

        {/* Session Filter */}
        {sessionOptions.length > 0 && (
          <MultiSelectDropdown
            label="Sessions"
            icon={null}
            options={sessionOptions}
            selected={selectedSessions}
            onChange={setSelectedSessions}
            placeholder="All Sessions"
          />
        )}

        {/* Direction Filter */}
        <SingleSelectDropdown
          label="Direction"
          icon={null}
          options={DIRECTION_OPTIONS}
          value={direction}
          onChange={setDirection}
        />

        {/* Reset Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Last Updated */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>
            Updated: {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Export Button */}
        {onExport && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onExport}
          className="h-9 gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        )}
        </div>
      </div>
    </div>
  );
}
