import React, { useEffect, useState } from "react";
import { Bell, Check, Trash2, BellOff } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import Skeleton from "@/components/ui/Skeleton.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";

const PAGE_SIZE = 25;

const KIND_ICONS = {
  budget_warn: "⚠️",
  budget_exceeded: "🚨",
  recurring_due: "🔁",
  goal_reached: "🎯",
  reminder: "⏰",
  system_message: "📣",
};

function formatNotification(n, t) {
  const data = n.data || {};
  switch (n.type) {
    case "budget_warn":
      return { title: t("notifications.budgetWarn", { name: data.name || "—" }), body: data.body || "" };
    case "budget_exceeded":
      return { title: t("notifications.budgetExceeded", { name: data.name || "—" }), body: data.body || "" };
    case "recurring_due":
      return { title: t("notifications.recurringDue"), body: data.title || "" };
    case "goal_reached":
      return { title: t("notifications.goalReached", { name: data.name || "—" }), body: "" };
    case "reminder":
      return { title: data.title || t("notifications.reminder"), body: data.body || "" };
    default:
      return { title: data.title || n.type, body: data.body || "" };
  }
}

export default function Notifications() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("all"); // "all" | "unread"
  const [hasMore, setHasMore] = useState(false);

  const load = async ({ append = false } = {}) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const offset = append ? items.length : 0;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        unreadOnly: tab === "unread" ? "true" : "false",
      });
      const res = await apiJson(`/api/notifications?${params.toString()}`);
      const next = res?.notifications || [];
      setItems(append ? [...items, ...next] : next);
      setHasMore(next.length === PAGE_SIZE);
      setErr("");
    } catch (e) {
      setErr(e?.message || t("errors.generic"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const markAllRead = async () => {
    try {
      await apiJson("/api/notifications/markRead", { method: "PATCH", body: { all: true } });
      load();
    } catch (e) {
      setErr(e?.message || t("errors.generic"));
    }
  };

  const markRead = async (n) => {
    if (n.read) return;
    try {
      await apiJson("/api/notifications/markRead", {
        method: "PATCH",
        body: { notificationIds: [n.id] },
      });
      setItems((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    } catch (e) {
      setErr(e?.message || t("errors.generic"));
    }
  };

  const removeOne = async (n) => {
    try {
      await apiJson(`/api/notifications/${n.id}`, { method: "DELETE" });
      setItems((p) => p.filter((x) => x.id !== n.id));
    } catch (e) {
      setErr(e?.message || t("errors.generic"));
    }
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title={t("nav.notifications")}
        subtitle={tab === "all" && unread > 0 ? t("notifications.unread", { count: unread }) : ""}
        right={
          unread > 0 && (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <Check className="w-4 h-4" />
              {t("notifications.markAllRead")}
            </Button>
          )
        }
      />

      <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1">
        {["all", "unread"].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-9 px-4 rounded-xl text-sm font-semibold transition ${
              tab === id
                ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {t(`notifications.tab${id === "all" ? "All" : "Unread"}`)}
          </button>
        ))}
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 px-3 py-2 rounded-xl">
          {err}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton lines={3} />
          <Skeleton lines={3} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={t("notifications.empty")}
          description={t("notifications.emptyHint")}
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            {items.map((n) => {
              const { title, body } = formatNotification(n, t);
              return (
                <div
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`flex items-start gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 cursor-pointer transition ${
                    !n.read ? "bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="text-2xl shrink-0">{KIND_ICONS[n.type] || "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {title}
                      {!n.read && (
                        <span className="ml-2 inline-block w-2 h-2 rounded-full bg-indigo-500 align-middle" />
                      )}
                    </div>
                    {body && (
                      <div className="text-xs text-slate-500 mt-0.5 break-words">{body}</div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {new Date(n.created_at).toLocaleString(lang === "uk" ? "uk-UA" : "en-US")}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOne(n);
                    }}
                    className="p-2 text-slate-400 hover:text-red-500"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </Card>
          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => load({ append: true })}
                disabled={loadingMore}
              >
                {loadingMore ? t("common.loading") : t("notifications.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
