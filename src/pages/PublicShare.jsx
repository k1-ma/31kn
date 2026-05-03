import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { sanitizeRichText } from "@/lib/sanitize.js";

const sanitizeHtml = (html) => sanitizeRichText(html, "full");
import { motion, AnimatePresence } from "framer-motion";
import { fetchPublicShare } from "@/lib/share.js";
import { fmtMoney, fmtRR, sessionTone, clampNum } from "@/lib/utils";
import { Moon, Calendar, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, ExternalLink, Image, FileText, Star, Check, X, ChevronDown, ChevronUp, User, Link2, MessageSquare, BookOpen, Filter, LogIn, UserPlus, Lightbulb, Target, BarChart3, Activity, Flame, Zap, Award, Shield } from "lucide-react";
import hauntedLogo from "@/assets/haunted.png";
import Modal from "@/components/common/Modal.jsx";
import ImageLightbox from "@/components/common/ImageLightbox.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import Button from "@/components/ui/Button.jsx";
import ShareThemeToggle from "@/components/common/ShareThemeToggle.jsx";

/**
 * Get month key from date string
 */
function getMonthKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Format month key to readable label
 */
function formatMonthLabel(monthKey, locale = "en") {
  if (monthKey === "unknown" || !monthKey || !monthKey.includes("-")) return "Unknown";
  const [y, m] = monthKey.split("-");
  const year = Number(y);
  const month = Number(m);
  if (Number.isNaN(year) || Number.isNaN(month)) return "Unknown";
  const d = new Date(year, month - 1, 1);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString(locale, { month: "long", year: "numeric" });
}

/**
 * Symbol icon component for public view
 */
function SymbolIcon({ avatar, color, name, size = 32 }) {
  const bgColor = color || "#6366f1";
  const sizeClass = size === 32 ? "h-8 w-8" : size === 40 ? "h-10 w-10" : "h-8 w-8";
  const textSize = size === 32 ? "text-sm" : size === 40 ? "text-base" : "text-sm";
  
  return (
    <div 
      className={`${sizeClass} shrink-0 rounded-lg overflow-hidden flex items-center justify-center shadow-lg shadow-accent/5`}
      style={{ backgroundColor: bgColor }}
    >
      {avatar?.type === "emoji" ? (
        <span className={textSize}>{avatar.emoji}</span>
      ) : avatar?.imageData ? (
        <img src={avatar.imageData} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`${textSize} text-white font-bold`}>{(name || "?")[0]}</span>
      )}
    </div>
  );
}

/**
 * Session badge for public view
 */
function PublicSessionBadge({ name }) {
  const tone = sessionTone(name);
  const cls =
    tone === "green"
      ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
      : tone === "orange"
      ? "border border-amber-500/40 bg-amber-500/15 text-amber-500"
      : tone === "purple"
      ? "border border-violet-500/40 bg-violet-500/15 text-violet-500"
      : tone === "blue"
      ? "border border-blue-500/40 bg-blue-500/15 text-blue-500"
      : "border border-accent/20 bg-[#0B1220]/50";
  
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium uppercase tracking-wider ${cls}`}>
      {name || "—"}
    </span>
  );
}

/**
 * Trade detail modal for public view
 */
function TradeDetailModal({ trade, open, onClose }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedIdea, setSelectedIdea] = useState(null);
  
  const handleImageClick = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  
  if (!trade) return null;
  
  const pnl = clampNum(trade.pnl);
  const rr = clampNum(trade.rr);
  const isProfitable = pnl > 0;
  const isLoss = pnl < 0;
  
  const links = trade.links || [];
  const images = trade.images || [];
  
  // Note sections - only show if not empty
  const notesSections = [
    { label: "Comments", content: trade.comments, icon: MessageSquare },
    { label: "Position Notes", content: trade.positionNotes, icon: FileText },
    { label: "Notes", content: trade.notes, icon: FileText },
    { label: "Journal", content: trade.journal, icon: BookOpen },
  ].filter(s => s.content && s.content.trim().length > 0);
  
  // Extract domain from URL for fallback link title
  const getDomain = (url) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return "Link";
    }
  };
  
  return (
    <>
      <Modal open={open} onClose={onClose} title={trade.symbolName || "Trade Details"} size="lg">
        <div className="space-y-6">
          {/* Trade Header Info */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-accent/10">
            <div className="flex items-center gap-3">
              <SymbolIcon 
                avatar={trade.symbolAvatar} 
                color={trade.symbolColor} 
                name={trade.symbolName}
                size={40}
              />
              <div className="text-lg font-semibold tracking-tight">{trade.symbolName}</div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                trade.direction === "Long" 
                  ? "bg-emerald-500/15 text-emerald-500" 
                  : "bg-red-500/15 text-red-500"
              }`}>
                {trade.direction === "Long" ? <ArrowUpRight className="inline h-3 w-3 mr-0.5" /> : <ArrowDownRight className="inline h-3 w-3 mr-0.5" />}
                {trade.direction?.toUpperCase() || "—"}
              </span>
              <PublicSessionBadge name={trade.sessionName} />
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {trade.date || "—"}
              </div>
            </div>
          </div>
          
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted/30 p-3 text-center glass">
              <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">RR</div>
              <div className="text-lg font-bold">{fmtRR(rr)}</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3 text-center glass">
              <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">PnL</div>
              <div className={`text-lg font-bold flex items-center justify-center gap-1 ${
                isProfitable ? "text-emerald-500" : isLoss ? "text-red-500" : "text-amber-500"
              }`}>
                {isProfitable ? <TrendingUp className="h-4 w-4" /> : isLoss ? <TrendingDown className="h-4 w-4" /> : null}
                {fmtMoney(pnl)}
              </div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3 text-center glass">
              <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Outcome</div>
              <div className={`text-sm font-semibold ${
                isProfitable ? "text-emerald-500" : isLoss ? "text-red-500" : "text-amber-500"
              }`}>
                {trade.outcome || (isProfitable ? "Profit" : isLoss ? "Loss" : "BE")}
              </div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3 text-center glass">
              <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Flags</div>
              <div className="flex items-center justify-center gap-1.5">
                {trade.bestTrade && <Star className="h-4 w-4 text-amber-500" title="Best Trade" />}
                {trade.followPlan && <Check className="h-4 w-4 text-emerald-500" title="Followed Plan" />}
                {!trade.bestTrade && !trade.followPlan && <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
          </div>
          
          {/* Photos Section */}
          {images.length > 0 && (
            <div className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
              <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Image className="h-4 w-4 text-accent" />
                  Photos ({images.length})
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => handleImageClick(i)}
                      className="group relative aspect-video rounded-xl overflow-hidden border border-accent/15 hover:border-accent/40 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/10"
                    >
                      <img 
                        src={img.dataUrl} 
                        alt={img.title || "Trade image"} 
                        className="h-full w-full object-cover"
                      />
                      {img.title && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-white text-xs font-medium truncate">{img.title}</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Links Section */}
          {links.length > 0 && (
            <div className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
              <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-4 w-4 text-accent" />
                  Links ({links.length})
                </div>
              </div>
              <div className="p-4 space-y-2">
                {links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 hover:bg-accent/10 border border-transparent hover:border-accent/20 transition-all group"
                  >
                    <ExternalLink className="h-4 w-4 text-accent shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-medium truncate">
                      {link.title || getDomain(link.url)}
                    </span>
                    <span className="text-xs text-muted-foreground truncate ml-auto hidden sm:block max-w-[200px]">
                      {link.url}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {/* Linked Documents Section */}
          {trade.linkedDocuments && trade.linkedDocuments.length > 0 && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 glass overflow-hidden">
              <div className="px-4 py-3 border-b border-blue-500/10 bg-gradient-to-r from-transparent via-blue-500/5 to-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-blue-400" />
                  Related Documents ({trade.linkedDocuments.length})
                </div>
              </div>
              <div className="p-4 space-y-2">
                {trade.linkedDocuments.map((doc, i) => (
                  <button
                    key={doc.id || i}
                    onClick={() => setSelectedDoc(doc)}
                    className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-muted/20 border border-transparent hover:border-blue-500/30 hover:bg-blue-500/10 transition-all text-left cursor-pointer group"
                  >
                    <FileText className="h-4 w-4 text-blue-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate group-hover:text-blue-400 transition-colors">{doc.title}</span>
                        <span className="text-[10px] uppercase text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                          {(doc.type || "note").replace(/_/g, ' ')}
                        </span>
                      </div>
                      {doc.contentText && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {doc.contentText}
                        </p>
                      )}
                      <span className="text-[10px] text-blue-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to view full document →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Linked Trading Ideas Section */}
          {trade.linkedIdeas && trade.linkedIdeas.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 glass overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-500/10 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  Trading Ideas ({trade.linkedIdeas.length})
                </div>
              </div>
              <div className="p-4 space-y-3">
                {trade.linkedIdeas.map((idea, i) => {
                  const resultColor = idea.result === "Worked" ? "text-emerald-400 bg-emerald-500/10"
                    : idea.result === "Failed" ? "text-red-400 bg-red-500/10"
                    : idea.result === "Partial" ? "text-amber-400 bg-amber-500/10"
                    : "text-slate-400 bg-slate-500/10";
                  return (
                    <button
                      key={idea.id || i}
                      onClick={() => setSelectedIdea(idea)}
                      className="w-full rounded-xl bg-muted/20 border border-accent/10 overflow-hidden hover:border-amber-500/30 hover:bg-amber-500/10 transition-all text-left cursor-pointer group"
                    >
                      <div className="flex items-start gap-3 px-4 py-3">
                        <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium truncate group-hover:text-amber-400 transition-colors">{idea.title}</span>
                            <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${resultColor}`}>
                              {idea.result || "Unknown"}
                            </span>
                            {idea.pair && (
                              <span className="text-[10px] text-muted-foreground">
                                {idea.pair}
                              </span>
                            )}
                          </div>
                          {idea.notesText && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {idea.notesText}
                            </p>
                          )}
                          {/* Idea tags */}
                          {idea.tags && idea.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {idea.tags.slice(0, 5).map((tag, ti) => (
                                <span key={ti} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-muted-foreground">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Image/link indicators */}
                          <div className="flex items-center gap-2 mt-1">
                            {idea.images && idea.images.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                📷 {idea.images.length}
                              </span>
                            )}
                            {idea.links && idea.links.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                🔗 {idea.links.length}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-amber-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            Click to view full idea →
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Notes Sections */}
          {notesSections.map((section, i) => {
            const IconComponent = section.icon;
            return (
              <div key={i} className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
                <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <IconComponent className="h-4 w-4 text-accent" />
                    {section.label}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </p>
                </div>
              </div>
            );
          })}
          
          {/* Empty state if no extra details */}
          {images.length === 0 && links.length === 0 && notesSections.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No additional details for this trade.</p>
            </div>
          )}
        </div>
      </Modal>
      
      {/* Image Lightbox */}
      <ImageLightbox
        images={images}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
      
      {/* Document Detail Modal */}
      <DocumentDetailModal
        doc={selectedDoc}
        open={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />
      
      {/* Idea Detail Modal */}
      <IdeaDetailModal
        idea={selectedIdea}
        open={!!selectedIdea}
        onClose={() => setSelectedIdea(null)}
      />
    </>
  );
}

/**
 * Single trade card for public view - clickable to show details
 */
function PublicTradeCard({ trade, onClick }) {
  const pnl = clampNum(trade.pnl);
  const rr = clampNum(trade.rr);
  const isProfitable = pnl > 0;
  const isLoss = pnl < 0;
  
  const links = trade.links || [];
  const images = trade.images || [];
  const hasNotes = trade.notes || trade.positionNotes || trade.comments || trade.journal;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="rounded-xl border border-accent/15 bg-card/80 glass premium-panel overflow-hidden hover:shadow-lg hover:shadow-accent/10 transition-all duration-300 cursor-pointer hover:border-accent/30 group"
    >
      {/* Card Header */}
      <div className="p-4 sm:p-5 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Symbol icon */}
            <SymbolIcon 
              avatar={trade.symbolAvatar} 
              color={trade.symbolColor} 
              name={trade.symbolName}
              size={32}
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight">{trade.symbolName}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  trade.direction === "Long" 
                    ? "bg-emerald-500/15 text-emerald-500" 
                    : "bg-red-500/15 text-red-500"
                }`}>
                  {trade.direction === "Long" ? <ArrowUpRight className="inline h-3 w-3 mr-0.5" /> : <ArrowDownRight className="inline h-3 w-3 mr-0.5" />}
                  {trade.direction?.toUpperCase() || "—"}
                </span>
                <PublicSessionBadge name={trade.sessionName} />
              </div>
            </div>
          </div>
          
          {/* Flags */}
          <div className="flex items-center gap-1.5 shrink-0">
            {trade.bestTrade && (
              <div className="h-7 w-7 rounded-lg bg-amber-500/15 flex items-center justify-center" title="Best Trade">
                <Star className="h-4 w-4 text-amber-500" />
              </div>
            )}
            {trade.followPlan && (
              <div className="h-7 w-7 rounded-lg bg-emerald-500/15 flex items-center justify-center" title="Followed Plan">
                <Check className="h-4 w-4 text-emerald-500" />
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Card Body */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* Date and Result Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {trade.date || "—"}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Outcome Badge */}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              isProfitable
                ? "bg-emerald-500/15 text-emerald-500" 
                : isLoss
                ? "bg-red-500/15 text-red-500"
                : "bg-amber-500/15 text-amber-500"
            }`}>
              {trade.outcome || (isProfitable ? "Profit" : isLoss ? "Loss" : "BE")}
            </span>
          </div>
        </div>
        
        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/30 p-3 text-center">
            <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">RR</div>
            <div className="text-lg font-bold">{fmtRR(rr)}</div>
          </div>
          <div className="rounded-xl bg-muted/30 p-3 text-center">
            <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">PnL</div>
            <div className={`text-lg font-bold flex items-center justify-center gap-1 ${
              isProfitable ? "text-emerald-500" : isLoss ? "text-red-500" : "text-amber-500"
            }`}>
              {isProfitable ? <TrendingUp className="h-4 w-4" /> : isLoss ? <TrendingDown className="h-4 w-4" /> : null}
              {fmtMoney(pnl)}
            </div>
          </div>
        </div>
        
        {/* Indicators for additional content */}
        <div className="flex flex-wrap gap-2">
          {images.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 text-xs text-accent font-medium">
              <Image className="h-3 w-3" />
              {images.length} photo{images.length !== 1 ? "s" : ""}
            </span>
          )}
          {links.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 text-xs text-accent font-medium">
              <ExternalLink className="h-3 w-3" />
              {links.length} link{links.length !== 1 ? "s" : ""}
            </span>
          )}
          {trade.linkedDocuments && trade.linkedDocuments.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-xs text-blue-400 font-medium">
              <FileText className="h-3 w-3" />
              {trade.linkedDocuments.length} plan{trade.linkedDocuments.length !== 1 ? "s" : ""}
            </span>
          )}
          {hasNotes && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 text-xs text-accent font-medium">
              <FileText className="h-3 w-3" />
              Notes
            </span>
          )}
        </div>
        
        {/* Click to view hint */}
        <div className="text-center">
          <span className="text-xs text-muted-foreground group-hover:text-accent transition-colors">
            Click to view details
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Document detail modal for public view (when viewing linked document from a shared trade)
 */
function DocumentDetailModal({ doc, open, onClose }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  if (!doc) return null;
  
  const docType = doc.type || "note";
  const images = doc.images || [];
  
  const handleImageClick = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  
  return (
    <>
      <Modal open={open} onClose={onClose} title={doc.title || "Document"} size="lg">
        <div className="space-y-6">
          {/* Header with type badge */}
          <div className="flex items-center gap-3 pb-4 border-b border-accent/10">
            <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold">{doc.title || "Untitled Document"}</h3>
              <span className="text-xs uppercase text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                {docType.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          
          {/* Content */}
          {(doc.contentHtml || doc.contentText) && (
            <div className="rounded-xl bg-muted/20 p-4 border border-accent/10">
              {doc.contentHtml ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(doc.contentHtml) }}
                />
              ) : (
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                  {doc.contentText}
                </p>
              )}
            </div>
          )}
          
          {/* Images */}
          {images.length > 0 && (
            <div className="rounded-2xl border border-accent/15 bg-card/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Image className="h-4 w-4 text-accent" />
                  Images ({images.length})
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => handleImageClick(i)}
                    className="group relative aspect-video rounded-xl overflow-hidden border border-accent/15 hover:border-accent/40 transition-all"
                  >
                    <img 
                      src={img.dataUrl} 
                      alt={img.title || "Document image"} 
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
      
      {/* Image Lightbox */}
      {images.length > 0 && (
        <ImageLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          images={images.map(img => ({ src: img.dataUrl, title: img.title }))}
          currentIndex={lightboxIndex}
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}

/**
 * Trading Idea detail modal for public view (when viewing linked idea from a shared trade)
 */
function IdeaDetailModal({ idea, open, onClose }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  if (!idea) return null;
  
  const images = idea.images || [];
  const links = idea.links || [];
  const tags = idea.tags || [];
  
  const resultColor = idea.result === "Worked" ? "text-emerald-400 bg-emerald-500/10"
    : idea.result === "Failed" ? "text-red-400 bg-red-500/10"
    : idea.result === "Partial" ? "text-amber-400 bg-amber-500/10"
    : "text-slate-400 bg-slate-500/10";
  
  const dirStyle = idea.direction === "Long" 
    ? { color: "text-emerald-400", bg: "bg-emerald-500/15" }
    : idea.direction === "Short"
    ? { color: "text-red-400", bg: "bg-red-500/15" }
    : { color: "text-blue-400", bg: "bg-blue-500/15" };
  
  const handleImageClick = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  
  return (
    <>
      <Modal open={open} onClose={onClose} title={idea.title || "Trading Idea"} size="lg">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start gap-3 pb-4 border-b border-accent/10">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Lightbulb className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{idea.title || "Untitled Idea"}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {idea.pair && (
                  <span className="text-xs text-muted-foreground font-medium">
                    {idea.pair}
                  </span>
                )}
                {idea.direction && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dirStyle.bg} ${dirStyle.color}`}>
                    {idea.direction}
                  </span>
                )}
                <span className={`text-xs uppercase px-2 py-0.5 rounded ${resultColor}`}>
                  {idea.result || "Unknown"}
                </span>
                {idea.timeframe && (
                  <span className="text-xs text-muted-foreground">
                    {idea.timeframe}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-lg bg-accent/10 text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
          
          {/* Notes */}
          {(idea.notesHtml || idea.notesText) && (
            <div className="rounded-xl bg-muted/20 p-4 border border-accent/10">
              {idea.notesHtml ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(idea.notesHtml) }}
                />
              ) : (
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                  {idea.notesText}
                </p>
              )}
            </div>
          )}
          
          {/* Images */}
          {images.length > 0 && (
            <div className="rounded-2xl border border-accent/15 bg-card/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Image className="h-4 w-4 text-accent" />
                  Screenshots ({images.length})
                </div>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => handleImageClick(i)}
                    className="group relative aspect-video rounded-xl overflow-hidden border border-accent/15 hover:border-accent/40 transition-all"
                  >
                    <img 
                      src={img.dataUrl} 
                      alt={img.title || "Idea screenshot"} 
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Links */}
          {links.length > 0 && (
            <div className="rounded-2xl border border-accent/15 bg-card/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-4 w-4 text-accent" />
                  Links ({links.length})
                </div>
              </div>
              <div className="p-4 space-y-2">
                {links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 hover:bg-accent/10 border border-transparent hover:border-accent/20 transition-all group"
                  >
                    <ExternalLink className="h-4 w-4 text-accent shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {link.label || link.title || link.url}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
      
      {/* Image Lightbox */}
      {images.length > 0 && (
        <ImageLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          images={images.map(img => ({ src: img.dataUrl, title: img.title }))}
          currentIndex={lightboxIndex}
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}

/**
 * 404 / Not Found State
 */
function NotFoundState() {
  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative text-center max-w-md"
      >
        <div className="h-20 w-20 mx-auto mb-6 rounded-xl bg-gradient-to-br from-accent/20 to-accent-2/20 flex items-center justify-center shadow-lg shadow-accent/10">
          <img src={hauntedLogo} alt="Haunted" className="h-10 w-10 object-contain drop-shadow" />
        </div>
        <h1 className="text-2xl font-bold mb-3 gradient-text">Link not found</h1>
        <p className="text-muted-foreground mb-6">
          This share link doesn't exist or has expired.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent to-accent-2 text-white font-semibold shadow-lg shadow-accent/20 hover:brightness-110 transition"
        >
          Go to Haunted
        </Link>
      </motion.div>
    </div>
  );
}

/**
 * Public Share Page
 * Displays shared trades in a read-only view
 */
export default function PublicShare() {
  const { shareId } = useParams();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [monthFilter, setMonthFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    
    async function loadShare() {
      try {
        const data = await fetchPublicShare(shareId);
        if (cancelled) return;
        
        // Check that this is a trade share and has trades data
        if (data && data.type === "trade" && data.payload?.trades && data.payload.trades.length > 0) {
          // Map API response to expected bundle format
          setBundle({
            id: data.id,
            trades: data.payload.trades,
            tradeIds: data.payload.tradeIds || [],
            authorName: data.authorName || data.payload.authorName,
            title: data.title,
            createdAt: data.createdAt,
            includeAnalytics: !!data.payload.includeAnalytics,
          });
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error("Failed to fetch share:", err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    
    loadShare();
    return () => { cancelled = true; };
  }, [shareId]);

  // Get list of months for filter
  const months = useMemo(() => {
    if (!bundle?.trades) return [];
    const keys = new Set(bundle.trades.map(t => getMonthKey(t.date)));
    return Array.from(keys).sort((a, b) => b.localeCompare(a)); // newest first
  }, [bundle?.trades]);

  // Filter and sort trades
  const visibleTrades = useMemo(() => {
    if (!bundle?.trades) return [];
    const list = monthFilter === "all"
      ? bundle.trades
      : bundle.trades.filter(t => getMonthKey(t.date) === monthFilter);

    return [...list].sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : null;
      const dateB = b.date ? new Date(b.date) : null;
      const da = dateA && !Number.isNaN(dateA.getTime()) ? dateA.getTime() : 0;
      const db = dateB && !Number.isNaN(dateB.getTime()) ? dateB.getTime() : 0;
      return db - da; // newest first
    });
  }, [bundle?.trades, monthFilter]);

  // Group trades by month (for "all" view)
  const groupedTrades = useMemo(() => {
    const map = new Map();
    visibleTrades.forEach(t => {
      const key = getMonthKey(t.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visibleTrades]);

  // Detailed analytics (same as backtest share)
  // Must be before conditional returns to respect React's Rules of Hooks
  const analyticsStats = useMemo(() => {
    if (!bundle?.includeAnalytics) return null;
    const total = visibleTrades.length;
    if (total === 0) return null;
    const w = visibleTrades.filter(t => clampNum(t.pnl) > 0);
    const l = visibleTrades.filter(t => clampNum(t.pnl) < 0);
    const winCount = w.length;
    const lossCount = l.length;
    const wr = Math.round((winCount / total) * 100);
    const pnl = visibleTrades.reduce((s, t) => s + clampNum(t.pnl), 0);
    const rr  = visibleTrades.reduce((s, t) => s + clampNum(t.rr), 0);
    const gP  = w.reduce((s, t) => s + clampNum(t.pnl), 0);
    const gL  = Math.abs(l.reduce((s, t) => s + clampNum(t.pnl), 0));
    const pf  = gL > 0 ? (gP / gL).toFixed(2) : "∞";
    const aRR = (rr / total).toFixed(2);
    const avgWin  = winCount > 0 ? gP / winCount : 0;
    const avgLoss = lossCount > 0 ? gL / lossCount : 0;
    const payoff  = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : winCount > 0 ? "∞" : "—";
    const expectancy = total > 0 ? ((wr / 100) * avgWin - (1 - wr / 100) * avgLoss).toFixed(2) : 0;

    // best / worst trade
    const sorted = [...visibleTrades].sort((a, b) => clampNum(b.pnl) - clampNum(a.pnl));
    const best  = sorted[0]  ? clampNum(sorted[0].pnl)  : 0;
    const worst = sorted.at(-1) ? clampNum(sorted.at(-1).pnl) : 0;

    // streaks
    let maxW = 0, maxL = 0, curW = 0, curL = 0;
    const chronological = [...visibleTrades].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });
    for (const t of chronological) {
      if (clampNum(t.pnl) > 0) { curW++; curL = 0; maxW = Math.max(maxW, curW); }
      else if (clampNum(t.pnl) < 0) { curL++; curW = 0; maxL = Math.max(maxL, curL); }
      else { curW = 0; curL = 0; }
    }

    // max drawdown
    let peak = 0;
    let equity = 0;
    let dd = 0;
    for (const t of chronological) {
      equity += clampNum(t.pnl);
      if (equity > peak) peak = equity;
      const cur = peak - equity;
      if (cur > dd) dd = cur;
    }

    return {
      total, winCount, lossCount, wr, pnl, aRR, pf, payoff,
      expectancy: Number(expectancy), best, worst,
      maxWinStreak: maxW, maxLossStreak: maxL, maxDrawdown: dd,
      avgWin, avgLoss, grossProfit: gP, grossLoss: gL,
    };
  }, [visibleTrades, bundle?.includeAnalytics]);

  if (loading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (notFound || !bundle) {
    return <NotFoundState />;
  }

  const trades = bundle.trades || [];
  const createdDate = bundle.createdAt ? new Date(bundle.createdAt).toLocaleDateString() : "";
  const authorName = bundle.authorName || null;

  // Stats based on visible trades
  const totalPnl = visibleTrades.reduce((sum, t) => sum + clampNum(t.pnl), 0);
  const totalRR = visibleTrades.reduce((sum, t) => sum + clampNum(t.rr), 0);
  const wins = visibleTrades.filter((t) => clampNum(t.pnl) > 0).length;
  const winRate = visibleTrades.length ? ((wins / visibleTrades.length) * 100).toFixed(0) : 0;

  return (
    <div className="min-h-screen app-bg">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
      
      {/* Header */}
      <header className="relative border-b border-accent/15 bg-card/50 glass backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-accent/20 to-accent-2/20 flex items-center justify-center shadow-lg shadow-accent/10">
              <img src={hauntedLogo} alt="Haunted" className="h-7 w-7 object-contain drop-shadow" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {bundle.title || "Shared Trades"}
              </h1>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-0.5">
                {authorName && (
                  <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span>Shared by <span className="font-medium text-foreground">{authorName}</span></span>
                  </p>
                )}
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
                  {authorName && <span className="hidden sm:inline text-accent/40">•</span>}
                  <Moon className="h-3.5 w-3.5" />
                  Read-only • Haunted edition
                  {createdDate && <span className="hidden sm:inline">• {createdDate}</span>}
                </p>
              </div>
            </div>
            <ShareThemeToggle />
          </div>
        </div>
      </header>
      
      {/* Content */}
      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

        {/* Analytics Stats (detailed, like backtest share) */}
        {analyticsStats ? (
          <div className="mb-8 space-y-4">
            {/* Hero stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Net PnL */}
              <div className={`relative overflow-hidden rounded-2xl border p-4 glass ${
                analyticsStats.pnl >= 0
                  ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                  : "border-red-500/20 bg-red-500/[0.06]"
              }`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${
                  analyticsStats.pnl >= 0 ? "from-emerald-500/10 to-transparent" : "from-red-500/10 to-transparent"
                }`} />
                <div className="relative">
                  <div className="flex items-center gap-1.5 mb-1">
                    {analyticsStats.pnl >= 0
                      ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Net PnL</span>
                  </div>
                  <div className={`text-xl sm:text-2xl font-bold tabular-nums ${analyticsStats.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {fmtMoney(analyticsStats.pnl)}
                  </div>
                </div>
              </div>

              {/* Win Rate */}
              <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-card/60 p-4 glass">
                <div className="flex items-center gap-1.5 mb-1">
                  <Target className="h-3.5 w-3.5 text-accent/60" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Win Rate</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">{analyticsStats.wr}%</div>
                <div className="mt-2 h-2 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                    style={{ width: `${analyticsStats.wr}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                  <span className="text-emerald-500">{analyticsStats.winCount}W</span>
                  <span className="text-red-500">{analyticsStats.lossCount}L</span>
                </div>
              </div>

              {/* Total Trades */}
              <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-card/60 p-4 glass">
                <div className="flex items-center gap-1.5 mb-1">
                  <BarChart3 className="h-3.5 w-3.5 text-accent/60" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Trades</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">{analyticsStats.total}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                    <ArrowUpRight className="h-3 w-3" />{analyticsStats.winCount}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
                    <ArrowDownRight className="h-3 w-3" />{analyticsStats.lossCount}
                  </span>
                  {analyticsStats.total - analyticsStats.winCount - analyticsStats.lossCount > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {analyticsStats.total - analyticsStats.winCount - analyticsStats.lossCount} Break Even
                    </span>
                  )}
                </div>
              </div>

              {/* Profit Factor */}
              <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-card/60 p-4 glass">
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity className="h-3.5 w-3.5 text-accent/60" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Profit Factor</span>
                </div>
                <div className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">{analyticsStats.pf}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtMoney(analyticsStats.grossProfit)} / {fmtMoney(analyticsStats.grossLoss)}
                </div>
              </div>
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { label: "Avg RR", value: analyticsStats.aRR, icon: Target, color: "text-accent" },
                { label: "Expectancy", value: fmtMoney(analyticsStats.expectancy), icon: Zap, color: analyticsStats.expectancy >= 0 ? "text-emerald-500" : "text-red-500" },
                { label: "Payoff Ratio", value: analyticsStats.payoff, icon: Award, color: "text-amber-500" },
                { label: "Best Trade", value: fmtMoney(analyticsStats.best), icon: ChevronUp, color: "text-emerald-500" },
                { label: "Worst Trade", value: fmtMoney(analyticsStats.worst), icon: ChevronDown, color: "text-red-500" },
                { label: "Drawdown", value: fmtMoney(analyticsStats.maxDrawdown), icon: Shield, color: "text-red-500" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl border border-accent/10 bg-card/40 px-3 py-2.5 glass text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Icon className={`h-3 w-3 ${color}`} />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Streaks */}
            {(analyticsStats.maxWinStreak > 0 || analyticsStats.maxLossStreak > 0) && (
              <div className="flex flex-wrap items-center gap-3">
                {analyticsStats.maxWinStreak > 0 && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] glass">
                    <Flame className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-semibold text-emerald-500">{analyticsStats.maxWinStreak}</span>
                    <span className="text-[11px] text-emerald-500/70">win streak</span>
                  </div>
                )}
                {analyticsStats.maxLossStreak > 0 && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] glass">
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs font-semibold text-red-500">{analyticsStats.maxLossStreak}</span>
                    <span className="text-[11px] text-red-500/70">loss streak</span>
                  </div>
                )}
                {monthFilter !== "all" && trades.length !== visibleTrades.length && (
                  <span className="text-xs text-muted-foreground">Filtered: {visibleTrades.length} of {trades.length} trades</span>
                )}
              </div>
            )}
          </div>
        ) : (
        /* Simple Stats Bar (fallback when analytics not included) */
        <div className="mb-6 p-4 rounded-2xl border border-accent/15 bg-card/60 glass">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Showing </span>
              <span className="font-semibold text-foreground">{visibleTrades.length} trade{visibleTrades.length !== 1 ? "s" : ""}</span>
              {monthFilter !== "all" && trades.length !== visibleTrades.length && (
                <span className="text-muted-foreground"> of {trades.length}</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Total PnL: </span>
                <span className={`font-semibold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {fmtMoney(totalPnl)}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Total RR: </span>
                <span className="font-semibold text-foreground">{fmtRR(totalRR)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Win Rate: </span>
                <span className="font-semibold text-foreground">{winRate}%</span>
              </div>
            </div>
          </div>
        </div>
        )}
        
        {/* Month Filter */}
        {months.length > 1 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filter by month</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMonthFilter("all")}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  monthFilter === "all"
                    ? "bg-accent/20 border-accent/30 text-accent shadow-lg shadow-accent/10"
                    : "bg-card/50 border-accent/10 text-muted-foreground hover:border-accent/20 hover:text-foreground"
                }`}
              >
                All months
              </button>
              {months.map((monthKey) => (
                <button
                  key={monthKey}
                  onClick={() => setMonthFilter(monthKey)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                    monthFilter === monthKey
                      ? "bg-accent/20 border-accent/30 text-accent shadow-lg shadow-accent/10"
                      : "bg-card/50 border-accent/10 text-muted-foreground hover:border-accent/20 hover:text-foreground"
                  }`}
                >
                  {formatMonthLabel(monthKey)}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Trade Cards - Grouped or Flat */}
        {monthFilter === "all" && months.length > 1 ? (
          // Grouped by month
          <div className="space-y-8">
            {groupedTrades.map(([monthKey, monthTrades]) => (
              <div key={monthKey}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-accent/30 to-transparent" />
                  <h2 className="text-sm font-semibold text-accent tracking-wide uppercase">
                    {formatMonthLabel(monthKey)}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    ({monthTrades.length} trade{monthTrades.length !== 1 ? "s" : ""})
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-accent/30 to-transparent" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                  {monthTrades.map((trade, index) => (
                    <motion.div
                      key={trade.id || index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <PublicTradeCard trade={trade} onClick={() => setSelectedTrade(trade)} />
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Flat list
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {visibleTrades.map((trade, index) => (
              <motion.div
                key={trade.id || index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <PublicTradeCard trade={trade} onClick={() => setSelectedTrade(trade)} />
              </motion.div>
            ))}
          </div>
        )}
        
        {/* Empty state when filtered */}
        {visibleTrades.length === 0 && (
          <div className="text-center py-16">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">No trades found for this period.</p>
            <button
              onClick={() => setMonthFilter("all")}
              className="mt-4 text-sm text-accent hover:underline"
            >
              Show all months
            </button>
          </div>
        )}
        
        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-accent/10 text-center space-y-4">
          {/* CTA to create own journal */}
          <div className="bg-card/50 border border-accent/20 rounded-2xl p-4 mx-auto max-w-md">
            <p className="text-sm text-foreground mb-3">
              Want to track your own trades?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/register">
                <Button size="sm" className="gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  Create account
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <LogIn className="h-4 w-4" />
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-accent">Haunted</span> — Trading Journal
          </p>
          <SocialLinks variant="pill" />
        </footer>
        </motion.div>
      </main>
      
      {/* Trade Detail Modal */}
      <TradeDetailModal 
        trade={selectedTrade} 
        open={!!selectedTrade} 
        onClose={() => setSelectedTrade(null)} 
      />
    </div>
  );
}
