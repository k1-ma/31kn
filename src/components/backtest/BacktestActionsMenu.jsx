import React, { useState, useRef, useEffect, useCallback } from "react";
import { MoreHorizontal, ExternalLink, Pencil, Copy, Archive, ArchiveRestore, Trash2, Share2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function BacktestActionsMenu({ onOpen, onRename, onDuplicate, onArchive, onUnarchive, onDelete, onShare, isArchived }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const items = [
    { label: t("backtests.open"), icon: <ExternalLink className="h-3.5 w-3.5" />, onClick: onOpen },
    { label: t("backtests.rename"), icon: <Pencil className="h-3.5 w-3.5" />, onClick: onRename },
    { label: t("backtests.duplicate"), icon: <Copy className="h-3.5 w-3.5" />, onClick: onDuplicate },
    { label: t("backtests.share") || "Share", icon: <Share2 className="h-3.5 w-3.5" />, onClick: onShare },
    { divider: true },
    isArchived
      ? { label: t("backtests.unarchive"), icon: <ArchiveRestore className="h-3.5 w-3.5" />, onClick: onUnarchive }
      : { label: t("backtests.archive"), icon: <Archive className="h-3.5 w-3.5" />, onClick: onArchive },
    { label: t("backtests.delete"), icon: <Trash2 className="h-3.5 w-3.5" />, onClick: onDelete, danger: true },
  ];

  const actionItems = items.filter(i => !i.divider);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auto flip: check if menu overflows viewport bottom
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 260);
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!open) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((prev) => {
        let next = prev + 1;
        while (next < actionItems.length && actionItems[next]?.divider) next++;
        return next >= actionItems.length ? 0 : next;
      });
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((prev) => {
        let next = prev - 1;
        while (next >= 0 && actionItems[next]?.divider) next--;
        return next < 0 ? actionItems.length - 1 : next;
      });
    }
    if (e.key === "Enter" && focusIdx >= 0 && focusIdx < actionItems.length) {
      e.preventDefault();
      setOpen(false);
      actionItems[focusIdx]?.onClick?.();
    }
  }, [open, focusIdx, actionItems]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // Reset focus when opening
  useEffect(() => {
    if (open) setFocusIdx(-1);
  }, [open]);

  let actionIdx = -1;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={
          "p-1.5 rounded-lg transition-all duration-150 " +
          (open
            ? "bg-accent/10 text-accent"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/[0.06] dark:hover:bg-white/[0.06]")
        }
        aria-label="Actions"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={
            "absolute right-0 w-52 bg-card dark:bg-[#1a1f2e] border border-border/50 dark:border-white/[0.08] " +
            "rounded-xl shadow-2xl dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)] py-1.5 z-[9999] " +
            "animate-in fade-in-0 zoom-in-95 duration-150 " +
            (dropUp ? "bottom-full mb-1" : "top-full mt-1")
          }
          role="menu"
        >
          {items.map((item, i) => {
            if (item.divider) {
              return <div key={i} className="h-px bg-border/30 dark:bg-white/[0.06] my-1.5 mx-2" />;
            }
            actionIdx++;
            const isActive = focusIdx === actionIdx;
            return (
              <button
                key={i}
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick?.(); }}
                onMouseEnter={() => setFocusIdx(items.slice(0, i).filter(x => !x.divider).length)}
                className={
                  "w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-all duration-100 rounded-lg mx-0 " +
                  (item.danger
                    ? (isActive
                        ? "bg-red-500/10 text-red-400"
                        : "text-red-500 dark:text-red-400 hover:bg-red-500/[0.08]")
                    : (isActive
                        ? "bg-accent/[0.08] dark:bg-white/[0.06] text-foreground"
                        : "text-foreground/90 hover:bg-accent/[0.06] dark:hover:bg-white/[0.04]"))
                }
              >
                <span className={item.danger ? "" : "text-muted-foreground"}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
