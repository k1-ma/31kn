import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Image as ImageIcon, Check,
  ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle,
  AlertTriangle, HelpCircle, Clock, Tag, Link2, Trash2
} from "lucide-react";
import Badge from "@/components/ui/Badge.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";

// Direction styles
const DIRECTION_STYLES = {
  Long: { color: "text-emerald-400", bg: "bg-emerald-500/90", icon: ArrowUpRight },
  Short: { color: "text-red-400", bg: "bg-red-500/90", icon: ArrowDownRight },
  Both: { color: "text-blue-400", bg: "bg-blue-500/90", icon: TrendingUp },
};

// Result styles
const RESULT_STYLES = {
  Unknown: { color: "text-slate-400", bg: "bg-slate-500/15", icon: HelpCircle, label: "Pending" },
  Worked: { color: "text-emerald-400", bg: "bg-emerald-500/15", icon: CheckCircle2, label: "✅ Worked" },
  Failed: { color: "text-red-400", bg: "bg-red-500/15", icon: XCircle, label: "❌ Failed" },
  Partial: { color: "text-amber-400", bg: "bg-amber-500/15", icon: AlertTriangle, label: "🟡 Partial" },
};

// Status styles
const STATUS_STYLES = {
  Planned: { color: "text-blue-400", bg: "bg-blue-500/15", label: "Planned" },
  Active: { color: "text-emerald-400", bg: "bg-emerald-500/15", label: "Active" },
  Closed: { color: "text-slate-400", bg: "bg-slate-500/15", label: "Closed" },
  Archived: { color: "text-amber-400", bg: "bg-amber-500/15", label: "Archived" },
};

/**
 * Gallery card for a single trading idea
 */
export default function IdeaGalleryCard({
  idea,
  onClick,
  onQuickResult,
  onDelete,
  isSelected,
  selectionMode,
  onToggleSelect,
  reduceMotion,
  index = 0,
  t,
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const images = Array.isArray(idea.images) ? idea.images : [];
  const hasImages = images.length > 0;
  const extraCount = Math.max(0, images.length - 1);

  const directionConfig = DIRECTION_STYLES[idea.direction] || DIRECTION_STYLES.Long;
  const DirectionIcon = directionConfig.icon;
  const resultConfig = RESULT_STYLES[idea.result] || RESULT_STYLES.Unknown;
  const ResultIcon = resultConfig.icon;
  const statusConfig = STATUS_STYLES[idea.status] || STATUS_STYLES.Planned;

  const preview = idea.notes_text ? idea.notes_text.slice(0, 80) : "";
  
  const formattedDate = React.useMemo(() => {
    const raw = idea.idea_date || idea.ideaDate || idea.created_at;
    const d = new Date(raw);
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  }, [idea.idea_date, idea.ideaDate, idea.created_at]);

  const imageCount = images.length;
  const linkCount = Array.isArray(idea.links) ? idea.links.length : 0;
  const tagCount = Array.isArray(idea.tags) ? idea.tags.length : 0;

  const handleClick = (e) => {
    if (selectionMode) {
      e.stopPropagation();
      onToggleSelect?.(idea.id);
    } else {
      onClick?.();
    }
  };

  const handleQuickResult = (e, result) => {
    e.stopPropagation();
    onQuickResult?.(idea.id, result);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    setDeleteConfirmOpen(true);
  };

  return (
    <>
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.25, delay: Math.min(index * 0.03, 0.15) }}
      onClick={handleClick}
      className={`gallery-card cursor-pointer relative group ${isSelected ? "ring-2 ring-accent" : ""}`}
    >
      {/* Selection checkbox overlay */}
      {selectionMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(idea.id);
          }}
          className={`absolute top-3 left-3 z-10 h-6 w-6 rounded-lg border flex items-center justify-center transition-colors ${
            isSelected
              ? "border-accent bg-accent text-white"
              : "border-border dark:border-white/40 bg-muted/60 dark:bg-black/40 hover:bg-accent/30"
          }`}
        >
          {isSelected && <Check className="h-4 w-4" />}
        </button>
      )}

      {/* Delete button - show on hover when not in selection mode */}
      {!selectionMode && onDelete && (
        <button
          onClick={handleDeleteClick}
          className="absolute top-3 right-3 z-10 h-7 w-7 rounded-lg flex items-center justify-center bg-black/50 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all"
          title={t?.("common.delete") || "Delete"}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      {/* Image Section */}
      <div className="gallery-card-image aspect-[16/10] relative">
        {hasImages ? (
          <>
            <img
              src={images[0]?.dataUrl}
              alt={images[0]?.title || "Idea screenshot"}
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
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-accent/10 to-accent-2/5">
            <div className={`p-4 rounded-xl ${directionConfig.bg.replace('/90', '/20')}`}>
              <DirectionIcon className={`h-8 w-8 ${directionConfig.color}`} />
            </div>
            {idea.pair && (
              <span className="mt-2 text-sm font-bold text-foreground">
                {idea.pair}
              </span>
            )}
          </div>
        )}

        {/* Direction indicator overlay */}
        <div className={`absolute bottom-3 left-3 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${directionConfig.bg} text-white`}>
          <DirectionIcon className="h-3 w-3" />
          {idea.direction?.toUpperCase() || "—"}
        </div>

        {/* Pair badge */}
        {idea.pair && hasImages && (
          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg text-xs font-bold bg-black/70 text-white">
            {idea.pair}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-4">
        {/* Top row: Title & Date */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold line-clamp-1 flex-1">
            {idea.title || "Untitled Idea"}
          </h3>
          <span className="text-xs text-muted-foreground shrink-0">{formattedDate}</span>
        </div>

        {/* Preview text */}
        {preview && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{preview}...</p>
        )}

        {/* Tags row */}
        {tagCount > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {idea.tags.slice(0, 2).map((tag, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-muted/50 text-muted-foreground">{tag}</span>
            ))}
            {tagCount > 2 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted/50 text-muted-foreground">+{tagCount - 2}</span>
            )}
          </div>
        )}

        {/* Status row */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-accent/10">
          <div className="flex items-center gap-2">
            {/* Status */}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConfig.bg} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            {/* Result (if not Unknown) */}
            {idea.result !== "Unknown" && (
              <span className={`flex items-center gap-0.5 text-xs ${resultConfig.color}`}>
                <ResultIcon className="h-3 w-3" />
              </span>
            )}
            {/* Indicators */}
            {imageCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                {imageCount}
              </span>
            )}
            {linkCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Link2 className="h-3 w-3" />
                {linkCount}
              </span>
            )}
          </div>

          {/* Quick result buttons - show on hover for Unknown results */}
          {idea.result === "Unknown" && idea.status !== "Archived" && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              <button
                onClick={(e) => handleQuickResult(e, "Worked")}
                className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 transition-colors"
                title="Worked"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => handleQuickResult(e, "Failed")}
                className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 transition-colors"
                title="Failed"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => handleQuickResult(e, "Partial")}
                className="p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 transition-colors"
                title="Partial"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Timeframe if set */}
          {idea.timeframe && (
            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/30">
              {idea.timeframe}
            </span>
          )}
        </div>
      </div>
    </motion.div>

    {/* Delete Confirmation Dialog */}
    <ConfirmDialog
      open={deleteConfirmOpen}
      onOpenChange={setDeleteConfirmOpen}
      title={t?.("tradingIdeas.deleteConfirmTitle") || "Delete Idea?"}
      description={t?.("tradingIdeas.deleteConfirmMessage") || "This trading idea will be permanently deleted. This action cannot be undone."}
      confirmText={t?.("common.delete") || "Delete"}
      cancelText={t?.("common.cancel") || "Cancel"}
      tone="danger"
      onConfirm={() => onDelete?.(idea.id)}
    />
    </>
  );
}
