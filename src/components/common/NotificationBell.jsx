import React, { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { AnimatePresence, motion } from "framer-motion";
import Button from "@/components/ui/Button.jsx";

/**
 * NotificationBell - A bell icon with unread count badge that shows a dropdown
 * with recent notifications when clicked
 */
function NotificationBell({ onInboxClick, onOpenUpdates, onOpenFeedback }) {
  const { t } = useI18n();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const dropdownRef = useRef(null);

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const res = await fetch("/api/notifications/count", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  };

  // Fetch recent notifications (unread only for dropdown)
  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=5&unreadOnly=true", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      } else {
        setError("load_failed");
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  };

  // Poll for unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Fetch notifications when dropdown is opened
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const handleBellClick = () => {
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      const res = await fetch("/api/notifications/markRead", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notificationIds: [notificationId] }),
      });
      if (res.ok) {
        // Refresh notifications and count
        fetchNotifications();
        fetchUnreadCount();
      }
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read first
    await handleMarkAsRead(notification.id);
    setIsOpen(false);

    const { type, data } = notification;

    // Handle daily digest - navigate to Updates & Feedback
    if (type === "updates_daily_digest") {
      if (onOpenUpdates) {
        onOpenUpdates();
      }
      return;
    }

    // Handle feedback message - navigate to specific feedback ticket
    if (type === "feedback_message" || type === "feedback_reply" || type === "feedback_status_changed") {
      if (onOpenFeedback && data?.feedbackId) {
        onOpenFeedback(data.feedbackId);
      } else if (onOpenUpdates) {
        // Fallback to updates page if no specific handler
        onOpenUpdates();
      }
      return;
    }
  };

  const handleViewAll = () => {
    setIsOpen(false);
    if (onInboxClick) {
      onInboxClick();
    }
  };

  const getNotificationIcon = (type) => {
    if (type.startsWith("risk_")) return "⚠️";
    if (type === "updates_daily_digest") return "📰";
    if (type === "feedback_message") return "💬";
    if (type.includes("reply")) return "💬";
    if (type.includes("achievement")) return "🏅";
    if (type.includes("challenge")) return "🎯";
    return "🔔";
  };

  const getNotificationMessage = (notification) => {
    const { type, data } = notification;
    
    // Special handling for updates_daily_digest
    if (type === "updates_daily_digest" && data?.count) {
      const msg = t("notifications.messages.updates_daily_digest");
      if (msg && msg !== "notifications.messages.updates_daily_digest") {
        return msg.replace("{count}", data.count);
      }
      return `Yesterday ${data.count} update(s) were published. See Updates & Feedback for details`;
    }

    // Special handling for feedback_message
    if (type === "feedback_message" && data?.messagePreview) {
      const msg = t("notifications.messages.feedback_message");
      if (msg && msg !== "notifications.messages.feedback_message") {
        return msg.replace("{title}", data.title || "").replace("{messagePreview}", data.messagePreview || "");
      }
      return `New reply on ticket "${data.title}": ${data.messagePreview}`;
    }

    const msgKey = `notifications.messages.${type}`;
    const msg = t(msgKey);
    
    // Simple template replacement
    if (msg && msg !== msgKey && data) {
      return msg.replace(/\{(\w+)\}/g, (_, key) => data[key] || "");
    }
    
    // Fallback to type name
    return t(`notifications.types.${type}`) || type;
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("common.justNow") || "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleBellClick}
        className="relative p-2 rounded-xl hover:bg-accent/15 transition-colors"
        title={t("notifications.bellTitle")}
        aria-label={t("notifications.bellTitle")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-5 w-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed left-4 right-4 sm:absolute sm:left-auto sm:right-0 mt-2 sm:w-96 sm:max-w-[calc(100vw-2rem)] bg-card border border-border/50 dark:border-accent/15 rounded-xl shadow-xl z-[60] overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-border/50 dark:border-accent/15 bg-accent/5">
              <h3 className="font-semibold text-sm">{t("notifications.title")}</h3>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("common.loading")}
                </div>
              ) : error ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {t("notifications.loadError") || "Failed to load notifications"}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchNotifications()}
                  >
                    {t("common.retry") || "Retry"}
                  </Button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {t("notifications.noNotifications")}
                </div>
              ) : (
                <div className="divide-y divide-accent/10">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="p-4 hover:bg-accent/5 transition-colors cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl flex-shrink-0">
                          {getNotificationIcon(notification.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground line-clamp-2">
                            {getNotificationMessage(notification)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTime(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-border/50 dark:border-accent/15 bg-accent/5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={handleViewAll}
                >
                  {t("notifications.viewAll")}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default React.memo(NotificationBell);
