import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Image as ImageIcon, Check } from "lucide-react";
import { AvatarBubble } from "@/components/common/Avatar.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { fmtRR } from "@/lib/utils";

/**
 * Gallery card for a single trade with image preview
 */
export default function TradeGalleryCard({
  trade,
  symbol,
  account,
  totalRR,
  totalPnL,
  outcome,
  pnlText,
  onClick,
  isSelected,
  selectionMode,
  onToggleSelect,
  reduceMotion,
  index = 0,
  noAccountLabel = "No account",
}) {
  const images = Array.isArray(trade.images) ? trade.images : [];
  const hasImages = images.length > 0;
  const extraCount = Math.max(0, images.length - 1);

  const handleClick = (e) => {
    if (selectionMode) {
      e.stopPropagation();
      onToggleSelect?.(trade.id);
    } else {
      onClick?.();
    }
  };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.25, delay: Math.min(index * 0.03, 0.15) }}
      onClick={handleClick}
      className={`gallery-card cursor-pointer relative group ${isSelected ? "ring-2 ring-accent" : ""}`}
      style={trade.highlightColor ? { borderColor: trade.highlightColor + "66", boxShadow: `0 0 0 1px ${trade.highlightColor}33` } : undefined}
    >
      {/* Selection checkbox overlay */}
      {selectionMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(trade.id);
          }}
          className={`absolute top-3 left-3 z-10 h-6 w-6 rounded-lg border flex items-center justify-center transition-colors ${
            isSelected
              ? "border-accent bg-accent text-white"
              : "border-white/40 bg-black/40 hover:bg-accent/30"
          }`}
        >
          {isSelected && <Check className="h-4 w-4" />}
        </button>
      )}

      {/* Image Section */}
      <div className="gallery-card-image aspect-[4/3] relative">
        {hasImages ? (
          <>
            <img
              src={images[0]?.dataUrl}
              alt={images[0]?.title || "Trade screenshot"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {/* Extra images badge */}
            {extraCount > 0 && (
              <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/60 text-white text-xs font-medium flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                +{extraCount}
              </div>
            )}
          </>
        ) : (
          /* Placeholder when no images */
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-muted/40 to-muted/20">
            <AvatarBubble avatar={symbol?.avatar} color={symbol?.color} size={56} />
            <span className="mt-2 text-sm font-medium text-muted-foreground">
              {symbol?.name || "—"}
            </span>
          </div>
        )}

        {/* Direction indicator overlay on image */}
        <div className={`absolute bottom-3 left-3 px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wide flex items-center gap-1 shadow-[0_2px_8px_rgba(0,0,0,0.3)] ${
          trade.direction === "Long"
            ? "bg-emerald-500/90 text-white"
            : "bg-red-500/90 text-white"
        }`}>
          {trade.direction === "Long" ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {trade.direction?.toUpperCase() || "—"}
        </div>
      </div>

      {/* Info Section */}
      <div className="p-4">
        {/* Top row: Symbol & Date */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {hasImages && <AvatarBubble avatar={symbol?.avatar} color={symbol?.color} size={28} />}
            {!hasImages && <div className="w-7" />}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                {symbol?.name || "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                {trade.date}
              </div>
            </div>
          </div>
          {/* Outcome badge */}
          <Badge
            variant="outline"
            className={`shrink-0 text-xs ${
              outcome === "Profit"
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-500"
                : outcome === "Loss"
                ? "border-rose-400/40 bg-rose-400/10 text-red-500"
                : "border-amber-400/40 bg-amber-400/10 text-amber-500"
            }`}
          >
            {outcome === "Profit" ? "TP" : outcome === "Loss" ? "SL" : "BE"}
          </Badge>
        </div>

        {/* Metrics row */}
        <div className="flex items-center justify-between gap-2">
          {/* RR */}
          <div className="text-center px-3 py-1.5 rounded-lg bg-muted/30 dark:bg-white/[0.03] border border-white/[0.04] flex-1">
            <div className="text-[10px] uppercase text-dim font-medium tracking-wider">RR</div>
            <div className="text-sm font-bold tabular-nums">{fmtRR(totalRR)}</div>
          </div>
          {/* PnL */}
          <div className={`text-center px-3 py-1.5 rounded-lg flex-1 border ${
            totalPnL >= 0 ? "bg-emerald-500/6 border-emerald-500/10" : "bg-red-500/6 border-red-500/10"
          }`}>
            <div className="text-[10px] uppercase text-dim font-medium tracking-wider">PnL</div>
            <div className={`text-sm font-bold tabular-nums ${totalPnL >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {pnlText}
            </div>
          </div>
        </div>

        {/* Account tag */}
        {account ? (
          <div className="mt-3 pt-3 border-t border-accent/10">
            <div className="flex items-center gap-2">
              <AvatarBubble avatar={account.avatar} color={account.color} size={22} />
              <span className="text-xs text-muted-foreground truncate">{account.name}</span>
            </div>
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-accent/10">
            <Badge variant="outline" className="text-xs border-amber-400/40 bg-amber-400/10 text-amber-500">
              {noAccountLabel}
            </Badge>
          </div>
        )}
      </div>
    </motion.div>
  );
}
