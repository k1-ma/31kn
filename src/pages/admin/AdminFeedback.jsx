import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { updatesApi } from "@/lib/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import AdminLayout from "./AdminLayout.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  MessageSquare, RefreshCcw, Bug, Lightbulb, Trash2,
  Calendar, User, Image as ImageIcon, ChevronDown, ChevronUp,
  CheckCircle, Clock, XCircle, AlertCircle, HelpCircle, Send, RotateCcw, Search, ArrowUpDown,
  Eye, EyeOff, CheckCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FEEDBACK_STATUSES = ["new", "in_progress", "resolved", "closed", "wontfix"];

const STATUS_CONFIG = {
  new: { icon: AlertCircle, color: "text-blue-400", bg: "bg-blue-500/20", label: "New" },
  in_progress: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/20", label: "In Progress" },
  resolved: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Resolved" },
  closed: { icon: XCircle, color: "text-slate-400", bg: "bg-slate-500/20", label: "Closed" },
  wontfix: { icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/20", label: "Won't Fix" },
};

const TYPE_CONFIG = {
  bug: { icon: Bug, color: "text-red-400", bg: "bg-red-500/20", label: "Bug Report" },
  suggestion: { icon: Lightbulb, color: "text-amber-400", bg: "bg-amber-500/20", label: "Suggestion" },
  question: { icon: HelpCircle, color: "text-blue-400", bg: "bg-blue-500/20", label: "Question" },
  other: { icon: MessageSquare, color: "text-slate-400", bg: "bg-slate-500/20", label: "Other" },
};

function ImageModal({ images, isOpen, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!isOpen || !images || images.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div className="relative max-w-4xl max-h-[90vh] p-4" onClick={(e) => e.stopPropagation()}>
        <img
          src={images[currentIndex]?.data}
          alt={images[currentIndex]?.name || "Feedback image"}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
        {images.length > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            {images.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-2 w-2 rounded-full ${idx === currentIndex ? "bg-white" : "bg-white/30"}`}
              />
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function FeedbackRow({ feedback, onUpdateStatus, onDelete, onReload, onMarkRead }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [adminNotes, setAdminNotes] = useState(feedback.admin_notes || "");
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef(null);

  const typeConfig = TYPE_CONFIG[feedback.type] || TYPE_CONFIG.other;
  const statusConfig = STATUS_CONFIG[feedback.status] || STATUS_CONFIG.new;
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;
  const images = Array.isArray(feedback.images) ? feedback.images : [];
  const isClosed = feedback.status === "closed";
  const isUnread = !feedback.admin_read_at;

  const loadMessages = useCallback(async () => {
    if (!expanded) return;
    try {
      setMessagesLoading(true);
      const data = await updatesApi.adminGetFeedbackMessages(feedback.id);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("[AdminFeedback] load messages error:", err);
    } finally {
      setMessagesLoading(false);
    }
  }, [feedback.id, expanded]);

  useEffect(() => {
    if (expanded) {
      loadMessages();
      // Auto-mark as read when admin expands
      if (isUnread) {
        onMarkRead?.(feedback.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, loadMessages, isUnread]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStatusChange = async (newStatus) => {
    setSaving(true);
    await onUpdateStatus(feedback.id, { status: newStatus, admin_notes: adminNotes });
    setSaving(false);
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    await onUpdateStatus(feedback.id, { admin_notes: adminNotes });
    setSaving(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sendingMessage || isClosed) return;
    
    try {
      setSendingMessage(true);
      await updatesApi.adminSendFeedbackMessage(feedback.id, newMessage.trim());
      setNewMessage("");
      loadMessages();
      onReload?.();
    } catch (err) {
      console.error("[AdminFeedback] send message error:", err);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCloseTicket = async () => {
    try {
      setSaving(true);
      await updatesApi.adminCloseFeedback(feedback.id);
      onReload?.();
    } catch (err) {
      console.error("[AdminFeedback] close error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleReopenTicket = async () => {
    try {
      setSaving(true);
      await updatesApi.adminReopenFeedback(feedback.id);
      onReload?.();
    } catch (err) {
      console.error("[AdminFeedback] reopen error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl border overflow-hidden transition-colors ${isUnread ? "border-blue-500/50 bg-blue-500/5 shadow-sm shadow-blue-500/10" : "border-border/50 bg-muted/10"}`}
      >
        {/* Header Row */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-muted/20 transition"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`h-10 w-10 rounded-xl ${typeConfig.bg} flex items-center justify-center shrink-0`}>
              <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {isUnread && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 animate-pulse" />}
                <h4 className="font-medium text-sm truncate">{feedback.title}</h4>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusConfig.bg} ${statusConfig.color} flex items-center gap-1`}>
                  <StatusIcon className="h-2.5 w-2.5" />
                  {statusConfig.label}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {feedback.user_nickname || "Unknown"}
                  {feedback.user_id !== null && feedback.user_id !== undefined && (
                    <span className="text-muted-foreground/70">(ID: {feedback.user_id})</span>
                  )}
                  {feedback.user_email && (
                    <span className="text-muted-foreground/70">— {feedback.user_email}</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(feedback.created_at).toLocaleDateString()}
                </span>
                {images.length > 0 && (
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    {images.length} image{images.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isUnread && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl h-8 w-8 text-blue-400 hover:text-blue-500"
                onClick={(e) => { e.stopPropagation(); onMarkRead?.(feedback.id); }}
                title={t("admin.feedback.markRead", null, "Mark as read")}
                aria-label={t("admin.feedback.markRead", null, "Mark as read")}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {!isUnread && (
              <span className="h-8 w-8 flex items-center justify-center text-muted-foreground/40" title={t("admin.feedback.alreadyRead", null, "Read")}>
                <EyeOff className="h-3.5 w-3.5" />
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl h-8 w-8 text-rose-400 hover:text-rose-500"
              onClick={(e) => { e.stopPropagation(); onDelete(feedback); }}
              title={t("common.delete")}
              aria-label={t("common.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {/* Expanded Content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 pt-0 space-y-4 border-t border-border/50">
                {/* Description */}
                {feedback.description && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("admin.feedback.description", null, "Description")}</label>
                    <p className="mt-1 text-sm whitespace-pre-line bg-muted/20 p-3 rounded-lg">
                      {feedback.description}
                    </p>
                  </div>
                )}

                {/* Images */}
                {images.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("admin.feedback.attachments", null, "Attachments")}</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setShowImages(true)}
                          className="h-16 w-16 rounded-lg overflow-hidden border border-border/50 hover:border-accent/50 transition"
                        >
                          <img
                            src={img.data}
                            alt={img.name || `Image ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages Thread */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("admin.feedback.messages", null, "Messages")}
                  </label>
                  <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                    {messagesLoading ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        {t("common.loading")}
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        {t("admin.feedback.noMessages", null, "No messages yet")}
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg ${
                            msg.sender_role === "admin"
                              ? "bg-blue-500/10 border border-blue-500/20 ml-8"
                              : "bg-muted/20 border border-border/50 mr-8"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium ${msg.sender_role === "admin" ? "text-blue-400" : "text-foreground"}`}>
                              {msg.sender_role === "admin" ? (msg.sender_nickname || "Admin") : (msg.sender_nickname || "User")}
                            </span>
                            {msg.created_at && (
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(msg.created_at).toLocaleString()}
                              </span>
                            )}
                            {msg.is_legacy && (
                              <span className="text-[10px] text-muted-foreground">(legacy note)</span>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Send Message Form */}
                  {!isClosed ? (
                    <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
                      <Input
                        placeholder={t("admin.feedback.messagePlaceholder", null, "Type your reply...")}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        maxLength={5000}
                        className="rounded-lg flex-1"
                        disabled={sendingMessage}
                      />
                      <Button
                        type="submit"
                        disabled={!newMessage.trim() || sendingMessage}
                        className="rounded-lg"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <div className="mt-3 text-center text-sm text-muted-foreground py-2 border-t border-border/50">
                      {t("admin.feedback.closedMessage", null, "Ticket is closed. Reopen to send messages.")}
                    </div>
                  )}
                </div>

                {/* Status Update */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("admin.feedback.status", null, "Status")}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {FEEDBACK_STATUSES.map((status) => {
                      const config = STATUS_CONFIG[status];
                      const Icon = config.icon;
                      return (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          disabled={saving}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            feedback.status === status
                              ? `${config.bg} ${config.color} border border-current`
                              : "bg-muted/20 text-muted-foreground hover:bg-muted/30"
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Close/Reopen Actions */}
                <div className="flex gap-2">
                  {isClosed ? (
                    <Button
                      variant="outline"
                      onClick={handleReopenTicket}
                      disabled={saving}
                      className="rounded-lg"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {t("admin.feedback.reopen", null, "Reopen Ticket")}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={handleCloseTicket}
                      disabled={saving}
                      className="rounded-lg"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {t("admin.feedback.close", null, "Close Ticket")}
                    </Button>
                  )}
                  {feedback.closed_at && (
                    <span className="text-xs text-muted-foreground self-center">
                      Closed by {feedback.closed_by_role || "unknown"} on {new Date(feedback.closed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Admin Notes (Legacy) */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("admin.feedback.notes", null, "Internal Notes (Legacy)")}</label>
                  <div className="mt-2 flex gap-2">
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder={t("admin.feedback.notesPlaceholder", null, "Add internal notes...")}
                      rows={2}
                      className="flex-1 px-3 py-2 rounded-lg bg-muted/20 border border-border/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                    <Button
                      onClick={handleSaveNotes}
                      disabled={saving || adminNotes === (feedback.admin_notes || "")}
                      className="rounded-lg self-end"
                    >
                      {saving ? "..." : t("common.save")}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Image Modal */}
      <ImageModal images={images} isOpen={showImages} onClose={() => setShowImages(false)} />
    </>
  );
}

export default function AdminFeedback() {
  const { t } = useI18n();
  const toast = useToasts();
  
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest"); // newest, unread, oldest
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await updatesApi.adminFeedbackList(statusFilter || undefined);
      setFeedback(data.feedback || []);
    } catch (e) {
      setError(e?.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      updatesApi.adminFeedbackList(statusFilter || undefined)
        .then(data => setFeedback(data.feedback || []))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const handleUpdateStatus = async (id, updates) => {
    // Optimistic update
    const prev = feedback;
    if (updates.status) {
      setFeedback(f => f.map(item => item.id === id ? { ...item, status: updates.status } : item));
    }
    try {
      await updatesApi.adminFeedbackUpdate(id, updates);
      toast.push({ title: t("common.done"), description: t("admin.feedback.toasts.updated", null, "Updated"), tone: "success" });
    } catch (e) {
      setFeedback(prev);
      toast.push({ title: t("common.error"), description: e?.message || t("admin.feedback.toasts.updateFailed", null, "Failed to update"), tone: "danger" });
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`${t("common.delete")} "${item.title}"?`)) return;
    // Optimistic delete
    const prev = feedback;
    setFeedback(f => f.filter(fb => fb.id !== item.id));
    try {
      await updatesApi.adminFeedbackDelete(item.id);
      toast.push({ title: t("common.done"), description: t("admin.feedback.toasts.deleted", null, "Deleted"), tone: "success" });
    } catch (e) {
      setFeedback(prev);
      toast.push({ title: t("common.error"), description: e?.message || t("admin.feedback.toasts.deleteFailed", null, "Failed to delete"), tone: "danger" });
    }
  };

  // Mark a single feedback as read (optimistic)
  const handleMarkRead = useCallback(async (id) => {
    setFeedback(f => f.map(item => item.id === id ? { ...item, admin_read_at: new Date().toISOString() } : item));
    try {
      await updatesApi.adminMarkFeedbackRead(id);
    } catch {
      setFeedback(f => f.map(item => item.id === id ? { ...item, admin_read_at: null } : item));
    }
  }, []);

  // Mark all feedback as read
  const handleMarkAllRead = useCallback(async () => {
    setMarkingAllRead(true);
    const now = new Date().toISOString();
    const prev = feedback;
    setFeedback(f => f.map(item => ({ ...item, admin_read_at: item.admin_read_at || now })));
    try {
      await updatesApi.adminMarkAllFeedbackRead();
      toast.push({ title: t("common.done"), description: t("admin.feedback.toasts.allMarkedRead", null, "All marked as read"), tone: "success" });
    } catch (e) {
      setFeedback(prev);
      toast.push({ title: t("common.error"), description: e?.message || "Failed", tone: "danger" });
    } finally {
      setMarkingAllRead(false);
    }
  }, [feedback, toast, t]);

  // Count by status
  const counts = feedback.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  // Count unread
  const unreadCount = feedback.filter(item => !item.admin_read_at).length;

  // Filter and sort
  const filteredFeedback = useMemo(() => {
    let list = feedback;
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(item => 
        (item.title || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q) ||
        (item.user_nickname || "").toLowerCase().includes(q)
      );
    }
    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === "unread") {
        // Unread (admin_read_at IS NULL) first, then by date
        const aUnread = !a.admin_read_at ? 1 : 0;
        const bUnread = !b.admin_read_at ? 1 : 0;
        if (bUnread !== aUnread) return bUnread - aUnread;
      }
      if (sortBy === "oldest") {
        return new Date(a.created_at) - new Date(b.created_at);
      }
      // newest (default)
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });
    return list;
  }, [feedback, searchQuery, sortBy]);

  return (
    <AdminLayout
      title={t("admin.nav.feedback", null, "Feedback")}
      subtitle={t("admin.feedback.subtitle", null, "User bug reports and suggestions")}
      actions={
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              className="rounded-xl text-xs gap-1.5"
              onClick={handleMarkAllRead}
              disabled={markingAllRead}
              title={t("admin.feedback.markAllRead", null, "Mark all as read")}
            >
              <CheckCheck className="h-4 w-4" />
              <span className="hidden sm:inline">{t("admin.feedback.markAllRead", null, "Mark all read")}</span>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold px-1.5">
                {unreadCount}
              </span>
            </Button>
          )}
          <Button variant="ghost" className="rounded-xl" onClick={loadFeedback} title={t("common.refresh")}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      }
    >

        {/* Error message */}
        {error && (
          <Card className="mb-6 rounded-xl border-2 border-dashed border-rose-500/30">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-rose-400/50" />
              <h3 className="text-base font-semibold mb-1 text-rose-400">{t("admin.feedback.error.title", null, "Failed to load")}</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {error}
              </p>
              <Button onClick={loadFeedback} className="rounded-xl">
                <RefreshCcw className="h-4 w-4 mr-2" />
                {t("common.refresh")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Status Filter + Search + Sort */}
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter("")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                !statusFilter 
                  ? "bg-accent text-white" 
                  : "bg-muted/20 text-muted-foreground hover:bg-muted/30"
              }`}
            >
              All ({feedback.length})
            </button>
            {FEEDBACK_STATUSES.map((status) => {
              const config = STATUS_CONFIG[status];
              const Icon = config.icon;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    statusFilter === status
                      ? `${config.bg} ${config.color} border border-current`
                      : "bg-muted/20 text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {config.label} ({counts[status] || 0})
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("admin.feedback.searchPlaceholder", null, "Search by title, description, or user...")}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted/20 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
            {/* Sort */}
            <div className="flex items-center gap-1">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              {["newest", "unread", "oldest"].map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                    sortBy === s ? "bg-accent text-white" : "bg-muted/20 text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {s === "newest" ? t("admin.feedback.sortNewest", null, "Newest") :
                   s === "unread" ? t("admin.feedback.sortUnread", null, "Unread") :
                   t("admin.feedback.sortOldest", null, "Oldest")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feedback List */}
        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {t("admin.feedback.listTitle", null, "User Feedback")}
              <span className="text-sm font-normal text-muted-foreground">
                ({filteredFeedback.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : filteredFeedback.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8 flex flex-col items-center gap-2">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
                {searchQuery ? t("admin.feedback.noResults", null, "No matching feedback.") : t("admin.feedback.empty", null, "No feedback yet.")}
              </div>
            ) : (
              filteredFeedback.map((item) => (
                <FeedbackRow
                  key={item.id}
                  feedback={item}
                  onUpdateStatus={handleUpdateStatus}
                  onDelete={handleDelete}
                  onReload={loadFeedback}
                  onMarkRead={handleMarkRead}
                />
              ))
            )}
          </CardContent>
        </Card>

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </AdminLayout>
  );
}
