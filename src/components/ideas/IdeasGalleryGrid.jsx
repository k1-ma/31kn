import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import IdeaGalleryCard from "./IdeaGalleryCard.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";
import { Calendar, Lightbulb } from "lucide-react";

// Responsive grid classes for consistent layout
const GRID_CLASSES = "grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";

// Group ideas by month
function groupByMonth(ideas) {
  const groups = new Map();
  
  for (const idea of ideas) {
    const raw = idea.idea_date || idea.ideaDate || idea.created_at;
    const date = raw ? new Date(raw) : null;
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
      groups.set(key, { key, sortKey, ideas: [] });
    }
    groups.get(key).ideas.push(idea);
  }
  
  // Sort groups by date descending (newest first)
  return Array.from(groups.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/**
 * Responsive grid for gallery view of trading ideas with month grouping
 */
export default function IdeasGalleryGrid({
  ideas,
  loading,
  onIdeaClick,
  onQuickResult,
  onDeleteIdea,
  selectionMode,
  selectedIds,
  onToggleSelect,
  reduceMotion,
  groupByDate = true,
  emptyMessage = "No trading ideas yet",
  emptyHint = "Create your first trading idea to get started",
  t,
}) {
  // Group ideas by month
  const groupedIdeas = useMemo(() => {
    if (!groupByDate) return null;
    return groupByMonth(ideas);
  }, [ideas, groupByDate]);

  if (loading) {
    return (
      <div className={GRID_CLASSES}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="gallery-card">
            <Skeleton className="aspect-[16/10] w-full" />
            <div className="p-4 space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-8 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-20 w-20 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
          <Lightbulb className="h-10 w-10 text-accent/50" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{emptyMessage}</h3>
        <p className="text-muted-foreground text-center max-w-md">{emptyHint}</p>
      </div>
    );
  }

  // Render helper for idea cards
  const renderIdeaCard = (idea, idx) => {
    const isSelected = selectedIds?.includes(idea.id);

    return (
      <IdeaGalleryCard
        key={idea.id}
        idea={idea}
        onClick={() => onIdeaClick(idea)}
        onQuickResult={onQuickResult}
        onDelete={onDeleteIdea}
        isSelected={isSelected}
        selectionMode={selectionMode}
        onToggleSelect={onToggleSelect}
        reduceMotion={reduceMotion}
        index={idx}
        t={t}
      />
    );
  };

  // If grouping is enabled, render with month headers
  if (groupByDate && groupedIdeas) {
    return (
      <div className="space-y-8">
        {groupedIdeas.map((group, groupIdx) => (
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
                {group.ideas.length} ideas
              </span>
            </div>
            
            {/* Ideas Grid */}
            <div className={GRID_CLASSES}>
              <AnimatePresence mode="popLayout">
                {group.ideas.map((idea, idx) => renderIdeaCard(idea, idx))}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  // Original flat grid (no grouping)
  return (
    <div className={GRID_CLASSES}>
      <AnimatePresence mode="popLayout">
        {ideas.map((idea, idx) => renderIdeaCard(idea, idx))}
      </AnimatePresence>
    </div>
  );
}
