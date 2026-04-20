import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Lightbulb, Clock, Tag, CheckCircle2, AlertTriangle, 
  XCircle, HelpCircle, TrendingUp, TrendingDown, LogIn, UserPlus,
  ExternalLink, Youtube, BookOpen, FileText, Image, X,
  ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, User, Moon, Link2,
  Calendar, BarChart3, Globe, Copy, Check, Star, MessageSquare
} from "lucide-react";
import hauntedLogo from "@/assets/haunted.png";
import Button from "@/components/ui/Button.jsx";
import Modal from "@/components/common/Modal.jsx";
import ImageLightbox from "@/components/common/ImageLightbox.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import ShareThemeToggle from "@/components/common/ShareThemeToggle.jsx";
import DOMPurify from "dompurify";
import { fetchPublicShare } from "@/lib/share.js";
import { safeFormatDate, clampNum, fmtMoney, fmtRR } from "@/lib/utils.js";

// Direction styles
const DIRECTION_STYLES = {
  Long: { color: "text-emerald-400", bg: "bg-emerald-500/15", bgSolid: "bg-emerald-500", icon: ArrowUpRight },
  Short: { color: "text-red-400", bg: "bg-red-500/15", bgSolid: "bg-red-500", icon: ArrowDownRight },
  Both: { color: "text-blue-400", bg: "bg-blue-500/15", bgSolid: "bg-blue-500", icon: TrendingUp },
};

// Result styles
const RESULT_STYLES = {
  Unknown: { label: "Pending", color: "text-slate-400", bg: "bg-slate-500/15", icon: HelpCircle },
  Worked: { label: "Worked", color: "text-emerald-400", bg: "bg-emerald-500/15", icon: CheckCircle2 },
  Failed: { label: "Failed", color: "text-red-400", bg: "bg-red-500/15", icon: XCircle },
  Partial: { label: "Partial", color: "text-amber-400", bg: "bg-amber-500/15", icon: AlertTriangle },
};

// Status styles
const STATUS_STYLES = {
  Planned: { label: "Planned", color: "text-blue-400", bg: "bg-blue-500/15" },
  Active: { label: "Active", color: "text-emerald-400", bg: "bg-emerald-500/15" },
  Closed: { label: "Closed", color: "text-slate-400", bg: "bg-slate-500/15" },
  Archived: { label: "Archived", color: "text-amber-400", bg: "bg-amber-500/15" },
};

// Link type icons
const LINK_ICONS = {
  tradingview: { icon: BarChart3, color: "text-blue-400" },
  youtube: { icon: Youtube, color: "text-red-400" },
  notion: { icon: BookOpen, color: "text-slate-400" },
  article: { icon: FileText, color: "text-emerald-400" },
  other: { icon: Globe, color: "text-muted-foreground" },
};

/**
 * HTML Content renderer
 */
function HtmlContent({ html }) {
  const sanitizedHtml = useMemo(() => {
    if (!html) return "";
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ["h1", "h2", "h3", "p", "br", "strong", "em", "ul", "ol", "li", "a", "code", "pre", "blockquote", "hr", "img"],
      ALLOWED_ATTR: ["href", "target", "rel", "src", "alt"],
      ALLOWED_URI_REGEXP: /^data:image\/(png|jpeg|jpg|gif|webp);base64,.*$/,
      ADD_URI_SAFE_ATTR: ["src"],
    });
  }, [html]);

  if (!sanitizedHtml) return null;
  
  return (
    <div 
      className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-blockquote:border-accent prose-blockquote:text-muted-foreground prose-code:bg-muted/50 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/50"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

/**
 * Image Gallery component
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
      <div className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
        <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Image className="h-4 w-4 text-accent" />
            Screenshots ({images.length})
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img, i) => (
              <button
                key={img.id || i}
                onClick={() => setPreviewIndex(i)}
                className="group relative aspect-video rounded-xl overflow-hidden border border-accent/15 hover:border-accent/40 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/10"
              >
                <img
                  src={img.dataUrl}
                  alt={img.title || "Screenshot"}
                  className="w-full h-full object-cover"
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

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewIndex !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
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

            <motion.img
              key={previewIndex}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              src={images[previewIndex]?.dataUrl}
              alt={images[previewIndex]?.title || "Screenshot"}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Image counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 text-white text-sm font-medium">
              {previewIndex + 1} / {images.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Links Section
 */
function LinksSection({ links }) {
  if (!links || links.length === 0) return null;

  return (
    <div className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
      <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4 text-accent" />
          Links ({links.length})
        </div>
      </div>
      <div className="p-4 space-y-2">
        {links.map((link, i) => {
          const linkConfig = LINK_ICONS[link.kind] || LINK_ICONS.other;
          const LinkIcon = linkConfig.icon;
          return (
            <a
              key={link.id || i}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 hover:bg-accent/10 border border-transparent hover:border-accent/20 transition-all group"
            >
              <LinkIcon className={`h-4 w-4 ${linkConfig.color} shrink-0 group-hover:scale-110 transition-transform`} />
              <span className="text-sm font-medium truncate flex-1">
                {link.label || link.url}
              </span>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Trade detail modal for public view (from linked trade in idea share)
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

/**
 * 404 / Not Found State
 */
function NotFoundState() {
  return (
    <div className="min-h-screen app-bg flex flex-col items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative text-center max-w-md"
      >
        <div className="h-20 w-20 mx-auto mb-6 rounded-xl bg-gradient-to-br from-accent/20 to-accent-2/20 flex items-center justify-center shadow-lg shadow-accent/10">
          <img src={hauntedLogo} alt="Haunted" className="h-10 w-10 object-contain drop-shadow" />
        </div>
        <h1 className="text-2xl font-bold mb-3 gradient-text">Trading Idea not found</h1>
        <p className="text-muted-foreground mb-6">
          This share link doesn't exist or has expired.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <Link to="/register">
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Create account
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" className="gap-2">
              <LogIn className="h-4 w-4" />
              Sign in
            </Button>
          </Link>
        </div>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-accent">Haunted</span> — Trading Journal
          </p>
          <SocialLinks variant="pill" />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Public Idea Share Page
 */
export default function PublicIdeaShare() {
  const { shareId } = useParams();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);

  useEffect(() => {
    let cancelled = false;
    
    async function loadShare() {
      try {
        const data = await fetchPublicShare(shareId);
        if (cancelled) return;
        
        // Check that this is an idea share and has idea data
        if (data && data.type === "idea" && data.payload?.idea) {
          // Support both single idea and multiple ideas
          const ideas = Array.isArray(data.payload.ideas) && data.payload.ideas.length > 0
            ? data.payload.ideas
            : [data.payload.idea];
          // Map API response to expected bundle format
          setBundle({
            id: data.id,
            idea: ideas[0],
            ideas,
            authorName: data.authorName || data.payload.authorName,
            title: data.title,
            createdAt: data.createdAt,
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

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!bundle || !bundle.idea) {
    return <NotFoundState />;
  }

  const ideas = bundle.ideas || [bundle.idea];
  const isMulti = ideas.length > 1;
  const authorName = bundle.authorName || null;
  const createdDate = bundle.createdAt ? safeFormatDate(bundle.createdAt) : "";

  return (
    <div className="min-h-screen app-bg">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
      
      {/* Header */}
      <header className="relative border-b border-accent/15 bg-card/50 glass backdrop-blur-lg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-accent/20 to-accent-2/20 flex items-center justify-center shadow-lg shadow-accent/10">
              <img src={hauntedLogo} alt="Haunted" className="h-7 w-7 object-contain drop-shadow" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {isMulti ? `Shared Trading Ideas (${ideas.length})` : "Shared Trading Idea"}
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
            {/* Copy link button */}
            <button
              onClick={handleCopyLink}
              className="shrink-0 h-10 px-4 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent font-medium text-sm flex items-center gap-2 transition-colors"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="hidden sm:inline">{copied ? "Copied!" : "Copy Link"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        
        {ideas.map((currentIdea, ideaIndex) => {
          const dc = DIRECTION_STYLES[currentIdea.direction] || DIRECTION_STYLES.Long;
          const DIcon = dc.icon;
          const rc = RESULT_STYLES[currentIdea.result] || RESULT_STYLES.Unknown;
          const RIcon = rc.icon;
          const sc = STATUS_STYLES[currentIdea.status] || STATUS_STYLES.Planned;
          const imgCount = currentIdea.images?.length || 0;
          const lnkCount = currentIdea.links?.length || 0;
          const notes = currentIdea.notesHtml || currentIdea.notesText;
          const ideaDate = safeFormatDate(currentIdea.createdAt);

          return (
            <React.Fragment key={currentIdea.id || ideaIndex}>
        {/* Idea Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: ideaIndex * 0.1 }}
          className="rounded-xl border border-accent/15 bg-card/80 glass premium-panel overflow-hidden"
        >
          {/* Idea Header */}
          <div className="p-5 sm:p-6 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              {/* Direction badge */}
              <div className={`shrink-0 p-3 rounded-xl ${dc.bg} border border-accent/20 shadow-lg shadow-accent/5`}>
                <DIcon className={`h-8 w-8 ${dc.color}`} />
              </div>
              
              <div className="flex-1 min-w-0">
                {/* Pair and direction */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {currentIdea.pair && (
                    <span className="text-xl sm:text-2xl font-bold text-foreground">
                      {currentIdea.pair}
                    </span>
                  )}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${dc.bgSolid} text-white`}>
                    {currentIdea.direction}
                  </span>
                  {currentIdea.timeframe && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs bg-muted/50 border border-border font-medium">
                      {currentIdea.timeframe}
                    </span>
                  )}
                  {isMulti && (
                    <span className="ml-auto text-xs text-muted-foreground font-medium">
                      {ideaIndex + 1} / {ideas.length}
                    </span>
                  )}
                </div>
                
                {isMulti ? (
                  <h2 className="text-xl sm:text-2xl font-bold mb-3">{currentIdea.title || "Untitled Idea"}</h2>
                ) : (
                  <h1 className="text-xl sm:text-2xl font-bold mb-3">{currentIdea.title || "Untitled Idea"}</h1>
                )}
                
                <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${sc.bg} ${sc.color} font-medium`}>
                    {sc.label}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {ideaDate}
                  </span>
                </div>
              </div>
              
              {/* Result badge */}
              {currentIdea.result !== "Unknown" && (
                <div className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl ${rc.bg} border border-accent/20`}>
                  <RIcon className={`h-5 w-5 ${rc.color}`} />
                  <span className={`font-semibold ${rc.color}`}>{rc.label}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            {currentIdea.tags?.length > 0 && (
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                {currentIdea.tags.map((tag, i) => (
                  <span 
                    key={i} 
                    className="px-2.5 py-1 rounded-full text-xs bg-muted/50 border border-border font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Quick stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="rounded-xl bg-muted/30 p-3 text-center glass">
                <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Direction</div>
                <div className={`text-sm font-bold flex items-center justify-center gap-1 ${dc.color}`}>
                  <DIcon className="h-4 w-4" />
                  {currentIdea.direction}
                </div>
              </div>
              <div className="rounded-xl bg-muted/30 p-3 text-center glass">
                <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Status</div>
                <div className={`text-sm font-bold ${sc.color}`}>{sc.label}</div>
              </div>
              <div className="rounded-xl bg-muted/30 p-3 text-center glass">
                <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Result</div>
                <div className={`text-sm font-bold flex items-center justify-center gap-1 ${rc.color}`}>
                  <RIcon className="h-4 w-4" />
                  {rc.label}
                </div>
              </div>
              <div className="rounded-xl bg-muted/30 p-3 text-center glass">
                <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1">Content</div>
                <div className="text-sm font-bold flex items-center justify-center gap-2">
                  {imgCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Image className="h-3.5 w-3.5" />
                      {imgCount}
                    </span>
                  )}
                  {lnkCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Link2 className="h-3.5 w-3.5" />
                      {lnkCount}
                    </span>
                  )}
                  {!imgCount && !lnkCount && <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Notes Content */}
          {notes && (
            <div className="p-5 sm:p-6">
              <HtmlContent html={currentIdea.notesHtml} />
            </div>
          )}

          {/* Empty state if no notes */}
          {!notes && (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No notes provided for this idea.</p>
            </div>
          )}
        </motion.div>

        {/* Images Gallery */}
        <ImageGallery images={currentIdea.images} />

        {/* Linked Trades Section */}
        {((currentIdea.linkedTrades && currentIdea.linkedTrades.length > 0) || currentIdea.linkedTrade) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4 text-accent" />
                Linked Trades ({currentIdea.linkedTrades?.length || (currentIdea.linkedTrade ? 1 : 0)})
              </div>
            </div>
            <div className="p-4 space-y-3">
              {(currentIdea.linkedTrades || (currentIdea.linkedTrade ? [currentIdea.linkedTrade] : [])).map((trade, i) => (
                <button 
                  key={trade.id || i}
                  onClick={() => setSelectedTrade(trade)}
                  className="w-full rounded-xl bg-muted/20 border border-accent/10 overflow-hidden hover:border-accent/30 hover:bg-accent/5 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-4 p-4">
                    <div 
                      className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                        trade.pnl >= 0 ? "bg-emerald-500/15" : "bg-red-500/15"
                      } group-hover:scale-105 transition-transform`}
                    >
                      {trade.pnl >= 0 ? (
                        <ArrowUpRight className="h-6 w-6 text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="h-6 w-6 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold group-hover:text-accent transition-colors">{trade.symbolName}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          trade.direction === "Long" 
                            ? "bg-emerald-500/15 text-emerald-400" 
                            : trade.direction === "Short"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-blue-500/15 text-blue-400"
                        }`}>
                          {trade.direction}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {trade.date}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-xl font-bold ${
                        trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}>
                        {trade.pnl >= 0 ? "+" : ""}{trade.pnl?.toFixed(2) || "0.00"}
                      </div>
                      {trade.rr !== undefined && (
                        <div className="text-sm text-muted-foreground">
                          {trade.rr?.toFixed(2) || "0.00"}R
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Indicators */}
                  <div className="px-4 pb-3 flex items-center gap-3">
                    {trade.notes && (
                      <span className="text-[10px] text-muted-foreground">📝 Notes</span>
                    )}
                    {trade.links && trade.links.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">🔗 {trade.links.length}</span>
                    )}
                    {trade.images && trade.images.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">📷 {trade.images.length}</span>
                    )}
                    <span className="text-[10px] text-accent ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to view details →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Links Section */}
        <LinksSection links={currentIdea.links} />

            </React.Fragment>
          );
        })}

        {/* Footer */}
        <footer className="pt-8 border-t border-accent/10 space-y-6">
          {/* CTA to create own journal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-r from-card/80 via-accent/5 to-card/80 border border-accent/20 rounded-2xl p-6 text-center"
          >
            <Lightbulb className="h-10 w-10 text-accent mx-auto mb-3 opacity-70" />
            <h3 className="text-lg font-semibold mb-2">Track Your Own Trading Ideas</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Create an account to start tracking, managing, and sharing your trading ideas with the Haunted trading journal.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/register">
                <Button className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Create account
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Sign in
                </Button>
              </Link>
            </div>
          </motion.div>
          
          <div className="text-center space-y-4">
            <p className="text-xs text-muted-foreground">
              Powered by <span className="font-semibold text-accent">Haunted</span> — Trading Journal
            </p>
            <SocialLinks variant="pill" />
          </div>
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
