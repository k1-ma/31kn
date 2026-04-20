import React, { useState, useEffect } from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Button from "@/components/ui/Button.jsx";
import { Trash2, Check, CheckCheck, Bell } from "lucide-react";

export default function Inbox() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // "all" or "unread"

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const unreadOnly = filter === "unread";
      const res = await fetch(`/api/notifications?limit=100&unreadOnly=${unreadOnly}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      const res = await fetch("/api/notifications/markRead", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notificationIds: [notificationId] }),
      });
      if (res.ok) {
        fetchNotifications();
      }
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications/markRead", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        fetchNotifications();
      }
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const handleDelete = async (notificationId) => {
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        fetchNotifications();
      }
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  const getNotificationIcon = (type) => {
    if (type.startsWith("risk_")) return "⚠️";
    if (type.includes("reply")) return "💬";
    if (type.includes("achievement")) return "🏅";
    if (type.includes("challenge")) return "🎯";
    if (type.includes("reminder")) return "⏰";
    if (type.includes("system")) return "📢";
    return "🔔";
  };

  const getNotificationMessage = (notification) => {
    const { type, data } = notification;
    const msgKey = `notifications.messages.${type}`;
    const msg = t(msgKey);
    
    // Simple template replacement
    if (msg && msg !== msgKey && data) {
      return msg.replace(/\{(\w+)\}/g, (_, key) => data[key] || "");
    }
    
    // Fallback to type name
    return t(`notifications.types.${type}`) || type;
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (diffMins < 1) return t("common.justNow") || "Just now";
    if (diffMins < 60) return `${diffMins} ${t("common.minutesAgo") || "min ago"}`;
    if (diffHours < 24) return `${diffHours} ${t("common.hoursAgo") || "h ago"}`;
    if (diffDays < 7) return `${diffDays} ${t("common.daysAgo") || "d ago"} • ${time}`;
    return date.toLocaleDateString() + " • " + time;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen app-bg p-4 sm:p-6 lg:p-8">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
      
      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Bell className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />
            <h1 className="text-2xl sm:text-3xl font-bold">{t("notifications.inbox")}</h1>
          </div>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} ${t("notifications.unread").toLowerCase()}`
              : t("notifications.noNotifications")}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={filter === "all" ? "default" : "ghost"}
            onClick={() => setFilter("all")}
            size="sm"
          >
            {t("notifications.all")}
          </Button>
          <Button
            variant={filter === "unread" ? "default" : "ghost"}
            onClick={() => setFilter("unread")}
            size="sm"
          >
            {t("notifications.unread")}
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              onClick={handleMarkAllAsRead}
              size="sm"
              className="ml-auto"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              {t("notifications.markAllRead")}
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <div className="space-y-2">
          {loading ? (
            <div className="glass rounded-xl p-8 text-center text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : notifications.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Bell className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">{t("notifications.noNotifications")}</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`glass rounded-xl p-4 transition-all ${
                  notification.read
                    ? "opacity-60 hover:opacity-80"
                    : "border-l-4 border-blue-500"
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <span className="text-2xl sm:text-3xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-1 xs:gap-2 mb-1">
                      <p className="text-sm font-medium break-words">
                        {t(`notifications.types.${notification.type}`)}
                      </p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(notification.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mb-3 break-words">
                      {getNotificationMessage(notification)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="h-8"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          {t("notifications.markRead")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(notification.id)}
                        className="h-8 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t("common.delete")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
