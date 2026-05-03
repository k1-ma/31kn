import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TradeGalleryCard from "./TradeGalleryCard.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";
import { Calendar } from "lucide-react";

// Group trades by month
function groupByMonth(trades) {
  const groups = new Map();
  
  for (const trade of trades) {
    const date = trade.date ? new Date(`${trade.date}T00:00:00`) : null;
    let key = "Unknown";
    let sortKey = "0000-00";
    
    if (date && !isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = date.getMonth();
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      key = `${monthNames[month]} ${year}`;
      sortKey = `${year}-${String(month).padStart(2, "0")}`;
    }
    
    if (!groups.has(key)) {
      groups.set(key, { key, sortKey, trades: [] });
    }
    groups.get(key).trades.push(trade);
  }
  
  // Sort groups by date descending (newest first)
  return Array.from(groups.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/**
 * Responsive grid for gallery view of trades with month grouping
 * Mobile: 1-2 cols, Tablet: 2-3 cols, Desktop: 3-4 cols, Large: 4-6 cols
 */
export default function TradesGalleryGrid({
  trades,
  symById,
  accById,
  asAllocations,
  sanitizeAlloc,
  totalRR,
  sumPnL,
  fmtMixedPnL,
  inferOutcome,
  loading,
  onTradeClick,
  selectionMode,
  selectedTradeIds,
  onToggleSelect,
  reduceMotion,
  accounts,
  groupByDate = true, // New prop to enable/disable grouping
  noAccountLabel = "No account",
}) {
  // Group trades by month
  const groupedTrades = useMemo(() => {
    if (!groupByDate) return null;
    return groupByMonth(trades);
  }, [trades, groupByDate]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="gallery-card">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="p-4 space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-12" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 flex-1" />
              </div>
              <Skeleton className="h-6 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No trades found</p>
          <p className="text-sm mt-1">Try adjusting your filters</p>
        </div>
      </div>
    );
  }

  // Render helper for trade cards
  const renderTradeCard = (trade, idx) => {
    const sym = symById.get(trade.symbolId);
    const rawAllocs = asAllocations(trade, accounts).map(sanitizeAlloc);
    // For account display, filter to those with accounts
    const allocsWithAccount = rawAllocs.filter((a) => !!a.accountId);
    const firstAcc = allocsWithAccount.length ? accById.get(allocsWithAccount[0].accountId) : null;

    // For stats, use all allocations (including those without account)
    const rTotal = totalRR(rawAllocs, accById);
    const pnlText = fmtMixedPnL(rawAllocs, accById);
    const pnlTotal = sumPnL(rawAllocs);
    const outcome = trade.outcome || inferOutcome(pnlTotal);
    const isSelected = selectedTradeIds.includes(trade.id);

    // Skip entry animation for items beyond the first batch (perf optimization)
    const skipAnimation = reduceMotion || idx >= 20;

    return (
      <TradeGalleryCard
        key={trade.id}
        trade={trade}
        symbol={sym}
        account={firstAcc}
        totalRR={rTotal}
        totalPnL={pnlTotal}
        outcome={outcome}
        pnlText={pnlText}
        onClick={() => onTradeClick(trade)}
        isSelected={isSelected}
        selectionMode={selectionMode}
        onToggleSelect={onToggleSelect}
        reduceMotion={skipAnimation}
        index={idx}
        noAccountLabel={noAccountLabel}
      />
    );
  };

  // If grouping is enabled, render with month headers
  if (groupByDate && groupedTrades) {
    return (
      <div className="space-y-8">
        {groupedTrades.map((group, groupIdx) => (
          <motion.div
            key={group.key}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: groupIdx * 0.05 }}
          >
            {/* Month Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                <Calendar className="h-4 w-4" />
                {group.key}
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-accent/20 to-transparent" />
              <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-muted/30">
                {group.trades.length} trades
              </span>
            </div>
            
            {/* Trades Grid */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              <AnimatePresence initial={false}>
                {group.trades.map((trade, idx) => renderTradeCard(trade, idx))}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  // Original flat grid (no grouping)
  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
      <AnimatePresence initial={false}>
        {trades.map((trade, idx) => renderTradeCard(trade, idx))}
      </AnimatePresence>
    </div>
  );
}
