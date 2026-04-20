import React, { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Save, Trash2, Share2, Copy, Check, ArrowUpRight, ArrowDownRight,
  TrendingUp, Tag, Plus, Image, ImagePlus, Link2, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, Clock, Calendar,
  ChevronLeft, ChevronRight, BarChart3, Youtube, BookOpen, FileText, Globe
} from "lucide-react";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Badge from "@/components/ui/Badge.jsx";
import RichTextEditor from "@/components/common/RichTextEditor.jsx";
import SelectDropdown from "@/components/common/SelectDropdown.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";
import ImageRemoveButton from "@/components/common/ImageRemoveButton.jsx";
import { uid, resizeImageFileToDataUrl } from "@/lib/utils";
import { createPublicShare, sanitizeIdeaForPublic, getIdeaShareUrl } from "@/lib/share.js";
import { isDeleted } from "@/lib/syncDb.js";

// Constants
const DIRECTIONS = ["Long", "Short", "Both"];
const STATUSES = ["Planned", "Active", "Closed", "Archived"];
const RESULTS = ["Unknown", "Worked", "Failed", "Partial"];

// Predefined timeframe options
const TIMEFRAMES = ["M1", "M3", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN"];

// Link type configuration
const LINK_TYPES = {
  tradingview: { label: "TradingView", icon: BarChart3, color: "text-blue-400" },
  youtube: { label: "YouTube", icon: Youtube, color: "text-red-400" },
  notion: { label: "Notion", icon: BookOpen, color: "text-slate-400" },
  article: { label: "Article", icon: FileText, color: "text-emerald-400" },
  other: { label: "Other", icon: Globe, color: "text-muted-foreground" },
};

// Direction styles
const DIRECTION_STYLES = {
  Long: { color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", icon: ArrowUpRight },
  Short: { color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/30", icon: ArrowDownRight },
  Both: { color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/30", icon: TrendingUp },
};

// Result styles
const RESULT_STYLES = {
  Unknown: { color: "text-slate-400", bg: "bg-slate-500/15", icon: HelpCircle },
  Worked: { color: "text-emerald-400", bg: "bg-emerald-500/15", icon: CheckCircle2 },
  Failed: { color: "text-red-400", bg: "bg-red-500/15", icon: XCircle },
  Partial: { color: "text-amber-400", bg: "bg-amber-500/15", icon: AlertTriangle },
};

// Status styles
const STATUS_STYLES = {
  Planned: { color: "text-blue-400", bg: "bg-blue-500/10" },
  Active: { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  Closed: { color: "text-slate-400", bg: "bg-slate-500/10" },
  Archived: { color: "text-amber-400", bg: "bg-amber-500/10" },
};

const isValidUrl = (url) => {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
};

function createEmptyIdea() {
  return {
    title: "",
    pair: "",
    direction: "Long",
    timeframe: "",
    modelId: "",
    status: "Planned",
    result: "Unknown",
    notes_html: "",
    notes_text: "",
    links: [],
    images: [],
    tags: [],
    linkedTradeIds: [],
    ideaDate: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Full-screen slide-out panel for viewing/editing an idea
 */
export default function IdeaDetailPanel({
  idea,
  open,
  onClose,
  onSave,
  onDelete,
  toast,
  libraries,
  trades = [],
  user,
  t,
  onNavigateToTrade,
  modelsEnabled = false,
}) {
  const [editIdea, setEditIdea] = useState(idea || createEmptyIdea());
  const [newTag, setNewTag] = useState("");
  const [shareUrl, setShareUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [customTimeframe, setCustomTimeframe] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const panelRef = useRef(null);

  // Get active symbols from libraries
  const symbols = useMemo(() => {
    return (libraries?.symbols || []).filter(s => !isDeleted(s));
  }, [libraries]);

  // Get active models from libraries
  const models = useMemo(() => {
    return (libraries?.models || []).filter(m => !isDeleted(m));
  }, [libraries]);

  // Check if current timeframe is custom (not in preset list)
  const isCustomTimeframe = useMemo(() => {
    const tf = editIdea.timeframe?.toUpperCase();
    return tf && !TIMEFRAMES.includes(tf);
  }, [editIdea.timeframe]);

  // Get linked trades details (now supports multiple)
  const linkedTrades = useMemo(() => {
    const tradeIds = editIdea.linkedTradeIds || [];
    if (!tradeIds.length) return [];
    return trades.filter(t => tradeIds.includes(t.id));
  }, [editIdea.linkedTradeIds, trades]);

  useEffect(() => {
    if (idea) {
      // Parse linked_trade_ids from server (snake_case) or linkedTradeIds (camelCase) or legacy linkedTradeId (single)
      let linkedTradeIds = [];
      if (Array.isArray(idea.linked_trade_ids)) {
        linkedTradeIds = idea.linked_trade_ids;
      } else if (typeof idea.linked_trade_ids === 'string') {
        try { linkedTradeIds = JSON.parse(idea.linked_trade_ids); } catch { linkedTradeIds = []; }
      } else if (Array.isArray(idea.linkedTradeIds)) {
        linkedTradeIds = idea.linkedTradeIds;
      } else if (idea.linkedTradeId || idea.linked_trade_id) {
        // Legacy: single linkedTradeId -> convert to array
        linkedTradeIds = [idea.linkedTradeId || idea.linked_trade_id];
      }
      
      setEditIdea({
        ...idea,
        links: Array.isArray(idea.links) ? idea.links : (typeof idea.links === 'string' ? JSON.parse(idea.links || '[]') : []),
        images: Array.isArray(idea.images) ? idea.images : (typeof idea.images === 'string' ? JSON.parse(idea.images || '[]') : []),
        tags: Array.isArray(idea.tags) ? idea.tags : (typeof idea.tags === 'string' ? JSON.parse(idea.tags || '[]') : []),
        linkedTradeIds: linkedTradeIds.filter(Boolean),
        modelId: idea.modelId || idea.model_id || "",
        ideaDate: idea.idea_date || idea.ideaDate || (idea.created_at ? new Date(idea.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
      });
      // Set custom timeframe if not in preset list
      const tf = idea.timeframe?.toUpperCase();
      if (tf && !TIMEFRAMES.includes(tf)) {
        setCustomTimeframe(idea.timeframe);
      } else {
        setCustomTimeframe("");
      }
    } else {
      setEditIdea(createEmptyIdea());
      setCustomTimeframe("");
    }
    setShareUrl(null);
    setCopied(false);
  }, [idea, open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [open]);

  const handleSave = async () => {
    if (!editIdea.title?.trim()) {
      toast?.push({ title: t?.("tradingIdeas.titleRequired") || "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onSave?.(editIdea);
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    // Use original idea data for sharing to avoid sharing unsaved changes
    const ideaToShare = idea?.id ? idea : editIdea;
    const authorName = user?.display_name || user?.nickname || user?.username || "Anonymous";
    const sanitizedIdea = sanitizeIdeaForPublic(ideaToShare, trades || [], libraries || {});
    const payload = { idea: sanitizedIdea, authorName };
    
    try {
      const result = await createPublicShare({
        type: "idea",
        payload,
        title: ideaToShare.title || "Trading Idea"
      });
      const url = getIdeaShareUrl(result.shareId);
      setShareUrl(url);
      navigator.clipboard?.writeText(url).then(() => {
        setCopied(true);
        toast?.push({ title: t?.("common.copied") || "Link copied!", description: url });
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    } catch (err) {
      console.error("Failed to create share:", err);
      toast?.push({ title: "Error", description: err.message || "Failed to create share link", variant: "error" });
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editIdea.tags.includes(newTag.trim())) {
      setEditIdea({ ...editIdea, tags: [...editIdea.tags, newTag.trim()] });
      setNewTag("");
    }
  };

  const handleContentChange = (html, text) => {
    setEditIdea({ ...editIdea, notes_html: html, notes_text: text });
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;
    
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast?.push({ title: t?.("common.error") || "Invalid file type", description: t?.("tradingIdeas.invalidImageType") || "Please upload a valid image", variant: "destructive" });
        continue;
      }
      
      if (file.size > maxSize) {
        toast?.push({ title: t?.("common.error") || "File too large", description: t?.("tradingIdeas.imageTooLarge") || "Maximum file size is 5MB", variant: "destructive" });
        continue;
      }
      
      try {
        const dataUrl = await resizeImageFileToDataUrl(file, { maxSize: 1920, quality: 0.92 });
        setEditIdea(prev => ({
          ...prev,
          images: [...(prev.images || []), { id: uid(), title: file.name, dataUrl }]
        }));
      } catch (err) {
        console.error('Image upload failed:', err);
        toast?.push({ title: t?.("common.error") || "Error", description: "Failed to process image", variant: "destructive" });
      }
    }
    e.target.value = "";
  };

  // Handle clipboard paste for images
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    
    if (imageFiles.length === 0) return;
    e.preventDefault();
    
    for (const file of imageFiles) {
      try {
        const dataUrl = await resizeImageFileToDataUrl(file, { maxSize: 1920, quality: 0.92 });
        const imageName = t?.("tradingIdeas.pastedImage") || "Pasted image";
        setEditIdea(prev => ({
          ...prev,
          images: [...(prev.images || []), { id: uid(), title: imageName, dataUrl }]
        }));
      } catch (err) {
        console.error('Image paste failed:', err);
        toast?.push({ title: t?.("common.error") || "Error", description: "Failed to paste image", variant: "destructive" });
      }
    }
  };

  const removeImage = (index) => {
    setEditIdea({
      ...editIdea,
      images: editIdea.images.filter((_, i) => i !== index)
    });
  };

  const addLink = () => {
    setEditIdea({
      ...editIdea,
      links: [...(editIdea.links || []), { id: uid(), label: "", url: "", kind: "other" }]
    });
  };

  const updateLink = (index, patch) => {
    setEditIdea({
      ...editIdea,
      links: editIdea.links.map((l, i) => i === index ? { ...l, ...patch } : l)
    });
  };

  const removeLink = (index) => {
    setEditIdea({
      ...editIdea,
      links: editIdea.links.filter((_, i) => i !== index)
    });
  };

  const removeTag = (tag) => {
    setEditIdea({
      ...editIdea,
      tags: editIdea.tags.filter(t => t !== tag)
    });
  };

  const directionConfig = DIRECTION_STYLES[editIdea.direction] || DIRECTION_STYLES.Long;
  const DirectionIcon = directionConfig.icon;
  const isNew = !idea?.id;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-full sm:w-[600px] md:w-[700px] lg:w-[800px] bg-[rgb(var(--bg))] border-l border-accent/20 shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-accent/15 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={onClose}
                    className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className={`shrink-0 p-2 rounded-xl ${directionConfig.bg} ${directionConfig.border} border`}>
                    <DirectionIcon className={`h-5 w-5 ${directionConfig.color}`} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">
                      {isNew ? (t?.("tradingIdeas.create") || "New Trading Idea") : (editIdea.title || t?.("common.untitled") || "Untitled")}
                    </h2>
                    {editIdea.pair && (
                      <p className="text-xs text-muted-foreground">{editIdea.pair} • {editIdea.direction}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {!isNew && (
                    <Button variant="outline" size="sm" onClick={handleShare} className="hidden sm:flex">
                      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                      <span className="hidden md:inline ml-1">{copied ? "Copied!" : "Share"}</span>
                    </Button>
                  )}
                  <Button onClick={handleSave} size="sm" disabled={saving}>
                    <Save className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">{saving ? "Saving..." : "Save"}</span>
                  </Button>
                </div>
              </div>
              
              {/* Share URL display */}
              {shareUrl && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-3 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                >
                  <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-xs text-emerald-400 truncate flex-1">{shareUrl}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(shareUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="p-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-emerald-400" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4 sm:p-6 space-y-6">
                
                {/* Basic Info Section */}
                <div className="space-y-4">
                  {/* Pair + Direction + Timeframe */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">{t?.("tradingIdeas.pair") || "Pair"}</label>
                      <select
                        value={editIdea.pair}
                        onChange={(e) => setEditIdea({ ...editIdea, pair: e.target.value })}
                        className="h-10 w-full rounded-xl bg-card/50 border border-accent/20 px-3 text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/20 outline-none transition-colors"
                      >
                        <option value="">{t?.("tradingIdeas.selectPair") || "Select pair..."}</option>
                        {symbols.map(s => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">{t?.("tradingIdeas.directionLabel") || "Direction"}</label>
                      <div className="flex rounded-xl border border-accent/20 overflow-hidden">
                        {DIRECTIONS.map(d => {
                          const config = DIRECTION_STYLES[d];
                          const Icon = config.icon;
                          const isActive = editIdea.direction === d;
                          return (
                            <button
                              key={d}
                              onClick={() => setEditIdea({ ...editIdea, direction: d })}
                              className={`flex-1 h-10 flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
                                isActive 
                                  ? `${config.bg} ${config.color} ${config.border}` 
                                  : "hover:bg-accent/10"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">{t?.("tradingIdeas.timeframe") || "Timeframe"}</label>
                      <div className="flex flex-wrap gap-1.5">
                        {TIMEFRAMES.map(tf => (
                          <button
                            key={tf}
                            type="button"
                            onClick={() => {
                              setEditIdea({ ...editIdea, timeframe: tf });
                              setCustomTimeframe("");
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              editIdea.timeframe?.toUpperCase() === tf
                                ? "bg-accent/20 border-accent/40 text-accent"
                                : "bg-card/50 border-accent/15 text-muted-foreground hover:bg-accent/10 hover:border-accent/30"
                            }`}
                          >
                            {tf}
                          </button>
                        ))}
                        <div className="relative">
                          <Input
                            value={customTimeframe}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setCustomTimeframe(val);
                              // Update idea timeframe: set to custom value or clear if empty
                              setEditIdea({ ...editIdea, timeframe: val.trim() || "" });
                            }}
                            placeholder={t?.("tradingIdeas.customTimeframe") || "Custom..."}
                            className={`h-8 w-24 text-xs ${isCustomTimeframe ? "border-accent/40 bg-accent/10" : ""}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Model */}
                  {modelsEnabled && models.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">{t?.("tradingIdeas.model") || "Model"}</label>
                      <select
                        value={editIdea.modelId || ""}
                        onChange={(e) => setEditIdea({ ...editIdea, modelId: e.target.value })}
                        className="h-10 w-full rounded-xl bg-card/50 border border-accent/20 px-3 text-sm focus:border-accent/50 focus:ring-2 focus:ring-accent/20 outline-none transition-colors"
                      >
                        <option value="">{t?.("tradingIdeas.noModel") || "No model"}</option>
                        {models.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">{t?.("tradingIdeas.title") || "Title"} *</label>
                    <Input
                      value={editIdea.title}
                      onChange={(e) => setEditIdea({ ...editIdea, title: e.target.value })}
                      placeholder={t?.("tradingIdeas.titlePlaceholder") || "Describe your trading idea..."}
                      className="text-lg font-semibold h-12"
                    />
                  </div>

                  {/* Status + Result + Date Row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="date"
                        value={editIdea.ideaDate || ""}
                        onChange={(e) => setEditIdea({ ...editIdea, ideaDate: e.target.value })}
                        className="h-8 rounded-lg bg-card/50 border border-accent/20 px-2 text-xs focus:border-accent/50 focus:ring-2 focus:ring-accent/20 outline-none transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t?.("tradingIdeas.statusLabel") || "Status"}:</span>
                      <div className="flex rounded-xl overflow-hidden border border-accent/20">
                        {STATUSES.map(s => {
                          const config = STATUS_STYLES[s];
                          const isActive = editIdea.status === s;
                          return (
                            <button
                              key={s}
                              onClick={() => setEditIdea({ ...editIdea, status: s })}
                              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                isActive ? `${config.bg} ${config.color}` : "hover:bg-accent/10"
                              }`}
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t?.("tradingIdeas.resultLabel") || "Result"}:</span>
                      <div className="flex rounded-xl overflow-hidden border border-accent/20">
                        {RESULTS.map(r => {
                          const config = RESULT_STYLES[r];
                          const Icon = config.icon;
                          const isActive = editIdea.result === r;
                          return (
                            <button
                              key={r}
                              onClick={() => setEditIdea({ ...editIdea, result: r })}
                              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                                isActive ? `${config.bg} ${config.color}` : "hover:bg-accent/10"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">{r}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Linked Trades Section - supports multiple trades */}
                  {trades.length > 0 && (
                    <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <TrendingUp className="h-4 w-4 text-blue-500" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold">{t?.("tradingIdeas.linkedTrades") || "Linked Trades"} ({linkedTrades.length})</h3>
                            <p className="text-[10px] text-muted-foreground">{t?.("tradingIdeas.linkedTradesHint") || "Connect this idea to executed trades"}</p>
                          </div>
                        </div>
                        <SelectDropdown
                          value=""
                          onChange={(value) => {
                            if (value && !(editIdea.linkedTradeIds || []).includes(value)) {
                              setEditIdea({ 
                                ...editIdea, 
                                linkedTradeIds: [...(editIdea.linkedTradeIds || []), value] 
                              });
                            }
                          }}
                          placeholder={`+ ${t?.("tradingIdeas.addTrade") || "Add Trade"}`}
                          searchable={true}
                          className="w-48"
                          options={[...trades]
                            .filter(tr => !(editIdea.linkedTradeIds || []).includes(tr.id))
                            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                            .slice(0, 50)
                            .map(trade => {
                              const sym = symbols.find(s => s.id === trade.symbolId);
                              const pnlStr = trade.pnl >= 0 ? `+${trade.pnl?.toFixed(2)}` : trade.pnl?.toFixed(2);
                              const isPositivePnl = trade.pnl >= 0;
                              const dirStyle = DIRECTION_STYLES[trade.direction] || DIRECTION_STYLES.Long;
                              return {
                                value: trade.id,
                                label: `${sym?.name || "—"} ${trade.direction || ""}`,
                                subtext: `${trade.date || ""} • ${pnlStr}`,
                                icon: <dirStyle.icon className={`h-3.5 w-3.5 ${dirStyle.color}`} />,
                                _isPositivePnl: isPositivePnl,
                                _date: trade.date || "",
                                _pnlStr: pnlStr,
                              };
                            })}
                          renderOption={(opt, isSelected) => (
                            <div className="flex items-center justify-between gap-3 flex-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                                <div className="min-w-0">
                                  <div className="text-sm truncate">{opt.label}</div>
                                  <div className="text-xs text-muted-foreground truncate">{opt._date}</div>
                                </div>
                              </div>
                              <div className="text-sm font-medium shrink-0">
                                <span className={opt._isPositivePnl ? "text-emerald-400" : "text-red-400"}>
                                  {opt._pnlStr}
                                </span>
                              </div>
                            </div>
                          )}
                        />
                      </div>
                      
                      {linkedTrades.length > 0 ? (
                        <div className="space-y-2">
                          {linkedTrades.map(linkedTrade => {
                            const sym = symbols.find(s => s.id === linkedTrade.symbolId);
                            return (
                              <div key={linkedTrade.id} className="flex items-center justify-between p-3 rounded-xl bg-card/50 border border-accent/20">
                                <div className="flex items-center gap-3">
                                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${linkedTrade.pnl >= 0 ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
                                    {linkedTrade.pnl >= 0 ? (
                                      <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                                    ) : (
                                      <ArrowDownRight className="h-4 w-4 text-red-400" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium">
                                      {sym?.name || linkedTrade.symbolId || "Trade"}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {linkedTrade.date} • <span className={linkedTrade.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                                        {linkedTrade.pnl >= 0 ? "+" : ""}{linkedTrade.pnl?.toFixed(2) || "0.00"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => onNavigateToTrade?.(linkedTrade.id)}
                                    className="h-8 w-8 p-0"
                                    title={t?.("common.open") || "Open"}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditIdea({ 
                                      ...editIdea, 
                                      linkedTradeIds: (editIdea.linkedTradeIds || []).filter(id => id !== linkedTrade.id) 
                                    })}
                                    className="h-8 w-8 p-0"
                                    title={t?.("common.unlink") || "Unlink"}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-3">{t?.("tradingIdeas.noLinkedTrades") || "No trades linked yet"}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes Section */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">{t?.("tradingIdeas.notes") || "Notes"}</label>
                  <div className="rounded-xl border border-accent/20 overflow-hidden bg-card/30">
                    <RichTextEditor
                      value={editIdea.notes_html || ""}
                      onChange={handleContentChange}
                      placeholder={t?.("tradingIdeas.notesPlaceholder") || "Describe your trading idea, analysis, entry/exit criteria... Type '/' for commands"}
                      minHeight={320}
                      variant="page"
                    />
                  </div>
                </div>

                {/* Images Section */}
                <div 
                  className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4"
                  onPaste={handlePaste}
                  tabIndex={0}
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-pink-500/10 flex items-center justify-center">
                        <Image className="h-4 w-4 text-pink-500" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">
                          {t?.("tradingIdeas.screenshots") || "Screenshots"} ({editIdea.images?.length || 0})
                        </h3>
                        <p className="text-[10px] text-muted-foreground">
                          {t?.("tradingIdeas.pasteHint") || "You can paste images from clipboard (Ctrl+V)"}
                        </p>
                      </div>
                    </div>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                      <Button size="sm" variant="secondary" className="h-8 text-xs pointer-events-none gap-1">
                        <Plus className="h-3.5 w-3.5" />
                        {t?.("common.add") || "Add"}
                      </Button>
                    </label>
                  </div>
                  
                  {editIdea.images?.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {editIdea.images.map((img, i) => (
                        <div key={img.id || i} className="relative group">
                          <div 
                            className="aspect-video rounded-xl overflow-hidden border-2 border-accent/15 bg-muted/20 cursor-pointer hover:border-pink-500/50 transition shadow-sm"
                            onClick={() => setPreviewIndex(i)}
                          >
                            <img
                              src={img.dataUrl}
                              alt={img.title || `Image ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <ImageRemoveButton
                            onClick={() => removeImage(i)}
                            size="md"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-accent/20 p-8 text-center">
                      <Image className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {t?.("tradingIdeas.noScreenshots") || "Drop screenshots here or click Add"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Links Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs text-muted-foreground flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      {t?.("tradingIdeas.links") || "Links"} ({editIdea.links?.length || 0})
                    </label>
                    <Button size="sm" variant="ghost" onClick={addLink} className="h-8 text-xs">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {t?.("tradingIdeas.addLink") || "Add Link"}
                    </Button>
                  </div>
                  
                  {editIdea.links?.length > 0 && (
                    <div className="space-y-2">
                      {editIdea.links.map((link, i) => {
                        const linkType = LINK_TYPES[link.kind] || LINK_TYPES.other;
                        const LinkIcon = linkType.icon;
                        // Convert LINK_TYPES to SelectDropdown format
                        const linkTypeOptions = Object.entries(LINK_TYPES).map(([key, cfg]) => ({
                          value: key,
                          label: cfg.label,
                          icon: <cfg.icon className={`h-3.5 w-3.5 ${cfg.color}`} />,
                        }));
                        return (
                          <div key={link.id || i} className="flex items-center gap-2 p-3 rounded-xl bg-card/50 border border-accent/15">
                            <div className="w-32 shrink-0">
                              <SelectDropdown
                                value={link.kind || "other"}
                                options={linkTypeOptions}
                                onChange={(value) => updateLink(i, { kind: value })}
                                placeholder={t?.("tradingIdeas.linkType") || "Type"}
                                className="[&>button]:h-8 [&>button]:rounded-lg [&>button]:text-xs"
                              />
                            </div>
                            <input
                              type="text"
                              placeholder={t?.("tradingIdeas.linkLabel") || "Label"}
                              value={link.label || ""}
                              onChange={(e) => updateLink(i, { label: e.target.value })}
                              className="flex-1 h-8 rounded-lg bg-muted/30 border border-accent/20 px-2 text-xs min-w-0"
                            />
                            <input
                              type="url"
                              placeholder="https://..."
                              value={link.url || ""}
                              onChange={(e) => updateLink(i, { url: e.target.value })}
                              className={`flex-[2] h-8 rounded-lg bg-muted/30 border px-2 text-xs min-w-0 ${
                                !isValidUrl(link.url) && link.url ? "border-red-500/50" : "border-accent/20"
                              }`}
                            />
                            {link.url && isValidUrl(link.url) && (
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg hover:bg-accent/10 text-accent"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              onClick={() => removeLink(i)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tags Section */}
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    {t?.("tradingIdeas.tags") || "Tags"}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-accent/20 bg-card/30 min-h-[48px]">
                    {editIdea.tags?.map((tag, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className="text-xs gap-1 cursor-pointer hover:bg-destructive/20 transition-colors"
                        onClick={() => removeTag(tag)}
                      >
                        {tag}
                        <X className="h-3 w-3" />
                      </Badge>
                    ))}
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder={t?.("tradingIdeas.addTag") || "Add tag..."}
                      className="flex-1 min-w-[80px] text-sm bg-transparent border-none focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-accent/15 bg-muted/20">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {!isNew && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {t?.("common.delete") || "Delete"}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Mobile share button */}
                  {!isNew && (
                    <Button variant="outline" size="sm" onClick={handleShare} className="sm:hidden">
                      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    {t?.("common.cancel") || "Cancel"}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-1" />
                    {saving ? (t?.("common.saving") || "Saving...") : (t?.("common.save") || "Save")}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Image Preview Modal */}
          {previewIndex !== null && editIdea.images?.[previewIndex] && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4"
              onClick={() => setPreviewIndex(null)}
            >
              <button
                onClick={() => setPreviewIndex(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="h-6 w-6 text-white" />
              </button>
              
              {editIdea.images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewIndex((prev) => (prev > 0 ? prev - 1 : editIdea.images.length - 1));
                    }}
                    className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <ChevronLeft className="h-6 w-6 text-white" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewIndex((prev) => (prev < editIdea.images.length - 1 ? prev + 1 : 0));
                    }}
                    className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <ChevronRight className="h-6 w-6 text-white" />
                  </button>
                </>
              )}

              <img
                src={editIdea.images[previewIndex]?.dataUrl}
                alt={editIdea.images[previewIndex]?.title || "Screenshot"}
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}

          {/* Delete Confirmation Dialog */}
          <ConfirmDialog
            open={deleteConfirmOpen}
            onOpenChange={setDeleteConfirmOpen}
            title={t?.("tradingIdeas.deleteConfirmTitle") || "Delete Idea?"}
            description={t?.("tradingIdeas.deleteConfirmMessage") || "This trading idea will be permanently deleted. This action cannot be undone."}
            confirmText={t?.("common.delete") || "Delete"}
            cancelText={t?.("common.cancel") || "Cancel"}
            tone="danger"
            onConfirm={() => {
              onDelete?.(idea.id);
              onClose?.();
            }}
          />
        </>
      )}
    </AnimatePresence>
  );
}
