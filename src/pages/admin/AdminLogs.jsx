import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { fmtBytes } from "@/lib/adminUtils.js";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { ScrollText, RefreshCcw } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { formatDateTimeUTC2 } from "@/lib/utils.js";

const ACTION_KEY = {
  "user.create": "userCreate",
  "user.password_reset": "userPasswordReset",
  "user.role_set": "userRoleSet",
  "user.disabled": "userDisabled",
  "user.enabled": "userEnabled",
  "user.delete": "userDelete",
  "backup.create": "backupCreate",
  "backup.download": "backupDownload",
  "backup.create_and_download": "backupCreateAndDownload",
};

function LogRow({ row, striped }) {
  const { t } = useI18n();
  const when = useMemo(() => {
    return formatDateTimeUTC2(row.created_at);
  }, [row.created_at]);

  const k = ACTION_KEY[row.action];
  const title = k ? t(`admin.pages.logs.actionLabels.${k}`) : row.action;
  const target = row.target_nickname || row.target_username;
  const L = {
    admin: t("admin.pages.logs.labels.admin"),
    user: t("admin.pages.logs.labels.user"),
    role: t("admin.pages.logs.labels.role"),
    name: t("admin.pages.logs.labels.name"),
    size: t("admin.pages.logs.labels.size"),
    login: t("admin.pages.logs.labels.login"),
  };

  return (
    <div className={`rounded-xl border border-border/40 p-3 ${striped ? "bg-muted/5" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">{title}</div>
            <Badge className="text-xs">{row.action}</Badge>
          </div>

          <div className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono">{when}</span> • {L.admin}:{" "}
            <span className="font-mono">{row.admin_username || "?"}</span>
            {target ? (
              <>
                {" "}
                • {L.user}: <span className="font-mono">{target}</span>
              </>
            ) : null}
          </div>

          {row?.meta ? (
            <div className="mt-2 text-xs text-muted-foreground">
              {row.meta?.role ? (
                <>
                  {L.role}: <span className="font-mono">{row.meta.role}</span>{" "}
                </>
              ) : null}
              {row.meta?.name ? (
                <>
                  {L.name}: <span className="font-mono">{row.meta.name}</span>{" "}
                </>
              ) : null}
              {row.meta?.size ? (
                <>
                  {L.size}: <span className="font-mono">{fmtBytes(row.meta.size)}</span>{" "}
                </>
              ) : null}
              {row.meta?.username ? (
                <>
                  {L.login}: <span className="font-mono">{row.meta.username}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AdminLogs() {
  const { t } = useI18n();
  const { user, isAdmin } = useAuth();
  const toast = useToasts();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");

  // Date range filter (client-side)
  const [dayFrom, setDayFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dayTo, setDayTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [appliedFrom, setAppliedFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [appliedTo, setAppliedTo] = useState(() => new Date().toISOString().split("T")[0]);

  const handleApply = useCallback(() => {
    setAppliedFrom(dayFrom);
    setAppliedTo(dayTo);
  }, [dayFrom, dayTo]);

  const load = async (reset = false) => {
    setLoading(true);
    try {
      const nextOffset = reset ? 0 : offset;
      const res = await apiJson(`/api/admin/logs?limit=50&offset=${nextOffset}`);
      const logs = res?.logs || [];
      setItems((prev) => (reset ? logs : [...prev, ...logs]));
      setOffset(nextOffset + logs.length);
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.pages.logs.toasts.loadFailed"), tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user && !isAdmin) return <Navigate to="/" replace />;
  if (!user) return <Navigate to="/admincrm-panel" replace />;

  const filtered = useMemo(() => {
    let result = items;

    // Date range filter (client-side)
    if (appliedFrom) {
      const from = new Date(appliedFrom + "T00:00:00Z");
      result = result.filter((r) => new Date(r.created_at) >= from);
    }
    if (appliedTo) {
      const to = new Date(appliedTo + "T23:59:59.999Z");
      result = result.filter((r) => new Date(r.created_at) <= to);
    }

    // Text search filter
    const s = q.trim().toLowerCase();
    if (s) {
      result = result.filter((r) => {
        const target = (r.target_username || "") + " " + (r.target_nickname || "");
        const meta = r.meta ? JSON.stringify(r.meta) : "";
        return (
          String(r.action || "").toLowerCase().includes(s) ||
          String(r.admin_username || "").toLowerCase().includes(s) ||
          target.toLowerCase().includes(s) ||
          meta.toLowerCase().includes(s)
        );
      });
    }

    return result;
  }, [items, q, appliedFrom, appliedTo]);

  return (
    <AdminLayout
      title={t("admin.pages.logs.title")}
      subtitle={t("admin.pages.logs.subtitle")}
      actions={
        <Button variant="ghost" className="rounded-xl" onClick={() => load(true)} title={t("common.refresh")}>
          <RefreshCcw className="h-4 w-4" />
        </Button>
      }
    >
      {/* Date Range Filter */}
      <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
        <CardContent className="pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("admin.pages.usage.from", null, "From")}
              </label>
              <Input
                type="date"
                value={dayFrom}
                onChange={(e) => setDayFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("admin.pages.usage.to", null, "To")}
              </label>
              <Input
                type="date"
                value={dayTo}
                onChange={(e) => setDayTo(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button onClick={handleApply} className="rounded-xl">
              {t("admin.pages.dashboard.apply", null, "Apply")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Card */}
      <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" /> {t("admin.pages.logs.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.pages.logs.filterPlaceholder")} />

          {loading && items.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("admin.pages.logs.empty")}</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-border/30">
              <div className="sticky top-0 bg-card/80 backdrop-blur-sm z-10 grid grid-cols-[1fr_auto] items-center gap-4 px-3 py-2 border-b border-border/30">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("admin.pages.logs.labels.action", null, "Action / Details")}
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("admin.pages.logs.labels.date", null, "Date")}
                </span>
              </div>
              <div className="space-y-0">
                {filtered.map((r, i) => (
                  <LogRow key={r.id} row={r} striped={i % 2 === 1} />
                ))}
              </div>
            </div>
          )}

          <Button className="rounded-xl w-full" onClick={() => load(false)} disabled={loading}>
            {loading ? t("common.loading") : t("admin.pages.logs.loadMore")}
          </Button>
        </CardContent>
      </Card>

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </AdminLayout>
  );
}
