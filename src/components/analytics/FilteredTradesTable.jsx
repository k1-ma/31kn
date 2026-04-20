/**
 * FilteredTradesTable - Premium table/list of filtered trades
 * Shows trades matching current filters with sorting and search
 */

import React, { useMemo, useState } from "react";
import {
  Search, SortAsc, SortDesc, Calendar, TrendingUp, TrendingDown,
  DollarSign, Target, FileText, Image, Link2, ChevronDown,
  ArrowUpDown, List, LayoutGrid
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { clampNum, fmtMoney, fmtRR } from "@/lib/utils";
import { AvatarBubble } from "@/components/common/Avatar.jsx";
import SessionBadge from "@/components/common/SessionBadge.jsx";

// Get total PnL from trade
function getTradePnl(trade) {
  const allocations = Array.isArray(trade?.allocations) ? trade.allocations : [];
  if (allocations.length > 0) {
    return allocations.reduce((s, a) => s + clampNum(a.pnl), 0);
  }
  return clampNum(trade?.pnl);
}

// Get total RR from trade
function getTradeRR(trade) {
  const allocations = Array.isArray(trade?.allocations) ? trade.allocations : [];
  if (allocations.length > 0) {
    return allocations.reduce((s, a) => s + clampNum(a.rr), 0);
  }
  return clampNum(trade?.rr);
}

// Single trade row component — memoized to avoid re-renders when sibling rows change
const TradeRow = React.memo(function TradeRow({ trade, symbolsById, sessionsById, accountsById, currency, onClick, reduceMotion, index }) {
  const symbol = symbolsById.get(trade.symbolId);
  const session = sessionsById.get(trade.sessionId);
  
  // Get primary account from allocations
  const allocations = Array.isArray(trade.allocations) ? trade.allocations : [];
  const primaryAccountId = allocations[0]?.accountId || trade.accountId;
  const primaryAccount = accountsById.get(primaryAccountId);
  
  const pnl = getTradePnl(trade);
  const rr = getTradeRR(trade);
  const isPositive = pnl >= 0;
  
  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  
  // Get notes snippet
  const notesSnippet = trade.notes 
    ? trade.notes.length > 60 ? trade.notes.slice(0, 60) + "..." : trade.notes
    : "";
  
  // Count attachments
  const imageCount = trade.images?.length || 0;
  const linkCount = trade.links?.length || 0;
  
  return (
    <tr
      onClick={() => onClick?.(trade)}
      className={`
        group cursor-pointer transition-colors duration-150
        border-b border-accent/5 last:border-b-0
        hover:bg-accent/5
        ${isPositive ? "hover:bg-emerald-500/5" : "hover:bg-rose-500/5"}
      `}
    >
      {/* Date */}
      <td className="px-3 py-3 text-sm text-muted-foreground whitespace-nowrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 opacity-50" />
          <span>{formatDate(trade.date)}</span>
          {trade.time && <span className="text-xs opacity-60">{trade.time}</span>}
        </div>
      </td>
      
      {/* Symbol */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          {symbol?.avatar && (
            typeof symbol.avatar === 'string' 
              ? <span className="text-sm">{symbol.avatar}</span>
              : symbol.avatar?.emoji 
                ? <span className="text-sm">{symbol.avatar.emoji}</span>
                : symbol.avatar?.imageData 
                  ? <img src={symbol.avatar.imageData} alt="" className="h-5 w-5 rounded object-cover" />
                  : null
          )}
          <span className="text-sm font-medium text-foreground">
            {symbol?.name || trade.pair || trade.symbol || "—"}
          </span>
        </div>
      </td>
      
      {/* Direction */}
      <td className="px-3 py-3">
        {trade.direction === "Long" ? (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-xs font-medium">
            <TrendingUp className="h-3 w-3" />
            Long
          </div>
        ) : trade.direction === "Short" ? (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 text-xs font-medium">
            <TrendingDown className="h-3 w-3" />
            Short
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      
      {/* Session */}
      <td className="px-3 py-3">
        {session ? (
          <SessionBadge name={session.name} reduceMotion={reduceMotion} />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      
      {/* Account */}
      <td className="px-3 py-3">
        {primaryAccount ? (
          <div className="flex items-center gap-1.5">
            <AvatarBubble avatar={primaryAccount.avatar} color={primaryAccount.color} size={20} />
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">
              {primaryAccount.name}
            </span>
            {allocations.length > 1 && (
              <span className="text-[10px] text-muted-foreground/60">+{allocations.length - 1}</span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      
      {/* PnL */}
      <td className="px-3 py-3 text-right">
        <span className={`text-sm font-semibold tabular-nums ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
          {isPositive ? "+" : ""}{fmtMoney(pnl, currency)}
        </span>
      </td>
      
      {/* RR */}
      <td className="px-3 py-3 text-center">
        <span className="text-sm text-foreground tabular-nums">{fmtRR(rr)}</span>
      </td>
      
      {/* Attachments */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          {imageCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Image className="h-3 w-3" />
              <span>{imageCount}</span>
            </div>
          )}
          {linkCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link2 className="h-3 w-3" />
              <span>{linkCount}</span>
            </div>
          )}
        </div>
      </td>
      
      {/* Notes snippet */}
      <td className="px-3 py-3 max-w-[200px]">
        {notesSnippet && (
          <p className="text-xs text-muted-foreground truncate">{notesSnippet}</p>
        )}
      </td>
    </tr>
  );
});

// Sort button component
function SortButton({ label, sortKey, currentSort, onSort }) {
  const isActive = currentSort.key === sortKey;
  
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`
        flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
        ${isActive 
          ? "bg-accent/15 text-accent" 
          : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
        }
      `}
    >
      {label}
      {isActive && (
        currentSort.direction === "desc" 
          ? <SortDesc className="h-3 w-3" />
          : <SortAsc className="h-3 w-3" />
      )}
    </button>
  );
}

export default function FilteredTradesTable({
  trades,
  accounts,
  libraries,
  currency = "$",
  onTradeClick,
  reduceMotion,
  maxHeight = "500px",
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  
  // Precompute lookup maps once — shared by all TradeRows
  const symbolsById = useMemo(() => new Map((libraries?.symbols || []).map(s => [s.id, s])), [libraries]);
  const sessionsById = useMemo(() => new Map((libraries?.sessions || []).map(s => [s.id, s])), [libraries]);
  const tagsById = useMemo(() => new Map((libraries?.customTags || []).map(t => [t.id, t])), [libraries]);
  const accountsById = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);

  // Filter trades by search
  const filteredTrades = useMemo(() => {
    if (!trades) return [];
    if (!search.trim()) return trades;
    
    const q = search.toLowerCase();
    
    return trades.filter(trade => {
      const symbol = symbolsById.get(trade.symbolId);
      const symbolName = (symbol?.name || trade.pair || trade.symbol || "").toLowerCase();
      const notes = (trade.notes || "").toLowerCase();
      const tags = (trade.tags || []).map((id) => tagsById.get(id)?.name || id).join(" ").toLowerCase();
      
      return symbolName.includes(q) || notes.includes(q) || tags.includes(q);
    });
  }, [trades, search, symbolsById, tagsById]);
  
  // Sort trades
  const sortedTrades = useMemo(() => {
    return [...filteredTrades].sort((a, b) => {
      let comparison = 0;
      
      switch (sortConfig.key) {
        case "date":
          comparison = String(a.date || "").localeCompare(String(b.date || ""));
          break;
        case "pnl":
          comparison = getTradePnl(a) - getTradePnl(b);
          break;
        case "rr":
          comparison = getTradeRR(a) - getTradeRR(b);
          break;
        default:
          comparison = 0;
      }
      
      return sortConfig.direction === "desc" ? -comparison : comparison;
    });
  }, [filteredTrades, sortConfig]);
  
  // Handle sort
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };
  
  return (
    <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/90 to-card/60 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-accent/15">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <List className="h-4 w-4 text-accent" />
              {t("pages.analyticsV2.filteredTrades.title")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sortedTrades.length} {t("pages.analyticsV2.filteredTrades.trades")}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("pages.analyticsV2.filteredTrades.search")}
                className="h-8 pl-8 pr-3 w-40 sm:w-52 rounded-lg bg-muted/30 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            
            {/* Sort buttons */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/30">
              <SortButton 
                label={t("pages.analyticsV2.filteredTrades.sortDate")} 
                sortKey="date" 
                currentSort={sortConfig} 
                onSort={handleSort} 
              />
              <SortButton 
                label={t("pages.analyticsV2.filteredTrades.sortPnl")} 
                sortKey="pnl" 
                currentSort={sortConfig} 
                onSort={handleSort} 
              />
              <SortButton 
                label={t("pages.analyticsV2.filteredTrades.sortRr")} 
                sortKey="rr" 
                currentSort={sortConfig} 
                onSort={handleSort} 
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Table */}
      {sortedTrades.length > 0 ? (
        <div className="overflow-x-auto" style={{ maxHeight }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card/98 border-b border-accent/15">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colDate")}
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colPair")}
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colDirection")}
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colSession")}
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colAccount")}
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colPnl")}
                </th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colRr")}
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colAttachments")}
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("pages.analyticsV2.filteredTrades.colNotes")}
                </th>
              </tr>
            </thead>
            <tbody>
                {sortedTrades.map((trade, idx) => (
                  <TradeRow
                    key={trade.id || idx}
                    trade={trade}
                    symbolsById={symbolsById}
                    sessionsById={sessionsById}
                    accountsById={accountsById}
                    currency={currency}
                    onClick={onTradeClick}
                    reduceMotion={reduceMotion}
                    index={idx}
                  />
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center">
          <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {search ? t("pages.analyticsV2.filteredTrades.noResults") : t("pages.analyticsV2.filteredTrades.noTrades")}
          </p>
        </div>
      )}
    </div>
  );
}
