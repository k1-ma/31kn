import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { fmtBytes } from "@/lib/adminUtils.js";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Badge from "@/components/ui/Badge.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { DatabaseBackup, Plus, Download, RefreshCcw, AlertCircle, CheckCircle2, Clock, HardDrive } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { formatDateTimeUTC2 } from "@/lib/utils.js";

function formatRelativeTime(date, t) {
  const now = new Date();
  const diff = now - new Date(date);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (hours < 1) return t("admin.pages.backups.time.lessThanHour");
  if (hours < 24) return t("admin.pages.backups.time.hoursAgo", { count: hours });
  if (days < 7) return t("admin.pages.backups.time.daysAgo", { count: days });
  return formatDateTimeUTC2(date, { dateOnly: true });
}

export default function AdminBackups() {
  const { t } = useI18n();
  const { user, isAdmin } = useAuth();
  const toast = useToasts();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await apiJson("/api/admin/backups");
      setItems(res?.backups || []);
    } catch (e) {
      toast.push({
        title: t("common.error"),
        description: e?.message || t("admin.pages.backups.toasts.loadFailed"),
        tone: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    setCreating(true);
    try {
      await apiJson("/api/admin/backups", { method: "POST" });
      toast.push({ title: t("common.done"), description: t("admin.pages.backups.toasts.created"), tone: "success" });
      refresh();
    } catch (e) {
      toast.push({
        title: t("common.error"),
        description: e?.message || t("admin.pages.backups.toasts.createFailed"),
        tone: "danger",
      });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (user && !isAdmin) return <Navigate to="/" replace />;
  if (!user) return <Navigate to="/admincrm-panel" replace />;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((b) => String(b.name || "").toLowerCase().includes(s));
  }, [items, q]);

  // Calculate stats
  const totalSize = items.reduce((acc, b) => acc + (Number(b.size_bytes) || 0), 0);
  const latestBackup = items.length > 0 ? items.reduce((a, b) => 
    new Date(a.created_at) > new Date(b.created_at) ? a : b
  ) : null;

  // Check if backup is recent (within last 24 hours)
  const isBackupRecent = latestBackup && 
    (new Date() - new Date(latestBackup.created_at)) < (24 * 60 * 60 * 1000);

  return (
    <AdminLayout
      title={t("admin.pages.backups.title")}
      subtitle={t("admin.pages.backups.subtitle")}
      actions={
        <Button variant="ghost" className="rounded-xl" onClick={refresh} title={t("common.refresh")} disabled={loading}>
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Stats cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <DatabaseBackup className="h-5 w-5 text-accent" />
              </div>
              <div>
                <div className="text-2xl font-bold">{items.length}</div>
                <div className="text-xs text-muted-foreground">{t("admin.pages.backups.stats.total")}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-success" />
              </div>
              <div>
                <div className="text-2xl font-bold">{fmtBytes(totalSize)}</div>
                <div className="text-xs text-muted-foreground">{t("admin.pages.backups.stats.totalSize")}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 p-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${isBackupRecent ? 'bg-success/10' : 'bg-warning/10'}`}>
                {isBackupRecent ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <Clock className="h-5 w-5 text-warning" />
                )}
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {latestBackup ? formatRelativeTime(latestBackup.created_at, t) : "—"}
                </div>
                <div className="text-xs text-muted-foreground">{t("admin.pages.backups.stats.lastBackup")}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Backup reminder */}
        {!isBackupRecent && items.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-warning">{t("admin.pages.backups.reminder.title")}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("admin.pages.backups.reminder.description")}</div>
            </div>
          </div>
        )}

        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5" /> {t("admin.pages.backups.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("admin.pages.backups.searchPlaceholder")}
                className="sm:max-w-xs"
              />
              <div className="flex gap-2">
                <a
                  href="/api/admin/backup"
                  className="inline-flex items-center justify-center rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]/45 glass px-4 py-2 text-sm hover:bg-white/20 dark:hover:bg-slate-900/20 transition"
                  title={t("admin.pages.backups.actions.downloadFresh")}
                >
                  <Download className="h-4 w-4 mr-1.5" /> {t("admin.pages.backups.actions.downloadFresh")}
                </a>
                <Button className="rounded-xl" onClick={createBackup} disabled={creating}>
                  {creating ? (
                    <RefreshCcw className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1.5" />
                  )}
                  {t("admin.pages.backups.actions.create")}
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <RefreshCcw className="h-4 w-4 animate-spin" />
                {t("common.loading")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8">
                <DatabaseBackup className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <div className="text-sm text-muted-foreground">{t("admin.pages.backups.empty")}</div>
                <Button className="mt-4 rounded-xl" onClick={createBackup} disabled={creating}>
                  <Plus className="h-4 w-4 mr-1.5" /> {t("admin.pages.backups.actions.createFirst")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {filtered.map((b, idx) => (
                  <div
                    key={b.name}
                    className={`flex flex-col gap-2 rounded-xl border bg-card/25 glass p-3 sm:flex-row sm:items-center sm:justify-between transition hover:bg-card/40 ${
                      idx === 0 ? 'border-accent/30' : 'border-border'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        idx === 0 ? 'bg-accent/10' : 'bg-muted/30'
                      }`}>
                        <DatabaseBackup className={`h-4 w-4 ${idx === 0 ? 'text-accent' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-2">
                          {b.name}
                          {idx === 0 && <Badge variant="outline" className="text-[10px]">{t("admin.pages.backups.latest")}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {formatDateTimeUTC2(b.created_at)} • {fmtBytes(b.size_bytes)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge className="text-xs" variant="secondary">postgres</Badge>
                      <a
                        href={`/api/admin/backups/${encodeURIComponent(b.name)}`}
                        className="inline-flex items-center justify-center rounded-xl border border-border bg-card/45 glass px-3 py-1.5 text-xs hover:bg-white/20 dark:hover:bg-slate-900/20 transition"
                        title={t("admin.pages.backups.actions.download")}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> {t("admin.pages.backups.actions.download")}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl bg-muted/20 border border-border/50 p-3 mt-4">
              <div className="text-xs font-semibold text-muted-foreground mb-1">{t("admin.pages.backups.tips.title")}</div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>{t("admin.pages.backups.tips.regular")}</li>
                <li>{t("admin.pages.backups.tips.storage")}</li>
                <li>{t("admin.pages.backups.tips.test")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </AdminLayout>
  );
}
