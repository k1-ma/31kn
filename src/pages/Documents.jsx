import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Header from "@/components/common/Header.jsx";
import ImageRemoveButton from "@/components/common/ImageRemoveButton.jsx";
import ImageLightbox from "@/components/common/ImageLightbox.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Modal from "@/components/common/Modal.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";
import RichTextEditor from "@/components/common/RichTextEditor.jsx";
import SelectDropdown from "@/components/common/SelectDropdown.jsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText, Plus, Search, Filter, ChevronDown, Check, X,
  Calendar, Target, Clock, TrendingUp, Zap, AlertTriangle,
  CheckCircle2, XCircle, HelpCircle, BarChart3, Edit2, Trash2,
  ExternalLink, Tag, Star, ArrowUpRight, Activity, Sparkles,
  Link2, FolderOpen, Folder, Book, Lightbulb, FileEdit,
  Share2, Copy, MoreVertical, ChevronRight, ChevronLeft, Pin, PinOff,
  Archive, RotateCcw, Eye, Image, ImagePlus, Upload, FilePlus2, Files
} from "lucide-react";
import { uid, fmtMoney, fmtRR, clampNum, isoDate, resizeImageFileToDataUrl } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { createPublicShare, createShareWithToast, sanitizeDocForPublic, getDocShareUrl } from "@/lib/share.js";
import { marked } from "marked";
import { sanitizeRichText } from "@/lib/sanitize.js";
import { isDeleted, monoNow } from "@/lib/syncDb.js";

// Document type configuration
const DOC_TYPES = {
  weekly_plan: { label: "Weekly Plan", icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/30" },
  strategy: { label: "Strategy", icon: Target, color: "text-purple-400", bg: "bg-purple-500/15", border: "border-purple-500/30" },
  idea: { label: "Idea / Setup", icon: Lightbulb, color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30" },
  note: { label: "Note", icon: FileText, color: "text-slate-400", bg: "bg-slate-500/15", border: "border-slate-500/30" },
  weekly_review: { label: "Weekly Review", icon: BarChart3, color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30" },
};

const DOC_STATUSES = {
  draft: { label: "Draft", color: "text-slate-400", bg: "bg-slate-400" },
  active: { label: "Active", color: "text-blue-400", bg: "bg-blue-400" },
  completed: { label: "Completed", color: "text-emerald-400", bg: "bg-emerald-400" },
  archived: { label: "Archived", color: "text-amber-400", bg: "bg-amber-400" },
};

const EVALUATION_RESULTS = {
  unknown: { label: "Unknown", color: "text-slate-400", icon: HelpCircle },
  worked: { label: "Worked", color: "text-emerald-400", icon: CheckCircle2 },
  partially: { label: "Partially", color: "text-amber-400", icon: AlertTriangle },
  failed: { label: "Failed", color: "text-red-400", icon: XCircle },
};

// Image upload configuration
const IMAGE_UPLOAD_CONFIG = {
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
};

// Sub-document preview character limit
const SUB_DOC_PREVIEW_LENGTH = 60;

// Templates for new documents
const TEMPLATES = {
  weekly_plan: `🎯 Weekly Goals


📊 Focus Pairs / Sessions


⚠️ Max Risk Per Day


📈 Max Trades Per Day


✅ Entry / Exit Rules


🚫 Forbidden Situations


📋 Planned Setups


🔄 What to Improve This Week

`,
  strategy: `📝 Setup Description


🌍 Context (Where It Works)


✅ Entry Conditions


❌ Invalidation


📊 RR / Expectations


⚠️ Mistakes & Limitations


📸 Examples

`,
  idea: `💡 Idea / Setup

Description:


Expected Outcome:


Notes:

`,
  note: `Notes:

`,
  weekly_review: `📅 Weekly Review

📊 Statistics
Trades taken: 
Win rate: 
Net PnL: 

✅ What Worked Well


❌ What Didn't Work


📝 Lessons Learned


🎯 Focus for Next Week

`,
};

// Create empty document
function createEmptyDocument(type = "note", parentId = null) {
  return {
    id: uid(),
    type,
    title: "",
    content: TEMPLATES[type] || "", // Legacy markdown content
    contentHtml: "", // Rich text HTML content
    contentText: "", // Plain text for search/preview
    banner: null, // Banner/cover image { id, dataUrl, title }
    tags: [],
    folderId: null,
    parentId, // null = root document, string = sub-document of parent
    createdAt: monoNow(),
    updatedAt: monoNow(),
    status: "draft",
    pinned: false,
    linkedTradeIds: [],
    links: [],
    images: [], // New: document images
    autoMatch: {
      enabled: false,
      pairs: [],
      sessions: [],
      keywords: [],
    },
    evaluation: {
      result: "unknown",
      score: null,
      notes: "",
      reviewedAt: null,
    },
    version: 1,
    versions: [],
  };
}

// Link type configuration
const LINK_TYPES = {
  tradingview: { label: "TradingView", icon: BarChart3, color: "text-blue-400" },
  youtube: { label: "YouTube", icon: Activity, color: "text-red-400" },
  notion: { label: "Notion", icon: Book, color: "text-slate-400" },
  article: { label: "Article", icon: FileText, color: "text-emerald-400" },
  other: { label: "Other", icon: ExternalLink, color: "text-muted-foreground" },
};

// URL validation helper
const isValidUrl = (url) => {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
};

/**
 * Convert legacy markdown content to HTML and plain text
 * Used for migrating old documents
 */
function migrateMarkdownToHtml(markdownContent) {
  if (!markdownContent) return { html: "", text: "" };
  try {
    const rawHtml = marked(markdownContent);
    const cleanHtml = sanitizeRichText(rawHtml, "noImages");
    // Create plain text version
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = cleanHtml;
    const text = tempDiv.textContent || tempDiv.innerText || "";
    return { html: cleanHtml, text: text.trim() };
  } catch {
    return { html: "", text: markdownContent || "" };
  }
}

/**
 * Strip HTML tags to get plain text
 */
function stripHtml(html) {
  if (!html) return "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || "";
}

// Document card component - clean, centered layout matching Haunted style
// OPTIMIZED: Accepts pre-computed linkedStats prop instead of recalculating from trades
function DocumentCard({ doc, linkedStats, onClick, onPin, onArchive, onDelete, subDocCount = 0 }) {
  const { t } = useI18n();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const typeConfig = DOC_TYPES[doc.type] || DOC_TYPES.note;
  const TypeIcon = typeConfig.icon;
  const statusConfig = DOC_STATUSES[doc.status] || DOC_STATUSES.draft;
  const evalConfig = EVALUATION_RESULTS[doc.evaluation?.result] || EVALUATION_RESULTS.unknown;
  const EvalIcon = evalConfig.icon;

  // Use pre-computed stats passed as prop (no more O(trades) filtering per card)
  const stats = linkedStats;

  // Preview text - use contentText if available, fallback to stripping HTML or markdown
  const preview = useMemo(() => {
    // Prefer contentText (plain text from rich editor)
    if (doc.contentText) {
      return doc.contentText.slice(0, 100);
    }
    // Fallback: strip HTML from contentHtml
    if (doc.contentHtml) {
      return stripHtml(doc.contentHtml).slice(0, 100);
    }
    // Legacy fallback: parse markdown content
    const lines = (doc.content || "").split("\n").filter(l => l.trim() && !l.startsWith("#") && !l.startsWith("🎯") && !l.startsWith("📊"));
    return lines.slice(0, 2).join(" ").slice(0, 100);
  }, [doc.content, doc.contentHtml, doc.contentText]);

  const formattedDate = useMemo(() => {
    const d = new Date(doc.updatedAt || doc.createdAt);
    return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  }, [doc.updatedAt, doc.createdAt]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group relative h-full"
    >
      <Card 
        className="cursor-pointer transition-all duration-200 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 h-full flex flex-col rounded-xl overflow-hidden"
        onClick={() => onClick?.(doc)}
      >
        {/* Banner Image (if exists) */}
        {doc.banner?.dataUrl && (
          <div className="w-full h-24 shrink-0">
            <img
              src={doc.banner.dataUrl}
              alt={doc.banner.title || "Banner"}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        <div className="p-4 flex flex-col flex-1">
          {/* ========== HEADER (top) ========== */}
          <div className="flex gap-3 items-center">
            {/* Left: Fixed icon/avatar (40px) */}
            <div className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl ${typeConfig.bg} ${typeConfig.border} border`}>
              <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
            </div>
            
            {/* Center: Title + Meta */}
            <div className="flex-1 min-w-0">
              {/* Title row - semibold, with pin indicator */}
              <div className="flex items-center gap-2 min-w-0">
                {doc.pinned && <Pin className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                <h3 className="font-semibold text-sm leading-tight line-clamp-1">
                  {doc.title || t("common.untitled")}
                </h3>
              </div>
              
              {/* Meta row: Type • Status • Date (muted, small) */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span className={`font-medium ${typeConfig.color}`}>{typeConfig.label}</span>
                <span className="text-muted-foreground/50">•</span>
                <span className={statusConfig.color}>{statusConfig.label}</span>
                <span className="text-muted-foreground/50">•</span>
                <span>{formattedDate}</span>
              </div>
            </div>
            
            {/* Right: Quick actions (show on hover) */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onPin?.(doc); }}
                className="p-1.5 rounded-lg hover:bg-accent/20 transition-colors"
                title={doc.pinned ? t("common.unpin") || "Unpin" : t("common.pin") || "Pin"}
              >
                {doc.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmOpen(true); }}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                  title={t("common.delete") || "Delete"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* ========== BODY (middle) ========== */}
          <div className="mt-3">
            {preview ? (
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {preview}{preview.length >= 100 ? "..." : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/50 italic">
                No preview available
              </p>
            )}
          </div>

          {/* ========== FOOTER (bottom, pinned with mt-auto) ========== */}
          <div className="mt-auto pt-3">
            {/* Tags row - if any */}
            {doc.tags?.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {doc.tags.slice(0, 4).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full">
                    {tag}
                  </Badge>
                ))}
              {doc.tags.length > 4 && (
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full">
                  +{doc.tags.length - 4}
                </Badge>
              )}
            </div>
          )}

          {/* Sub-documents indicator */}
          {subDocCount > 0 && (
            <div className="flex items-center gap-1.5 mb-2">
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 rounded-full gap-1">
                <Files className="h-3 w-3" />
                {subDocCount} {t("documents.subDocuments.title") || "Sub-documents"}
              </Badge>
            </div>
          )}

          {/* Stats row - small text/pills, aligned on ONE baseline */}
          {stats ? (
            <div className="flex items-center gap-3 pt-2 border-t border-border/30 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                <span>{stats.count} trades</span>
              </div>
              <div className={`flex items-center gap-1 ${stats.winRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{stats.winRate}%</span>
              </div>
              <div className={`font-medium ${stats.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {stats.netPnl >= 0 ? "+" : ""}{fmtMoney(stats.netPnl)}
              </div>
              <div className="ml-auto">
                <EvalIcon className={`h-4 w-4 ${evalConfig.color}`} />
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-border/30 text-xs text-muted-foreground/50">
              No linked trades
            </div>
          )}
          </div>
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("documents.deleteConfirmTitle") || "Delete Document?"}
        description={t("documents.deleteConfirmMessage") || "This document will be archived. You can restore it from the trash."}
        confirmText={t("common.delete") || "Delete"}
        cancelText={t("common.cancel") || "Cancel"}
        tone="danger"
        onConfirm={() => onDelete?.(doc.id)}
      />
    </motion.div>
  );
}

// Wrap in React.memo to prevent unnecessary re-renders
const MemoizedDocumentCard = React.memo(DocumentCard);

// Document Editor Modal
function DocumentEditor({ doc, open, onClose, onSave, onDelete, trades, libraries, user, toast, onNavigateToTrade, documents, onUpsertDocument }) {
  const { t } = useI18n();
  const [editDoc, setEditDoc] = useState(doc || createEmptyDocument());
  const [showPreview, setShowPreview] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [shareUrl, setShareUrl] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Image lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // Sub-document navigation stack: array of { id, title } for breadcrumb trail
  const [docStack, setDocStack] = useState([]);
  const [subDocDeleteId, setSubDocDeleteId] = useState(null);
  // Unsaved changes tracking
  const baselineRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmUnsaved, setConfirmUnsaved] = useState(false);

  // Initialize and migrate content when doc changes
  useEffect(() => {
    if (doc) {
      let migratedDoc = { ...doc };
      
      // Migrate legacy markdown content to HTML if needed
      if (!doc.contentHtml && doc.content) {
        const { html, text } = migrateMarkdownToHtml(doc.content);
        migratedDoc = {
          ...migratedDoc,
          contentHtml: html,
          contentText: text,
        };
      }
      
      setEditDoc(migratedDoc);
      baselineRef.current = JSON.stringify({ title: migratedDoc.title, contentHtml: migratedDoc.contentHtml, tags: migratedDoc.tags, type: migratedDoc.type, status: migratedDoc.status });
    } else {
      const empty = createEmptyDocument();
      setEditDoc(empty);
      baselineRef.current = JSON.stringify({ title: empty.title, contentHtml: empty.contentHtml, tags: empty.tags, type: empty.type, status: empty.status });
    }
    setIsDirty(false);
    setConfirmUnsaved(false);
    setShareUrl(null);
    setDocStack([]);
  }, [doc, open]);

  // Track dirty state
  useEffect(() => {
    if (!baselineRef.current) return;
    const current = JSON.stringify({ title: editDoc.title, contentHtml: editDoc.contentHtml, tags: editDoc.tags, type: editDoc.type, status: editDoc.status });
    setIsDirty(current !== baselineRef.current);
  }, [editDoc.title, editDoc.contentHtml, editDoc.tags, editDoc.type, editDoc.status]);

  // Get child documents for the current document
  const childDocs = useMemo(() => {
    if (!documents || !editDoc?.id) return [];
    return documents.filter(d => d.parentId === editDoc.id && !d.archivedAt && !isDeleted(d));
  }, [documents, editDoc?.id]);

  const handleSave = () => {
    const updated = { ...editDoc, updatedAt: monoNow() };
    onSave?.(updated);
    setIsDirty(false);
    baselineRef.current = JSON.stringify({ title: updated.title, contentHtml: updated.contentHtml, tags: updated.tags, type: updated.type, status: updated.status });
    // If we're inside a sub-document, navigate back to parent instead of closing
    if (docStack.length > 0) {
      handleNavigateBack();
    } else {
      onClose?.();
    }
  };

  // Save current doc without closing (used when navigating to sub-document)
  const handleSaveQuiet = () => {
    const updated = { ...editDoc, updatedAt: monoNow() };
    onSave?.(updated);
    return updated;
  };

  // Create and open a new sub-document
  const handleCreateSubDocument = (type = "note") => {
    // Save parent first
    handleSaveQuiet();
    // Push current doc to navigation stack
    setDocStack(prev => [...prev, { id: editDoc.id, title: editDoc.title || t("common.untitled") || "Untitled" }]);
    // Create child doc with parentId
    const subDoc = createEmptyDocument(type, editDoc.id);
    setEditDoc(subDoc);
    setShowPreview(false);
    setShareUrl(null);
  };

  // Open an existing sub-document
  const handleOpenSubDocument = (subDoc) => {
    // Save parent first
    handleSaveQuiet();
    // Push current doc to navigation stack
    setDocStack(prev => [...prev, { id: editDoc.id, title: editDoc.title || t("common.untitled") || "Untitled" }]);
    // Migrate sub-doc if needed
    let migratedDoc = { ...subDoc };
    if (!subDoc.contentHtml && subDoc.content) {
      const { html, text } = migrateMarkdownToHtml(subDoc.content);
      migratedDoc = { ...migratedDoc, contentHtml: html, contentText: text };
    }
    setEditDoc(migratedDoc);
    setShowPreview(false);
    setShareUrl(null);
  };

  // Navigate back to parent document
  const handleNavigateBack = () => {
    if (docStack.length === 0) return;
    // Save current sub-doc
    handleSaveQuiet();
    const newStack = [...docStack];
    const parent = newStack.pop();
    setDocStack(newStack);
    // Find and load the parent document
    const parentDoc = documents?.find(d => d.id === parent.id);
    if (parentDoc) {
      let migratedDoc = { ...parentDoc };
      if (!parentDoc.contentHtml && parentDoc.content) {
        const { html, text } = migrateMarkdownToHtml(parentDoc.content);
        migratedDoc = { ...migratedDoc, contentHtml: html, contentText: text };
      }
      setEditDoc(migratedDoc);
    }
    setShowPreview(false);
    setShareUrl(null);
  };

  // Handle closing - check for unsaved changes first
  const handleClose = () => {
    if (isDirty) {
      setConfirmUnsaved(true);
      return;
    }
    if (docStack.length > 0) {
      // Save current sub-doc before closing
      const updated = { ...editDoc, updatedAt: monoNow() };
      onSave?.(updated);
    }
    setDocStack([]);
    onClose?.();
  };

  // Force close without saving (discard changes)
  const handleDiscardAndClose = () => {
    setConfirmUnsaved(false);
    setIsDirty(false);
    setDocStack([]);
    onClose?.();
  };

  // Save and close
  const handleSaveAndClose = () => {
    setConfirmUnsaved(false);
    const updated = { ...editDoc, updatedAt: monoNow() };
    onSave?.(updated);
    setIsDirty(false);
    setDocStack([]);
    onClose?.();
  };

  // Delete a sub-document
  const handleDeleteSubDocument = (subDocId) => {
    onDelete?.(subDocId);
    setSubDocDeleteId(null);
  };

  const handleShare = async () => {
    const authorName = user?.display_name || user?.nickname || user?.username || "Anonymous";
    const document = sanitizeDocForPublic(editDoc, trades || [], libraries || {});
    const payload = { document, authorName };
    
    const url = await createShareWithToast({
      type: "doc",
      payload,
      title: editDoc.title || "Untitled Document",
      getUrl: getDocShareUrl,
      toast,
    });
    
    if (url) {
      setShareUrl(url);
      navigator.clipboard?.writeText(url).then(() => {
        toast?.push({ title: t("common.copied") || "Copied", description: url });
      }).catch(() => {});
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editDoc.tags.includes(newTag.trim())) {
      setEditDoc({ ...editDoc, tags: [...editDoc.tags, newTag.trim()] });
      setNewTag("");
    }
  };

  const handleRemoveTag = (tag) => {
    setEditDoc({ ...editDoc, tags: editDoc.tags.filter(t => t !== tag) });
  };

  // Handle rich text editor content change
  const handleContentChange = (html, text) => {
    setEditDoc({ 
      ...editDoc, 
      contentHtml: html, 
      contentText: text,
      // Keep legacy content for backwards compatibility
      content: text 
    });
  };

  // Handle image upload with validation
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!IMAGE_UPLOAD_CONFIG.allowedTypes.includes(file.type)) {
      toast?.push({ title: "Invalid file type", description: "Please upload a valid image (JPEG, PNG, GIF, WebP)", variant: "destructive" });
      e.target.value = "";
      return;
    }
    
    // Validate file size
    if (file.size > IMAGE_UPLOAD_CONFIG.maxSizeBytes) {
      toast?.push({ title: "File too large", description: "Maximum file size is 5MB", variant: "destructive" });
      e.target.value = "";
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        const newImage = {
          id: uid(),
          title: file.name || "Image",
          dataUrl,
        };
        setEditDoc({
          ...editDoc,
          images: [...(editDoc.images || []), newImage],
        });
      }
    };
    reader.readAsDataURL(file);
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
        setEditDoc(prev => ({
          ...prev,
          images: [...(prev.images || []), { id: uid(), title: t("documents.pastedImage") || "Pasted image", dataUrl }]
        }));
      } catch (err) {
        console.error('Image paste failed:', err);
        toast?.push({ title: t("common.error") || "Error", description: "Failed to paste image", variant: "destructive" });
      }
    }
  };

  // Handle banner upload with validation
  const handleBannerUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!IMAGE_UPLOAD_CONFIG.allowedTypes.includes(file.type)) {
      toast?.push({ title: t("documents.banner.invalidType") || "Invalid file type", description: t("documents.banner.invalidTypeDesc") || "Please upload a valid image (JPEG, PNG, GIF, WebP)", variant: "destructive" });
      e.target.value = "";
      return;
    }
    
    // Validate file size
    if (file.size > IMAGE_UPLOAD_CONFIG.maxSizeBytes) {
      toast?.push({ title: t("documents.banner.tooLarge") || "File too large", description: t("documents.banner.tooLargeDesc") || "Maximum file size is 5MB", variant: "destructive" });
      e.target.value = "";
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setEditDoc({
          ...editDoc,
          banner: {
            id: uid(),
            title: file.name || "Banner",
            dataUrl,
          },
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Handle banner removal
  const handleRemoveBanner = () => {
    setEditDoc({ ...editDoc, banner: null });
  };

  const typeConfig = DOC_TYPES[editDoc.type] || DOC_TYPES.note;
  const TypeIcon = typeConfig.icon;

  return (
    <Modal open={open} onClose={handleClose} size="xl">
      <div className="flex flex-col h-[85vh] max-h-[900px]">
        {/* Breadcrumb Navigation for Sub-documents */}
        {docStack.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-2.5 bg-muted/30 border-b border-border/50 shrink-0">
            <button
              onClick={handleNavigateBack}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors font-medium"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t("common.back") || "Back"}
            </button>
            <span className="text-muted-foreground/40 text-xs">/</span>
            {docStack.map((item, idx) => (
              <React.Fragment key={item.id}>
                <button
                  onClick={() => {
                    // Navigate back to this specific level
                    handleSaveQuiet();
                    const targetDoc = documents?.find(d => d.id === item.id);
                    if (targetDoc) {
                      let migratedDoc = { ...targetDoc };
                      if (!targetDoc.contentHtml && targetDoc.content) {
                        const { html, text } = migrateMarkdownToHtml(targetDoc.content);
                        migratedDoc = { ...migratedDoc, contentHtml: html, contentText: text };
                      }
                      setEditDoc(migratedDoc);
                      setDocStack(prev => prev.slice(0, idx));
                      setShowPreview(false);
                      setShareUrl(null);
                    }
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[120px]"
                  title={item.title}
                >
                  {item.title || t("common.untitled") || "Untitled"}
                </button>
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              </React.Fragment>
            ))}
            <span className="text-xs font-medium text-foreground truncate max-w-[160px]">
              {editDoc.title || t("common.untitled") || "Untitled"}
            </span>
          </div>
        )}
        {/* Banner Section */}
        {editDoc.banner ? (
          <div className="relative group shrink-0">
            <img
              src={editDoc.banner.dataUrl}
              alt={editDoc.banner.title || "Banner"}
              className="w-full h-40 object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <label className="cursor-pointer mr-2">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBannerUpload}
                />
                <Button size="sm" variant="secondary" className="pointer-events-none">
                  <Upload className="h-4 w-4 mr-1" />
                  {t("documents.banner.change") || "Change"}
                </Button>
              </label>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleRemoveBanner}
              >
                <X className="h-4 w-4 mr-1" />
                {t("documents.banner.remove") || "Remove"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-b border-border/50">
            <label className="cursor-pointer flex items-center justify-center py-3 gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerUpload}
              />
              <ImagePlus className="h-4 w-4" />
              <span className="text-sm">{t("documents.banner.add") || "Add banner"}</span>
            </label>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${typeConfig.bg} ${typeConfig.border} border`}>
              <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
            </div>
            <div className="w-40">
              <SelectDropdown
                value={editDoc.type}
                onChange={(value) => setEditDoc({ ...editDoc, type: value })}
                options={Object.entries(DOC_TYPES).map(([key, cfg]) => ({
                  value: key,
                  label: cfg.label,
                  icon: <cfg.icon className={`h-4 w-4 ${cfg.color}`} />,
                }))}
                placeholder={t("documents.selectType") || "Select type"}
                className="!mt-0"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="h-4 w-4 mr-1" />
              {showPreview ? "Edit" : "Preview"}
            </Button>
            <div className="w-32">
              <SelectDropdown
                value={editDoc.status}
                onChange={(value) => setEditDoc({ ...editDoc, status: value })}
                options={Object.entries(DOC_STATUSES).map(([key, cfg]) => ({
                  value: key,
                  label: cfg.label,
                }))}
                placeholder={t("documents.selectStatus") || "Status"}
                className="!mt-0"
              />
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="px-4 py-3 border-b border-border/50">
          <input
            type="text"
            value={editDoc.title}
            onChange={(e) => setEditDoc({ ...editDoc, title: e.target.value })}
            placeholder={t("common.untitled")}
            className="w-full text-xl font-semibold bg-transparent border-none focus:outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Content - Rich Text Editor (primary content area) */}
        <div className="flex-1 overflow-auto p-4 min-h-[40vh]">
          {showPreview ? (
            <div 
              className="document-preview text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: sanitizeRichText(editDoc.contentHtml || "", "full"),
              }}
            />
          ) : (
            <RichTextEditor
              value={editDoc.contentHtml || ""}
              onChange={handleContentChange}
              placeholder={t("documents.editor.placeholder") || "Start writing... Type '/' for commands"}
              minHeight={480}
              variant="page"
              className="h-full"
            />
          )}
        </div>

        {/* Images Section */}
        <div className="px-4 py-3 border-t border-border/50 shrink-0" onPaste={handlePaste} tabIndex={0} role="region" aria-label="Images">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">
                Images ({editDoc.images?.length || 0})
              </span>
              <span className="text-[10px] text-muted-foreground">
                — {t("documents.pasteHint") || "Ctrl+V to paste"}
              </span>
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <Button size="sm" variant="ghost" className="h-6 text-xs pointer-events-none">
                <ImagePlus className="h-3 w-3 mr-1" />
                Add Image
              </Button>
            </label>
          </div>
          {editDoc.images?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {editDoc.images.map((img, i) => (
                <div key={img.id || i} className="relative group aspect-square rounded-lg overflow-hidden border border-border/50 hover:border-accent/50 transition-colors cursor-pointer">
                  <img
                    src={img.dataUrl}
                    alt={img.title || "Image"}
                    className="w-full h-full object-cover"
                    onClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
                  />
                  <ImageRemoveButton
                    onClick={() => setEditDoc({
                      ...editDoc,
                      images: editDoc.images.filter((_, idx) => idx !== i)
                    })}
                    className="top-1 right-1"
                    size="sm"
                  />
                </div>
              ))}
            </div>
          )}
          {editDoc.images?.length > 0 && (
            <ImageLightbox
              images={editDoc.images}
              initialIndex={lightboxIndex}
              open={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </div>

        {/* Links Section */}
        <div className="px-4 py-3 border-t border-border/50 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">
                {t("documents.links.title") || "Links"} ({editDoc.links?.length || 0})
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditDoc({
                ...editDoc,
                links: [...(editDoc.links || []), { id: uid(), label: "", url: "", kind: "other" }]
              })}
              className="h-6 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              {t("documents.links.add") || "Add Link"}
            </Button>
          </div>
          {editDoc.links?.length > 0 && (
            <div className="space-y-1.5">
              {editDoc.links.map((link, i) => {
                const linkType = LINK_TYPES[link.kind] || LINK_TYPES.other;
                const LinkIcon = linkType.icon;
                const urlValid = !link.url || isValidUrl(link.url);
                return (
                  <div key={link.id || i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-accent/10">
                    <div className="w-28 shrink-0">
                      <SelectDropdown
                        value={link.kind || "other"}
                        onChange={(value) => setEditDoc({
                          ...editDoc,
                          links: editDoc.links.map((l, idx) => idx === i ? { ...l, kind: value } : l)
                        })}
                        options={Object.entries(LINK_TYPES).map(([key, cfg]) => ({
                          value: key,
                          label: cfg.label,
                          icon: <cfg.icon className={`h-3.5 w-3.5 ${cfg.color}`} />,
                        }))}
                        placeholder="Type"
                        className="!mt-0"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder={t("documents.links.name") || "Link name"}
                      value={link.label || ""}
                      onChange={(e) => setEditDoc({
                        ...editDoc,
                        links: editDoc.links.map((l, idx) => idx === i ? { ...l, label: e.target.value } : l)
                      })}
                      className="flex-1 h-7 rounded-lg bg-card border border-border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <input
                      type="text"
                      placeholder="https://..."
                      value={link.url || ""}
                      onChange={(e) => setEditDoc({
                        ...editDoc,
                        links: editDoc.links.map((l, idx) => idx === i ? { ...l, url: e.target.value } : l)
                      })}
                      className={`flex-1 h-7 rounded-lg bg-card border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent ${!urlValid ? "border-red-500/50" : "border-border"}`}
                    />
                    {link.url && isValidUrl(link.url) && (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-accent/10 hover:bg-accent/20 text-accent"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditDoc({
                        ...editDoc,
                        links: editDoc.links.filter((_, idx) => idx !== i)
                      })}
                      className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/15 text-red-500"
                      title={t("documents.links.remove") || "Remove"}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Linked Trades */}
        {trades && trades.length > 0 && (
          <div className="px-4 py-3 border-t border-border/50 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">
                  {t("documents.linkedTrades") || "Linked Trades"} ({editDoc.linkedTradeIds?.length || 0})
                </span>
              </div>
              <div className="w-52">
                <SelectDropdown
                  value=""
                  onChange={(value) => {
                    if (value && !editDoc.linkedTradeIds?.includes(value)) {
                      setEditDoc({
                        ...editDoc,
                        linkedTradeIds: [...(editDoc.linkedTradeIds || []), value]
                      });
                    }
                  }}
                  options={trades
                    .filter(tr => !editDoc.linkedTradeIds?.includes(tr.id))
                    .slice(0, 20)
                    .map(tr => {
                      const symbol = (libraries?.symbols || []).find(s => s.id === tr.symbolId);
                      const pnlFormatted = tr.pnl != null ? (tr.pnl >= 0 ? `+${tr.pnl.toFixed(2)}` : tr.pnl.toFixed(2)) : "N/A";
                      return {
                        value: tr.id,
                        label: `${tr.date} • ${symbol?.name || "?"} • ${pnlFormatted}`,
                      };
                    })}
                  placeholder={`+ ${t("documents.linkTrade") || "Link Trade"}`}
                  searchable={true}
                  className="!mt-0"
                />
              </div>
            </div>
            {editDoc.linkedTradeIds?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {editDoc.linkedTradeIds.map(tid => {
                  const tr = trades.find(t => t.id === tid);
                  if (!tr) return null;
                  const symbol = (libraries?.symbols || []).find(s => s.id === tr.symbolId);
                  return (
                    <div key={tid} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] ${tr.pnl >= 0 ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/5" : "border-red-500/40 text-red-400 bg-red-500/5"}`}>
                      <span>{tr.date} {symbol?.name || "?"} {tr.pnl >= 0 ? "+" : ""}{tr.pnl?.toFixed(0)}</span>
                      <button
                        type="button"
                        onClick={() => onNavigateToTrade?.(tid)}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-white/10"
                        title={t("common.open") || "Open"}
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditDoc({
                          ...editDoc,
                          linkedTradeIds: editDoc.linkedTradeIds.filter(id => id !== tid)
                        })}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-red-500/20"
                        title={t("common.unlink") || "Unlink"}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sub-documents Section */}
        <div className="px-4 py-3 border-t border-border/50 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Files className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">
                {t("documents.subDocuments.title") || "Sub-documents"} ({childDocs.length})
              </span>
            </div>
            <div className="relative group/subdoc">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => handleCreateSubDocument("note")}
              >
                <FilePlus2 className="h-3 w-3 mr-1" />
                {t("documents.subDocuments.add") || "Add Sub-document"}
              </Button>
            </div>
          </div>
          {childDocs.length > 0 && (
            <div className="space-y-1.5 max-h-[180px] overflow-auto">
              {childDocs.map((subDoc) => {
                const subTypeConfig = DOC_TYPES[subDoc.type] || DOC_TYPES.note;
                const SubTypeIcon = subTypeConfig.icon;
                const subStatusConfig = DOC_STATUSES[subDoc.status] || DOC_STATUSES.draft;
                const subPreview = subDoc.contentText
                  ? subDoc.contentText.slice(0, SUB_DOC_PREVIEW_LENGTH)
                  : subDoc.contentHtml
                    ? stripHtml(subDoc.contentHtml).slice(0, SUB_DOC_PREVIEW_LENGTH)
                    : "";
                return (
                  <div
                    key={subDoc.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-accent/10 hover:border-accent/30 cursor-pointer transition-colors group/subitem"
                    onClick={() => handleOpenSubDocument(subDoc)}
                  >
                    <div className={`p-1 rounded-lg ${subTypeConfig.bg} shrink-0`}>
                      <SubTypeIcon className={`h-3.5 w-3.5 ${subTypeConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {subDoc.title || t("common.untitled") || "Untitled"}
                      </div>
                      {subPreview && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {subPreview}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] ${subStatusConfig.color}`}>{subStatusConfig.label}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSubDocDeleteId(subDoc.id); }}
                        className="p-1 rounded hover:bg-red-500/20 text-red-400 opacity-0 group-hover/subitem:opacity-100 transition-opacity"
                        title={t("common.delete") || "Delete"}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {childDocs.length === 0 && (
            <div className="text-[11px] text-muted-foreground/50 py-1">
              {t("documents.subDocuments.empty") || "No sub-documents. Add sub-documents to organize your content."}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="px-4 py-3 border-t border-border/50 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {editDoc.tags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => handleRemoveTag(tag)}>
                {tag}
                <X className="h-3 w-3" />
              </Badge>
            ))}
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              placeholder="Add tag..."
              className="text-xs bg-transparent border-none focus:outline-none w-20"
            />
          </div>
        </div>

        {/* Evaluation (for ideas/strategies) */}
        {(editDoc.type === "idea" || editDoc.type === "strategy") && (
          <div className="px-4 py-3 border-t border-border/50 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">Result:</span>
              <div className="flex gap-1">
                {Object.entries(EVALUATION_RESULTS).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isActive = editDoc.evaluation?.result === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setEditDoc({
                        ...editDoc,
                        evaluation: {
                          ...editDoc.evaluation,
                          result: key,
                          reviewedAt: monoNow()
                        }
                      })}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                        isActive 
                          ? `${cfg.color} bg-current/10 border border-current/30` 
                          : "text-muted-foreground hover:bg-muted/30"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Share URL (if generated) */}
        {shareUrl && (
          <div className="px-4 py-2 border-t border-border/50 bg-emerald-500/10 shrink-0">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-emerald-400 truncate flex-1">{shareUrl}</span>
              <button
                onClick={() => navigator.clipboard?.writeText(shareUrl)}
                className="p-1 rounded hover:bg-emerald-500/20 transition-colors"
              >
                <Copy className="h-4 w-4 text-emerald-400" />
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded hover:bg-emerald-500/20 transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-emerald-400" />
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border/50 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2">
            {/* Delete button - only for existing documents */}
            {doc?.id && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("common.delete")}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">{editDoc.version > 1 ? `v${editDoc.version}` : ""}</span>
            {editDoc.linkedTradeIds?.length > 0 && (
              <span className="text-xs text-muted-foreground">• {editDoc.linkedTradeIds.length} linked trades</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editDoc.id && (
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-1" />
                {t("documents.share") || "Share"}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("documents.deleteConfirmTitle") || "Delete Document?"}
        description={t("documents.deleteConfirmMessage") || "This document will be archived. You can restore it from the trash."}
        confirmText={t("common.delete") || "Delete"}
        cancelText={t("common.cancel") || "Cancel"}
        tone="danger"
        onConfirm={() => {
          onDelete?.(doc.id);
          handleClose?.();
        }}
      />

      {/* Sub-document Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!subDocDeleteId}
        onOpenChange={(v) => { if (!v) setSubDocDeleteId(null); }}
        title={t("documents.subDocuments.deleteTitle") || "Delete Sub-document?"}
        description={t("documents.subDocuments.deleteMessage") || "This sub-document will be permanently removed."}
        confirmText={t("common.delete") || "Delete"}
        cancelText={t("common.cancel") || "Cancel"}
        tone="danger"
        onConfirm={() => handleDeleteSubDocument(subDocDeleteId)}
      />

      {/* Unsaved Changes Confirmation */}
      <Modal
        open={confirmUnsaved}
        onOpenChange={(v) => { if (!v) setConfirmUnsaved(false); }}
        title={t("documents.unsaved.title") || "Unsaved changes"}
      >
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t("documents.unsaved.description") || "You have unsaved changes. Save the document or exit without saving?"}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmUnsaved(false)}>
              {t("documents.unsaved.cancel") || t("common.cancel") || "Cancel"}
            </Button>
            <Button variant="secondary" onClick={handleDiscardAndClose}>
              {t("documents.unsaved.discard") || "Exit"}
            </Button>
            <Button onClick={handleSaveAndClose}>
              {t("documents.unsaved.save") || t("common.save") || "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

// Quick Idea Modal
function QuickIdeaModal({ open, onClose, onSave }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const handleSave = () => {
    if (!title.trim()) return;
    const doc = createEmptyDocument("idea");
    doc.title = title.trim();
    doc.content = content.trim() || `## 💡 ${title.trim()}\n\n`;
    onSave?.(doc);
    setTitle("");
    setContent("");
    onClose?.();
  };

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold">{t("documents.quickIdea") || "Quick Idea"}</h2>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("documents.ideaTitle") || "Idea title..."}
          className="mb-3"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("documents.ideaContent") || "Quick notes (optional)..."}
          rows={3}
          className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!title.trim()}>{t("common.save")}</Button>
        </div>
      </div>
    </Modal>
  );
}

// Weekly Review Wizard Modal
function WeeklyReviewModal({ open, onClose, onSave, trades, documents }) {
  const { t } = useI18n();
  const [lessons, setLessons] = useState("");
  
  // Calculate week stats
  const weekStats = useMemo(() => {
    const now = monoNow();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const weekTrades = (trades || []).filter(t => {
      if (isDeleted(t)) return false;
      const d = new Date(t.date);
      return d.getTime() >= weekAgo && d.getTime() <= now;
    });
    
    if (!weekTrades.length) return null;
    
    const wins = weekTrades.filter(t => clampNum(t.pnl) > 0).length;
    const netPnl = weekTrades.reduce((s, t) => s + clampNum(t.pnl), 0);
    const winRate = Math.round((wins / weekTrades.length) * 100);
    const followedPlan = weekTrades.filter(t => t.followPlan).length;
    const adherence = Math.round((followedPlan / weekTrades.length) * 100);
    
    return { count: weekTrades.length, wins, netPnl, winRate, adherence, trades: weekTrades };
  }, [trades]);

  const handleGenerate = () => {
    const doc = createEmptyDocument("weekly_review");
    const d = new Date();
    const weekNum = Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7);
    doc.title = `Week ${weekNum} Review - ${d.toLocaleDateString("en", { month: "short", year: "numeric" })}`;
    
    let content = `## 📅 Weekly Review\n\n`;
    content += `### 📊 Statistics\n`;
    if (weekStats) {
      content += `- Trades taken: ${weekStats.count}\n`;
      content += `- Win rate: ${weekStats.winRate}%\n`;
      content += `- Net PnL: ${fmtMoney(weekStats.netPnl)}\n`;
      content += `- Plan adherence: ${weekStats.adherence}%\n`;
    } else {
      content += `- No trades this week\n`;
    }
    content += `\n### ✅ What Worked Well\n\n\n`;
    content += `### ❌ What Didn't Work\n\n\n`;
    content += `### 📝 Lessons Learned\n${lessons || "\n"}\n`;
    content += `### 🎯 Focus for Next Week\n\n`;
    
    doc.content = content;
    doc.status = "completed";
    onSave?.(doc);
    onClose?.();
  };

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">{t("documents.reviewWeek") || "Weekly Review Wizard"}</h2>
        </div>
        
        {weekStats ? (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-muted/50 border border-border">
              <div className="text-xs text-muted-foreground">Trades</div>
              <div className="text-xl font-bold">{weekStats.count}</div>
            </div>
            <div className="p-3 rounded-xl bg-muted/50 border border-border">
              <div className="text-xs text-muted-foreground">Win Rate</div>
              <div className={`text-xl font-bold ${weekStats.winRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                {weekStats.winRate}%
              </div>
            </div>
            <div className="p-3 rounded-xl bg-muted/50 border border-border">
              <div className="text-xs text-muted-foreground">Net PnL</div>
              <div className={`text-xl font-bold ${weekStats.netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {weekStats.netPnl >= 0 ? "+" : ""}{fmtMoney(weekStats.netPnl)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-muted/50 border border-border">
              <div className="text-xs text-muted-foreground">Plan Adherence</div>
              <div className={`text-xl font-bold ${weekStats.adherence >= 70 ? "text-emerald-400" : "text-amber-400"}`}>
                {weekStats.adherence}%
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-muted/30 border border-border text-center text-muted-foreground mb-4">
            No trades this week
          </div>
        )}

        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block">Key lessons this week:</label>
          <textarea
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            placeholder="What did you learn?"
            rows={3}
            className="w-full p-3 rounded-xl bg-muted/50 border border-border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleGenerate}>
            <Sparkles className="h-4 w-4 mr-1" />
            Generate Review
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Document Statistics Widget
function DocumentStatsWidget({ documents, trades }) {
  const stats = useMemo(() => {
    const docs = (documents || []).filter(d => !d.archivedAt);
    const ideas = docs.filter(d => d.type === "idea" || d.type === "strategy");
    
    // Calculate success rate
    let worked = 0, total = 0;
    ideas.forEach(doc => {
      if (doc.evaluation?.result && doc.evaluation.result !== "unknown") {
        total++;
        if (doc.evaluation.result === "worked") worked++;
      }
    });
    const successRate = total > 0 ? Math.round((worked / total) * 100) : 0;
    
    // Top ideas by PnL
    const ideasWithStats = ideas.map(doc => {
      const linkedTrades = (trades || []).filter(t => 
        (doc.linkedTradeIds || []).includes(t.id) && !isDeleted(t)
      );
      const netPnl = linkedTrades.reduce((s, t) => s + clampNum(t.pnl), 0);
      const wins = linkedTrades.filter(t => clampNum(t.pnl) > 0).length;
      const winRate = linkedTrades.length ? Math.round((wins / linkedTrades.length) * 100) : 0;
      return { ...doc, netPnl, winRate, tradeCount: linkedTrades.length };
    }).filter(d => d.tradeCount > 0);
    
    const topByPnl = [...ideasWithStats].sort((a, b) => b.netPnl - a.netPnl).slice(0, 3);
    const topByWinRate = [...ideasWithStats].sort((a, b) => b.winRate - a.winRate).slice(0, 3);
    
    return {
      total: docs.length,
      ideas: ideas.length,
      successRate,
      topByPnl,
      topByWinRate,
    };
  }, [documents, trades]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-blue-400" />
          <span className="text-xs text-muted-foreground">Total Docs</span>
        </div>
        <div className="text-2xl font-bold">{stats.total}</div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <span className="text-xs text-muted-foreground">Ideas/Strategies</span>
        </div>
        <div className="text-2xl font-bold">{stats.ideas}</div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span className="text-xs text-muted-foreground">Ideas Success Rate</span>
        </div>
        <div className={`text-2xl font-bold ${stats.successRate >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
          {stats.successRate}%
        </div>
      </Card>
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Star className="h-4 w-4 text-purple-400" />
          <span className="text-xs text-muted-foreground">Top Idea</span>
        </div>
        <div className="text-sm font-medium truncate">
          {stats.topByPnl[0]?.title || "—"}
        </div>
      </Card>
    </div>
  );
}

// Main Documents Page
export default function Documents({
  documents = [],
  docFolders = [],
  trades = [],
  libraries = {},
  onUpsertDocument,
  onDeleteDocument,
  reduceMotion = false,
  toast,
  user,
  selectedDocumentId,
  onClearSelectedDocument,
  onNavigateToTrade,
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");
  
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [quickIdeaOpen, setQuickIdeaOpen] = useState(false);
  const [weeklyReviewOpen, setWeeklyReviewOpen] = useState(false);
  const [createTypeOpen, setCreateTypeOpen] = useState(false);

  // Handle selected document from navigation (e.g., from trade editor)
  useEffect(() => {
    if (selectedDocumentId) {
      const doc = documents.find(d => d.id === selectedDocumentId);
      if (doc) {
        setEditingDoc(doc);
        setEditorOpen(true);
      }
      onClearSelectedDocument?.();
    }
  }, [selectedDocumentId, documents, onClearSelectedDocument]);

  // PERFORMANCE OPTIMIZATION: Pre-compute trade lookup map and linked stats for all documents
  // This avoids O(docs * trades) filtering in each DocumentCard
  const tradeById = useMemo(() => {
    const map = new Map();
    for (const t of trades || []) {
      if (!isDeleted(t)) map.set(t.id, t);
    }
    return map;
  }, [trades]);

  // Pre-compute linked trade stats for all documents in one pass
  const linkedStatsByDocId = useMemo(() => {
    const startMark = performance.now();
    const statsMap = new Map();
    
    for (const doc of documents || []) {
      const linkedIds = doc.linkedTradeIds || [];
      if (!linkedIds.length) {
        statsMap.set(doc.id, null);
        continue;
      }
      
      let count = 0, wins = 0, netPnl = 0, followedPlan = 0;
      for (const tid of linkedIds) {
        const t = tradeById.get(tid);
        if (!t) continue;
        count++;
        const pnl = clampNum(t.pnl);
        netPnl += pnl;
        if (pnl > 0) wins++;
        if (t.followPlan) followedPlan++;
      }
      
      if (count === 0) {
        statsMap.set(doc.id, null);
      } else {
        statsMap.set(doc.id, {
          count,
          wins,
          netPnl,
          winRate: Math.round((wins / count) * 100),
          adherence: Math.round((followedPlan / count) * 100),
        });
      }
    }
    
    if (process.env.NODE_ENV === "development") {
      const duration = performance.now() - startMark;
      if (duration > 10) {
        console.log(`[Documents] linkedStatsByDocId computed in ${duration.toFixed(1)}ms for ${documents?.length ?? 0} docs`);
      }
    }
    
    return statsMap;
  }, [documents, tradeById]);

  // Pre-compute sub-document counts per parent document
  const subDocCountByParentId = useMemo(() => {
    const countMap = new Map();
    for (const doc of documents || []) {
      if (doc.parentId && !doc.archivedAt && !isDeleted(doc)) {
        countMap.set(doc.parentId, (countMap.get(doc.parentId) || 0) + 1);
      }
    }
    return countMap;
  }, [documents]);

  // Filter and sort documents
  const filteredDocs = useMemo(() => {
    // Only show root documents (no parentId) in the main grid
    let list = [...documents].filter(d => !d.archivedAt && !d.parentId);
    
    // Search - also search in sub-documents (show parent if sub-doc matches)
    if (search.trim()) {
      const q = search.toLowerCase();
      const subDocs = documents.filter(d => d.parentId && !d.archivedAt && !isDeleted(d));
      const parentIdsWithMatchingSubDocs = new Set(
        subDocs
          .filter(d =>
            (d.title || "").toLowerCase().includes(q) ||
            (d.content || "").toLowerCase().includes(q) ||
            (d.contentText || "").toLowerCase().includes(q) ||
            (d.tags || []).some(tag => tag.toLowerCase().includes(q))
          )
          .map(d => d.parentId)
      );
      list = list.filter(d => 
        (d.title || "").toLowerCase().includes(q) ||
        (d.content || "").toLowerCase().includes(q) ||
        (d.contentText || "").toLowerCase().includes(q) ||
        (d.tags || []).some(tag => tag.toLowerCase().includes(q)) ||
        parentIdsWithMatchingSubDocs.has(d.id)
      );
    }
    
    // Type filter
    if (typeFilter !== "all") {
      list = list.filter(d => d.type === typeFilter);
    }
    
    // Status filter
    if (statusFilter !== "all") {
      list = list.filter(d => d.status === statusFilter);
    }
    
    // Sort
    if (sortBy === "updated") {
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } else if (sortBy === "created") {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (sortBy === "title") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    
    // Pinned first
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    
    return list;
  }, [documents, search, typeFilter, statusFilter, sortBy]);

  const handleCreateDocument = (type) => {
    const doc = createEmptyDocument(type);
    setEditingDoc(doc);
    setEditorOpen(true);
    setCreateTypeOpen(false);
  };

  const handleEditDocument = (doc) => {
    setEditingDoc(doc);
    setEditorOpen(true);
  };

  const handleSaveDocument = (doc) => {
    onUpsertDocument?.(doc);
    toast?.push({ title: t("common.saved") || "Saved", description: doc.title || "Document saved" });
  };

  const handlePinDocument = (doc) => {
    onUpsertDocument?.({ ...doc, pinned: !doc.pinned, updatedAt: monoNow() });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Header
        title={t("nav.documents") || "Documents"}
        subtitle={t("documents.subtitle") || "Plans, strategies, ideas and notes"}
      />

      {/* Stats Widget */}
      <DocumentStatsWidget documents={documents} trades={trades} />

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end justify-between">
        {/* Filters Row */}
        <div className="flex flex-1 gap-3 items-end flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[180px] max-w-xs">
            <div className="text-xs font-semibold text-muted-foreground mb-1">{t("common.search") || "Search"}</div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("documents.searchPlaceholder") || "Search documents..."}
                className="pl-9 h-10 rounded-xl"
              />
            </div>
          </div>

          {/* Type filter - SelectDropdown */}
          <div className="min-w-[160px]">
            <div className="text-xs font-semibold text-muted-foreground">{t("documents.type") || "Type"}</div>
            <SelectDropdown
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: t("documents.allTypes") || "All Types", icon: <FileText className="h-4 w-4 text-accent" /> },
                ...Object.entries(DOC_TYPES).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return {
                    value: key,
                    label: cfg.label,
                    icon: <Icon className={`h-4 w-4 ${cfg.color}`} />,
                  };
                })
              ]}
            />
          </div>

          {/* Status filter - SelectDropdown */}
          <div className="min-w-[140px]">
            <div className="text-xs font-semibold text-muted-foreground">{t("common.status") || "Status"}</div>
            <SelectDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: t("documents.allStatuses") || "All Statuses", icon: <Filter className="h-4 w-4 text-accent" /> },
                ...Object.entries(DOC_STATUSES).map(([key, cfg]) => ({
                  value: key,
                  label: cfg.label,
                  icon: <span className={`inline-block w-2 h-2 rounded-full ${cfg.bg}`} />,
                }))
              ]}
            />
          </div>
        </div>

        {/* Actions - Proper hierarchy: Create is primary (larger), others are secondary (smaller) */}
        <div className="flex items-center gap-2">
          {/* Secondary actions - smaller */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setQuickIdeaOpen(true)}
            title={t("documents.quickIdea") || "Quick Idea"}
            className="text-muted-foreground hover:text-foreground"
          >
            <Zap className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">{t("documents.quickIdea") || "Quick Idea"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeeklyReviewOpen(true)}
            title={t("documents.reviewWeek") || "Review Week"}
            className="text-muted-foreground hover:text-foreground"
          >
            <BarChart3 className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">{t("documents.reviewWeek") || "Review Week"}</span>
          </Button>

          {/* Primary action - Create (prominent but not oversized) */}
          <div className="relative">
            <Button 
              variant="primary" 
              size="md" 
              onClick={() => setCreateTypeOpen(!createTypeOpen)}
              className="shadow-lg shadow-accent/20"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t("documents.create") || "Create"}
              <ChevronDown className={`h-3.5 w-3.5 ml-1.5 transition-transform ${createTypeOpen ? "rotate-180" : ""}`} />
            </Button>
            
            <AnimatePresence>
              {createTypeOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-xl z-[9999] overflow-hidden"
                >
                  {Object.entries(DOC_TYPES).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => handleCreateDocument(key)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/10 transition-colors text-left"
                      >
                        <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
                          <Icon className={`h-4 w-4 ${cfg.color}`} />
                        </div>
                        <span className="text-sm font-medium">{cfg.label}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Document Grid - responsive with consistent gaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredDocs.map((doc) => (
            <MemoizedDocumentCard
              key={doc.id}
              doc={doc}
              linkedStats={linkedStatsByDocId.get(doc.id)}
              subDocCount={subDocCountByParentId.get(doc.id) || 0}
              onClick={handleEditDocument}
              onPin={handlePinDocument}
              onDelete={onDeleteDocument}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Empty state - clean, centered with primary CTA */}
      {filteredDocs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="p-4 rounded-xl bg-muted/30 mb-6">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t("documents.empty") || "No documents yet"}</h3>
          <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
            {t("documents.emptyHint") || "Create your first document to get started with plans, strategies, and notes"}
          </p>
          <Button variant="primary" size="lg" onClick={() => handleCreateDocument("note")}>
            <Plus className="h-5 w-5 mr-2" />
            {t("documents.createFirst") || "Create Document"}
          </Button>
        </div>
      )}

      {/* Editor Modal */}
      <DocumentEditor
        doc={editingDoc}
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingDoc(null); }}
        onSave={handleSaveDocument}
        onDelete={(id) => {
          onDeleteDocument?.(id);
          // Only close if deleting the root doc (not a sub-doc)
          const deletedDoc = documents.find(d => d.id === id);
          if (!deletedDoc?.parentId || deletedDoc?.id === editingDoc?.id) {
            setEditorOpen(false);
            setEditingDoc(null);
          }
        }}
        trades={trades}
        libraries={libraries}
        user={user}
        toast={toast}
        onNavigateToTrade={onNavigateToTrade}
        documents={documents}
        onUpsertDocument={onUpsertDocument}
      />

      {/* Quick Idea Modal */}
      <QuickIdeaModal
        open={quickIdeaOpen}
        onClose={() => setQuickIdeaOpen(false)}
        onSave={handleSaveDocument}
      />

      {/* Weekly Review Modal */}
      <WeeklyReviewModal
        open={weeklyReviewOpen}
        onClose={() => setWeeklyReviewOpen(false)}
        onSave={handleSaveDocument}
        trades={trades}
        documents={documents}
      />
    </div>
  );
}
