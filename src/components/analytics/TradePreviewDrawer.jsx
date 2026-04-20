/**
 * TradePreviewDrawer - Slide-in drawer showing trade details
 * Premium haunted design with all trade information
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, ExternalLink, Calendar, Clock, TrendingUp, TrendingDown,
  Wallet, Target, DollarSign, FileText, Image, Link2, Tag,
  ChevronRight, AlertCircle, MinusCircle
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { clampNum, fmtMoney, fmtPct, fmtRR } from "@/lib/utils";
import { AvatarBubble } from "@/components/common/Avatar.jsx";
import SessionBadge from "@/components/common/SessionBadge.jsx";
import Button from "@/components/ui/Button.jsx";
import { isNoAccount } from "@/lib/noAccount.js";
import ImageLightbox from "@/components/common/ImageLightbox.jsx";

// Overlay backdrop
function Backdrop({ onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
    />
  );
}

// Detail row component
function DetailRow({ icon: Icon, label, value, className = "" }) {
  if (!value && value !== 0) return null;
  
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-accent/10 last:border-b-0 ${className}`}>
      <div className="shrink-0 h-8 w-8 rounded-lg bg-muted/40 flex items-center justify-center">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-sm font-medium text-foreground mt-0.5">{value}</div>
      </div>
    </div>
  );
}

// PnL indicator badge
function PnlBadge({ pnl, currency }) {
  const isPositive = pnl >= 0;
  return (
    <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
      isPositive 
        ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30" 
        : "bg-rose-500/15 text-rose-500 border border-rose-500/30"
    }`}>
      {isPositive ? "+" : ""}{fmtMoney(pnl, currency)}
    </div>
  );
}

// Photo thumbnail grid - uses trade.images array with {id, title, dataUrl} format
function PhotoGrid({ images, onImageClick }) {
  if (!images || images.length === 0) return null;
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
      {images.slice(0, 6).map((img, idx) => (
        <button
          key={img.id || idx}
          onClick={() => onImageClick?.(idx)}
          className="aspect-square rounded-lg overflow-hidden border border-accent/20 hover:border-accent/50 transition-colors hover:scale-[1.02] cursor-pointer"
        >
          <img 
            src={img.dataUrl} 
            alt={img.title || `Screenshot ${idx + 1}`}
            className="w-full h-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}

// Links list
function LinksList({ links }) {
  if (!links || links.length === 0) return null;
  
  return (
    <div className="space-y-2 mt-2">
      {links.map((link, idx) => (
        <a
          key={link.id || idx}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
        >
          <Link2 className="h-4 w-4 text-accent shrink-0" />
          <span className="text-sm text-foreground truncate flex-1">
            {link.name || link.title || link.url}
          </span>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
        </a>
      ))}
    </div>
  );
}

// Account allocations display
function AllocationsList({ allocations, accounts, currency, t }) {
  if (!allocations || allocations.length === 0) return null;
  
  const accountsById = new Map((accounts || []).map(a => [a.id, a]));
  
  return (
    <div className="space-y-2 mt-2">
      {allocations.map((alloc, idx) => {
        const acc = accountsById.get(alloc.accountId);
        const pnl = clampNum(alloc.pnl);
        const isPositive = pnl >= 0;
        const isAllocNoAccount = isNoAccount(alloc);
        
        return (
          <div 
            key={alloc.accountId || idx}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/20 border border-accent/10"
          >
            <div className="flex items-center gap-2 min-w-0">
              {isAllocNoAccount ? (
                <>
                  <div className="h-7 w-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <MinusCircle className="h-4 w-4 text-amber-500" />
                  </div>
                  <span className="text-sm font-medium truncate text-amber-500">
                    {t("pages.trades.editor.labels.noAccount")}
                  </span>
                </>
              ) : (
                <>
                  <AvatarBubble avatar={acc?.avatar} color={acc?.color} size={28} />
                  <span className="text-sm font-medium truncate">{acc?.name || acc?.id || "Account"}</span>
                </>
              )}
            </div>
            <div className={`text-sm font-semibold tabular-nums ${isPositive ? "text-emerald-500" : "text-rose-500"}`}>
              {isPositive ? "+" : ""}{fmtMoney(pnl, currency)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TradePreviewDrawer({
  trade,
  accounts,
  libraries,
  currency = "$",
  onClose,
  onOpenFullTrade,
  reduceMotion,
}) {
  const { t } = useI18n();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  const handleImageClick = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  
  if (!trade) return null;
  
  // Extract trade data
  const symbolsById = new Map((libraries?.symbols || []).map(s => [s.id, s]));
  const sessionsById = new Map((libraries?.sessions || []).map(s => [s.id, s]));
  const accountsById = new Map((accounts || []).map(a => [a.id, a]));
  
  const symbol = symbolsById.get(trade.symbolId);
  const session = sessionsById.get(trade.sessionId);
  
  // Get total PnL from allocations or direct pnl
  const allocations = Array.isArray(trade.allocations) ? trade.allocations : [];
  const totalPnl = allocations.length > 0 
    ? allocations.reduce((s, a) => s + clampNum(a.pnl), 0)
    : clampNum(trade.pnl);
  
  const totalRR = allocations.length > 0
    ? allocations.reduce((s, a) => s + clampNum(a.rr), 0)
    : clampNum(trade.rr);
  
  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { 
      weekday: "short",
      year: "numeric", 
      month: "short", 
      day: "numeric" 
    });
  };
  
  // Get direction icon
  const DirectionIcon = trade.direction === "Long" ? TrendingUp : TrendingDown;
  const directionColor = trade.direction === "Long" ? "text-emerald-500" : "text-rose-500";
  
  return (
    <AnimatePresence>
      {trade && (
        <>
          <Backdrop onClick={onClose} />
          
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-card border-l border-border/50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-accent/15 bg-gradient-to-r from-accent/5 to-transparent">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {symbol?.avatar && (
                      typeof symbol.avatar === 'string' 
                        ? <span className="text-lg">{symbol.avatar}</span>
                        : symbol.avatar?.emoji 
                          ? <span className="text-lg">{symbol.avatar.emoji}</span>
                          : symbol.avatar?.imageData 
                            ? <img src={symbol.avatar.imageData} alt="" className="h-6 w-6 rounded object-cover" />
                            : null
                    )}
                    <h2 className="text-lg font-bold text-foreground truncate">
                      {symbol?.name || trade.pair || trade.symbol || t("pages.analyticsV2.drawer.unknownPair")}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(trade.date)}</span>
                    {trade.time && <span>• {trade.time}</span>}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              {/* PnL + RR Summary */}
              <div className="flex items-center gap-3 mt-4">
                <PnlBadge pnl={totalPnl} currency={currency} />
                <div className="px-3 py-1.5 rounded-lg bg-muted/40 text-sm font-medium">
                  {fmtRR(totalRR)}
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 ${directionColor}`}>
                  <DirectionIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{trade.direction || "—"}</span>
                </div>
              </div>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Trade Details */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {t("pages.analyticsV2.drawer.tradeDetails")}
                </h3>
                
                <DetailRow 
                  icon={Calendar} 
                  label={t("pages.analyticsV2.drawer.date")} 
                  value={formatDate(trade.date)} 
                />
                <DetailRow 
                  icon={Clock} 
                  label={t("pages.analyticsV2.drawer.session")} 
                  value={session ? (
                    <SessionBadge name={session.name} reduceMotion={reduceMotion} />
                  ) : "—"}
                />
                <DetailRow 
                  icon={Target} 
                  label={t("pages.analyticsV2.drawer.risk")} 
                  value={trade.risk ? fmtMoney(trade.risk, currency) : "—"} 
                />
                <DetailRow 
                  icon={DollarSign} 
                  label={t("pages.analyticsV2.drawer.rr")} 
                  value={fmtRR(totalRR)} 
                />
              </section>
              
              {/* Account Allocations */}
              {allocations.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {t("pages.analyticsV2.drawer.allocations")}
                  </h3>
                  <AllocationsList allocations={allocations} accounts={accounts} currency={currency} t={t} />
                </section>
              )}
              
              {/* Tags */}
              {trade.tags && trade.tags.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    {t("pages.analyticsV2.drawer.tags")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {trade.tags.map((tagId, idx) => {
                      const tagObj = (libraries?.customTags || []).find((tg) => tg.id === tagId);
                      const tagName = tagObj?.name || tagId;
                      const tagColor = tagObj?.avatar?.color || tagObj?.color;
                      return (
                        <span 
                          key={idx}
                          className="px-2.5 py-1 rounded-full text-xs border"
                          style={tagColor ? { backgroundColor: tagColor + "22", borderColor: tagColor + "44", color: tagColor } : { backgroundColor: "rgb(var(--accent) / 0.15)", borderColor: "rgb(var(--accent) / 0.3)", color: "rgb(var(--accent))" }}
                        >
                          {tagObj?.avatar?.emoji ? <span className="mr-1">{tagObj.avatar.emoji}</span> : null}
                          {tagName}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}
              
              {/* Notes */}
              {trade.notes && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {t("pages.analyticsV2.drawer.notes")}
                  </h3>
                  <div className="p-3 rounded-xl bg-muted/20 border border-accent/10">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{trade.notes}</p>
                  </div>
                </section>
              )}
              
              {/* Comments */}
              {trade.comments && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {t("pages.analyticsV2.drawer.comments")}
                  </h3>
                  <div className="p-3 rounded-xl bg-muted/20 border border-accent/10">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{trade.comments}</p>
                  </div>
                </section>
              )}
              
              {/* Images */}
              {trade.images && trade.images.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Image className="h-3.5 w-3.5" />
                    {t("pages.analyticsV2.drawer.photos")} ({trade.images.length})
                  </h3>
                  <PhotoGrid images={trade.images} onImageClick={handleImageClick} />
                </section>
              )}
              
              {/* Links */}
              {trade.links && trade.links.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" />
                    {t("pages.analyticsV2.drawer.links")} ({trade.links.length})
                  </h3>
                  <LinksList links={trade.links} />
                </section>
              )}
            </div>
            
            {/* Footer - Open Full Trade button */}
            <div className="shrink-0 px-5 py-4 border-t border-accent/15 bg-gradient-to-r from-transparent to-accent/5">
              <Button 
                variant="default" 
                className="w-full rounded-xl"
                onClick={() => onOpenFullTrade?.(trade)}
              >
                <span>{t("pages.analyticsV2.drawer.openFullTrade")}</span>
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </motion.div>
          
          {/* Image Lightbox */}
          <ImageLightbox
            images={trade.images || []}
            initialIndex={lightboxIndex}
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
          />
        </>
      )}
    </AnimatePresence>
  );
}
