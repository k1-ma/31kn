import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { fetchPublicShare } from "@/lib/share.js";
import { fmtMoney, fmtRR, sessionTone, clampNum } from "@/lib/utils";
import {
  FlaskConical, Moon, Calendar, ArrowUpRight, ArrowDownRight,
  TrendingUp, TrendingDown, ExternalLink, Image, FileText,
  Star, Check, User, Link2, MessageSquare, BookOpen, Filter,
  LogIn, UserPlus, DollarSign, Target, Percent, BarChart3,
  Clock, StickyNote, Flame, Zap, Activity, Award, Shield,
  ChevronDown, ChevronUp,
} from "lucide-react";
import hauntedLogo from "@/assets/haunted.png";
import Modal from "@/components/common/Modal.jsx";
import ImageLightbox from "@/components/common/ImageLightbox.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import Button from "@/components/ui/Button.jsx";
import ShareThemeToggle from "@/components/common/ShareThemeToggle.jsx";

/* ───── helpers ───── */
function getMonthKey(dateStr) {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatMonthLabel(monthKey, locale = "en") {
  if (monthKey === "unknown" || !monthKey || !monthKey.includes("-")) return "Unknown";
  const [y, m] = monthKey.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString(locale, { month: "long", year: "numeric" });
}

/* ───── SymbolIcon ───── */
function SymbolIcon({ avatar, color, name, size = 32 }) {
  const bgColor = color || "#6366f1";
  const sizeClass = size === 40 ? "h-10 w-10" : "h-8 w-8";
  const textSize = size === 40 ? "text-base" : "text-sm";
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

/* ───── SessionBadge ───── */
function PublicSessionBadge({ name }) {
  const tone = sessionTone(name);
  const cls =
    tone === "green"   ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500" :
    tone === "orange"  ? "border-amber-500/40 bg-amber-500/15 text-amber-500" :
    tone === "purple"  ? "border-violet-500/40 bg-violet-500/15 text-violet-500" :
    tone === "blue"    ? "border-blue-500/40 bg-blue-500/15 text-blue-500" :
    "border-accent/20 bg-[#0B1220]/50";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium uppercase tracking-wider ${cls}`}>
      {name || "—"}
    </span>
  );
}

/* ───── Trade Detail Modal (backtest-simplified: no docs/ideas) ───── */
function TradeDetailModal({ trade, open, onClose }) {
  if (!trade) return null;
  return <TradeDetailModalInner trade={trade} open={open} onClose={onClose} />;
}
function TradeDetailModalInner({ trade, open, onClose }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const pnl = clampNum(trade.pnl);
  const rr  = clampNum(trade.rr);
  const isProfitable = pnl > 0;
  const isLoss = pnl < 0;
  const links  = trade.links || [];
  const images = trade.images || [];

  const notesSections = [
    { label: "Notes",    content: trade.notes,    icon: FileText },
    { label: "Comments", content: trade.comments,  icon: MessageSquare },
    { label: "Position Notes", content: trade.positionNotes, icon: FileText },
    { label: "Journal",  content: trade.journal,   icon: BookOpen },
  ].filter(s => s.content && s.content.trim().length > 0);

  const getDomain = (url) => { try { return new URL(url).hostname.replace("www.", ""); } catch { return "Link"; } };

  return (
    <>
      <Modal open={open} onClose={onClose} title={trade.symbolName || "Trade Details"} size="lg">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-accent/10">
            <div className="flex items-center gap-3">
              <SymbolIcon avatar={trade.symbolAvatar} color={trade.symbolColor} name={trade.symbolName} size={40} />
              <div className="text-lg font-semibold tracking-tight">{trade.symbolName}</div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                trade.direction === "Long" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
              }`}>
                {trade.direction === "Long" ? <ArrowUpRight className="inline h-3 w-3 mr-0.5" /> : <ArrowDownRight className="inline h-3 w-3 mr-0.5" />}
                {trade.direction?.toUpperCase() || "—"}
              </span>
              {trade.sessionName && <PublicSessionBadge name={trade.sessionName} />}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {trade.date || "—"}
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

          {/* Photos */}
          {images.length > 0 && (
            <div className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
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
                    onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                    className="group relative aspect-video rounded-xl overflow-hidden border border-accent/15 hover:border-accent/40 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/10"
                  >
                    <img src={img.dataUrl} alt={img.title || "Trade image"} className="h-full w-full object-cover" />
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
          )}

          {/* Links */}
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
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/20 hover:bg-accent/10 border border-transparent hover:border-accent/20 transition-all group">
                    <ExternalLink className="h-4 w-4 text-accent shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-medium truncate">{link.title || getDomain(link.url)}</span>
                    <span className="text-xs text-muted-foreground truncate ml-auto hidden sm:block max-w-[200px]">{link.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {notesSections.map((section, i) => {
            const IconComp = section.icon;
            return (
              <div key={i} className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
                <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <IconComp className="h-4 w-4 text-accent" />
                    {section.label}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{section.content}</p>
                </div>
              </div>
            );
          })}

          {images.length === 0 && links.length === 0 && notesSections.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No additional details for this trade.</p>
            </div>
          )}
        </div>
      </Modal>

      <ImageLightbox
        images={images}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}

/* ───── Trade Card (clickable, same style as PublicShare) ───── */
function PublicTradeCard({ trade, onClick }) {
  const pnl = clampNum(trade.pnl);
  const rr  = clampNum(trade.rr);
  const isProfitable = pnl > 0;
  const isLoss = pnl < 0;
  const links  = trade.links || [];
  const images = trade.images || [];
  const hasNotes = trade.notes || trade.positionNotes || trade.comments || trade.journal;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="rounded-xl border border-accent/15 bg-card/80 glass premium-panel overflow-hidden hover:shadow-lg hover:shadow-accent/10 transition-all duration-300 cursor-pointer hover:border-accent/30 group"
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <SymbolIcon avatar={trade.symbolAvatar} color={trade.symbolColor} name={trade.symbolName} size={32} />
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight">{trade.symbolName || "—"}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  trade.direction === "Long" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                }`}>
                  {trade.direction === "Long" ? <ArrowUpRight className="inline h-3 w-3 mr-0.5" /> : <ArrowDownRight className="inline h-3 w-3 mr-0.5" />}
                  {trade.direction?.toUpperCase() || "—"}
                </span>
                {trade.sessionName && <PublicSessionBadge name={trade.sessionName} />}
              </div>
            </div>
          </div>
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

      {/* Body */}
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {trade.date || "—"}
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            isProfitable ? "bg-emerald-500/15 text-emerald-500" : isLoss ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-500"
          }`}>
            {trade.outcome || (isProfitable ? "Profit" : isLoss ? "Loss" : "BE")}
          </span>
        </div>

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
          {hasNotes && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 text-xs text-accent font-medium">
              <FileText className="h-3 w-3" />
              Notes
            </span>
          )}
        </div>

        <div className="text-center">
          <span className="text-xs text-muted-foreground group-hover:text-accent transition-colors">
            Click to view details
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ───── Not Found ───── */
function NotFoundState() {
  return (
    <div className="min-h-screen app-bg flex flex-col items-center justify-center gap-6 p-4">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
      <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center">
        <FlaskConical className="h-8 w-8 text-accent/40" />
      </div>
      <h1 className="text-xl font-bold text-foreground">Backtest Not Found</h1>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        This backtest share link is invalid or has expired.
      </p>
      <Link to="/">
        <Button size="sm" variant="secondary">Go Home</Button>
      </Link>
    </div>
  );
}

/* ═══════════════ MAIN PAGE ═══════════════ */
export default function PublicBacktestShare() {
  const { shareId } = useParams();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [shareData, setShareData] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [monthFilter, setMonthFilter] = useState("all");

  useEffect(() => {
    if (!shareId) { setNotFound(true); setLoading(false); return; }
    fetchPublicShare(shareId)
      .then((data) => { if (!data) { setNotFound(true); } else { setShareData(data); } })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [shareId]);

  const bt     = shareData?.payload || {};
  const trades = bt.trades || [];
  const notes  = bt.notes || {};

  /* months */
  const months = useMemo(() => {
    const keys = new Set(trades.map(t => getMonthKey(t.date)));
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [trades]);

  /* filtered */
  const visibleTrades = useMemo(() => {
    const list = monthFilter === "all" ? trades : trades.filter(t => getMonthKey(t.date) === monthFilter);
    return [...list].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return (Number.isNaN(db) ? 0 : db) - (Number.isNaN(da) ? 0 : da);
    });
  }, [trades, monthFilter]);

  /* grouped */
  const groupedTrades = useMemo(() => {
    const map = new Map();
    visibleTrades.forEach(t => {
      const k = getMonthKey(t.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visibleTrades]);

  /* stats */
  const stats = useMemo(() => {
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
    let peak = bt.initialEquity || 0;
    let equity = peak;
    let dd = 0;
    for (const t of chronological) {
      equity += clampNum(t.pnl);
      if (equity > peak) peak = equity;
      const cur = peak - equity;
      if (cur > dd) dd = cur;
    }

    // return on equity
    const returnPct = (bt.initialEquity || 0) > 0
      ? ((pnl / bt.initialEquity) * 100).toFixed(1)
      : null;

    return {
      total, winCount, lossCount, wr, pnl, aRR, pf, payoff,
      expectancy: Number(expectancy), best, worst,
      maxWinStreak: maxW, maxLossStreak: maxL, maxDrawdown: dd,
      returnPct, avgWin, avgLoss, grossProfit: gP, grossLoss: gL,
    };
  }, [visibleTrades, bt.initialEquity]);
  const totalTrades = stats?.total || 0;

  if (loading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (notFound || !shareData) return <NotFoundState />;

  const authorName = shareData.authorName || null;
  const createdDate = shareData.createdAt ? new Date(shareData.createdAt).toLocaleDateString() : "";

  return (
    <div className="min-h-screen app-bg">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />

      {/* ── Header ── */}
      <header className="relative border-b border-accent/15 bg-card/50 glass backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-accent/20 to-accent-2/20 flex items-center justify-center shadow-lg shadow-accent/10">
              <img src={hauntedLogo} alt="Haunted" className="h-7 w-7 object-contain drop-shadow" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <FlaskConical className="h-5 w-5 text-accent shrink-0" />
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                  {bt.name || "Shared Backtest"}
                </h1>
              </div>
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
                  Read-only • Backtest
                  {createdDate && <span className="hidden sm:inline">• {createdDate}</span>}
                </p>
              </div>
            </div>
            <ShareThemeToggle />
          </div>
        </div>
      </header>
      {/* ── Content ── */}
      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

          {/* Meta chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {bt.period?.from && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/60 border border-accent/15 text-xs text-muted-foreground glass">
                <Calendar className="h-3.5 w-3.5 text-accent/60" />
                {bt.period.from}{bt.period.to ? ` → ${bt.period.to}` : ""}
              </span>
            )}
            {bt.initialEquity > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/60 border border-accent/15 text-xs text-muted-foreground glass">
                <DollarSign className="h-3.5 w-3.5 text-accent/60" />
                ${Number(bt.initialEquity).toLocaleString()}
              </span>
            )}
            {(bt.symbols || []).map(sym => (
              <span key={sym} className="inline-flex items-center px-3 py-1.5 rounded-xl bg-accent/[0.08] border border-accent/15 text-xs font-semibold text-accent/80">
                {sym}
              </span>
            ))}
            {(bt.timeframes || []).map(tf => (
              <span key={tf} className="inline-flex items-center px-2.5 py-1.5 rounded-xl bg-card/60 border border-accent/15 text-xs text-muted-foreground glass">
                <Clock className="h-3 w-3 mr-1 text-accent/50" />
                {tf}
              </span>
            ))}
          </div>

          {/* ── Metrics Grid ── */}
          {stats && (
            <div className="mb-8 space-y-4">
              {/* Hero stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Net PnL */}
                <div className={`relative overflow-hidden rounded-2xl border p-4 glass ${
                  stats.pnl >= 0
                    ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                    : "border-red-500/20 bg-red-500/[0.06]"
                }`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${
                    stats.pnl >= 0 ? "from-emerald-500/10 to-transparent" : "from-red-500/10 to-transparent"
                  }`} />
                  <div className="relative">
                    <div className="flex items-center gap-1.5 mb-1">
                      {stats.pnl >= 0
                        ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                        : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Net PnL</span>
                    </div>
                    <div className={`text-xl sm:text-2xl font-bold tabular-nums ${stats.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {fmtMoney(stats.pnl)}
                    </div>
                    {stats.returnPct !== null && (
                      <div className={`text-xs font-medium mt-0.5 ${stats.pnl >= 0 ? "text-emerald-500/70" : "text-red-500/70"}`}>
                        {stats.pnl >= 0 ? "+" : ""}{stats.returnPct}% return
                      </div>
                    )}
                  </div>
                </div>

                {/* Win Rate */}
                <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-card/60 p-4 glass">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target className="h-3.5 w-3.5 text-accent/60" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Win Rate</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">{stats.wr}%</div>
                  <div className="mt-2 h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                      style={{ width: `${stats.wr}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                    <span className="text-emerald-500">{stats.winCount}W</span>
                    <span className="text-red-500">{stats.lossCount}L</span>
                  </div>
                </div>

                {/* Total Trades */}
                <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-card/60 p-4 glass">
                  <div className="flex items-center gap-1.5 mb-1">
                    <BarChart3 className="h-3.5 w-3.5 text-accent/60" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Trades</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">{stats.total}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                      <ArrowUpRight className="h-3 w-3" />{stats.winCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
                      <ArrowDownRight className="h-3 w-3" />{stats.lossCount}
                    </span>
                    {stats.total - stats.winCount - stats.lossCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {stats.total - stats.winCount - stats.lossCount} Break Even
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
                  <div className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">{stats.pf}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {fmtMoney(stats.grossProfit)} / {fmtMoney(stats.grossLoss)}
                  </div>
                </div>
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {[
                  { label: "Avg RR", value: stats.aRR, icon: Target, color: "text-accent" },
                  { label: "Expectancy", value: fmtMoney(stats.expectancy), icon: Zap, color: stats.expectancy >= 0 ? "text-emerald-500" : "text-red-500" },
                  { label: "Payoff Ratio", value: stats.payoff, icon: Award, color: "text-amber-500" },
                  { label: "Best Trade", value: fmtMoney(stats.best), icon: ChevronUp, color: "text-emerald-500" },
                  { label: "Worst Trade", value: fmtMoney(stats.worst), icon: ChevronDown, color: "text-red-500" },
                  { label: "Drawdown", value: fmtMoney(stats.maxDrawdown), icon: Shield, color: "text-red-500" },
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
              {(stats.maxWinStreak > 0 || stats.maxLossStreak > 0) && (
                <div className="flex flex-wrap items-center gap-3">
                  {stats.maxWinStreak > 0 && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] glass">
                      <Flame className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-xs font-semibold text-emerald-500">{stats.maxWinStreak}</span>
                      <span className="text-[11px] text-emerald-500/70">win streak</span>
                    </div>
                  )}
                  {stats.maxLossStreak > 0 && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] glass">
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-xs font-semibold text-red-500">{stats.maxLossStreak}</span>
                      <span className="text-[11px] text-red-500/70">loss streak</span>
                    </div>
                  )}
                  {monthFilter !== "all" && trades.length !== totalTrades && (
                    <span className="text-xs text-muted-foreground">Filtered: {totalTrades} of {trades.length} trades</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {(notes.plan || notes.description) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {notes.plan && (
                <div className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
                  <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <StickyNote className="h-4 w-4 text-accent" />
                      Strategy Plan
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{notes.plan}</p>
                  </div>
                </div>
              )}
              {notes.description && (
                <div className="rounded-2xl border border-accent/15 bg-card/60 glass overflow-hidden">
                  <div className="px-4 py-3 border-b border-accent/10 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-accent" />
                      Description
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{notes.description}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Month filter */}
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
                {months.map((mk) => (
                  <button
                    key={mk}
                    onClick={() => setMonthFilter(mk)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                      monthFilter === mk
                        ? "bg-accent/20 border-accent/30 text-accent shadow-lg shadow-accent/10"
                        : "bg-card/50 border-accent/10 text-muted-foreground hover:border-accent/20 hover:text-foreground"
                    }`}
                  >
                    {formatMonthLabel(mk)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trade cards */}
          {monthFilter === "all" && months.length > 1 ? (
            <div className="space-y-8">
              {groupedTrades.map(([mk, monthTrades]) => (
                <div key={mk}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-accent/30 to-transparent" />
                    <h2 className="text-sm font-semibold text-accent tracking-wide uppercase">{formatMonthLabel(mk)}</h2>
                    <span className="text-xs text-muted-foreground">({monthTrades.length} trade{monthTrades.length !== 1 ? "s" : ""})</span>
                    <div className="h-px flex-1 bg-gradient-to-l from-accent/30 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                    {monthTrades.map((trade, i) => (
                      <motion.div key={trade.id || i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                        <PublicTradeCard trade={trade} onClick={() => setSelectedTrade(trade)} />
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {visibleTrades.map((trade, i) => (
                <motion.div key={trade.id || i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <PublicTradeCard trade={trade} onClick={() => setSelectedTrade(trade)} />
                </motion.div>
              ))}
            </div>
          )}

          {visibleTrades.length === 0 && (
            <div className="text-center py-16">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">
                {trades.length > 0 ? "No trades found for this period." : "No trades shared in this backtest."}
              </p>
              {trades.length > 0 && monthFilter !== "all" && (
                <button onClick={() => setMonthFilter("all")} className="mt-4 text-sm text-accent hover:underline">
                  Show all months
                </button>
              )}
            </div>
          )}

          {/* Footer */}
          <footer className="mt-12 pt-6 border-t border-accent/10 text-center space-y-4">
            <div className="bg-card/50 border border-accent/20 rounded-2xl p-4 mx-auto max-w-md">
              <p className="text-sm text-foreground mb-3">Want to track your own trades?</p>
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
      <TradeDetailModal trade={selectedTrade} open={!!selectedTrade} onClose={() => setSelectedTrade(null)} />
    </div>
  );
}
