import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { apiJson } from "@/lib/api.js";
import Modal from "@/components/common/Modal.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Switch from "@/components/ui/Switch.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { Plus, Users, Pencil, KeyRound, Ban, CheckCircle2, Search, RefreshCcw, LogOut, Trash2, Mail, Shield, ArrowUpDown } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { formatDateTimeUTC2 } from "@/lib/utils.js";

function hexToRgb(hex) {
  const s = String(hex || "").trim();
  const re = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  if (!re.test(s)) return null;
  let h = s.slice(1);
  if (h.length === 3) h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  if (h.length === 8) h = h.slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every((v) => Number.isFinite(v))) return null;
  return { r, g, b };
}

function roleBadgeClass(role) {
  const rr = String(role || "user").toLowerCase();
  if (rr === "admin") return "bg-indigo-500/20 text-indigo-100 border-indigo-400/30";
  if (rr === "loh") return "bg-fuchsia-500/20 text-fuchsia-100 border-fuchsia-400/30";
  if (rr === "manager") return "bg-emerald-500/20 text-emerald-100 border-emerald-400/30";
  return "";
}

function roleBadgeVisual(role, roleColor) {
  const rgb = hexToRgb(roleColor);
  if (!rgb) return { className: roleBadgeClass(role), style: undefined };
  return {
    className: "text-white border",
    style: {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.20)`,
      borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`,
      color: "rgba(255,255,255,0.92)",
    },
  };
}

function genPassword(length = 18) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=?";
  const bytes = new Uint32Array(length);
  window.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    return true;
  } catch {
    return false;
  }
}

function UserRow({ u, onEdit, onToggleDisabled }) {
  const { t } = useI18n();
  const badge = roleBadgeVisual(u.role, u.role_color);
  const displayIp = u.last_ip || u.created_ip || "—";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]/25 glass p-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-semibold truncate">{u.nickname || u.username}</div>
          <Badge className={`text-xs ${badge.className}`} style={badge.style}>
            {u.role}
          </Badge>
          {u.is_disabled ? (
            <Badge className="text-xs bg-rose-500/20 text-rose-100 border-rose-400/30">{t("common.disabled")}</Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {t("admin.pages.users.form.login")}: <span className="font-mono">{u.username}</span> • {formatDateTimeUTC2(u.updated_at)}
        </div>
        <div className="text-xs text-muted-foreground truncate mt-1">
          {t("admin.pages.users.form.email")}: <span className="font-mono">{u.email || "—"}</span> • {t("admin.pages.users.form.ip")}: <span className="font-mono">{displayIp}</span> • {t("admin.pages.users.form.accountsCount")}: {u.accounts_count ?? 0}, {t("admin.pages.users.form.tradesCount")}: {u.trades_count ?? 0}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="rounded-xl" onClick={() => onEdit(u)} title={t("admin.pages.users.actions.edit")}>
          <Pencil className="h-4 w-4" />
        </Button>
        {u.role !== "admin" ? (
          <Button
            variant="ghost"
            className="rounded-xl"
            onClick={() => onToggleDisabled(u)}
            title={u.is_disabled ? t("admin.pages.users.actions.enable") : t("admin.pages.users.actions.disable")}
          >
            {u.is_disabled ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const { t } = useI18n();
  const { user, isAdmin } = useAuth();
  const toast = useToasts();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [sortField, setSortField] = useState("role");
  const [sortOrder, setSortOrder] = useState("desc");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState(null);

  const [cLogin, setCLogin] = useState("");
  const [cNick, setCNick] = useState("");
  const [cPass, setCPass] = useState("");
  const [cRole, setCRole] = useState("user");
  const [cRoleColor, setCRoleColor] = useState("");

  const [eNick, setENick] = useState("");
  const [ePass, setEPass] = useState("");
  const [eRole, setERole] = useState("user");
  const [eRoleColor, setERoleColor] = useState("");
  const [eDisabled, setEDisabled] = useState(false);
  const [eEmail, setEEmail] = useState("");
  const [eIsAdmin, setEIsAdmin] = useState(false);

  const [confirm, setConfirm] = useState({ open: false, title: "", description: "", onConfirm: null, onCancel: null });

  const [fullDeleteOpen, setFullDeleteOpen] = useState(false);
  const [fullDeleteGuardKey, setFullDeleteGuardKey] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await apiJson("/api/admin/users");
      setItems(res?.users || []);
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.pages.users.errors.loadFailed"), tone: "danger" });
    } finally {
      setLoading(false);
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
    let result = items;
    if (s) {
      result = result.filter((u) => {
        const a = `${u.username || ""} ${u.nickname || ""} ${u.role || ""} ${u.email || ""} ${u.created_ip || ""} ${u.last_ip || ""}`.toLowerCase();
        return a.includes(s);
      });
    }
    // Sort
    // Role priority: admin=0, manager=1, other=2
    const rolePriority = (r) => r === "admin" ? 0 : r === "manager" ? 1 : 2;
    const sorted = [...result].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case "name":
          aVal = (a.nickname || a.username || "").toLowerCase();
          bVal = (b.nickname || b.username || "").toLowerCase();
          break;
        case "role":
          aVal = rolePriority(a.role);
          bVal = rolePriority(b.role);
          break;
        case "trades":
          aVal = Number(a.trades_count) || 0;
          bVal = Number(b.trades_count) || 0;
          break;
        case "accounts":
          aVal = Number(a.accounts_count) || 0;
          bVal = Number(b.accounts_count) || 0;
          break;
        case "date":
          aVal = new Date(a.created_at || 0).getTime();
          bVal = new Date(b.created_at || 0).getTime();
          break;
        default:
          return 0;
      }
      if (sortField === "name") {
        return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (sortOrder === "asc") return aVal - bVal;
      return bVal - aVal;
    });
    return sorted;
  }, [items, q, sortField, sortOrder]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
  };

  const openEdit = (u) => {
    setCurrent(u);
    setENick(u.nickname || "");
    setEPass("");
    setERole(u.role || "user");
    setERoleColor(u.role_color || "");
    setEDisabled(!!u.is_disabled);
    setEEmail(u.email || "");
    setEIsAdmin(u.role === "admin");
    setEditOpen(true);
  };

  const createUser = async () => {
    try {
      const res = await apiJson("/api/admin/users", {
        method: "POST",
        body: {
          username: cLogin.trim(),
          nickname: cNick.trim(),
          password: cPass,
          role: cRole.trim(),
          role_color: cRoleColor.trim() || null,
        },
      });
      toast.push({
        title: t("common.done"),
        description: t("admin.pages.users.toasts.created", { username: res?.user?.username || cLogin.trim() }),
        tone: "success",
      });
      setCreateOpen(false);
      setCLogin("");
      setCNick("");
      setCPass("");
      setCRole("user");
      setCRoleColor("");
      refresh();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.pages.users.errors.createFailed"), tone: "danger" });
    }
  };

  const saveUser = async () => {
    if (!current) return;
    
    // Validate email format if provided
    const emailVal = eEmail.trim();
    if (emailVal) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVal)) {
        toast.push({ title: t("common.error"), description: t("admin.pages.users.errors.invalidEmail", null, "Invalid email format"), tone: "danger" });
        return;
      }
    }
    
    // Determine the final role - admin toggle takes precedence
    let finalRole = eRole.trim();
    if (eIsAdmin) {
      finalRole = "admin";
    } else if (finalRole === "admin") {
      // If admin toggle is off but text field says "admin", default to "user"
      finalRole = "user";
    }
    
    const wasAdmin = current.role === "admin";
    const becomingAdmin = !wasAdmin && eIsAdmin;
    
    // If promoting to admin, show confirmation dialog
    if (becomingAdmin) {
      setConfirm({
        open: true,
        title: t("admin.pages.users.confirmMakeAdmin.title", null, "Promote to Admin"),
        description: t("admin.pages.users.confirmMakeAdmin.description", { username: current.username }, `Are you sure you want to make "${current.username}" an administrator? They will have full access to the admin panel.`),
        onConfirm: async () => {
          await doSaveUser(finalRole, emailVal);
        },
        onCancel: () => {
          // Reset admin toggle to match original state when cancelled
          setEIsAdmin(wasAdmin);
        },
      });
      return;
    }
    
    await doSaveUser(finalRole, emailVal);
  };
  
  const doSaveUser = async (finalRole, emailVal) => {
    try {
      await apiJson(`/api/admin/users/${current.id}`, {
        method: "PUT",
        body: {
          nickname: eNick.trim(),
          newPassword: ePass || undefined,
          role: finalRole,
          role_color: eRoleColor.trim() || null,
          is_disabled: eDisabled,
          email: emailVal || null,
        },
      });
      toast.push({ title: t("common.done"), description: t("admin.pages.users.toasts.saved"), tone: "success" });
      setEditOpen(false);
      refresh();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.pages.users.errors.saveFailed"), tone: "danger" });
    }
  };

  const deleteCurrentUser = async () => {
    if (!current || current.role === "admin") return;
    setConfirm({
      open: true,
      title: t("admin.pages.users.actions.delete", null, "Delete User"),
      description: t("admin.pages.users.confirmDelete", { username: current.username }, `Are you sure you want to delete user "${current.username}"? This action cannot be undone.`),
      onConfirm: async () => {
        try {
          await apiJson(`/api/admin/users/${current.id}`, { method: "DELETE" });
          toast.push({
            title: t("common.done"),
            description: t("admin.pages.users.toasts.deleted", null, "User deleted"),
            tone: "success",
          });
          setEditOpen(false);
          refresh();
        } catch (e) {
          toast.push({ title: t("common.error"), description: e?.message || t("admin.pages.users.errors.deleteFailed", null, "Failed to delete user"), tone: "danger" });
        }
      },
    });
  };

  const openFullDelete = () => {
    if (!current || current.role === "admin") return;
    setFullDeleteGuardKey("");
    setFullDeleteOpen(true);
  };

  const confirmFullDelete = async () => {
    if (!current) return;
    try {
      await apiJson(`/api/admin/users/${current.id}/full-delete`, {
        method: "POST",
        body: { guardKey: fullDeleteGuardKey },
      });
      toast.push({
        title: t("common.done"),
        description: t("admin.pages.users.toasts.fullDeleted", null, "User fully deleted. Email is now available for re-registration."),
        tone: "success",
      });
      setFullDeleteOpen(false);
      setEditOpen(false);
      refresh();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.pages.users.errors.fullDeleteFailed", null, "Failed to fully delete user"), tone: "danger" });
    }
  };

  const toggleDisabled = async (u) => {
    if (u.role === "admin") return;
    const next = !u.is_disabled;

    setConfirm({
      open: true,
      title: next ? t("admin.pages.users.actions.disable") : t("admin.pages.users.actions.enable"),
      description: t("admin.pages.users.confirmToggle", { username: u.username, action: next ? t("admin.pages.users.actions.disable") : t("admin.pages.users.actions.enable") }),
      onConfirm: async () => {
        try {
          await apiJson(`/api/admin/users/${u.id}`, { method: "PUT", body: { is_disabled: next } });
          toast.push({
            title: t("common.done"),
            description: next ? t("admin.pages.users.toasts.statusChangedOff") : t("admin.pages.users.toasts.statusChangedOn"),
            tone: "success",
          });
          refresh();
        } catch (e) {
          toast.push({ title: t("common.error"), description: e?.message || t("admin.pages.users.errors.statusFailed"), tone: "danger" });
        }
      },
    });
  };

  const logoutAll = async () => {
    if (!current) return;
    setConfirm({
      open: true,
      title: t("admin.pages.users.actions.logoutAll"),
      description: t("admin.pages.users.confirmLogoutAll", { username: current.username }),
      onConfirm: async () => {
        try {
          const r = await apiJson(`/api/admin/users/${current.id}/logout-all`, { method: "POST" });
          toast.push({
            title: t("common.done"),
            description: t("admin.pages.users.toasts.logoutDone", { count: r?.removed ?? 0 }),
            tone: "success",
          });
        } catch (e) {
          toast.push({ title: t("common.error"), description: e?.message || t("admin.pages.users.errors.logoutFailed"), tone: "danger" });
        }
      },
    });
  };

  const copyOrToast = async (value) => {
    const ok = await copyToClipboard(value);
    toast.push({
      title: t("common.done"),
      description: ok ? t("common.copiedToClipboard") : t("common.copyFailed"),
      tone: ok ? "success" : "danger",
    });
  };

  return (
    <AdminLayout
      title={t("admin.pages.users.title")}
      subtitle={t("admin.pages.users.subtitle")}
      actions={
        <>
          <Button variant="ghost" className="rounded-xl" onClick={refresh} title={t("common.refresh")}>
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button className="rounded-xl" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t("admin.pages.users.actions.create")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* User Stats Summary */}
        {!loading && items.length > 0 && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-lg shadow-black/5 p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("admin.pages.users.stats.total", null, "Total Users")}</div>
              <div className="text-xl font-bold mt-1">{items.length}</div>
            </div>
            <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-lg shadow-black/5 p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("admin.pages.users.stats.admins", null, "Admins")}</div>
              <div className="text-xl font-bold mt-1">{items.filter(u => u.role === "admin").length}</div>
            </div>
            <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-lg shadow-black/5 p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("admin.pages.users.stats.disabled", null, "Disabled")}</div>
              <div className="text-xl font-bold mt-1 text-rose-400">{items.filter(u => u.is_disabled).length}</div>
            </div>
            <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-lg shadow-black/5 p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("admin.pages.users.stats.totalTrades", null, "Total Trades")}</div>
              <div className="text-xl font-bold mt-1">{items.reduce((s, u) => s + (Number(u.trades_count) || 0), 0).toLocaleString()}</div>
            </div>
          </div>
        )}

        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> {t("admin.nav.users")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.pages.users.searchPlaceholder")} className="pl-9 rounded-xl" />
            </div>

            {/* Sort controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" />
                {t("admin.pages.users.sortBy", null, "Sort")}:
              </span>
              {[
                { key: "role", label: t("admin.pages.users.sortOptions.role", null, "Role") },
                { key: "name", label: t("admin.pages.users.sortOptions.name", null, "Name") },
                { key: "trades", label: t("admin.pages.users.sortOptions.trades", null, "Trades") },
                { key: "accounts", label: t("admin.pages.users.sortOptions.accounts", null, "Accounts") },
                { key: "date", label: t("admin.pages.users.sortOptions.date", null, "Date") },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    sortField === key
                      ? "bg-accent text-[rgb(var(--on-accent))]"
                      : "bg-muted/20 hover:bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {label}
                  {sortField === key && (
                    <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} {t("admin.pages.users.usersCount", null, "users")}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 flex flex-col items-center gap-2">
                <Users className="h-8 w-8 text-muted-foreground/40" />
                <span className="text-sm text-muted-foreground">{q ? t("admin.pages.users.noResults", null, "No matching users") : t("admin.pages.users.empty")}</span>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((u) => (
                  <UserRow key={u.id} u={u} onEdit={openEdit} onToggleDisabled={toggleDisabled} />
                ))}
              </div>
            )}

            <div className="text-xs text-muted-foreground pt-2">{t("admin.pages.users.notePasswords")}</div>
          </CardContent>
        </Card>
      </div>

      <Modal open={createOpen} onOpenChange={setCreateOpen} title={t("admin.pages.users.modalCreateTitle")} reduceMotion>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.login")}</div>
            <Input value={cLogin} onChange={(e) => setCLogin(e.target.value)} placeholder={t("admin.pages.users.form.placeholders.login")} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.nickname")}</div>
            <Input value={cNick} onChange={(e) => setCNick(e.target.value)} placeholder={t("admin.pages.users.form.placeholders.nick")} />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.password")}</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={cPass} onChange={(e) => setCPass(e.target.value)} type="text" placeholder={t("admin.pages.users.form.placeholders.password")} />
              <Button
                variant="secondary"
                className="rounded-xl"
                onClick={async () => {
                  const p = genPassword();
                  setCPass(p);
                  await copyOrToast(p); toast.push({ title: t("common.done"), description: t("common.generated"), tone: "success" });
                }}
              >
                {t("admin.pages.users.actions.generatePassword")}
              </Button>
              <Button variant="ghost" className="rounded-xl" onClick={() => copyOrToast(cPass)}>
                {t("admin.pages.users.actions.copyPassword")}
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.role")}</div>
            <Input value={cRole} onChange={(e) => setCRole(e.target.value)} placeholder={t("admin.pages.users.form.placeholders.role")} />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.roleColor")}</div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="color"
                value={cRoleColor?.trim() ? cRoleColor.trim() : "#64748b"}
                onChange={(e) => setCRoleColor(e.target.value)}
                className="w-14 px-1"
                title={t("admin.pages.users.form.pickColor")}
              />
              <Input value={cRoleColor} onChange={(e) => setCRoleColor(e.target.value)} placeholder="#RRGGBB" className="font-mono" />
              <Button variant="ghost" className="rounded-xl" onClick={() => setCRoleColor("")}>
                {t("admin.pages.users.form.clear")}
              </Button>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{t("admin.pages.users.form.colorFormat")}</div>
          </div>

          <Button className="rounded-xl w-full" onClick={createUser}>
            <Plus className="h-4 w-4 mr-1" /> {t("admin.pages.users.actions.create")}
          </Button>
        </div>
      </Modal>

      <Modal open={editOpen} onOpenChange={setEditOpen} title={t("admin.pages.users.modalEditTitle")} reduceMotion>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {t("admin.pages.users.form.login")}: <span className="font-mono">{current?.username}</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground bg-muted/20 rounded-xl p-2">
            <div>{t("admin.pages.users.form.email")}: <span className="font-mono select-all">{current?.email || "—"}</span></div>
            <div>{t("admin.pages.users.form.ip")}: <span className="font-mono select-all">{current?.last_ip || current?.created_ip || "—"}</span></div>
            <div>{t("admin.pages.users.form.accountsCount")}: <span className="font-semibold">{current?.accounts_count ?? 0}</span></div>
            <div>{t("admin.pages.users.form.tradesCount")}: <span className="font-semibold">{current?.trades_count ?? 0}</span></div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.nickname")}</div>
            <Input value={eNick} onChange={(e) => setENick(e.target.value)} placeholder={t("admin.pages.users.form.placeholders.nick")} />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4" /> {t("admin.pages.users.form.email")}
            </div>
            <Input 
              value={eEmail} 
              onChange={(e) => setEEmail(e.target.value)} 
              type="email"
              pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
              placeholder={t("admin.pages.users.form.placeholders.email", null, "user@example.com")} 
            />
            <div className="mt-1 text-xs text-muted-foreground">
              {t("admin.pages.users.form.emailHint", null, "Leave empty to remove email")}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> {t("admin.pages.users.form.resetPassword")}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={ePass}
                onChange={(e) => setEPass(e.target.value)}
                type="text"
                placeholder={t("admin.pages.users.form.placeholders.newPassword")}
              />
              <Button
                variant="secondary"
                className="rounded-xl"
                onClick={async () => {
                  const p = genPassword();
                  setEPass(p);
                  await copyOrToast(p); toast.push({ title: t("common.done"), description: t("common.generated"), tone: "success" });
                }}
              >
                {t("admin.pages.users.actions.generatePassword")}
              </Button>
              <Button variant="ghost" className="rounded-xl" onClick={() => copyOrToast(ePass)}>
                {t("admin.pages.users.actions.copyPassword")}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.role")}</div>
              <Input value={eRole} onChange={(e) => setERole(e.target.value)} placeholder={t("admin.pages.users.form.placeholders.role")} />
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.roleColor")}</div>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={eRoleColor?.trim() ? eRoleColor.trim() : "#64748b"}
                  onChange={(e) => setERoleColor(e.target.value)}
                  className="w-14 px-1"
                  title={t("admin.pages.users.form.pickColor")}
                />
                <Input value={eRoleColor} onChange={(e) => setERoleColor(e.target.value)} placeholder="#RRGGBB" className="font-mono" />
                <Button variant="ghost" className="rounded-xl" onClick={() => setERoleColor("")}>
                  {t("admin.pages.users.form.clear")}
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold">{t("admin.pages.users.form.disabled")}</div>
              <div className="flex items-center justify-between rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20 px-3 py-2">
                <div className="text-sm text-muted-foreground">{t("admin.pages.users.form.disableHint")}</div>
                <Switch checked={!!eDisabled} onCheckedChange={setEDisabled} />
              </div>
            </div>
            
            <div>
              <div className="mb-1 text-xs font-semibold flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                {t("admin.pages.users.form.adminAccess", null, "Admin Access")}
              </div>
              <div className={`flex items-center justify-between rounded-xl border px-3 py-2 ${eIsAdmin ? 'border-amber-500/40 bg-amber-500/10' : 'border-[rgb(var(--border))] bg-[rgb(var(--muted))]/20'}`}>
                <div className="text-sm text-muted-foreground">
                  {t("admin.pages.users.form.adminAccessHint", null, "Allow access to admin panel")}
                </div>
                <Switch 
                  checked={eIsAdmin} 
                  onCheckedChange={setEIsAdmin}
                  disabled={current?.role === "admin"}
                />
              </div>
              {current?.role === "admin" && (
                <div className="mt-1 text-xs text-amber-500/80">
                  {t("admin.pages.users.form.adminNoChange", null, "Cannot revoke admin from an existing admin")}
                </div>
              )}
            </div>
          </div>

          <Button variant="outline" className="rounded-xl w-full" onClick={logoutAll}>
            <LogOut className="h-4 w-4 mr-1" /> {t("admin.pages.users.actions.logoutAll")}
          </Button>

          <Button className="rounded-xl w-full" onClick={saveUser}>
            <Pencil className="h-4 w-4 mr-1" /> {t("admin.pages.users.actions.save")}
          </Button>

          {current?.role !== "admin" && (
            <Button variant="destructive" className="rounded-xl w-full" onClick={deleteCurrentUser}>
              <Trash2 className="h-4 w-4 mr-1" /> {t("admin.pages.users.actions.delete", null, "Delete User")}
            </Button>
          )}
          {current?.role !== "admin" && (
            <Button variant="destructive" className="rounded-xl w-full opacity-80" onClick={openFullDelete}>
              <Trash2 className="h-4 w-4 mr-1" /> {t("admin.pages.users.actions.fullDelete", null, "Full Delete")}
            </Button>
          )}
        </div>
      </Modal>

      <Modal open={fullDeleteOpen} onOpenChange={setFullDeleteOpen} title={t("admin.pages.users.confirmFullDelete.title", null, "Full Delete User")} reduceMotion>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t("admin.pages.users.confirmFullDelete.description", { username: current?.username }, `This will permanently delete user "${current?.username}" and ALL their data. The email will be available for re-registration. Enter the guard key to confirm.`)}
          </div>
          <Input
            type="password"
            value={fullDeleteGuardKey}
            onChange={(e) => setFullDeleteGuardKey(e.target.value)}
            placeholder={t("admin.pages.users.confirmFullDelete.guardKeyPlaceholder", null, "Enter guard key")}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setFullDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmFullDelete} disabled={!fullDeleteGuardKey}>
              {t("admin.pages.users.actions.fullDelete", null, "Full Delete")}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(v) => {
          if (!v && confirm.onCancel) {
            confirm.onCancel();
          }
          setConfirm((p) => ({ ...p, open: v }));
        }}
        title={confirm.title}
        description={confirm.description}
        confirmText={t("common.confirm")}
        cancelText={t("common.cancel")}
        onConfirm={async () => {
          const fn = confirm.onConfirm;
          setConfirm((p) => ({ ...p, open: false, onCancel: null }));
          await fn?.();
        }}
      />

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </AdminLayout>
  );
}
