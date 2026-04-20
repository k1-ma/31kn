import React from "react";
import { List, LayoutGrid, ArrowUpDown, SlidersHorizontal, TrendingUp, TrendingDown, Minus, CheckCircle2, CalendarDays } from "lucide-react";
import SelectDropdown from "@/components/common/SelectDropdown.jsx";

/**
 * Toolbar with view toggle, sorting, and filters for Trades page
 */
export default function TradesViewToolbar({
  view,
  onViewChange,
  sortBy,
  onSortChange,
  sortDir,
  onSortDirChange,
  outcomeFilter,
  onOutcomeFilterChange,
  onOpenCalendar,
  calendarActive,
  tradeOpen,
  t,
}) {
  // Gallery first (primary), List second (secondary)
  const viewOptions = [
    { id: "gallery", icon: LayoutGrid, label: t?.("pages.trades.viewGallery") || "Gallery" },
    { id: "list", icon: List, label: t?.("pages.trades.viewList") || "List" },
  ];

  const sortOptions = [
    { value: "date", label: t?.("pages.trades.sortByDate") || "Date" },
    { value: "pnl", label: t?.("pages.trades.sortByPnL") || "PnL" },
    { value: "rr", label: t?.("pages.trades.sortByRR") || "RR" },
    { value: "outcome", label: t?.("pages.trades.sortByOutcome") || "Outcome" },
    { value: "symbol", label: t?.("pages.trades.sortBySymbol") || "Symbol" },
  ];

  const outcomeOptions = [
    { value: "all", label: t?.("pages.trades.outcomeAll") || "All", icon: <CheckCircle2 className="h-4 w-4 text-accent" /> },
    { value: "Profit", label: t?.("pages.trades.outcomeProfit") || "TP", icon: <TrendingUp className="h-4 w-4 text-emerald-500" /> },
    { value: "Loss", label: t?.("pages.trades.outcomeLoss") || "SL", icon: <TrendingDown className="h-4 w-4 text-red-500" /> },
    { value: "BE", label: t?.("pages.trades.outcomeBE") || "BE", icon: <Minus className="h-4 w-4 text-amber-500" /> },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {/* View Toggle - hide List and Calendar when trade is open */}
      <div className="flex rounded-xl border border-border/50 dark:border-white/[0.08] bg-white/[0.02] p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]">
        {viewOptions
          .filter(({ id }) => !tradeOpen || id === "gallery") // Only show Gallery when trade is open
          .map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
              view === id
                ? "bg-[#3B82F6] text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
            }`}
            title={label}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}

        {/* Calendar button - part of the same group, hide when trade is open */}
        {onOpenCalendar && !tradeOpen && (
          <button
            onClick={onOpenCalendar}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
              calendarActive
                ? "bg-[#3B82F6] text-white shadow-[0_1px_4px_rgba(59,130,246,0.3)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
            }`}
            title={t?.("pages.trades.calendar") || "Calendar"}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">{t?.("pages.trades.calendar") || "Calendar"}</span>
          </button>
        )}
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-white/[0.08] hidden sm:block" />

      {/* Sort By - Using custom SelectDropdown */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
        <div className="w-[110px] sm:w-[140px]">
          <SelectDropdown
            label={t?.("pages.trades.sortBy") || "Sort by"}
            value={sortBy}
            onChange={onSortChange}
            searchable={false}
            options={sortOptions}
          />
        </div>

        {/* Sort Direction Toggle */}
        <button
          onClick={() => onSortDirChange(sortDir === "desc" ? "asc" : "desc")}
          className={`h-10 px-2 rounded-xl border border-accent/15 bg-card/50 text-sm transition-colors hover:bg-muted/30 ${
            sortDir === "asc" ? "text-accent" : "text-muted-foreground"
          }`}
          title={sortDir === "desc" ? (t?.("pages.trades.sortDescending") || "Descending") : (t?.("pages.trades.sortAscending") || "Ascending")}
        >
          {sortDir === "desc" ? "↓" : "↑"}
        </button>
      </div>

      {/* Outcome Filter - Using custom SelectDropdown */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <div className="w-[100px] sm:w-[120px]">
          <SelectDropdown
            label={t?.("pages.trades.outcomeFilter") || "Outcome"}
            value={outcomeFilter}
            onChange={onOutcomeFilterChange}
            searchable={false}
            options={outcomeOptions}
          />
        </div>
      </div>
    </div>
  );
}
