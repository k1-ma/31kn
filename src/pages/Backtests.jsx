import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Header from "@/components/common/Header.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import BacktestCard from "@/components/backtest/BacktestCard.jsx";
import BacktestCreateModal from "@/components/backtest/BacktestCreateModal.jsx";
import BacktestShareModal from "@/components/backtest/BacktestShareModal.jsx";
import ShareLinkModal from "@/components/common/ShareLinkModal.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { Plus, FlaskConical, Search, ChevronDown, Check, ArrowUpDown, Archive } from "lucide-react";
import { uid } from "@/lib/utils.js";
import { motion, AnimatePresence } from "framer-motion";
import Switch from "@/components/ui/Switch.jsx";
import { isDeleted } from "@/lib/syncDb.js";

/** Compute PnL for a backtest (sum of allocations, fallback to trade.pnl) */
function backtestPnl(bt) {
  return (bt.trades || []).filter(tr => !isDeleted(tr)).reduce((sum, trade) => {
    const allocs = Array.isArray(trade.allocations) ? trade.allocations : [];
    return sum + (allocs.length > 0
      ? allocs.reduce((s, a) => s + (Number(a?.pnl) || 0), 0)
      : (Number(trade.pnl) || 0));
  }, 0);
}

/** Compute win rate for a backtest */
function backtestWinRate(bt) {
  const trades = (bt.trades || []).filter(tr => !isDeleted(tr));
  if (trades.length === 0) return 0;
  const wins = trades.filter(trade => {
    const allocs = Array.isArray(trade.allocations) ? trade.allocations : [];
    const pnl = allocs.length > 0
      ? allocs.reduce((s, a) => s + (Number(a?.pnl) || 0), 0)
      : (Number(trade.pnl) || 0);
    return pnl > 0;
  }).length;
  return wins / trades.length;
}

/** Premium sort dropdown matching DashboardFilterBar style */
function SortDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const handleKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handleClick);
      document.addEventListener("keydown", handleKey);
    }, 0);
    return () => { clearTimeout(timer); document.removeEventListener("pointerdown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, [open]);

  const selected = options.find(o => o.id === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-medium transition-all duration-200 ${
          open
            ? "bg-accent/10 border border-accent/30 text-foreground shadow-[0_1px_4px_rgba(59,130,246,0.08)]"
            : "bg-muted/30 dark:bg-white/[0.03] border border-border/50 dark:border-white/[0.08] text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05] hover:border-border dark:hover:border-white/[0.14] hover:text-foreground"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span className="max-w-[140px] truncate">{selected?.label || value}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute top-full right-0 mt-2 min-w-[200px] rounded-xl border border-border/50 dark:border-white/[0.08] bg-card/98 dark:bg-[#131722]/95 backdrop-blur-xl shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-[9999] overflow-hidden py-1"
            role="listbox"
          >
            {options.map((opt) => (
              <button
                key={opt.id}
                role="option"
                aria-selected={value === opt.id}
                onClick={() => { onChange(opt.id); setOpen(false); }}
                className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left text-[13px] transition-colors duration-150 ${
                  value === opt.id
                    ? "bg-accent/[0.08] text-foreground"
                    : "text-foreground/80 hover:bg-muted/30 dark:hover:bg-white/[0.04] hover:text-foreground"
                }`}
              >
                {opt.icon && <span className="text-muted-foreground/70">{opt.icon}</span>}
                <span className="flex-1">{opt.label}</span>
                {value === opt.id && <Check className="h-4 w-4 text-accent" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Backtests({
  backtests = [],
  uiBacktests = {},
  onCreateBacktest,
  onUpdateBacktest,
  onOpenBacktest,
  onDuplicateBacktest,
  onArchiveBacktest,
  onDeleteBacktest,
  reduceMotion,
  toast,
  libraries = {},
  flushSync,
  setShareInFlight,
}) {
  const { t } = useI18n();
  const [createOpen, setCreateOpen] = useState(false);
  const [editBacktest, setEditBacktest] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [shareBacktest, setShareBacktest] = useState(null);
  const [shareUrl, setShareUrl] = useState(null);

  // UI state
  const [query, setQuery] = useState(uiBacktests.query || "");
  const [showArchived, setShowArchived] = useState(uiBacktests.showArchived || false);
  const [sort, setSort] = useState(uiBacktests.sort || "updatedDesc");

  // Filter & sort
  const filtered = useMemo(() => {
    let list = backtests.filter((bt) => !isDeleted(bt));
    if (!showArchived) list = list.filter((bt) => !bt.archivedAt);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((bt) => (bt.name || "").toLowerCase().includes(q));
    }
    // Sort
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "updatedDesc": return (b.updatedAt || 0) - (a.updatedAt || 0);
        case "nameAsc": return (a.name || "").localeCompare(b.name || "");
        case "tradesDesc": return ((b.trades || []).filter(x => !isDeleted(x)).length) - ((a.trades || []).filter(x => !isDeleted(x)).length);
        case "tradesAsc": return ((a.trades || []).filter(x => !isDeleted(x)).length) - ((b.trades || []).filter(x => !isDeleted(x)).length);
        case "bestPnl": return backtestPnl(b) - backtestPnl(a);
        case "worstPnl": return backtestPnl(a) - backtestPnl(b);
        case "newest": return (b.createdAt || 0) - (a.createdAt || 0);
        case "winRate": return backtestWinRate(b) - backtestWinRate(a);
        default: return 0;
      }
    });
    return list;
  }, [backtests, query, showArchived, sort]);

  const handleCreate = useCallback((data) => {
    onCreateBacktest?.(data);
    toast?.add?.({ title: t("backtests.created"), variant: "success" });
  }, [onCreateBacktest, toast, t]);

  const handleRename = useCallback((id) => {
    const bt = backtests.find((b) => b.id === id);
    if (!bt) return;
    setRenameId(id);
    setRenameName(bt.name || "");
  }, [backtests]);

  const handleRenameSubmit = useCallback(() => {
    if (!renameId || !renameName.trim()) return;
    onUpdateBacktest?.(renameId, { name: renameName.trim(), updatedAt: Date.now() });
    setRenameId(null);
    setRenameName("");
  }, [renameId, renameName, onUpdateBacktest]);

  const handleDuplicate = useCallback((id) => {
    onDuplicateBacktest?.(id, t("backtests.copySuffix"));
    toast?.add?.({ title: t("backtests.duplicated"), variant: "success" });
  }, [onDuplicateBacktest, toast, t]);

  const handleArchive = useCallback((id) => {
    const bt = backtests.find((b) => b.id === id);
    if (!bt) return;
    if (bt.archivedAt) {
      onArchiveBacktest?.(id, false);
      toast?.add?.({ title: t("backtests.unarchived"), variant: "success" });
    } else {
      onArchiveBacktest?.(id, true);
      toast?.add?.({ title: t("backtests.archived"), variant: "success" });
    }
  }, [backtests, onArchiveBacktest, toast, t]);

  const handleDelete = useCallback((id) => {
    setDeleteConfirm(id);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    onDeleteBacktest?.(deleteConfirm);
    toast?.add?.({ title: t("backtests.deleted"), variant: "success" });
    setDeleteConfirm(null);
  }, [deleteConfirm, onDeleteBacktest, toast, t]);

  const handleEditSettings = useCallback((id) => {
    const bt = backtests.find((b) => b.id === id);
    if (bt) setEditBacktest(bt);
  }, [backtests]);

  const handleSaveEdit = useCallback((data) => {
    if (!editBacktest) return;
    onUpdateBacktest?.(editBacktest.id, { ...data, updatedAt: Date.now() });
    setEditBacktest(null);
    toast?.add?.({ title: t("backtests.saved"), variant: "success" });
  }, [editBacktest, onUpdateBacktest, toast, t]);

  const handleShare = useCallback((id) => {
    const bt = backtests.find((b) => b.id === id);
    if (bt) setShareBacktest(bt);
  }, [backtests]);

  const handleShareComplete = useCallback((url) => {
    setShareBacktest(null);
    if (url) setShareUrl(url);
  }, []);

  return (
    <div className="space-y-4">
      <Header
        title={t("backtests.title")}
        right={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("backtests.create")}
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("backtests.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-medium transition-all duration-200 ${
              showArchived
                ? "bg-accent/10 border border-accent/30 text-foreground shadow-[0_1px_4px_rgba(59,130,246,0.08)]"
                : "bg-muted/30 dark:bg-white/[0.03] border border-border/50 dark:border-white/[0.08] text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.05] hover:border-border dark:hover:border-white/[0.14] hover:text-foreground"
            }`}
            aria-pressed={showArchived}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>{t("backtests.showArchived")}</span>
          </button>
          <SortDropdown
            value={sort}
            onChange={setSort}
            options={[
              { id: "updatedDesc", label: t("backtests.sortUpdated") },
              { id: "newest", label: t("backtests.sortNewest") },
              { id: "nameAsc", label: t("backtests.sortName") },
              { id: "bestPnl", label: t("backtests.sortBestPnl") },
              { id: "worstPnl", label: t("backtests.sortWorstPnl") },
              { id: "winRate", label: t("backtests.sortWinRate") },
              { id: "tradesDesc", label: t("backtests.sortTrades") },
              { id: "tradesAsc", label: t("backtests.sortTradesAsc") },
            ]}
          />
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent/[0.08] dark:bg-accent/[0.12] flex items-center justify-center mb-4">
            <FlaskConical className="h-8 w-8 text-accent/60" />
          </div>
          <h3 className="text-[15px] font-semibold text-foreground mb-1">{t("backtests.empty")}</h3>
          <p className="text-[13px] text-muted-foreground mb-4 max-w-xs">{t("backtests.emptyDesc")}</p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("backtests.create")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((bt) => (
            <BacktestCard
              key={bt.id}
              backtest={bt}
              onOpen={() => onOpenBacktest?.(bt.id)}
              onRename={() => handleRename(bt.id)}
              onDuplicate={() => handleDuplicate(bt.id)}
              onArchive={() => handleArchive(bt.id)}
              onUnarchive={() => handleArchive(bt.id)}
              onDelete={() => handleDelete(bt.id)}
              onShare={() => handleShare(bt.id)}
            />
          ))}
        </div>
      )}

      {/* Rename inline dialog */}
      {renameId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t("backtests.rename")} onClick={() => setRenameId(null)}>
          <div
            className="bg-card dark:bg-[#1a1f2e] border border-border/50 dark:border-white/[0.08] rounded-xl shadow-2xl p-5 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-semibold text-foreground mb-3">{t("backtests.rename")}</h3>
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); }}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" size="sm" onClick={() => setRenameId(null)}>{t("common.cancel")}</Button>
              <Button size="sm" onClick={handleRenameSubmit} disabled={!renameName.trim()}>{t("common.save")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      <BacktestCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
        availableSymbols={(libraries.symbols || []).filter(s => !isDeleted(s)).map(s => s.name || s.id)}
      />

      {/* Edit settings modal */}
      {editBacktest && (
        <BacktestCreateModal
          open={!!editBacktest}
          onClose={() => setEditBacktest(null)}
          onSave={handleSaveEdit}
          editBacktest={editBacktest}
          availableSymbols={(libraries.symbols || []).filter(s => !isDeleted(s)).map(s => s.name || s.id)}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
        title={t("backtests.delete")}
        description={t("backtests.deleteConfirm")}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        tone="danger"
        onConfirm={confirmDelete}
        reduceMotion={reduceMotion}
      />

      {/* Share backtest modal */}
      {shareBacktest && (
        <BacktestShareModal
          open={!!shareBacktest}
          onOpenChange={(open) => { if (!open) setShareBacktest(null); }}
          backtest={shareBacktest}
          libraries={libraries}
          toast={toast}
          reduceMotion={reduceMotion}
          onShareComplete={handleShareComplete}
          flushSync={flushSync}
          setShareInFlight={setShareInFlight}
        />
      )}

      {/* Share link modal */}
      <ShareLinkModal
        open={!!shareUrl}
        onOpenChange={(open) => { if (!open) setShareUrl(null); }}
        shareUrl={shareUrl || ""}
        toast={toast}
        reduceMotion={reduceMotion}
      />
    </div>
  );
}
