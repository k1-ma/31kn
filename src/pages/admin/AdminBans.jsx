import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiJson } from "@/lib/api.js";
import Modal from "@/components/common/Modal.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { Shield, Plus, Trash2, Globe, User, Clock, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";
import { formatDateTimeUTC2 } from "@/lib/utils.js";

function IpBanRow({ ban, onDelete }) {
  const { t } = useI18n();
  const isExpired = ban.expires_at && new Date(ban.expires_at) < new Date();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col gap-2 rounded-xl border border-border/50 bg-card/25 glass p-4 md:flex-row md:items-center md:justify-between ${isExpired ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Globe className="h-4 w-4 text-rose-500" />
          <span className="font-mono font-semibold">{ban.ip}</span>
          {isExpired && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
              {t("admin.pages.bans.expired", null, "Expired")}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {ban.reason && <span className="mr-3">{ban.reason}</span>}
          <span>
            {t("admin.pages.bans.createdAt", null, "Created")}: {formatDateTimeUTC2(ban.created_at)}
          </span>
          {ban.expires_at && (
            <span className="ml-3">
              {t("admin.pages.bans.expiresAt", null, "Expires")}: {formatDateTimeUTC2(ban.expires_at)}
            </span>
          )}
          {ban.created_by_username && (
            <span className="ml-3">
              {t("admin.pages.bans.by", null, "By")}: {ban.created_by_username}
            </span>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-xl text-rose-500 hover:bg-rose-500/10"
        onClick={() => onDelete(ban)}
        title={t("common.delete", null, "Delete")}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </motion.div>
  );
}

export default function AdminBans() {
  const { t } = useI18n();
  const toast = useToasts();
  const [ipBans, setIpBans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    loadBans();
  }, []);

  const loadBans = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson("/api/admin/bans/ip");
      setIpBans(data.bans || []);
    } catch (e) {
      setError(e?.message || "Failed to load bans");
    } finally {
      setLoading(false);
    }
  };

  const handleAddBan = async (e) => {
    e.preventDefault();
    if (!newIp.trim()) return;
    
    setSaving(true);
    try {
      await apiJson("/api/admin/bans/ip", {
        method: "POST",
        body: {
          ip: newIp.trim(),
          reason: newReason.trim() || null,
          expires_at: newExpiresAt || null,
        },
      });
      toast.success(t("admin.pages.bans.added", null, "IP ban added"));
      setShowAddModal(false);
      setNewIp("");
      setNewReason("");
      setNewExpiresAt("");
      loadBans();
    } catch (e) {
      toast.error(e?.message || t("admin.pages.bans.addFailed", null, "Failed to add ban"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBan = async () => {
    if (!deleteTarget) return;
    try {
      await apiJson(`/api/admin/bans/ip/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(t("admin.pages.bans.deleted", null, "IP ban removed"));
      setDeleteTarget(null);
      loadBans();
    } catch (e) {
      toast.error(e?.message || t("admin.pages.bans.deleteFailed", null, "Failed to delete ban"));
    }
  };

  return (
    <AdminLayout
      title={t("admin.nav.bans", null, "Bans")}
      subtitle={t("admin.pages.bans.subtitle", null, "Manage IP and account bans")}
    >
      <ToastViewport toasts={toast.toasts} dismiss={toast.dismiss} />

        {/* IP Bans Section */}
        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {t("admin.pages.bans.ipBans", null, "IP Bans")}
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  onClick={loadBans}
                  title={t("common.refresh", null, "Refresh")}
                >
                  <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  className="rounded-xl"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t("admin.pages.bans.addIpBan", null, "Add IP Ban")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-4">
                {error}
              </div>
            )}
            
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : ipBans.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>{t("admin.pages.bans.noIpBans", null, "No IP bans")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ipBans.map((ban) => (
                  <IpBanRow key={ban.id} ban={ban} onDelete={setDeleteTarget} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Note about user bans */}
        <div className="p-4 rounded-xl bg-muted/10 border border-border/50 text-sm text-muted-foreground">
          <User className="h-4 w-4 inline-block mr-2" />
          {t("admin.pages.bans.userBansNote", null, "User account bans can be managed from the Users page.")}
          {" "}
          <Link to="/admincrm-panel/users" className="text-accent hover:underline">
            {t("admin.nav.users", null, "Go to Users")}
          </Link>
        </div>
      {/* Add IP Ban Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t("admin.pages.bans.addIpBan", null, "Add IP Ban")}
      >
        <form onSubmit={handleAddBan} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("admin.pages.bans.ipAddress", null, "IP Address")} *
            </label>
            <Input
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              placeholder="192.168.1.1"
              required
              className="mt-1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("admin.pages.bans.reason", null, "Reason")}
            </label>
            <Input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder={t("admin.pages.bans.reasonPlaceholder", null, "Optional reason for ban")}
              className="mt-1"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {t("admin.pages.bans.expiresAt", null, "Expires At")}
            </label>
            <Input
              type="datetime-local"
              value={newExpiresAt}
              onChange={(e) => setNewExpiresAt(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("admin.pages.bans.expiresNote", null, "Leave empty for permanent ban")}
            </p>
          </div>
          
          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAddModal(false)}
              disabled={saving}
            >
              {t("common.cancel", null, "Cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("common.working", null, "Saving...") : t("admin.pages.bans.addBan", null, "Add Ban")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteBan}
        title={t("admin.pages.bans.confirmDelete", null, "Delete IP Ban?")}
        message={t("admin.pages.bans.confirmDeleteMessage", null, `Are you sure you want to remove the ban for ${deleteTarget?.ip}?`)}
        confirmLabel={t("common.delete", null, "Delete")}
        danger
      />
    </AdminLayout>
  );
}
