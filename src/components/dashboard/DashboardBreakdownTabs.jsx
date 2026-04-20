/**
 * DashboardBreakdownTabs - Tabbed breakdown tables (By Pair, Session, Account, Weekday, RR)
 */

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import {
  Layers,
  Clock,
  Wallet,
  Calendar,
  Target,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from "lucide-react";
import { fmtMoney, fmtPct, fmtPnl } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";

const TABS = [
  { id: "byPair", label: "By Pair", icon: Layers },
  { id: "bySession", label: "By Session", icon: Clock },
  { id: "byAccount", label: "By Account", icon: Wallet },
  { id: "byWeekday", label: "By Weekday", icon: Calendar },
  { id: "byRRBucket", label: "By RR", icon: Target },
];

// Sortable table header
function SortableHeader({ label, sortKey, currentSort, onSort }) {
  const isActive = currentSort.key === sortKey;
  const isAsc = isActive && currentSort.dir === "asc";

  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-[11px] uppercase tracking-wider font-medium transition-colors ${
        isActive ? "text-accent" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {isActive ? (
        isAsc ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

// Breakdown table row
function BreakdownRow({ item, currency, onClick, fmtPnlValue }) {
  const isPositive = item.netPnl >= 0;

  return (
    <tr
      onClick={onClick}
      className="group border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors duration-150 cursor-pointer"
    >
      <td className="py-3 px-3">
        <span className="font-medium text-sm">{item.key}</span>
      </td>
      <td className="py-3 px-3 text-right">
        <span className="text-sm tabular-nums">{item.trades}</span>
      </td>
      <td className="py-3 px-3 text-right">
        <span
          className={`text-sm font-semibold tabular-nums ${
            isPositive ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {fmtPnlValue ? fmtPnlValue(item.netPnl) : fmtMoney(item.netPnl, currency)}
        </span>
      </td>
      <td className="py-3 px-3 text-right">
        <span
          className={`text-sm tabular-nums ${
            item.winRate >= 50 ? "text-emerald-400" : item.winRate >= 40 ? "text-amber-400" : "text-rose-400"
          }`}
        >
          {fmtPct(item.winRate)}
        </span>
      </td>
      <td className="py-3 px-3 text-right">
        <span className="text-sm tabular-nums">{item.avgRR.toFixed(2)}R</span>
      </td>
      <td className="py-3 px-3 text-right hidden md:table-cell">
        <span className="text-sm tabular-nums">{fmtPnlValue ? fmtPnlValue(item.expectancy) : fmtMoney(item.expectancy, currency)}</span>
      </td>
      <td className="py-3 px-3 text-right hidden lg:table-cell">
        <span
          className={`text-sm tabular-nums ${
            item.profitFactor >= 1.5 ? "text-emerald-400" : item.profitFactor >= 1 ? "text-amber-400" : "text-rose-400"
          }`}
        >
          {item.profitFactor >= 999 ? "∞" : item.profitFactor.toFixed(2)}
        </span>
      </td>
    </tr>
  );
}

// Breakdown table
function BreakdownTable({ data, currency, onRowClick, fmtPnlValue }) {
  const [sort, setSort] = useState({ key: "netPnl", dir: "desc" });

  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const sorted = [...data].sort((a, b) => {
      const aVal = a[sort.key] ?? 0;
      const bVal = b[sort.key] ?? 0;
      const cmp = typeof aVal === "string" ? aVal.localeCompare(bVal) : aVal - bVal;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, sort]);

  const handleSort = (key) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  if (!data || data.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        <div className="text-xs">Появится после первых сделок</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/30 dark:border-white/[0.05]">
            <th className="py-2 px-3 text-left">
              <SortableHeader label="Name" sortKey="key" currentSort={sort} onSort={handleSort} />
            </th>
            <th className="py-2 px-3 text-right">
              <SortableHeader label="Trades" sortKey="trades" currentSort={sort} onSort={handleSort} />
            </th>
            <th className="py-2 px-3 text-right">
              <SortableHeader label="Net P&L" sortKey="netPnl" currentSort={sort} onSort={handleSort} />
            </th>
            <th className="py-2 px-3 text-right">
              <SortableHeader label="Win Rate" sortKey="winRate" currentSort={sort} onSort={handleSort} />
            </th>
            <th className="py-2 px-3 text-right">
              <SortableHeader label="Avg RR" sortKey="avgRR" currentSort={sort} onSort={handleSort} />
            </th>
            <th className="py-2 px-3 text-right hidden md:table-cell">
              <SortableHeader label="Expectancy" sortKey="expectancy" currentSort={sort} onSort={handleSort} />
            </th>
            <th className="py-2 px-3 text-right hidden lg:table-cell">
              <SortableHeader label="PF" sortKey="profitFactor" currentSort={sort} onSort={handleSort} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((item) => (
            <BreakdownRow
              key={item.key}
              item={item}
              currency={currency}
              onClick={() => onRowClick?.(item)}
              fmtPnlValue={fmtPnlValue}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardBreakdownTabs({ breakdowns, currency = "$", loading = false, onRowClick, pnlDisplayMode = "money", startingEquity = 0 }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("byPair");

  const activeData = breakdowns?.[activeTab] || [];
  const ActiveIcon = TABS.find((t) => t.id === activeTab)?.icon || Layers;

  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <Layers className="h-4 w-4 text-accent" />
            Performance Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[200px] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
          <ActiveIcon className="h-4 w-4 text-accent" />
          Performance Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border/30 dark:border-white/[0.05]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count = breakdowns?.[tab.id]?.length || 0;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-accent/10 text-foreground border border-[#3B82F6]/20 shadow-[0_1px_4px_rgba(59,130,246,0.06)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30 dark:hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums ${
                      isActive ? "bg-[#3B82F6]/15" : "bg-white/[0.04]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <BreakdownTable
              data={activeData}
              currency={currency}
              onRowClick={onRowClick}
              fmtPnlValue={pnlDisplayMode === "percent" && startingEquity > 0 
                ? (v) => fmtPnl(v, currency, "percent", startingEquity)
                : undefined
              }
            />
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
