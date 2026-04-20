import React, { useEffect, useState, useCallback, useRef } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Calendar, Tag, Bug, Lightbulb, MessageSquarePlus,
  Send, Image as ImageIcon, X, CheckCircle2, ChevronDown, ChevronUp,
  Zap, Shield, Palette, Wrench, Package, RefreshCcw, AlertCircle,
  MessageCircle, Clock, XCircle, RotateCcw, ArrowLeft
} from "lucide-react";
import { updatesApi } from "@/lib/api.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useAuth } from "@/auth/AuthProvider.jsx";

// Category icons and colors
const CATEGORY_CONFIG = {
  Feature: { icon: Sparkles, color: "text-purple-400", bg: "bg-purple-500/10" },
  Bugfix: { icon: Bug, color: "text-red-400", bg: "bg-red-500/10" },
  Improvement: { icon: Zap, color: "text-amber-400", bg: "bg-amber-500/10" },
  Security: { icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  Performance: { icon: Zap, color: "text-blue-400", bg: "bg-blue-500/10" },
  UI: { icon: Palette, color: "text-pink-400", bg: "bg-pink-500/10" },
  Other: { icon: Package, color: "text-slate-400", bg: "bg-slate-500/10" },
};

// Ticket status configuration
const TICKET_STATUS_CONFIG = {
  new: { icon: AlertCircle, color: "text-blue-400", bg: "bg-blue-500/20", label: "New" },
  in_progress: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/20", label: "In Progress" },
  resolved: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Resolved" },
  closed: { icon: XCircle, color: "text-slate-400", bg: "bg-slate-500/20", label: "Closed" },
  wontfix: { icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/20", label: "Won't Fix" },
};

const TICKET_TYPE_CONFIG = {
  bug: { icon: Bug, color: "text-red-400", bg: "bg-red-500/20" },
  suggestion: { icon: Lightbulb, color: "text-amber-400", bg: "bg-amber-500/20" },
  question: { icon: MessageCircle, color: "text-blue-400", bg: "bg-blue-500/20" },
  other: { icon: MessageCircle, color: "text-slate-400", bg: "bg-slate-500/20" },
};

// Group updates by day
function groupByDay(updates) {
  const groups = new Map();
  
  for (const update of updates) {
    const date = update.published_at ? new Date(update.published_at) : new Date(update.created_at);
    const dateStr = date.toISOString().slice(0, 10);
    const displayDate = date.toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    if (!groups.has(dateStr)) {
      groups.set(dateStr, { key: dateStr, displayDate, updates: [] });
    }
    groups.get(dateStr).updates.push(update);
  }
  
  return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
}

function UpdateItem({ update, index }) {
  const date = update.published_at 
    ? new Date(update.published_at).toLocaleDateString() 
    : new Date(update.created_at).toLocaleDateString();
  const config = CATEGORY_CONFIG[update.category] || CATEGORY_CONFIG.Other;
  const CategoryIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="py-3 first:pt-0 last:pb-0"
    >
      <div className="flex items-center gap-3">
        {/* Icon wrapper - same as FeedbackForm */}
        <div className={`h-10 w-10 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
          <CategoryIcon className={`h-5 w-5 ${config.color}`} />
        </div>
        
        {/* Text content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">{update.title}</h4>
          {update.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {update.description}
            </p>
          )}
          
          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${config.bg} font-medium ${config.color} flex items-center gap-1`}>
              <CategoryIcon className="h-2.5 w-2.5" />
              {update.category}
            </span>
            {update.version && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                v{update.version}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {date}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FeedbackForm({ onSubmit, loading }) {
  const { t } = useI18n();
  const [type, setType] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState([]);
  const [expanded, setExpanded] = useState(false);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Read files as base64
    files.slice(0, 5 - images.length).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) return; // Max 5MB per image
      
      const reader = new FileReader();
      reader.onload = (event) => {
        setImages((prev) => [...prev, {
          name: file.name,
          data: event.target.result,
          size: file.size,
        }].slice(0, 5));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || loading) return;
    
    await onSubmit({
      type,
      title: title.trim(),
      description: description.trim() || null,
      images: images.map((img) => ({ name: img.name, data: img.data })),
    });
    
    // Reset form
    setTitle("");
    setDescription("");
    setImages([]);
    setExpanded(false);
  };

  return (
    <Card className="rounded-xl border-2 border-accent/15">
      <CardContent className="!p-4">
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
              <MessageSquarePlus className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{t("updates.feedback.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("updates.feedback.subtitle")}</p>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {/* Expandable Form */}
        <AnimatePresence>
          {expanded && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit}
              className="overflow-hidden"
            >
              <div className="pt-4 space-y-4">
                {/* Type Selection */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType("bug")}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${
                      type === "bug" 
                        ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                        : "bg-muted/20 text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    <Bug className="h-4 w-4" />
                    {t("updates.feedback.typeBug")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("suggestion")}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${
                      type === "suggestion" 
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" 
                        : "bg-muted/20 text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    <Lightbulb className="h-4 w-4" />
                    {t("updates.feedback.typeSuggestion")}
                  </button>
                </div>

                {/* Title Input */}
                <Input
                  placeholder={t("updates.feedback.titlePlaceholder")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  className="rounded-xl"
                />

                {/* Description */}
                <textarea
                  placeholder={t("updates.feedback.descriptionPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={5000}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl bg-muted/20 border border-border/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
                />

                {/* Image Upload */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/20 hover:bg-muted/30 cursor-pointer transition text-sm text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      {t("updates.feedback.addImage")}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={images.length >= 5}
                      />
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {images.length}/5 {t("updates.feedback.images")}
                    </span>
                  </div>

                  {/* Image Previews */}
                  {images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {images.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img
                            src={img.data}
                            alt={img.name}
                            className="h-16 w-16 object-cover rounded-lg border border-border/50"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={!title.trim() || loading}
                  className="w-full rounded-xl"
                >
                  {loading ? (
                    t("common.working")
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {t("updates.feedback.submit")}
                    </>
                  )}
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// Ticket Thread Component
function TicketThread({ ticket, onClose, onReload }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await updatesApi.getFeedbackMessages(ticket.id);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("[Ticket] load messages error:", err);
    } finally {
      setLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      await updatesApi.sendFeedbackMessage(ticket.id, newMessage.trim());
      setNewMessage("");
      loadMessages();
      onReload?.();
    } catch (err) {
      console.error("[Ticket] send message error:", err);
    } finally {
      setSending(false);
    }
  };

  const handleCloseTicket = async () => {
    try {
      setActionLoading(true);
      await updatesApi.closeFeedback(ticket.id);
      // Reload the tickets list to get updated status
      onReload?.();
      // Close the view after a short delay to show the action was completed
      setTimeout(() => onClose(), 300);
    } catch (err) {
      console.error("[Ticket] close error:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenTicket = async () => {
    try {
      setActionLoading(true);
      await updatesApi.reopenFeedback(ticket.id);
      // Reload the tickets list to get updated status
      onReload?.();
      // Close the view after a short delay to show the action was completed
      setTimeout(() => onClose(), 300);
    } catch (err) {
      console.error("[Ticket] reopen error:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const isClosed = ticket.status === "closed";
  const typeConfig = TICKET_TYPE_CONFIG[ticket.type] || TICKET_TYPE_CONFIG.other;
  const statusConfig = TICKET_STATUS_CONFIG[ticket.status] || TICKET_STATUS_CONFIG.new;
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  return (
    <Card className="rounded-xl border-2 border-accent/15">
      <CardContent className="!p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-muted/20 hover:bg-muted/30 flex items-center justify-center transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className={`h-10 w-10 rounded-xl ${typeConfig.bg} flex items-center justify-center shrink-0`}>
            <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{ticket.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color} flex items-center gap-1`}>
                <StatusIcon className="h-2.5 w-2.5" />
                {statusConfig.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(ticket.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {isClosed ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReopenTicket}
                disabled={actionLoading}
                className="rounded-xl text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                {t("updates.tickets.reopen", null, "Reopen")}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseTicket}
                disabled={actionLoading}
                className="rounded-xl text-xs"
              >
                <XCircle className="h-3 w-3 mr-1" />
                {t("updates.tickets.close", null, "Close")}
              </Button>
            )}
          </div>
        </div>

        {/* Description */}
        {ticket.description && (
          <div className="mb-4 p-3 rounded-xl bg-muted/10 text-sm">
            {ticket.description}
          </div>
        )}

        {/* Messages */}
        <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              {t("common.loading")}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              {t("updates.tickets.noMessages", null, "No messages yet")}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-xl ${
                  msg.sender_role === "admin"
                    ? "bg-blue-500/10 border border-blue-500/20 ml-4"
                    : "bg-muted/10 border border-border/50 mr-4"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${msg.sender_role === "admin" ? "text-blue-400" : "text-foreground"}`}>
                    {msg.sender_role === "admin" ? "Admin" : (msg.sender_nickname || "You")}
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

        {/* Reply Form */}
        {!isClosed ? (
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              placeholder={t("updates.tickets.messagePlaceholder", null, "Type your message...")}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              maxLength={5000}
              className="rounded-xl flex-1"
              disabled={sending}
            />
            <Button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-2 border-t border-border/50">
            {t("updates.tickets.closedMessage", null, "This ticket is closed. Reopen to send messages.")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// My Feedback Tickets Component
function MyFeedbackTickets({ onTicketSelect, selectedTicketId }) {
  const { t } = useI18n();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await updatesApi.myFeedback();
      setTickets(data.feedback || []);
    } catch (err) {
      console.error("[MyTickets] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Listen for open-feedback event
  useEffect(() => {
    const handleOpenFeedback = (e) => {
      const id = e.detail?.id;
      if (id) {
        const ticket = tickets.find((t) => t.id === id);
        if (ticket) {
          setExpanded(true);
          setSelectedTicket(ticket);
        }
      }
    };
    window.addEventListener("open-feedback", handleOpenFeedback);
    return () => window.removeEventListener("open-feedback", handleOpenFeedback);
  }, [tickets]);

  // Handle external selection
  useEffect(() => {
    if (selectedTicketId) {
      const ticket = tickets.find((t) => t.id === selectedTicketId);
      if (ticket) {
        setExpanded(true);
        setSelectedTicket(ticket);
      }
    }
  }, [selectedTicketId, tickets]);

  const handleTicketClick = (ticket) => {
    setSelectedTicket(ticket);
    onTicketSelect?.(ticket.id);
  };

  const handleBack = () => {
    setSelectedTicket(null);
    onTicketSelect?.(null);
  };

  if (tickets.length === 0 && !loading) {
    return null; // Don't show if no tickets
  }

  return (
    <Card className="rounded-xl border-2 border-accent/15">
      <CardContent className="!p-4">
        {selectedTicket ? (
          <TicketThread
            ticket={selectedTicket}
            onClose={handleBack}
            onReload={loadTickets}
          />
        ) : (
          <>
            {/* Header */}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{t("updates.tickets.title", null, "My Feedback Tickets")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {tickets.length} {t("updates.tickets.count", null, "ticket(s)")}
                  </p>
                </div>
              </div>
              {expanded ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </button>

            {/* Tickets List */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-4 space-y-2">
                    {loading ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        {t("common.loading")}
                      </div>
                    ) : (
                      tickets.map((ticket) => {
                        const typeConfig = TICKET_TYPE_CONFIG[ticket.type] || TICKET_TYPE_CONFIG.other;
                        const statusConfig = TICKET_STATUS_CONFIG[ticket.status] || TICKET_STATUS_CONFIG.new;
                        const TypeIcon = typeConfig.icon;
                        const StatusIcon = statusConfig.icon;

                        return (
                          <button
                            key={ticket.id}
                            onClick={() => handleTicketClick(ticket)}
                            className="w-full p-3 rounded-xl bg-muted/10 hover:bg-muted/20 transition text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`h-8 w-8 rounded-lg ${typeConfig.bg} flex items-center justify-center shrink-0`}>
                                <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm truncate">{ticket.title}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color} flex items-center gap-1`}>
                                    <StatusIcon className="h-2.5 w-2.5" />
                                    {statusConfig.label}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(ticket.created_at).toLocaleDateString()}
                                  </span>
                                  {ticket.last_message_preview && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                      • {ticket.last_message_by === "admin" ? "Admin: " : ""}{ticket.last_message_preview}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ChevronDown className="h-4 w-4 text-muted-foreground rotate-[-90deg]" />
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function UpdatesAndFeedback({ reduceMotion }) {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const { user } = useAuth();
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [ticketsKey, setTicketsKey] = useState(0); // Key to force refresh tickets
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const loadUpdates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await updatesApi.list();
      setUpdates(data.updates || []);
    } catch (err) {
      console.error("[Updates] load error:", err);
      setError(err?.message || tRef.current("updates.error.loadFailed", null, "Failed to load updates"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates]);

  const handleFeedbackSubmit = async (feedback) => {
    try {
      setFeedbackLoading(true);
      await updatesApi.submitFeedback(feedback);
      setSuccessMessage(t("updates.feedback.success"));
      setTicketsKey((k) => k + 1); // Refresh tickets list
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("[Feedback] submit error:", err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const filteredUpdates = categoryFilter === "all" 
    ? updates 
    : updates.filter(u => u.category === categoryFilter);
  const groupedUpdates = groupByDay(filteredUpdates);
  const availableCategories = ["all", ...new Set(updates.map(u => u.category).filter(Boolean))];

  return (
    <div>
      <Header
        title={t("updates.title")}
        subtitle={t("updates.subtitle")}
      />

      {/* Success Message */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-sm text-emerald-400">{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback Form */}
      <div className="mt-6">
        <FeedbackForm onSubmit={handleFeedbackSubmit} loading={feedbackLoading} />
      </div>

      {/* My Feedback Tickets */}
      <div className="mt-6" key={ticketsKey}>
        <MyFeedbackTickets 
          onTicketSelect={setSelectedTicketId}
          selectedTicketId={selectedTicketId}
        />
      </div>

      {/* Filters */}
      {updates.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {availableCategories.map((cat) => {
            const isAll = cat === "all";
            const config = CATEGORY_CONFIG[cat];
            const Icon = isAll ? Tag : config?.icon || Tag;
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-3 w-3" />
                {isAll ? (t("updates.filter.all", null, "All")) : cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="mt-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl bg-card/50 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <Card className="rounded-xl border-2 border-dashed border-rose-500/20">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-rose-400/50" />
              <h3 className="text-lg font-semibold mb-2 text-rose-400">{t("updates.error.title", null, "Failed to load")}</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {error}
              </p>
              <Button onClick={loadUpdates} className="rounded-xl">
                <RefreshCcw className="h-4 w-4 mr-2" />
                {t("common.refresh")}
              </Button>
            </CardContent>
          </Card>
        ) : updates.length === 0 ? (
          <Card className="rounded-xl border-2 border-dashed border-accent/20">
            <CardContent className="p-8 text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-2">{t("updates.empty.title")}</h3>
              <p className="text-muted-foreground text-sm">
                {t("updates.empty.description")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {groupedUpdates.map((group, groupIdx) => (
              <motion.div
                key={group.key}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: groupIdx * 0.05 }}
              >
                {/* Day Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    <Calendar className="h-4 w-4" />
                    {group.displayDate}
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-accent/20 to-transparent" />
                  <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-muted/30">
                    {group.updates.length} {t("updates.count")}
                  </span>
                </div>
                
                {/* Updates List */}
                <Card className="rounded-xl border-2 border-accent/15">
                  <CardContent className="!p-4">
                    <div className="divide-y divide-border/30">
                      {group.updates.map((update, idx) => (
                        <UpdateItem key={update.id} update={update} index={idx} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
