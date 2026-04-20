import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Header from "@/components/common/Header.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Press from "@/components/common/Press.jsx";
import ShareLinkModal from "@/components/common/ShareLinkModal.jsx";
import IdeasGalleryGrid from "@/components/ideas/IdeasGalleryGrid.jsx";
import IdeaDetailPanel from "@/components/ideas/IdeaDetailPanel.jsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  Lightbulb, Plus, Search, TrendingUp, AlertTriangle, CheckCircle2,
  XCircle, HelpCircle, Activity, Share2, CheckSquare, LayoutGrid, RefreshCw
} from "lucide-react";
import { ideasApi } from "@/lib/api.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { uid } from "@/lib/utils";
import { createPublicShare, createShareWithToast, sanitizeIdeaForPublic, getIdeaShareUrl } from "@/lib/share.js";
import { useAuth } from "@/auth/AuthProvider.jsx";

// Constants for Trading Ideas
const STATUSES = ["Planned", "Active", "Closed", "Archived"];
const RESULTS = ["Unknown", "Worked", "Failed", "Partial"];

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD - Unified KPI card component with fixed height and centered content
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ icon, value, label, color, bg }) {
  return (
    <div className="rounded-xl border border-border/50 dark:border-white/10 bg-muted/30 dark:bg-white/5 backdrop-blur-md px-5 py-4 min-h-[84px] h-[84px] flex items-center">
      <div className="w-full flex items-center gap-4">
        <div className={`rounded-xl ${bg} shrink-0 flex items-center justify-center h-9 w-9`}>
          <span className={color}>{icon}</span>
        </div>
        <div className="min-w-0">
          <div className={`text-2xl font-semibold leading-none ${color}`}>{value}</div>
          <div className="text-xs text-muted-foreground leading-tight mt-1 truncate">{label}</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS WIDGET - KPI row with consistent height cards
// ─────────────────────────────────────────────────────────────────────────────

function StatsWidget({ stats, loading, t }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-[84px] rounded-xl bg-card/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { 
      label: t("tradingIdeas.stats.total") || "Total Ideas", 
      value: stats.total || 0, 
      icon: <Lightbulb className="h-5 w-5" />, 
      color: "text-blue-400",
      bg: "bg-blue-500/10"
    },
    { 
      label: t("tradingIdeas.stats.active") || "Active", 
      value: stats.active || 0, 
      icon: <Activity className="h-5 w-5" />, 
      color: "text-emerald-400",
      bg: "bg-emerald-500/10"
    },
    { 
      label: t("tradingIdeas.stats.worked") || "Worked", 
      value: stats.worked || 0, 
      icon: <CheckCircle2 className="h-5 w-5" />, 
      color: "text-emerald-400",
      bg: "bg-emerald-500/10"
    },
    { 
      label: t("tradingIdeas.stats.failed") || "Failed", 
      value: stats.failed || 0, 
      icon: <XCircle className="h-5 w-5" />, 
      color: "text-red-400",
      bg: "bg-red-500/10"
    },
    { 
      label: t("tradingIdeas.stats.successRate") || "Success Rate", 
      value: `${stats.successRate || 0}%`, 
      icon: <TrendingUp className="h-5 w-5" />, 
      color: stats.successRate >= 50 ? "text-emerald-400" : "text-amber-400",
      bg: stats.successRate >= 50 ? "bg-emerald-500/10" : "bg-amber-500/10"
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
      {statCards.map((stat, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <StatCard
            icon={stat.icon}
            value={stat.value}
            label={stat.label}
            color={stat.color}
            bg={stat.bg}
          />
        </motion.div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER CHIPS - Mobile-friendly filter buttons
// ─────────────────────────────────────────────────────────────────────────────

function FilterChips({ statusFilter, resultFilter, onStatusChange, onResultChange, t }) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Status Filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">{t("tradingIdeas.statusLabel") || "Status"}:</span>
        <button
          onClick={() => onStatusChange("")}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            !statusFilter 
              ? "bg-accent text-white" 
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {t("common.all") || "All"}
        </button>
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => onStatusChange(s === statusFilter ? "" : s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-accent text-white"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {t(`tradingIdeas.status.${s.toLowerCase()}`) || s}
          </button>
        ))}
      </div>
      
      {/* Result Filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">{t("tradingIdeas.resultLabel") || "Result"}:</span>
        <button
          onClick={() => onResultChange("")}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            !resultFilter 
              ? "bg-accent text-white" 
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
          }`}
        >
          {t("common.all") || "All"}
        </button>
        {RESULTS.filter(r => r !== "Unknown").map(r => (
          <button
            key={r}
            onClick={() => onResultChange(r === resultFilter ? "" : r)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
              resultFilter === r
                ? r === "Worked" ? "bg-emerald-500 text-white"
                  : r === "Failed" ? "bg-red-500 text-white"
                  : "bg-amber-500 text-white"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {r === "Worked" && <CheckCircle2 className="h-3 w-3" />}
            {r === "Failed" && <XCircle className="h-3 w-3" />}
            {r === "Partial" && <AlertTriangle className="h-3 w-3" />}
            {t(`tradingIdeas.result.${r.toLowerCase()}`) || r}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function Ideas({ libraries, reduceMotion, trades = [], onIdeaSaved, selectedIdeaId, onClearSelectedIdea, onNavigateToTrade, modelsEnabled }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [ideas, setIdeas] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  
  // Error state for better UX
  const [loadError, setLoadError] = useState(null);
  
  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);
  
  // Share modal
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  
  // Toasts
  const [toasts, setToasts] = useState([]);
  
  // Ref to track if a database error toast has already been shown (to prevent spam)
  const dbErrorShownRef = useRef(false);

  const toast = useMemo(() => ({
    push: (t) => {
      const id = uid();
      setToasts(prev => [...prev, { ...t, id }]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 3000);
    },
    dismiss: (id) => setToasts(prev => prev.filter(t => t.id !== id)),
  }), []);

  // Load ideas
  const loadIdeas = useCallback(async () => {
    setLoadError(null);
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      if (resultFilter) filters.result = resultFilter;
      if (search) filters.search = search;
      const res = await ideasApi.list(filters);
      setIdeas(res?.ideas || []);
      // Reset db error flag on successful load
      dbErrorShownRef.current = false;
    } catch (e) {
      console.error("Failed to load ideas:", e);
      // Set error state for UI feedback
      setLoadError({
        message: e.status === 503 
          ? (t("common.dbUnavailable") || "Database temporarily unavailable") 
          : (e.message || t("common.error") || "Error"),
        code: e.status || 0,
      });
      // Only show db error toast once to prevent spam (503 = db unavailable)
      const isDbError = e.status === 503 || e.status === 0;
      if (!isDbError || !dbErrorShownRef.current) {
        toast.push({ title: t("common.error") || "Error", description: e.message, variant: "destructive" });
        if (isDbError) {
          dbErrorShownRef.current = true;
        }
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, resultFilter, search, t, toast]);

  const loadStats = useCallback(async () => {
    try {
      const res = await ideasApi.stats();
      setStats(res);
    } catch (e) {
      console.error("Failed to load stats:", e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Pre-compute idea lookup map for O(1) lookups
  const ideaById = useMemo(() => {
    const map = new Map();
    for (const idea of ideas) {
      map.set(String(idea.id), idea);
    }
    return map;
  }, [ideas]);

  // Handle selected idea from navigation (e.g., from trade editor)
  useEffect(() => {
    if (selectedIdeaId && !loading && ideas.length > 0) {
      const idea = ideaById.get(String(selectedIdeaId));
      if (idea) {
        setEditingIdea(idea);
        setPanelOpen(true);
      }
      onClearSelectedIdea?.();
    }
  }, [selectedIdeaId, ideaById, loading, onClearSelectedIdea, ideas.length]);

  // Retry handler for error state
  const handleRetry = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    dbErrorShownRef.current = false;
    loadIdeas();
    loadStats();
  }, [loadIdeas, loadStats]);

  // CRUD handlers
  const handleSaveIdea = async (ideaData) => {
    try {
      // Get previous linkedTradeIds for sync
      const prevIdea = ideas.find(i => i.id === ideaData.id);
      const prevLinkedTradeIds = prevIdea?.linked_trade_ids 
        ? (Array.isArray(prevIdea.linked_trade_ids) ? prevIdea.linked_trade_ids 
          : (typeof prevIdea.linked_trade_ids === 'string' ? JSON.parse(prevIdea.linked_trade_ids || '[]') : []))
        : [];
      
      if (ideaData.id) {
        await ideasApi.update(ideaData.id, ideaData);
        toast.push({ title: t("tradingIdeas.ideaUpdated") || "Idea updated" });
      } else {
        await ideasApi.create(ideaData);
        toast.push({ title: t("tradingIdeas.ideaCreated") || "Idea created" });
      }
      
      // Sync linkedTradeIds changes to trades' ideaIds
      if (onIdeaSaved && ideaData.id) {
        onIdeaSaved(ideaData, prevLinkedTradeIds);
      }
      
      loadIdeas();
      loadStats();
    } catch (e) {
      toast.push({ title: t("common.error") || "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteIdea = async (id) => {
    try {
      await ideasApi.delete(id);
      toast.push({ title: t("tradingIdeas.ideaDeleted") || "Idea deleted" });
      loadIdeas();
      loadStats();
    } catch (e) {
      toast.push({ title: t("common.error") || "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleQuickResult = async (id, result) => {
    try {
      await ideasApi.update(id, { result, status: "Closed" });
      toast.push({ title: t("tradingIdeas.resultUpdated") || "Result updated" });
      loadIdeas();
      loadStats();
    } catch (e) {
      toast.push({ title: t("common.error") || "Error", description: e.message, variant: "destructive" });
    }
  };

  // Selection mode handlers
  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectedIds([]);
    }
    setSelectionMode(!selectionMode);
  };

  const toggleIdeaSelection = (ideaId) => {
    setSelectedIds((prev) =>
      prev.includes(ideaId) ? prev.filter((id) => id !== ideaId) : [...prev, ideaId]
    );
  };

  const selectAllFiltered = () => {
    const allIds = ideas.map((idea) => idea.id);
    setSelectedIds(allIds);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleShareSelected = async () => {
    if (selectedIds.length === 0) return;
    
    const selectedIdeas = selectedIds
      .map(id => ideas.find(i => i.id === id))
      .filter(Boolean);
    if (selectedIdeas.length === 0) return;
    
    const authorName = (user?.display_name || user?.nickname || user?.username || "").trim() || "Trader";
    const sanitizedIdeas = selectedIdeas.map(i => sanitizeIdeaForPublic(i, trades || [], libraries || {})).filter(Boolean);
    
    // Backward compatible: keep `idea` for single, add `ideas` array for multiple
    const payload = {
      idea: sanitizedIdeas[0],
      ideas: sanitizedIdeas,
      authorName,
    };
    
    const title = sanitizedIdeas.length === 1
      ? (sanitizedIdeas[0].title || "Trading Idea")
      : `${sanitizedIdeas.length} Trading Ideas`;
    
    const url = await createShareWithToast({
      type: "idea",
      payload,
      title,
      getUrl: getIdeaShareUrl,
      toast,
    });
    
    if (url) {
      setShareUrl(url);
      setShareModalOpen(true);
    }
    
    // Exit selection mode after sharing
    setSelectionMode(false);
    setSelectedIds([]);
  };

  // Open panel
  const openIdea = (idea = null) => {
    setEditingIdea(idea);
    setPanelOpen(true);
  };

  const handleIdeaClick = (idea) => {
    if (selectionMode) {
      toggleIdeaSelection(idea.id);
    } else {
      openIdea(idea);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <Header
        title={t("tradingIdeas.title") || "Trading Ideas"}
        subtitle={t("tradingIdeas.subtitle") || "Track and evaluate your trading ideas"}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[160px] sm:min-w-[200px] max-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("tradingIdeas.searchPlaceholder") || "Search ideas..."}
                className="pl-9 h-10"
              />
            </div>

            {/* Select mode toggle */}
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button 
                variant={selectionMode ? "secondary" : "outline"} 
                onClick={toggleSelectionMode}
                className={selectionMode ? "border-accent/40" : ""}
                size="sm"
              >
                <CheckSquare className="h-4 w-4" />
                <span className="hidden sm:inline ml-1.5">{selectionMode ? t("common.cancel") || "Cancel" : t("common.select") || "Select"}</span>
              </Button>
            </Press>

            {/* New idea button */}
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button onClick={() => openIdea()}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline ml-1.5">{t("tradingIdeas.create") || "New Idea"}</span>
              </Button>
            </Press>
          </div>
        }
      />

      {/* Stats */}
      <StatsWidget stats={stats} loading={statsLoading} t={t} />

      {/* Filters */}
      <div className="rounded-xl border border-accent/15 bg-card/50 backdrop-blur p-4">
        <FilterChips 
          statusFilter={statusFilter}
          resultFilter={resultFilter}
          onStatusChange={setStatusFilter}
          onResultChange={setResultFilter}
          t={t}
        />
      </div>

      {/* Selection Action Bar */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-accent/20 bg-card/90 glass p-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {selectedIds.length} {t("common.selected") || "selected"}
              </span>
              <button
                onClick={selectAllFiltered}
                className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
              >
                {t("common.selectAll") || "Select All"} ({ideas.length})
              </button>
              {selectedIds.length > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  {t("common.clearSelection") || "Clear"}
                </button>
              )}
            </div>
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button
                onClick={handleShareSelected}
                disabled={selectedIds.length === 0}
                className="gap-1.5"
                size="sm"
              >
                <Share2 className="h-4 w-4" />
                {t("common.share") || "Share"} {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
              </Button>
            </Press>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{ideas.length} {t("tradingIdeas.ideasCount") || "ideas"}</span>
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4" />
          <span>{t("tradingIdeas.galleryView") || "Gallery View"}</span>
        </div>
      </div>

      {/* Ideas Grid */}
      {loadError && !loading ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <div className="text-lg font-medium text-foreground mb-2">
            {t("common.loadFailed") || "Couldn't load data"}
          </div>
          <div className="text-sm text-muted-foreground mb-4">
            {loadError.message}
          </div>
          <Button onClick={handleRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t("common.retry") || "Retry"}
          </Button>
          {loadError.code ? (
            <div className="text-xs text-muted-foreground mt-3">
              Code: {loadError.code}
            </div>
          ) : null}
        </div>
      ) : (
        <IdeasGalleryGrid
          ideas={ideas}
          loading={loading}
          onIdeaClick={handleIdeaClick}
          onQuickResult={handleQuickResult}
          onDeleteIdea={handleDeleteIdea}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleIdeaSelection}
          reduceMotion={reduceMotion}
          emptyMessage={t("tradingIdeas.empty") || "No trading ideas yet"}
          emptyHint={t("tradingIdeas.emptyHint") || "Create your first trading idea to get started"}
          t={t}
        />
      )}

      {/* Empty state action */}
      {!loading && !loadError && ideas.length === 0 && (
        <div className="flex justify-center">
          <Button onClick={() => openIdea()} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            {t("tradingIdeas.createFirst") || "Create Your First Idea"}
          </Button>
        </div>
      )}

      {/* Detail Panel */}
      <IdeaDetailPanel
        idea={editingIdea}
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setEditingIdea(null); }}
        onSave={handleSaveIdea}
        onDelete={handleDeleteIdea}
        toast={toast}
        libraries={libraries}
        trades={trades}
        user={user}
        t={t}
        onNavigateToTrade={onNavigateToTrade}
        modelsEnabled={modelsEnabled}
      />

      {/* Share Modal */}
      <ShareLinkModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        shareUrl={shareUrl}
        toast={toast}
      />

      {/* Toasts */}
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className={`fixed bottom-4 left-1/2 z-50 px-4 py-3 rounded-xl shadow-lg max-w-sm ${
              toast.variant === "destructive" ? "bg-red-500 text-white" : "bg-card border border-accent/30"
            }`}
          >
            <div className="font-medium text-sm">{toast.title}</div>
            {toast.description && <div className="text-xs text-muted-foreground mt-1">{toast.description}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
