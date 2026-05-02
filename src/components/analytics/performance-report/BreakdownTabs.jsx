/**
 * BreakdownTabs - Tabbed breakdown tables for Performance Report
 * Premium table with sorting, sticky header, and row click support
 */

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Coins, Clock, Wallet, Calendar, Target, 
  ChevronUp, ChevronDown, ArrowUpDown, BarChart3, Brain
} from "lucide-react";
import { fmtMoney, fmtPct } from "@/lib/utils";
import { AvatarBubble } from "@/components/common/Avatar.jsx";

// Special label for trades without account
const NO_ACCOUNT_LABEL = "__NO_ACCOUNT__";

// Tab data configuration
const TAB_CONFIG = {
  byPair: { key: "byPair", icon: Coins, label: "By Pair" },
  bySession: { key: "bySession", icon: Clock, label: "By Session" },
  byModel: { key: "byModel", icon: Brain, label: "By Model" },
  byAccount: { key: "byAccount", icon: Wallet, label: "By Account" },
  byWeekday: { key: "byWeekday", icon: Calendar, label: "By Weekday" },
  byRRBucket: { key: "byRRBucket", icon: Target, label: "By RR" },
};

// Column configuration
const COLUMNS = [
  { key: "key", label: "Name", sortable: true, align: "left" },
  { key: "trades", label: "Trades", sortable: true, align: "center" },
  { key: "netPnl", label: "Net PnL", sortable: true, align: "right", format: "money" },
  { key: "winRate", label: "Win Rate", sortable: true, align: "center", format: "percent" },
  { key: "avgRR", label: "Avg RR", sortable: true, align: "center", format: "rr" },
  { key: "expectancy", label: "Expectancy", sortable: true, align: "right", format: "money" },
  { key: "profitFactor", label: "Profit Factor", sortable: true, align: "center", format: "number" },
  { key: "maxWinStreak", label: "Win Streak", sortable: true, align: "center", format: "streak" },
  { key: "maxLossStreak", label: "Loss Streak", sortable: true, align: "center", format: "streak" },
];

// Sort indicator component
const SortIndicator = React.memo(function SortIndicator({ direction }) {
  if (!direction) {
    return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  }
  return direction === "asc" 
    ? <ChevronUp className="h-3 w-3 text-accent" />
    : <ChevronDown className="h-3 w-3 text-accent" />;
});

// Format cell value
function formatValue(value, format, currency) {
  if (value === null || value === undefined) return "—";
  
  switch (format) {
    case "money":
      return fmtMoney(value, currency);
    case "percent":
      return fmtPct(value);
    case "rr":
      return `${Number(value).toFixed(2)}R`;
    case "number":
      return value >= 999 ? "∞" : Number(value).toFixed(2);
    case "streak":
      return String(Number(value) || 0);
    default:
      return value;
  }
}

// Single Tab Button
const TabButton = React.memo(function TabButton({ tab, active, onClick }) {
  const Icon = tab.icon;
  
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium 
        transition-all duration-200
        ${active 
          ? "bg-accent/15 text-accent border border-accent/30 shadow-sm" 
          : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
        }
      `}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{tab.label}</span>
    </button>
  );
});

// Premium Table Component
function BreakdownTable({ data, currency, onRowClick, sortConfig, onSort, t, activeTab }) {
  if (!data || data.length === 0) {
    return (
      <div className="py-12 text-center">
        <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }
  
  // Format display value, translating special keys
  const formatDisplayValue = (value, colKey) => {
    if (colKey === "key" && value === NO_ACCOUNT_LABEL) {
      return (
        <span className="flex items-center gap-1.5">
          <AvatarBubble avatar={null} color="#F59E0B" size={20} isNoAccount={true} />
          <span className="text-amber-500">{t?.("accounts.noAccount") || "No account"}</span>
        </span>
      );
    }
    return value;
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-accent/10">
      <table className="w-full text-sm">
        {/* Header */}
        <thead className="sticky top-0 z-10 bg-card/98 border-b border-accent/15">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`
                  px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider
                  ${col.align === "left" ? "text-left" : col.align === "right" ? "text-right" : "text-center"}
                  ${col.sortable ? "cursor-pointer hover:text-foreground transition-colors select-none" : ""}
                `}
                onClick={() => col.sortable && onSort(col.key)}
              >
                <div className={`flex items-center gap-1.5 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                  {col.label}
                  {col.sortable && (
                    <SortIndicator direction={sortConfig?.key === col.key ? sortConfig.direction : null} />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-accent/5">
          {data.map((row, idx) => {
            const isPositive = row.netPnl >= 0;
            const isNoAccountRow = activeTab === "byAccount" && row.key === NO_ACCOUNT_LABEL;
            
            return (
              <tr
                key={row.key || idx}
                onClick={() => onRowClick?.(row)}
                className={`
                  group cursor-pointer transition-colors duration-150
                  hover:bg-accent/5
                  ${isPositive ? "hover:bg-emerald-500/5" : "hover:bg-rose-500/5"}
                `}
              >
                {COLUMNS.map((col) => {
                  const value = row[col.key];
                  const formatted = formatValue(value, col.format, currency);
                  
                  // Special styling for certain columns
                  let textClass = "text-foreground";
                  if (col.key === "netPnl") {
                    textClass = isPositive ? "text-emerald-500 font-semibold" : "text-rose-500 font-semibold";
                  } else if (col.key === "winRate") {
                    textClass = row.winRate >= 50 ? "text-emerald-500" : "text-rose-500";
                  } else if (col.key === "expectancy") {
                    textClass = row.expectancy >= 0 ? "text-emerald-500" : "text-rose-500";
                  } else if (col.key === "profitFactor") {
                    textClass = row.profitFactor >= 1 ? "text-emerald-500" : "text-rose-500";
                  } else if (col.key === "maxWinStreak") {
                    textClass = "text-emerald-500";
                  } else if (col.key === "maxLossStreak") {
                    textClass = "text-rose-500";
                  }
                  
                  // Use special rendering for "key" column to handle NO_ACCOUNT_LABEL
                  const displayValue = col.key === "key" ? formatDisplayValue(value, col.key) : formatted;
                  
                  return (
                    <td
                      key={col.key}
                      className={`
                        px-4 py-3 tabular-nums
                        ${col.align === "left" ? "text-left" : col.align === "right" ? "text-right" : "text-center"}
                        ${col.key === "key" ? "font-medium" : ""}
                        ${col.key === "key" && isNoAccountRow ? "" : textClass}
                      `}
                    >
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function BreakdownTabs({ breakdowns, currency, reduceMotion, onTradeClick, t, modelsEnabled = true }) {
  const [activeTab, setActiveTab] = useState("byPair");
  const [sortConfig, setSortConfig] = useState({ key: "netPnl", direction: "desc" });

  const visibleTabs = useMemo(() => {
    return Object.values(TAB_CONFIG).filter((tab) => modelsEnabled || tab.key !== "byModel");
  }, [modelsEnabled]);

  React.useEffect(() => {
    if (!modelsEnabled && activeTab === "byModel") {
      setActiveTab("byPair");
    }
  }, [modelsEnabled, activeTab]);

  // Get current tab data
  const currentData = breakdowns[activeTab] || [];

  // Sort data
  const sortedData = useMemo(() => {
    if (!currentData || currentData.length === 0) return [];
    
    return [...currentData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      // Handle string comparison for key column
      if (sortConfig.key === "key") {
        const comparison = String(aVal).localeCompare(String(bVal));
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }
      
      // Numeric comparison
      const numA = Number(aVal) || 0;
      const numB = Number(bVal) || 0;
      return sortConfig.direction === "asc" ? numA - numB : numB - numA;
    });
  }, [currentData, sortConfig]);

  // Handle sort
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  // Get localized tab labels
  const getTabLabel = (tabKey) => {
    const labels = {
      byPair: t("pages.performanceReport.breakdown.byPair") || "By Pair",
      bySession: t("pages.performanceReport.breakdown.bySession") || "By Session",
      byModel: t("pages.performanceReport.breakdown.byModel") || "By Model",
      byAccount: t("pages.performanceReport.breakdown.byAccount") || "By Account",
      byWeekday: t("pages.performanceReport.breakdown.byWeekday") || "By Weekday",
      byRRBucket: t("pages.performanceReport.breakdown.byRR") || "By RR",
    };
    return labels[tabKey] || TAB_CONFIG[tabKey]?.label || tabKey;
  };

  return (
    <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/60 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t("pages.performanceReport.breakdown.title") || "Breakdown Report"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("pages.performanceReport.breakdown.subtitle") || "Analyze performance by different dimensions"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b border-accent/10">
        {visibleTabs.map((tab) => (
          <TabButton
            key={tab.key}
            tab={{ ...tab, label: getTabLabel(tab.key) }}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          />
        ))}
      </div>

      {/* Table */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <BreakdownTable
            data={sortedData}
            currency={currency}
            onRowClick={onTradeClick}
            sortConfig={sortConfig}
            onSort={handleSort}
            t={t}
            activeTab={activeTab}
          />
        </motion.div>
      </AnimatePresence>

      {/* Footer stats */}
      {sortedData.length > 0 && (
        <div className="mt-4 pt-4 border-t border-accent/10 flex items-center justify-between text-xs text-muted-foreground">
          <span>{sortedData.length} {t("pages.performanceReport.breakdown.items") || "items"}</span>
          <span>
            {t("pages.performanceReport.breakdown.clickToFilter") || "Click row to filter"}
          </span>
        </div>
      )}
    </div>
  );
}
