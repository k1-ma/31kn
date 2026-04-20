import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

/**
 * Custom SingleDatePicker component matching the Haunted UI styling.
 * Similar to DateRangePicker but for selecting a single date.
 * 
 * @param {Object} props
 * @param {string} props.value - Selected date value (ISO format: YYYY-MM-DD)
 * @param {function} props.onChange - Callback when date changes
 * @param {string} props.placeholder - Placeholder text when no value selected
 * @param {string} props.className - Additional className for wrapper
 */
export default function SingleDatePicker({
  value,
  onChange,
  placeholder,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    // Start with current month or the selected date's month
    if (value) {
      const d = new Date(value + "T00:00:00");
      return { year: d.getFullYear(), month: d.getMonth() };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const { t } = useI18n();

  // Day/Month names - using translations if available
  const monthNames = useMemo(() => {
    return t("common.datePicker.months")?.split(",") ?? [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
  }, [t]);

  const shortDayNames = useMemo(() => {
    return t("common.datePicker.daysShort")?.split(",") ?? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  }, [t]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 2000 + 2 }, (_, i) => 2000 + i);
  }, []);

  // Handle click outside
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e) {
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

  // Update viewDate when value changes
  useEffect(() => {
    if (value && open) {
      const d = new Date(value + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setViewDate({ year: d.getFullYear(), month: d.getMonth() });
      }
    }
  }, [value, open]);

  // Format date for display
  const formatDisplayDate = useCallback((isoDate) => {
    if (!isoDate) return "";
    const d = new Date(isoDate + "T00:00:00");
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  }, []);

  // Get display text for trigger
  const getDisplayText = useCallback(() => {
    const defaultPlaceholder = t("common.datePicker.selectDate") || "Select date";
    if (value) {
      return formatDisplayDate(value);
    }
    return placeholder || defaultPlaceholder;
  }, [value, formatDisplayDate, t, placeholder]);

  // Generate calendar days for the current view month
  const calendarDays = useMemo(() => {
    const { year, month } = viewDate;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Get day of week (0 = Sunday, adjust to Monday-based)
    let startDayOfWeek = firstDay.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Convert to Mon=0
    
    const days = [];
    
    // Add empty slots for days before the first day
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ day: null, date: null });
    }
    
    // Add all days of the month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({ day: d, date: iso });
    }
    
    return days;
  }, [viewDate]);

  // Check if date is selected
  const isSelected = useCallback((dateIso) => dateIso === value, [value]);

  // Handle day click
  const handleDayClick = useCallback((dateIso) => {
    if (!dateIso) return;
    onChange(dateIso);
    setOpen(false);
  }, [onChange]);

  // Navigate months
  const goToPrevMonth = useCallback(() => {
    setViewDate(prev => {
      const newMonth = prev.month - 1;
      if (newMonth < 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { ...prev, month: newMonth };
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewDate(prev => {
      const newMonth = prev.month + 1;
      if (newMonth > 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { ...prev, month: newMonth };
    });
  }, []);

  // Quick presets
  const presets = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    
    return [
      { label: t("common.datePicker.presets.today") || "Today", date: today },
      { label: t("common.datePicker.presets.yesterday") || "Yesterday", date: yesterdayIso },
    ];
  }, [t]);

  const applyPreset = useCallback((preset) => {
    onChange(preset.date);
    setOpen(false);
  }, [onChange]);

  const hasValue = !!value;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="h-10 w-full rounded-xl border border-accent/15 bg-card/50 px-3 text-sm text-foreground outline-none flex items-center justify-between gap-2 hover:bg-muted/30 transition focus:ring-2 focus:ring-accent/20"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Calendar className="h-4 w-4 shrink-0 text-accent" />
          <span className={`truncate ${!hasValue ? "text-muted-foreground" : ""}`}>
            {getDisplayText()}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute top-full left-0 mt-2 w-full min-w-[280px] rounded-xl border border-border bg-card shadow-lg z-[9999] pointer-events-auto overflow-hidden"
            role="dialog"
          >
            {/* Quick presets */}
            <div className="p-2 border-b border-border/50">
              <div className="flex flex-wrap gap-1">
                {presets.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-muted/30 hover:bg-muted/50 text-foreground transition font-medium"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
              <button
                type="button"
                onClick={goToPrevMonth}
                className="p-1.5 rounded-lg hover:bg-muted/50 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1">
                <select
                  value={viewDate.month}
                  onChange={(e) => setViewDate(prev => ({ ...prev, month: Number(e.target.value) }))}
                  className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer text-foreground appearance-none hover:text-accent transition pr-1"
                >
                  {monthNames.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
                <select
                  value={viewDate.year}
                  onChange={(e) => setViewDate(prev => ({ ...prev, year: Number(e.target.value) }))}
                  className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer text-foreground appearance-none hover:text-accent transition"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={goToNextMonth}
                className="p-1.5 rounded-lg hover:bg-muted/50 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="p-3">
              {/* Day names header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {shortDayNames.map((day, i) => (
                  <div key={i} className="h-8 flex items-center justify-center text-xs text-muted-foreground font-medium">
                    {day}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((item, i) => {
                  if (!item.day) {
                    return <div key={i} className="h-8" />;
                  }

                  const selected = isSelected(item.date);

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleDayClick(item.date)}
                      className={`h-8 w-full rounded-lg text-sm font-medium transition
                        ${selected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/50 text-foreground"
                        }
                      `}
                    >
                      {item.day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer with clear button */}
            {value && (
              <div className="px-3 py-2 border-t border-border/30 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{formatDisplayDate(value)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition"
                >
                  {t("common.clear") || "Clear"}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
