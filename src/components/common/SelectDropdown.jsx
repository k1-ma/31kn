import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Search } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useAnimationsEnabled } from "@/lib/animations.jsx";

/**
 * Reusable dropdown component with custom styling (matches Account dropdown UI).
 * 
 * @param {Object} props
 * @param {string} props.label - The label displayed above the dropdown (optional, for accessibility)
 * @param {string} props.value - Currently selected value
 * @param {Array<{value: string, label: string, icon?: React.ReactNode, subtext?: string, color?: string}>} props.options - Options array
 * @param {function} props.onChange - Callback when value changes
 * @param {boolean} props.searchable - Whether to show search input (default: false)
 * @param {function} props.renderOption - Custom render function for options (optional)
 * @param {string} props.placeholder - Placeholder text when no value selected
 * @param {string} props.className - Additional className for wrapper
 */
export default function SelectDropdown({
  label,
  value,
  options = [],
  onChange,
  searchable = false,
  renderOption,
  placeholder = "Select...",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const { t } = useI18n();
  const animationsEnabled = useAnimationsEnabled();

  // Handle click outside using document pointerdown (not onBlur which is unreliable)
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e) {
      // Close only if click is outside BOTH triggerRef and menuRef
      const clickedTrigger = triggerRef.current?.contains(e.target);
      const clickedMenu = menuRef.current?.contains(e.target);

      if (!clickedTrigger && !clickedMenu) {
        setOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    // Add listeners after a tick to avoid closing immediately from the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchable && searchRef.current) {
      // Small delay to ensure DOM is ready after animation starts
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    if (!open) setSearch("");
  }, [open, searchable]);

  // Filter options by search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((opt) =>
      (opt.label || "").toLowerCase().includes(q) ||
      (opt.subtext || "").toLowerCase().includes(q)
    );
  }, [options, search]);

  // Convert value to string for consistent comparison
  const valueStr = String(value ?? "");
  const selectedOption = options.find((opt) => String(opt.value) === valueStr);

  // Default option rendering
  const defaultRenderOption = (opt, isSelected) => (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {opt.icon && (
        <div className="shrink-0">
          {opt.icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`truncate ${isSelected ? "font-medium" : ""}`}>{opt.label}</span>
          {opt.badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${opt.badgeClass || "bg-muted text-muted-foreground"}`}>
              {opt.badge}
            </span>
          )}
        </div>
        {opt.subtext && (
          <div className="text-xs text-muted-foreground truncate">{opt.subtext}</div>
        )}
      </div>
    </div>
  );

  const renderFn = renderOption || defaultRenderOption;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-1 h-10 w-full rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/20 dark:bg-white/[0.03] px-3 text-[13px] text-foreground outline-none flex items-center justify-between gap-2 hover:border-border dark:hover:border-white/[0.14] hover:bg-muted/30 dark:hover:bg-white/[0.05] transition-all duration-200 shadow-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedOption ? (
            <>
              {selectedOption.icon && <span className="shrink-0">{selectedOption.icon}</span>}
              <span className="truncate">{selectedOption.label}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown menu - simple absolute positioning, high z-index */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            initial={animationsEnabled ? { opacity: 0, y: -4, scale: 0.98 } : { opacity: 1 }}
            animate={animationsEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 }}
            exit={animationsEnabled ? { opacity: 0, y: -4, scale: 0.98 } : { opacity: 0 }}
            transition={animationsEnabled ? { type: "spring", stiffness: 400, damping: 25 } : { duration: 0 }}
            className="absolute top-full left-0 mt-2 w-full min-w-[200px] rounded-xl border border-border/50 dark:border-white/[0.08] bg-card/98 dark:bg-[#131722]/95 backdrop-blur-xl shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-[9999] pointer-events-auto overflow-hidden"
            role="listbox"
          >
            {/* Search input (only if searchable and more than 3 options) */}
            {searchable && options.length > 3 && (
              <div className="p-2 border-b border-border/50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("common.search") + "..."}
                    className="w-full h-8 pl-8 pr-3 rounded-lg bg-muted/30 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </div>
            )}

            {/* Scrollable options list */}
            <div className="max-h-[280px] overflow-y-auto overscroll-contain">
              {filteredOptions.map((opt) => {
                const optValue = String(opt.value);
                const isSelected = valueStr === optValue;

                return (
                  <button
                    key={optValue}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-left text-[13px] flex items-center gap-3 transition-colors duration-150 ${
                      isSelected ? "bg-accent/8 text-foreground" : "hover:bg-muted/30 dark:hover:bg-white/[0.04] text-foreground/90"
                    }`}
                  >
                    {renderFn(opt, isSelected)}
                    {isSelected && <Check className="h-4 w-4 text-accent shrink-0" />}
                  </button>
                );
              })}

              {filteredOptions.length === 0 && search && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {t("common.nothingFound")}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
