import React, { useEffect, useState } from "react";
import { Bell, Check, Trash2, BellOff } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";

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
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    apiJson("/api/notifications?limit=50")
      .then((res) => setItems(res?.notifications || []))
      .catch((e) => setErr(e?.message || t("errors.generic")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    try {
      await apiJson("/api/notifications/markRead", {
        method: "PATCH",
        body: { all: true },
      });
      load();
    } catch (e) {
      setErr(e?.message || t("errors.generic"));
    }
  };

  const toggleRead = async (n) => {
    try {
      await apiJson("/api/notifications/markRead", {
        method: "PATCH",
        body: { ids: [n.id], read: !n.read },
      });
      load();
    } catch (e) {
      setErr(e?.message || t("errors.generic"));
    }
  };

  const removeOne = async (n) => {
    try {
      await apiJson(`/api/notifications/${n.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e?.message || t("errors.generic"));
    }
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="page-enter space-y-4">
      <PageHeader
        title={t("nav.notifications")}
        subtitle={unread > 0 ? t("notifications.unread", { count: unread }) : ""}
        right={
          unread > 0 && (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <Check className="w-4 h-4" />
              {t("notifications.markAllRead")}
            </Button>
          )
        }
      />

      {err && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 px-3 py-2 rounded-xl">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm">{t("common.loading")}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={t("notifications.empty")}
          description={t("notifications.emptyHint")}
        />
      ) : (
        <Card className="overflow-hidden">
          {items.map((n) => {
            const { title, body } = formatNotification(n, t);
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 ${
                  !n.read ? "bg-emerald-50/40 dark:bg-emerald-950/20" : ""
                }`}
              >
                <span className="text-2xl shrink-0">{KIND_ICONS[n.type] || "🔔"}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {title}
                    {!n.read && (
                      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-emerald-500 align-middle" />
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
                  onClick={() => toggleRead(n)}
                  className="p-2 text-slate-400 hover:text-emerald-600"
                  aria-label={n.read ? t("notifications.markUnread") : t("notifications.markRead")}
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeOne(n)}
                  className="p-2 text-slate-400 hover:text-red-500"
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
