import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileText, Calendar, Target, Lightbulb, BarChart3, 
  ArrowLeft, Clock, Tag, CheckCircle2, AlertTriangle, 
  XCircle, HelpCircle, TrendingUp, TrendingDown, Activity, LogIn, UserPlus,
  ExternalLink, Youtube, BookOpen, Image, X, ChevronLeft, ChevronRight,
  User, Moon, Link2, ArrowUpRight, ArrowDownRight, Check, Star, MessageSquare
} from "lucide-react";
import hauntedLogo from "@/assets/haunted.png";
import Button from "@/components/ui/Button.jsx";
import Modal from "@/components/common/Modal.jsx";
import ImageLightbox from "@/components/common/ImageLightbox.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import ShareThemeToggle from "@/components/common/ShareThemeToggle.jsx";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { safeFormatDate, clampNum, fmtMoney, fmtRR } from "@/lib/utils.js";
import { fetchPublicShare } from "@/lib/share.js";

// Document type configuration
const DOC_TYPES = {
  weekly_plan: { label: "Weekly Plan", icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/15" },
  strategy: { label: "Strategy", icon: Target, color: "text-purple-400", bg: "bg-purple-500/15" },
  idea: { label: "Idea / Setup", icon: Lightbulb, color: "text-amber-400", bg: "bg-amber-500/15" },
  note: { label: "Note", icon: FileText, color: "text-slate-400", bg: "bg-slate-500/15" },
  weekly_review: { label: "Weekly Review", icon: BarChart3, color: "text-emerald-400", bg: "bg-emerald-500/15" },
};

const EVALUATION_RESULTS = {
  unknown: { label: "Unknown", color: "text-slate-400", icon: HelpCircle },
  worked: { label: "Worked", color: "text-emerald-400", icon: CheckCircle2 },
  partially: { label: "Partially", color: "text-amber-400", icon: AlertTriangle },
  failed: { label: "Failed", color: "text-red-400", icon: XCircle },
};

// Link type icons
const LINK_ICONS = {
  tradingview: () => <ExternalLink className="h-4 w-4 text-blue-400" />,
  youtube: () => <Youtube className="h-4 w-4 text-red-400" />,
  notion: () => <BookOpen className="h-4 w-4 text-slate-400" />,
  article: () => <FileText className="h-4 w-4 text-emerald-400" />,
  other: () => <ExternalLink className="h-4 w-4 text-muted-foreground" />,
};

/**
 * HTML Content renderer - renders sanitized HTML from rich text editor
 * Falls back to markdown conversion for legacy content
 */
function HtmlContent({ doc }) {
  const sanitizedHtml = useMemo(() => {
    // Safety check for null/undefined doc
    if (!doc) return "";
    
    // Prefer HTML content from rich text editor
    if (doc.contentHtml) {
      return DOMPurify.sanitize(doc.contentHtml, {
        ALLOWED_TAGS: ["h1", "h2", "h3", "p", "br", "strong", "em", "ul", "ol", "li", "a", "code", "pre", "blockquote", "hr", "img"],
        ALLOWED_ATTR: ["href", "target", "rel", "src", "alt"],
        ALLOWED_URI_REGEXP: /^data:image\/(png|jpeg|jpg|gif|webp);base64,.*$/,
        ADD_URI_SAFE_ATTR: ["src"],
      });
    }
    // Fallback: convert legacy markdown to HTML
    if (doc.content) {
      try {
        const rawHtml = marked(doc.content);
        return DOMPurify.sanitize(rawHtml, {
          ALLOWED_TAGS: ["h1", "h2", "h3", "p", "br", "strong", "em", "ul", "ol", "li", "a", "code", "pre", "blockquote", "hr", "img"],
          ALLOWED_ATTR: ["href", "target", "rel", "src", "alt"],
          ALLOWED_URI_REGEXP: /^data:image\/(png|jpeg|jpg|gif|webp);base64,.*$/,
          ADD_URI_SAFE_ATTR: ["src"],
        });
      } catch {
        return "";
      }
    }
    return "";
  }, [doc?.content, doc?.contentHtml]);

  if (!sanitizedHtml) return null;
  
  return (
    <div 
      className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-blockquote:border-accent prose-blockquote:text-muted-foreground prose-code:bg-muted/50 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/50"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

/**
 * Image Gallery component for document images
 */
function ImageGallery({ images }) {
  const [previewIndex, setPreviewIndex] = useState(null);

  if (!images || images.length === 0) return null;

  const showPrev = () => {
    setPreviewIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const showNext = () => {
    setPreviewIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <>
      <div className="p-6 border-t border-border/50">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Image className="h-4 w-4" />
          Images ({images.length})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {images.map((img, i) => (
            <button
              key={img.id || i}
              onClick={() => setPreviewIndex(i)}
              className="aspect-square rounded-xl overflow-hidden border border-border/50 hover:border-accent/50 transition-colors cursor-pointer"
            >
              <img
                src={img.dataUrl}
                alt={img.title || "Image"}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewIndex !== null && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewIndex(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setPreviewIndex(null); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </button>
          
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); showPrev(); }}
                className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <ChevronLeft className="h-6 w-6 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); showNext(); }}
                className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <ChevronRight className="h-6 w-6 text-white" />
              </button>
            </>
          )}

          <img
            src={images[previewIndex]?.dataUrl}
            alt={images[previewIndex]?.title || "Image"}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

/**
 * Trade detail modal for public view (from linked trade in document share)
 */
function TradeDetailModal({ trade, open, onClose }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  if (!trade) return null;
  
  const pnl = clampNum(trade.pnl);
  const rr = clampNum(trade.rr);
  const isProfitable = pnl > 0;
  const isLoss = pnl < 0;
  
  const links = trade.links || [];
  const images = trade.images || [];
  
  const handleImageClick = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  
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
          {/* Trade Header */}
          <div className="flex items-center gap-4 pb-4 border-b border-accent/10">
            <div 
              className={`h-14 w-14 rounded-xl flex items-center justify-center shrink-0 ${
                isProfitable ? "bg-emerald-500/15" : isLoss ? "bg-red-500/15" : "bg-amber-500/15"
              }`}
            >
              {isProfitable ? (
                <ArrowUpRight className="h-7 w-7 text-emerald-400" />
              ) : isLoss ? (
                <ArrowDownRight className="h-7 w-7 text-red-400" />
              ) : (
                <TrendingUp className="h-7 w-7 text-amber-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold">{trade.symbolName || "—"}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  trade.direction === "Long" 
                    ? "bg-emerald-500/15 text-emerald-400" 
                    : trade.direction === "Short"
                    ? "bg-red-500/15 text-red-400"
                    : "bg-blue-500/15 text-blue-400"
                }`}>
                  {trade.direction === "Long" && <ArrowUpRight className="inline h-3 w-3 mr-0.5" />}
                  {trade.direction === "Short" && <ArrowDownRight className="inline h-3 w-3 mr-0.5" />}
                  {trade.direction || "—"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {trade.date || "—"}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-2xl font-bold ${
                isProfitable ? "text-emerald-400" : isLoss ? "text-red-400" : "text-amber-400"
              }`}>
                {isProfitable ? "+" : ""}{fmtMoney(pnl)}
              </div>
              <div className="text-sm text-muted-foreground">
                {fmtRR(rr)}
              </div>
            </div>
          </div>
          
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">RR</div>
              <div className="text-lg font-bold">{fmtRR(rr)}</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">PnL</div>
              <div className={`text-lg font-bold ${
                isProfitable ? "text-emerald-500" : isLoss ? "text-red-500" : "text-amber-500"
              }`}>
                {fmtMoney(pnl)}
              </div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Outcome</div>
              <div className={`text-sm font-semibold ${
                isProfitable ? "text-emerald-500" : isLoss ? "text-red-500" : "text-amber-500"
              }`}>
                {trade.outcome || (isProfitable ? "Profit" : isLoss ? "Loss" : "BE")}
              </div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3 text-center">
              <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Flags</div>
              <div className="flex items-center justify-center gap-1.5">
                {trade.bestTrade && <Star className="h-4 w-4 text-amber-500" title="Best Trade" />}
                {trade.followPlan && <Check className="h-4 w-4 text-emerald-500" title="Followed Plan" />}
                {!trade.bestTrade && !trade.followPlan && <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
          </div>
          
          {/* Notes */}
          {trade.notes && (
            <div className="rounded-xl bg-muted/20 p-4 border border-accent/10">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <MessageSquare className="h-4 w-4 text-accent" />
                Notes
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                {trade.notes}
              </p>
            </div>
          )}
          
          {/* Images */}
          {images.length > 0 && (
            <div className="rounded-2xl border border-accent/15 bg-card/60 overflow-hidden">
              <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Image className="h-4 w-4 text-accent" />
                  Photos ({images.length})
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
                      alt={img.title || "Trade image"} 
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
                      {link.title || getDomain(link.url)}
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
          images={images}
          initialIndex={lightboxIndex}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

export default function PublicDocShare() {
  const { shareId } = useParams();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState(null);

  useEffect(() => {
    let cancelled = false;
    
    async function loadShare() {
      try {
        const data = await fetchPublicShare(shareId);
        if (cancelled) return;
        
        // Check that this is a doc share and has document data
        if (data && data.type === "doc" && data.payload?.document) {
          // Map API response to expected bundle format
          setBundle({
            id: data.id,
            document: data.payload.document,
            authorName: data.authorName || data.payload.authorName,
            title: data.title,
            createdAt: data.createdAt,
            stats: data.payload.document?.stats,
          });
        } else {
          setBundle(null);
        }
      } catch (err) {
        console.error("Failed to fetch share:", err);
        if (!cancelled) setBundle(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    
    loadShare();
    return () => { cancelled = true; };
  }, [shareId]);

  // All hooks must be called before any conditional returns (Rules of Hooks)
  const doc = bundle?.document;
  const formattedDate = useMemo(() => safeFormatDate(doc?.createdAt), [doc?.createdAt]);

  if (loading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!bundle || !doc) {
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
          <h1 className="text-2xl font-bold mb-3 gradient-text">Document not found</h1>
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

  const typeConfig = DOC_TYPES[doc.type] || DOC_TYPES.note;
  const TypeIcon = typeConfig.icon;
  const evalConfig = EVALUATION_RESULTS[doc.evaluation?.result] || EVALUATION_RESULTS.unknown;
  const EvalIcon = evalConfig.icon;
  const authorName = bundle.authorName || "Anonymous";
  const createdDate = bundle.createdAt ? safeFormatDate(bundle.createdAt) : "";
  const imageCount = doc.images?.length || 0;
  const linkCount = doc.links?.length || 0;

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
                {doc.title || "Shared Document"}
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-accent/15 bg-card/80 glass premium-panel overflow-hidden"
        >
          {/* Banner Image (if exists) */}
          {doc.banner?.dataUrl && (
            <div className="w-full h-48 sm:h-64">
              <img
                src={doc.banner.dataUrl}
                alt={doc.banner.title || "Banner"}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Document Header */}
          <div className="p-4 sm:p-6 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${typeConfig.bg} border border-accent/20 shadow-lg shadow-accent/5`}>
                <TypeIcon className={`h-6 w-6 ${typeConfig.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium ${typeConfig.color}`}>
                    {typeConfig.label}
                  </span>
                  {doc.evaluation?.result && doc.evaluation.result !== "unknown" && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className={`flex items-center gap-1 text-xs ${evalConfig.color}`}>
                        <EvalIcon className="h-3 w-3" />
                        {evalConfig.label}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-2xl font-bold mb-2">{doc.title || "Untitled"}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formattedDate}
                  </span>
                  {bundle.authorName && (
                    <>
                      <span>•</span>
                      <span>by {bundle.authorName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tags */}
            {doc.tags?.length > 0 && (
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Tag className="h-4 w-4 text-muted-foreground" />
                {doc.tags.map((tag, i) => (
                  <span 
                    key={i} 
                    className="px-2 py-0.5 rounded-full text-xs bg-muted/50 border border-border"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Links */}
            {doc.links?.length > 0 && (
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {doc.links.map((link, i) => {
                  const linkType = LINK_ICONS[link.kind] || LINK_ICONS.other;
                  return (
                    <a
                      key={link.id || i}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-accent/10 hover:bg-accent/20 border border-accent/20 text-accent transition-colors"
                    >
                      {linkType()}
                      {link.label || link.url}
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Document Content */}
          <div className="p-6">
            <HtmlContent doc={doc} />
          </div>

          {/* Images Gallery */}
          <ImageGallery images={doc.images} />

          {/* Linked Trades Section */}
          {doc.linkedTrades && doc.linkedTrades.length > 0 && (
            <div className="p-6 border-t border-border/50">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                Linked Trades ({doc.linkedTrades.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {doc.linkedTrades.map((trade, i) => {
                  const pnl = trade.pnl ?? 0;
                  const isProfitable = pnl > 0;
                  const isLoss = pnl < 0;
                  return (
                    <button
                      key={trade.id || i}
                      onClick={() => setSelectedTrade(trade)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border hover:border-accent/30 hover:bg-accent/5 transition-all text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div 
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold group-hover:scale-105 transition-transform"
                          style={{ backgroundColor: trade.symbolColor || "#6366f1" }}
                        >
                          <span className="text-white">{(trade.symbolName || "?")[0]}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate group-hover:text-accent transition-colors">{trade.symbolName || "—"}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              trade.direction === "Long" 
                                ? "bg-emerald-500/15 text-emerald-500" 
                                : "bg-red-500/15 text-red-500"
                            }`}>
                              {trade.direction || "—"}
                              {trade.direction === "Long" ? <ArrowUpRight className="inline h-2.5 w-2.5" /> : <ArrowDownRight className="inline h-2.5 w-2.5" />}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">{trade.date || "—"}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold flex items-center justify-end gap-1 ${
                          isProfitable ? "text-emerald-400" : isLoss ? "text-red-400" : "text-amber-400"
                        }`}>
                          {isProfitable ? <TrendingUp className="h-3 w-3" /> : isLoss ? <TrendingDown className="h-3 w-3" /> : null}
                          ${Math.abs(pnl).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {trade.rr ? `${trade.rr.toFixed(1)}R` : "—"}
                          {trade.followPlan && <Check className="inline h-3 w-3 text-emerald-400 ml-1" title="Followed Plan" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Click on a trade to view full details
              </p>
            </div>
          )}

          {/* Stats (if available) */}
          {bundle.stats && (
            <div className="p-6 border-t border-border/50 bg-muted/20">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Performance
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-card/50 border border-border">
                  <div className="text-xs text-muted-foreground">Trades</div>
                  <div className="text-lg font-bold">{bundle.stats.tradeCount || 0}</div>
                </div>
                <div className="p-3 rounded-xl bg-card/50 border border-border">
                  <div className="text-xs text-muted-foreground">Win Rate</div>
                  <div className={`text-lg font-bold ${(bundle.stats.winRate || 0) >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                    {bundle.stats.winRate || 0}%
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-card/50 border border-border">
                  <div className="text-xs text-muted-foreground">Net PnL</div>
                  <div className={`text-lg font-bold ${(bundle.stats.netPnl || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    ${bundle.stats.netPnl?.toFixed(2) || "0.00"}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-card/50 border border-border">
                  <div className="text-xs text-muted-foreground">Plan Adherence</div>
                  <div className={`text-lg font-bold ${(bundle.stats.adherence || 0) >= 70 ? "text-emerald-400" : "text-amber-400"}`}>
                    {bundle.stats.adherence || 0}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-accent/10 text-center space-y-4">
          {/* CTA to create own journal */}
          <div className="bg-card/50 border border-accent/20 rounded-2xl p-4 mx-auto max-w-md">
            <p className="text-sm text-foreground mb-3">
              Want to create your own trading journal?
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
