import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import SelectDropdown from "@/components/common/SelectDropdown.jsx";
import SingleDatePicker from "@/components/common/SingleDatePicker.jsx";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import AdminNav from "./AdminNav.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  Trophy, ArrowLeft, RefreshCcw, Plus, Edit2, Trash2, Copy, Save,
  ExternalLink, Calendar, Users, Search, X, AlertCircle,
  Upload, Download, Eye, EyeOff, Link2, Clock, BarChart3,
  ClipboardList, Check, Minus, Hash, History, Award, ChevronRight, Vote,
  TrendingUp, TrendingDown, Lock, Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ASSET_ICONS } from "@/lib/assetIcons.js";

/* ── Constants ────────────────────────────────────── */

const TABS = ["leaderboard", "participants", "voteDays", "history", "public", "settings", "overview"];

const TAB_ICONS = {
  leaderboard: BarChart3,
  participants: Users,
  voteDays: Vote,
  history: ClipboardList,
  public: Link2,
  settings: Settings,
  overview: Trophy,
};

const STATUS_COLORS = {
  draft: "bg-slate-500/20 text-slate-400",
  active: "bg-emerald-500/20 text-emerald-400",
  finished: "bg-blue-500/20 text-blue-400",
  archived: "bg-amber-500/20 text-amber-400",
};

const PARTICIPANT_STATUS_COLORS = {
  active: "bg-emerald-500/20 text-emerald-400",
  hidden: "bg-slate-500/20 text-slate-400",
  disqualified: "bg-rose-500/20 text-rose-400",
};

const STATUS_OPTIONS = ["draft", "active", "finished", "archived"];
const PARTICIPANT_STATUS_OPTIONS = ["active", "hidden", "disqualified"];

const textareaCls = "w-full px-4 py-3 rounded-xl bg-[#1a1a2e] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-accent/50";

/* ── Helpers ──────────────────────────────────────── */

const api = async (url, opts = {}) => {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || "Request failed");
  return json;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtTime = (d) => (d ? new Date(d).toLocaleString() : "—");

/* ═══════════════════════════════════════════════════
   Leaderboard Tab — Main working screen
   ═══════════════════════════════════════════════════ */

function LeaderboardTab({ tournament, onReload, toast }) {
  const { t } = useI18n();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [customModal, setCustomModal] = useState(null);
  // customModal: { id, name, delta, reason, mode: "add"|"set", currentPoints }
  const [historyDrawer, setHistoryDrawer] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [bulkDelta, setBulkDelta] = useState(1);
  const [bulkReason, setBulkReason] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const loadLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api(`/api/admin/tournaments/${tournament.id}/leaderboard?includeHidden=true`);
      setLeaderboard(data.leaderboard || []);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tournament.id]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const filtered = useMemo(() => {
    let items = leaderboard;
    if (statusFilter !== "all") {
      items = items.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) =>
          (p.display_name || "").toLowerCase().includes(q) ||
          (p.username || "").toLowerCase().includes(q) ||
          (p.role || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [leaderboard, search, statusFilter]);

  // Reset page when search/filter changes
  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedFiltered = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  // Offset for rank display
  const pageOffset = page * PAGE_SIZE;

  const handleQuickPoints = async (participantId, delta, reason) => {
    try {
      await api(`/api/admin/tournaments/${tournament.id}/participants/${participantId}/add-points`, {
        method: "POST",
        body: JSON.stringify({ points_delta: delta, reason: reason || `Quick ${delta > 0 ? "+" : ""}${delta}` }),
      });
      loadLeaderboard();
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const handleCustomPoints = async () => {
    if (!customModal) return;
    try {
      if (customModal.mode === "set") {
        await api(`/api/admin/tournaments/${tournament.id}/participants/${customModal.id}/set-points`, {
          method: "POST",
          body: JSON.stringify({ total_points: Number(customModal.delta), reason: customModal.reason || null }),
        });
        toast.push({ title: t("common.done", null, "Done"), description: `Set to ${customModal.delta} points`, tone: "success" });
      } else {
        await api(`/api/admin/tournaments/${tournament.id}/participants/${customModal.id}/add-points`, {
          method: "POST",
          body: JSON.stringify({ points_delta: Number(customModal.delta), reason: customModal.reason || null }),
        });
        toast.push({ title: t("common.done", null, "Done"), description: `${Number(customModal.delta) > 0 ? "+" : ""}${customModal.delta} points`, tone: "success" });
      }
      setCustomModal(null);
      loadLeaderboard();
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const handleBulkAdd = async () => {
    if (selected.size === 0) return;
    try {
      const entries = Array.from(selected).map((id) => ({
        participant_id: id,
        points_delta: Number(bulkDelta),
        reason: bulkReason || `Bulk ${Number(bulkDelta) >= 0 ? "+" : ""}${bulkDelta}`,
      }));
      await api(`/api/admin/tournaments/${tournament.id}/points/bulk-add`, {
        method: "POST",
        body: JSON.stringify({ entries }),
      });
      toast.push({ title: t("common.done", null, "Done"), description: `${entries.length} participants updated`, tone: "success" });
      setSelected(new Set());
      setBulkReason("");
      loadLeaderboard();
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const loadHistory = async (participantId) => {
    try {
      const data = await api(`/api/admin/tournaments/${tournament.id}/participants/${participantId}/history`);
      setHistoryData(data.logs || []);
      setHistoryDrawer(participantId);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  };

  const getRankStyle = (idx) => {
    if (idx === 0) return "text-amber-400 font-bold";
    if (idx === 1) return "text-slate-300 font-bold";
    if (idx === 2) return "text-amber-600 font-bold";
    return "text-muted-foreground";
  };

  const getRankBadge = (idx) => {
    if (idx === 0) return "🥇";
    if (idx === 1) return "🥈";
    if (idx === 2) return "🥉";
    return `#${idx + 1}`;
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter" && filtered.length === 1) {
      const p = filtered[0];
      setCustomModal({ id: p.id, name: p.display_name, delta: "", reason: "", mode: "add", currentPoints: Number(p.total_points) || 0 });
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("admin.tournaments.leaderboard.searchPlaceholder", null, "Search by name, username, role…")}
            className="rounded-xl pl-9"
          />
          {search.trim() && filtered.length === 1 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-accent/70 pointer-events-none">
              ↵ Enter
            </div>
          )}
        </div>
        <SelectDropdown
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: t("admin.tournaments.participants.allStatuses", null, "All statuses") },
            ...PARTICIPANT_STATUS_OPTIONS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
          ]}
          className="w-auto min-w-[140px]"
        />
        <Button variant="ghost" className="rounded-xl" onClick={loadLeaderboard}>
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="rounded-xl border border-accent/30 bg-accent/5 shadow-lg shadow-accent/5">
              <CardContent className="p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-accent/20 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <span className="text-sm font-semibold text-accent">
                    {selected.size} {t("admin.tournaments.leaderboard.selected", null, "selected")}
                  </span>
                </div>
                <div className="h-5 w-px bg-border/30 hidden sm:block" />
                <Input
                  type="number"
                  value={bulkDelta}
                  onChange={(e) => setBulkDelta(e.target.value)}
                  className="rounded-xl w-20"
                  placeholder="±"
                />
                <Input
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder={t("admin.tournaments.leaderboard.reason", null, "Reason (optional)")}
                  className="rounded-xl flex-1 min-w-[150px]"
                />
                <Button onClick={handleBulkAdd} className="rounded-xl">
                  <Plus className="h-4 w-4 mr-1" />
                  {t("admin.tournaments.leaderboard.bulkAdd", null, "Apply to selected")}
                </Button>
                <Button variant="ghost" onClick={() => setSelected(new Set())} className="rounded-xl">
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leaderboard Table */}
      <Card className="rounded-xl border border-accent/15 bg-card/70 glass backdrop-blur-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 text-xs text-muted-foreground">
                <th className="p-3 text-left w-10">
                  <button
                    onClick={toggleAll}
                    className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      filtered.length > 0 && selected.size === filtered.length
                        ? "bg-accent border-accent text-white"
                        : selected.size > 0
                          ? "bg-accent/30 border-accent/50 text-accent"
                          : "border-border/50 hover:border-accent/40"
                    }`}
                  >
                    {(filtered.length > 0 && selected.size === filtered.length) && <Check className="h-3 w-3" />}
                    {(selected.size > 0 && selected.size < filtered.length) && <Minus className="h-3 w-3" />}
                  </button>
                </th>
                <th className="p-3 text-center w-12">#</th>
                <th className="p-3 text-left">{t("admin.tournaments.leaderboard.name", null, "Name")}</th>
                <th className="p-3 text-left hidden sm:table-cell">{t("admin.tournaments.leaderboard.username", null, "Username")}</th>
                <th className="p-3 text-left hidden md:table-cell">{t("admin.tournaments.leaderboard.role", null, "Role")}</th>
                <th className="p-3 text-center">{t("admin.tournaments.leaderboard.points", null, "Points")}</th>
                <th className="p-3 text-left hidden lg:table-cell">{t("admin.tournaments.leaderboard.lastUpdate", null, "Last Update")}</th>
                <th className="p-3 text-center">{t("admin.tournaments.leaderboard.actions", null, "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{t("common.loading", null, "Loading…")}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{t("admin.tournaments.leaderboard.empty", null, "No participants found")}</td></tr>
              ) : (
                paginatedFiltered.map((p, idx) => {
                  const globalIdx = pageOffset + idx;
                  return (
                  <tr
                    key={p.id}
                    className={`border-b border-border/10 hover:bg-accent/5 transition ${
                      p.status === "hidden" ? "opacity-50" : ""
                    } ${p.status === "disqualified" ? "line-through opacity-40" : ""} ${
                      globalIdx < 3 ? "bg-accent/[0.03]" : ""
                    }`}
                  >
                    <td className="p-3">
                      <button
                        onClick={() => toggleSelect(p.id)}
                        className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          selected.has(p.id)
                            ? "bg-accent border-accent text-white scale-110"
                            : "border-border/40 hover:border-accent/40"
                        }`}
                      >
                        {selected.has(p.id) && <Check className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className={`p-3 text-center ${getRankStyle(globalIdx)}`}>
                      {getRankBadge(globalIdx)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {p.avatar_url && (
                          <img src={p.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                        )}
                        <div>
                          <div className="font-medium">{p.display_name}</div>
                          <div className="text-[10px] text-muted-foreground sm:hidden">{p.username || ""}</div>
                        </div>
                        {p.status !== "active" && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${PARTICIPANT_STATUS_COLORS[p.status] || ""}`}>
                            {p.status}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground hidden sm:table-cell">{p.username || "—"}</td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{p.role || "—"}</td>
                    <td className="p-3 text-center">
                      <span className="font-bold text-base">{Number(p.total_points) || 0}</span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {fmtTime(p.last_points_update || p.updated_at)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {[1, 2, 3].map((d) => (
                          <button
                            key={d}
                            onClick={() => handleQuickPoints(p.id, d)}
                            className="px-2 py-1 text-xs rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition"
                          >
                            +{d}
                          </button>
                        ))}
                        <button
                          onClick={() => handleQuickPoints(p.id, -1)}
                          className="px-2 py-1 text-xs rounded-lg bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 transition"
                        >
                          −1
                        </button>
                        <button
                          onClick={() => setCustomModal({ id: p.id, name: p.display_name, delta: "", reason: "", mode: "add", currentPoints: Number(p.total_points) || 0 })}
                          className="px-2 py-1 text-xs rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition"
                        >
                          ±
                        </button>
                        <button
                          onClick={() => loadHistory(p.id)}
                          className="px-2 py-1 text-xs rounded-lg bg-slate-500/15 text-slate-400 hover:bg-slate-500/25 transition"
                        >
                          <History className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-border/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} {t("admin.tournaments.leaderboard.total", null, "total")} • page {page + 1}/{totalPages}</span>
            <div className="flex gap-1">
              <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-xl h-7 px-3 text-xs">
                ←
              </Button>
              <Button variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="rounded-xl h-7 px-3 text-xs">
                →
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Custom Points Modal */}
      <AnimatePresence>
        {customModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setCustomModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-card border border-border/50 rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-4">
                {t("admin.tournaments.leaderboard.customPoints", null, "Custom Points")} — {customModal.name}
              </h3>
              {/* Mode Toggle */}
              <div className="flex gap-1 p-1 mb-4 bg-card/80 rounded-xl border border-border/30">
                <button
                  onClick={() => setCustomModal({ ...customModal, mode: "add", delta: "" })}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    customModal.mode === "add"
                      ? "bg-accent/20 text-accent shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Plus className="h-3 w-3 inline mr-1" />
                  {t("admin.tournaments.leaderboard.addPoints", null, "Add / Subtract")}
                </button>
                <button
                  onClick={() => setCustomModal({ ...customModal, mode: "set", delta: String(customModal.currentPoints || 0) })}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    customModal.mode === "set"
                      ? "bg-amber-500/20 text-amber-400 shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Hash className="h-3 w-3 inline mr-1" />
                  {t("admin.tournaments.leaderboard.setPoints", null, "Set Total")}
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {customModal.mode === "set"
                      ? t("admin.tournaments.leaderboard.newTotal", null, "New Total Points")
                      : t("admin.tournaments.leaderboard.pointsDelta", null, "Points (±)")}
                  </label>
                  {customModal.mode === "set" && (
                    <div className="text-[10px] text-muted-foreground mb-1">
                      Current: {customModal.currentPoints} pts
                    </div>
                  )}
                  <Input
                    type="number"
                    value={customModal.delta}
                    onChange={(e) => setCustomModal({ ...customModal, delta: e.target.value })}
                    placeholder={customModal.mode === "set" ? "e.g. 10" : "e.g. 5 or -2"}
                    className="rounded-xl"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.leaderboard.reason", null, "Reason (optional)")}</label>
                  <Input
                    value={customModal.reason}
                    onChange={(e) => setCustomModal({ ...customModal, reason: e.target.value })}
                    placeholder={t("admin.tournaments.leaderboard.reasonPlaceholder", null, "e.g. MOTM vote day 3")}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="ghost" onClick={() => setCustomModal(null)} className="rounded-xl">
                  {t("common.cancel", null, "Cancel")}
                </Button>
                <Button onClick={handleCustomPoints} disabled={!customModal.delta} className="rounded-xl">
                  {t("admin.tournaments.leaderboard.apply", null, "Apply")}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Drawer */}
      <AnimatePresence>
        {historyDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => setHistoryDrawer(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="bg-card border-l border-border/50 w-full max-w-lg h-full overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{t("admin.tournaments.leaderboard.history", null, "Points History")}</h3>
                <Button variant="ghost" size="icon" onClick={() => setHistoryDrawer(null)} className="rounded-xl">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {historyData.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("admin.tournaments.leaderboard.noHistory", null, "No history yet")}</p>
              ) : (
                <div className="space-y-2">
                  {historyData.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/20">
                      <div className={`text-sm font-bold min-w-[50px] text-center ${Number(log.points_delta) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {Number(log.points_delta) >= 0 ? "+" : ""}{log.points_delta}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{log.reason || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {fmtTime(log.created_at)} {log.admin_name ? `• ${log.admin_name}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Participants Tab
   ═══════════════════════════════════════════════════ */

function ParticipantsTab({ tournament, onReload, toast }) {
  const { t } = useI18n();
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ display_name: "", username: "", role: "", notes: "", status: "active" });
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);

  const loadParticipants = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api(`/api/admin/tournaments/${tournament.id}/participants`);
      setParticipants(data.participants || []);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tournament.id]);

  useEffect(() => { loadParticipants(); }, [loadParticipants]);

  const filtered = useMemo(() => {
    if (!search.trim()) return participants;
    const q = search.toLowerCase();
    return participants.filter(
      (p) =>
        (p.display_name || "").toLowerCase().includes(q) ||
        (p.username || "").toLowerCase().includes(q) ||
        (p.role || "").toLowerCase().includes(q)
    );
  }, [participants, search]);

  const resetForm = () => setForm({ display_name: "", username: "", role: "", notes: "", status: "active" });

  const handleSave = async () => {
    if (!form.display_name.trim()) return;
    try {
      if (editingId) {
        await api(`/api/admin/tournaments/${tournament.id}/participants/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await api(`/api/admin/tournaments/${tournament.id}/participants`, {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.participants.saved", null, "Participant saved"), tone: "success" });
      resetForm();
      setEditingId(null);
      setShowAdd(false);
      loadParticipants();
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const handleEdit = (p) => {
    setForm({
      display_name: p.display_name || "",
      username: p.username || "",
      role: p.role || "",
      notes: p.notes || "",
      status: p.status || "active",
    });
    setEditingId(p.id);
    setShowAdd(true);
  };

  const handleDelete = async (p) => {
    if (!confirm(`Delete "${p.display_name}"?`)) return;
    try {
      await api(`/api/admin/tournaments/${tournament.id}/participants/${p.id}`, { method: "DELETE" });
      toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.participants.deleted", null, "Participant deleted"), tone: "success" });
      loadParticipants();
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournament.id}/participants/export`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tournament-${tournament.id}-participants.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(",")[1];
        const result = await api(`/api/admin/tournaments/${tournament.id}/participants/import`, {
          method: "POST",
          body: JSON.stringify({ fileData: base64, mode: "upsert" }),
        });
        toast.push({
          title: t("common.done", null, "Done"),
          description: `Imported: ${result.created || 0} new, ${result.updated || 0} updated${result.pointsAdded ? `, ${result.pointsAdded} points added` : ""}`,
          tone: "success",
        });
        loadParticipants();
        onReload();
      };
      reader.readAsDataURL(file);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          onClick={() => { resetForm(); setEditingId(null); setShowAdd(!showAdd); }}
          className="rounded-xl"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t("admin.tournaments.participants.add", null, "Add Participant")}
        </Button>
        <Button variant="ghost" onClick={handleExport} className="rounded-xl">
          <Download className="h-4 w-4 mr-1" />
          {t("admin.tournaments.participants.export", null, "Export")}
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()} className="rounded-xl">
          <Upload className="h-4 w-4 mr-1" />
          {t("admin.tournaments.participants.import", null, "Import")}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.tournaments.participants.search", null, "Search…")}
            className="rounded-xl pl-9 w-[200px]"
          />
        </div>
      </div>

      {/* Add/Edit Form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="rounded-xl border border-accent/15 bg-card/70 glass backdrop-blur-md">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">{t("admin.tournaments.participants.displayName", null, "Display Name")} *</label>
                    <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="rounded-xl" />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">{t("admin.tournaments.participants.username", null, "Username")}</label>
                    <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="rounded-xl" />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">{t("admin.tournaments.participants.role", null, "Role")}</label>
                    <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">{t("admin.tournaments.participants.notes", null, "Notes")}</label>
                    <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-xl" />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">{t("admin.tournaments.participants.status", null, "Status")}</label>
                    <SelectDropdown
                      value={form.status}
                      onChange={(v) => setForm({ ...form, status: v })}
                      options={PARTICIPANT_STATUS_OPTIONS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => { setShowAdd(false); setEditingId(null); resetForm(); }} className="rounded-xl">
                    {t("common.cancel", null, "Cancel")}
                  </Button>
                  <Button onClick={handleSave} disabled={!form.display_name.trim()} className="rounded-xl">
                    <Save className="h-4 w-4 mr-1" />
                    {editingId ? t("common.save", null, "Save") : t("admin.tournaments.participants.add", null, "Add")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Participants List */}
      <Card className="rounded-xl border border-accent/15 bg-card/70 glass backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("admin.tournaments.participants.title", null, "Participants")}
            <span className="text-sm font-normal text-muted-foreground">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground p-4">{t("common.loading", null, "Loading…")}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>{t("admin.tournaments.participants.empty", null, "No participants yet")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/20 hover:border-accent/20 transition">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{p.display_name}</span>
                      {p.username && <span className="text-xs text-muted-foreground">@{p.username}</span>}
                      {p.role && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">{p.role}</span>}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PARTICIPANT_STATUS_COLORS[p.status] || ""}`}>{p.status}</span>
                    </div>
                    {p.notes && <div className="text-[10px] text-muted-foreground mt-1">{p.notes}</div>}
                  </div>
                  <div className="text-sm font-bold">{Number(p.total_points) || 0} pts</div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(p)} className="rounded-xl h-8 w-8">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p)} className="rounded-xl h-8 w-8 text-rose-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   History Tab
   ═══════════════════════════════════════════════════ */

function HistoryTab({ tournament, toast }) {
  const { t } = useI18n();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api(`/api/admin/tournaments/${tournament.id}/points/history?limit=${limit}&offset=${offset}`);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tournament.id, offset]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleDelete = async (logId) => {
    if (!confirm("Delete this points entry? The participant's total will be recalculated.")) return;
    try {
      await api(`/api/admin/tournaments/${tournament.id}/points/${logId}`, { method: "DELETE" });
      toast.push({ title: t("common.done", null, "Done"), description: "Entry deleted", tone: "success" });
      loadHistory();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournament.id}/export/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tournament-${tournament.id}-history.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t("admin.tournaments.history.title", null, "Points History")} ({total})
        </h3>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleExport} className="rounded-xl">
            <Download className="h-4 w-4 mr-1" />
            {t("admin.tournaments.history.export", null, "Export")}
          </Button>
          <Button variant="ghost" onClick={loadHistory} className="rounded-xl">
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="rounded-xl border border-accent/15 bg-card/70 glass backdrop-blur-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 text-xs text-muted-foreground">
                <th className="p-3 text-left">{t("admin.tournaments.history.date", null, "Date")}</th>
                <th className="p-3 text-left">{t("admin.tournaments.history.participant", null, "Participant")}</th>
                <th className="p-3 text-center">{t("admin.tournaments.history.delta", null, "Delta")}</th>
                <th className="p-3 text-left">{t("admin.tournaments.history.reason", null, "Reason")}</th>
                <th className="p-3 text-left hidden sm:table-cell">{t("admin.tournaments.history.admin", null, "Admin")}</th>
                <th className="p-3 text-center w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t("common.loading", null, "Loading…")}</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t("admin.tournaments.history.empty", null, "No entries yet")}</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/10 hover:bg-accent/5 transition">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtTime(log.created_at)}</td>
                    <td className="p-3">
                      <div className="font-medium text-sm">{log.participant_name}</div>
                      {log.participant_username && (
                        <div className="text-[10px] text-muted-foreground">@{log.participant_username}</div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`font-bold ${Number(log.points_delta) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {Number(log.points_delta) >= 0 ? "+" : ""}{log.points_delta}
                      </span>
                    </td>
                    <td className="p-3 text-sm">{log.reason || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground hidden sm:table-cell">{log.admin_name || "—"}</td>
                    <td className="p-3 text-center">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)} className="rounded-xl h-7 w-7 text-rose-400">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="p-3 border-t border-border/20 flex items-center justify-center gap-2">
            <Button variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="rounded-xl text-xs">
              ← {t("common.prev", null, "Previous")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {offset + 1}–{Math.min(offset + limit, total)} / {total}
            </span>
            <Button variant="ghost" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="rounded-xl text-xs">
              {t("common.next", null, "Next")} →
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Public Tab
   ═══════════════════════════════════════════════════ */

function PublicTab({ tournament, onReload, toast }) {
  const { t } = useI18n();
  const [publicLink, setPublicLink] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPublicLink = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api(`/api/admin/tournaments/${tournament.id}/public-link`);
      setPublicLink(data?.public_slug ? data : null);
    } catch {
      setPublicLink(null);
    } finally {
      setLoading(false);
    }
  }, [tournament.id]);

  useEffect(() => { loadPublicLink(); }, [loadPublicLink]);

  const handleToggle = async () => {
    try {
      if (!publicLink) {
        await api(`/api/admin/tournaments/${tournament.id}/public-link`, { method: "POST" });
      }
      await api(`/api/admin/tournaments/${tournament.id}/public`, {
        method: "PUT",
        body: JSON.stringify({ is_public: !publicLink?.is_enabled }),
      });
      toast.push({ title: t("common.done", null, "Done"), tone: "success" });
      loadPublicLink();
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const handleRegenerate = async () => {
    try {
      await api(`/api/admin/tournaments/${tournament.id}/public/generate-slug`, { method: "POST" });
      toast.push({ title: t("common.done", null, "Done"), description: "New link generated", tone: "success" });
      loadPublicLink();
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  const publicUrl = publicLink?.public_slug
    ? `${window.location.origin}/tournament/${publicLink.public_slug}`
    : null;

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      toast.push({ title: t("common.done", null, "Copied!"), tone: "success" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border border-accent/15 bg-card/70 glass backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("admin.tournaments.publicLink.title", null, "Public Link")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", null, "Loading…")}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Button onClick={handleToggle} className={`rounded-xl ${publicLink?.is_enabled ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}`}>
                  {publicLink?.is_enabled ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                  {publicLink?.is_enabled
                    ? t("admin.tournaments.publicLink.enabled", null, "Public — ON")
                    : t("admin.tournaments.publicLink.disabled", null, "Public — OFF")}
                </Button>
                <Button variant="ghost" onClick={handleRegenerate} className="rounded-xl">
                  <RefreshCcw className="h-4 w-4 mr-1" />
                  {t("admin.tournaments.publicLink.regenerate", null, "New Link")}
                </Button>
              </div>

              {publicUrl && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#1a1a2e] border border-border/30">
                  <ExternalLink className="h-4 w-4 text-accent shrink-0" />
                  <span className="text-sm text-accent truncate flex-1">{publicUrl}</span>
                  <Button variant="ghost" size="icon" onClick={handleCopy} className="rounded-xl h-8 w-8 shrink-0">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8 shrink-0">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              )}

              {publicUrl && (
                <div className="mt-3">
                  <label className="text-xs text-muted-foreground mb-1.5 block">Voting Links</label>
                  <p className="text-xs text-muted-foreground p-3 rounded-xl bg-[#1a1a2e] border border-border/30">
                    Voting links are generated per day. Go to the <strong>Vote Days</strong> tab to copy the link for a specific day.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Settings Tab — Voting Settings (password + penalty)
   ═══════════════════════════════════════════════════ */

function SettingsTab({ tournament, onReload, toast }) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vote_password: "",
    wrong_guess_penalty: "0",
  });

  useEffect(() => {
    if (tournament) {
      setForm({
        vote_password: tournament.vote_password || "",
        wrong_guess_penalty: (tournament.scoring_config?.wrong_guess_penalty ?? 0).toString(),
      });
    }
  }, [tournament]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/admin/tournaments/${tournament.id}`, {
        method: "PUT",
        body: JSON.stringify({
          vote_password: form.vote_password.trim() || null,
          scoring_config: {
            ...(tournament.scoring_config || {}),
            wrong_guess_penalty: parseFloat(form.wrong_guess_penalty) || 0,
          },
        }),
      });
      toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.toasts.saved", null, "Tournament saved"), tone: "success" });
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  if (!tournament) return null;

  const hasPassword = !!(form.vote_password && form.vote_password.trim());
  const penaltyValue = parseFloat(form.wrong_guess_penalty) || 0;

  return (
    <div className="space-y-6">
      {/* Voting Settings */}
      <Card className="rounded-xl border border-accent/15 bg-card/70 glass backdrop-blur-md">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Vote className="h-5 w-5 text-accent" />
            <h3 className="text-base font-semibold">{t("admin.tournaments.detail.votingSettings", null, "Voting Settings")}</h3>
          </div>

          {/* Vote Password */}
          <div className="rounded-xl border border-border/30 bg-[#1a1a2e]/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-400" />
              <label className="text-sm font-semibold">{t("admin.tournaments.form.votePassword", null, "Voting Password")}</label>
              {hasPassword && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                  {t("admin.tournaments.detail.passwordSet", null, "Password set")}
                </span>
              )}
            </div>
            <input
              type="text"
              value={form.vote_password}
              onChange={(e) => setForm({ ...form, vote_password: e.target.value })}
              placeholder={t("admin.tournaments.form.votePasswordPlaceholder", null, "Leave empty for no password")}
              className="w-full px-4 py-2.5 rounded-xl bg-[#0f0f23] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <p className="text-xs text-muted-foreground">{t("admin.tournaments.form.votePasswordHint", null, "If set, voters must enter this password to submit their vote.")}</p>
          </div>

          {/* Wrong Guess Penalty */}
          <div className="rounded-xl border border-border/30 bg-[#1a1a2e]/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-red-400" />
              <label className="text-sm font-semibold">{t("admin.tournaments.form.wrongGuessPenalty", null, "Wrong Guess Penalty")}</label>
              {penaltyValue > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                  −{penaltyValue} {t("admin.tournaments.detail.pointsPerWrongGuess", null, "points per wrong guess")}
                </span>
              )}
            </div>
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={form.wrong_guess_penalty}
              onChange={(e) => setForm({ ...form, wrong_guess_penalty: e.target.value })}
              placeholder="0"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0f0f23] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <p className="text-xs text-muted-foreground">{t("admin.tournaments.form.wrongGuessPenaltyHint", null, "Points deducted per wrong guess when resolving a day. Set to 0 to disable.")}</p>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              <Save className="h-4 w-4 mr-1" />
              {saving ? t("common.working", null, "Saving…") : t("common.save", null, "Save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Settings Summary (read-only) */}
      <Card className="rounded-xl">
        <CardContent className="p-4 space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">{t("admin.tournaments.settings.currentValues", null, "Current Settings")}</h4>
          <div className="flex items-center gap-3">
            <Lock className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-sm font-medium">{t("admin.tournaments.form.votePassword", null, "Voting Password")}</div>
              <div className="text-xs text-muted-foreground">
                {tournament.vote_password
                  ? t("admin.tournaments.detail.passwordSet", null, "Password set") + `: ${tournament.vote_password}`
                  : t("admin.tournaments.detail.noPassword", null, "No password required")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Minus className="h-4 w-4 text-red-400 shrink-0" />
            <div>
              <div className="text-sm font-medium">{t("admin.tournaments.form.wrongGuessPenalty", null, "Wrong Guess Penalty")}</div>
              <div className="text-xs text-muted-foreground">
                {(tournament.scoring_config?.wrong_guess_penalty ?? 0) > 0
                  ? `${tournament.scoring_config.wrong_guess_penalty} ${t("admin.tournaments.detail.pointsPerWrongGuess", null, "points per wrong guess")}`
                  : t("admin.tournaments.detail.noPenalty", null, "No penalty (disabled)")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Overview Tab
   ═══════════════════════════════════════════════════ */

function OverviewTab({ tournament, participantCount, onReload, toast }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (tournament) {
      setForm({
        name: tournament.name || "",
        description: tournament.description || "",
        start_date: tournament.start_date ? new Date(tournament.start_date).toISOString().split("T")[0] : "",
        end_date: tournament.end_date ? new Date(tournament.end_date).toISOString().split("T")[0] : "",
        status: tournament.status || "draft",
        rules_text: tournament.rules_text || "",
        vote_password: tournament.vote_password || "",
        wrong_guess_penalty: (tournament.scoring_config?.wrong_guess_penalty ?? 0).toString(),
      });
    }
  }, [tournament]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/admin/tournaments/${tournament.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          status: form.status,
          rules_text: form.rules_text.trim() || null,
          vote_password: form.vote_password.trim() || null,
          scoring_config: {
            ...(tournament.scoring_config || {}),
            wrong_guess_penalty: parseFloat(form.wrong_guess_penalty) || 0,
          },
        }),
      });
      toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.toasts.saved", null, "Tournament saved"), tone: "success" });
      setEditing(false);
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  if (!tournament) return null;

  return (
    <div className="space-y-6">
      {/* Status & Info */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[tournament.status] || STATUS_COLORS.draft}`}>
          {t(`admin.tournaments.statuses.${tournament.status}`, null, tournament.status)}
        </span>
        <h2 className="text-xl font-bold">{tournament.name}</h2>
        {tournament.start_date && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {fmtDate(tournament.start_date)} — {fmtDate(tournament.end_date)}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-emerald-400" />
            <div>
              <div className="text-lg font-bold">{participantCount}</div>
              <div className="text-[11px] text-muted-foreground">{t("admin.tournaments.detail.totalParticipants", null, "Participants")}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-blue-400" />
            <div>
              <div className="text-lg font-bold">{fmtDate(tournament.created_at)}</div>
              <div className="text-[11px] text-muted-foreground">{t("admin.tournaments.detail.created", null, "Created")}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <Hash className="h-5 w-5 text-amber-400" />
            <div>
              <div className="text-sm font-mono font-bold truncate">{tournament.slug}</div>
              <div className="text-[11px] text-muted-foreground">Slug</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="rounded-xl" onClick={() => setEditing(!editing)}>
          <Edit2 className="h-4 w-4 mr-1" /> {t("common.edit", null, "Edit")}
        </Button>
      </div>

      {/* Edit Form */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="rounded-xl border border-accent/15 bg-card/70 glass backdrop-blur-md">
              <CardContent className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.name", null, "Name")}</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.description", null, "Description")}</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className={textareaCls}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.startDate", null, "Start Date")}</label>
                    <SingleDatePicker value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.endDate", null, "End Date")}</label>
                    <SingleDatePicker value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.status", null, "Status")}</label>
                  <SelectDropdown
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v })}
                    options={STATUS_OPTIONS.map((s) => ({ value: s, label: t(`admin.tournaments.statuses.${s}`, null, s) }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.rules", null, "Rules")}</label>
                  <textarea
                    value={form.rules_text}
                    onChange={(e) => setForm({ ...form, rules_text: e.target.value })}
                    rows={4}
                    className={textareaCls}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.votePassword", null, "Voting Password")}</label>
                  <input
                    type="text"
                    value={form.vote_password}
                    onChange={(e) => setForm({ ...form, vote_password: e.target.value })}
                    placeholder={t("admin.tournaments.form.votePasswordPlaceholder", null, "Leave empty for no password")}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#1a1a2e] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("admin.tournaments.form.votePasswordHint", null, "If set, voters must enter this password to submit their vote.")}</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.wrongGuessPenalty", null, "Wrong Guess Penalty")}</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    value={form.wrong_guess_penalty}
                    onChange={(e) => setForm({ ...form, wrong_guess_penalty: e.target.value })}
                    placeholder="0"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#1a1a2e] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("admin.tournaments.form.wrongGuessPenaltyHint", null, "Points deducted per wrong guess when resolving a day. Set to 0 to disable.")}</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setEditing(false)} className="rounded-xl">
                    {t("common.cancel", null, "Cancel")}
                  </Button>
                  <Button onClick={handleSave} disabled={!form.name.trim() || saving} className="rounded-xl">
                    <Save className="h-4 w-4 mr-1" />
                    {saving ? t("common.working", null, "Saving…") : t("common.save", null, "Save")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Description & Rules */}
      {tournament.description && (
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">{t("admin.tournaments.form.description", null, "Description")}</h4>
            <p className="text-sm whitespace-pre-wrap">{tournament.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Voting Settings (read-only) */}
      <Card className="rounded-xl">
        <CardContent className="p-4 space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">{t("admin.tournaments.detail.votingSettings", null, "Voting Settings")}</h4>
          <div className="flex items-center gap-3">
            <Lock className="h-4 w-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-sm font-medium">{t("admin.tournaments.form.votePassword", null, "Voting Password")}</div>
              <div className="text-xs text-muted-foreground">
                {tournament.vote_password
                  ? t("admin.tournaments.detail.passwordSet", null, "Password set") + `: ${tournament.vote_password}`
                  : t("admin.tournaments.detail.noPassword", null, "No password required")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Minus className="h-4 w-4 text-red-400 shrink-0" />
            <div>
              <div className="text-sm font-medium">{t("admin.tournaments.form.wrongGuessPenalty", null, "Wrong Guess Penalty")}</div>
              <div className="text-xs text-muted-foreground">
                {(tournament.scoring_config?.wrong_guess_penalty ?? 0) > 0
                  ? `${tournament.scoring_config.wrong_guess_penalty} ${t("admin.tournaments.detail.pointsPerWrongGuess", null, "points per wrong guess")}`
                  : t("admin.tournaments.detail.noPenalty", null, "No penalty (disabled)")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Vote Days Tab — Daily voting management
   ═══════════════════════════════════════════════════ */

const VOTE_DAY_STATUS_COLORS = {
  upcoming: "bg-slate-500/20 text-slate-400",
  open: "bg-emerald-500/20 text-emerald-400",
  closed: "bg-amber-500/20 text-amber-400",
  resolved: "bg-blue-500/20 text-blue-400",
};

const VOTE_DAY_STATUS_OPTIONS = ["upcoming", "open", "closed"];

function VoteDaysTab({ tournament, onReload, toast }) {
  const { t } = useI18n();

  // List view state
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ date_key: "", title: "", status: "upcoming", voting_open_at: "", voting_close_at: "" });
  const [creatingDay, setCreatingDay] = useState(false);

  // Detail view state
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [editingDay, setEditingDay] = useState(false);
  const [dayForm, setDayForm] = useState({});
  const [savingDay, setSavingDay] = useState(false);

  // Assets state
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [assetForm, setAssetForm] = useState({ asset_code: "", asset_label: "" });

  // Outcomes state
  const [outcomes, setOutcomes] = useState({});
  const [resolving, setResolving] = useState(false);
  const [pointsMultiplier, setPointsMultiplier] = useState(1);

  // Votes state
  const [votes, setVotes] = useState([]);
  const [votesLoading, setVotesLoading] = useState(false);
  const [voteSearch, setVoteSearch] = useState("");

  // Manual vote state
  const [showManualVote, setShowManualVote] = useState(false);
  const [manualVoteNickname, setManualVoteNickname] = useState("");
  const [manualVoteSelections, setManualVoteSelections] = useState({});
  const [addingManualVote, setAddingManualVote] = useState(false);

  // Default assets state
  const [defaultAssets, setDefaultAssets] = useState([]);
  const [defaultAssetsLoading, setDefaultAssetsLoading] = useState(false);
  const [showDefaultAssets, setShowDefaultAssets] = useState(false);
  const [newDefaultAsset, setNewDefaultAsset] = useState({ asset_code: "", asset_label: "", icon_url: "" });
  const [addingDefault, setAddingDefault] = useState(false);

  // Quick create state
  const [quickCreating, setQuickCreating] = useState(false);

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState(null);
  // { title, description, onConfirm, loading }

  const base = `/api/admin/tournaments/${tournament.id}/vote-days`;

  /* ── Load days list ── */
  const loadDays = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api(base);
      setDays(data.days || data || []);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [tournament.id]);

  /* ── Load default assets ── */
  const loadDefaultAssets = useCallback(async () => {
    try {
      setDefaultAssetsLoading(true);
      const data = await api(`/api/admin/tournaments/${tournament.id}/default-assets`);
      setDefaultAssets(data.assets || []);
    } catch (e) {
      console.error("[VoteDaysTab] Failed to load default assets:", e?.message || e);
    } finally {
      setDefaultAssetsLoading(false);
    }
  }, [tournament.id]);

  useEffect(() => { loadDays(); loadDefaultAssets(); }, [loadDays, loadDefaultAssets]);

  /* ── Load day detail ── */
  const loadDayDetail = useCallback(async (dayId) => {
    try {
      setDayLoading(true);
      const data = await api(`${base}/${dayId}`);
      const day = data.day || data;
      setDayDetail(day);
      setDayForm({
        date_key: day.date_key || "",
        title: day.title || "",
        status: day.status || "upcoming",
        voting_open_at: day.voting_open_at ? new Date(day.voting_open_at).toISOString().slice(0, 16) : "",
        voting_close_at: day.voting_close_at ? new Date(day.voting_close_at).toISOString().slice(0, 16) : "",
      });
      setAssets(day.assets || []);
      // Initialize outcomes from existing resolved data
      const initOutcomes = {};
      (day.assets || []).forEach((a) => {
        if (a.correct_option) initOutcomes[a.id] = a.correct_option;
      });
      setOutcomes(initOutcomes);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setDayLoading(false);
    }
  }, [tournament.id]);

  /* ── Load assets for day ── */
  const loadAssets = useCallback(async (dayId) => {
    try {
      setAssetsLoading(true);
      const data = await api(`${base}/${dayId}/assets`);
      setAssets(data.assets || data || []);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setAssetsLoading(false);
    }
  }, [tournament.id]);

  /* ── Load votes for day ── */
  const loadVotes = useCallback(async (dayId) => {
    try {
      setVotesLoading(true);
      const data = await api(`${base}/${dayId}/votes`);
      setVotes(data.votes || data || []);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setVotesLoading(false);
    }
  }, [tournament.id]);

  /* ── Select a day ── */
  const selectDay = (day) => {
    setSelectedDay(day.id);
    loadDayDetail(day.id);
    loadVotes(day.id);
  };

  const goBack = () => {
    setSelectedDay(null);
    setDayDetail(null);
    setEditingDay(false);
    setAssets([]);
    setVotes([]);
    setOutcomes({});
    setPointsMultiplier(1);
    setShowManualVote(false);
    setManualVoteNickname("");
    setManualVoteSelections({});
    loadDays();
  };

  /* ── Create day ── */
  const handleCreateDay = async () => {
    if (!createForm.date_key) return;
    try {
      setCreatingDay(true);
      await api(base, {
        method: "POST",
        body: JSON.stringify({
          date_key: createForm.date_key,
          title: createForm.title || null,
          status: createForm.status,
          voting_open_at: createForm.voting_open_at || null,
          voting_close_at: createForm.voting_close_at || null,
        }),
      });
      toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.voteDays.created", null, "Vote day created"), tone: "success" });
      setCreateForm({ date_key: "", title: "", status: "upcoming", voting_open_at: "", voting_close_at: "" });
      setShowCreate(false);
      loadDays();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setCreatingDay(false);
    }
  };

  /* ── Update day ── */
  const handleUpdateDay = async () => {
    try {
      setSavingDay(true);
      await api(`${base}/${selectedDay}`, {
        method: "PUT",
        body: JSON.stringify({
          date_key: dayForm.date_key,
          title: dayForm.title || null,
          status: dayForm.status,
          voting_open_at: dayForm.voting_open_at || null,
          voting_close_at: dayForm.voting_close_at || null,
        }),
      });
      toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.voteDays.updated", null, "Vote day updated"), tone: "success" });
      setEditingDay(false);
      loadDayDetail(selectedDay);
      loadDays();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setSavingDay(false);
    }
  };

  /* ── Add asset ── */
  const handleAddAsset = async () => {
    if (!assetForm.asset_code.trim()) return;
    try {
      await api(`${base}/${selectedDay}/assets`, {
        method: "POST",
        body: JSON.stringify(assetForm),
      });
      toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.voteDays.assetAdded", null, "Asset added"), tone: "success" });
      setAssetForm({ asset_code: "", asset_label: "" });
      setShowAddAsset(false);
      loadAssets(selectedDay);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  /* ── Delete asset ── */
  const handleDeleteAsset = async (assetId) => {
    try {
      await api(`${base}/${selectedDay}/assets/${assetId}`, { method: "DELETE" });
      toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.voteDays.assetDeleted", null, "Asset deleted"), tone: "success" });
      loadAssets(selectedDay);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  /* ── Add all default assets ── */
  const handleAddAllDefaults = async () => {
    const existingCodes = new Set(assets.map((a) => a.asset_code));
    const toAdd = defaultAssets.filter((d) => !existingCodes.has(d.asset_code));
    if (toAdd.length === 0) {
      toast.push({ title: t("common.info", null, "Info"), description: t("admin.tournaments.voteDays.allDefaultsAdded", null, "All default assets already added"), tone: "info" });
      return;
    }
    let added = 0;
    const failed = [];
    for (const d of toAdd) {
      try {
        await api(`${base}/${selectedDay}/assets`, {
          method: "POST",
          body: JSON.stringify({ asset_code: d.asset_code, asset_label: d.asset_label }),
        });
        added++;
      } catch (e) {
        failed.push(d.asset_code);
      }
    }
    if (failed.length > 0) {
      toast.push({ title: t("common.error", null, "Error"), description: `Failed to add: ${failed.join(", ")}`, tone: "danger" });
    } else {
      toast.push({ title: t("common.done", null, "Done"), description: `${added} ${t("admin.tournaments.voteDays.assetsAdded", null, "assets added")}`, tone: "success" });
    }
    loadAssets(selectedDay);
  };

  /* ── Add single default asset ── */
  const handleAddDefaultAsset = async (d) => {
    if (assets.some((a) => a.asset_code === d.asset_code)) {
      toast.push({ title: t("common.info", null, "Info"), description: `${d.asset_code} ${t("admin.tournaments.voteDays.alreadyAdded", null, "already added")}`, tone: "info" });
      return;
    }
    try {
      await api(`${base}/${selectedDay}/assets`, {
        method: "POST",
        body: JSON.stringify({ asset_code: d.asset_code, asset_label: d.asset_label }),
      });
      toast.push({ title: t("common.done", null, "Done"), description: `${t("admin.tournaments.voteDays.added", null, "Added")} ${d.asset_code}`, tone: "success" });
      loadAssets(selectedDay);
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  /* ── Quick Create Today ── */
  const handleQuickCreateToday = async () => {
    try {
      setQuickCreating(true);
      const result = await api(`/api/admin/tournaments/${tournament.id}/vote-days/quick-today`, { method: "POST" });
      toast.push({ title: t("common.done", null, "Done"), description: `Created today's voting day with ${result.assetsCount || 0} assets`, tone: "success" });
      loadDays();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setQuickCreating(false);
    }
  };

  /* ── Add default asset (management) ── */
  const handleAddDefaultAssetEntry = async () => {
    if (!newDefaultAsset.asset_code.trim()) return;
    try {
      setAddingDefault(true);
      await api(`/api/admin/tournaments/${tournament.id}/default-assets`, {
        method: "POST",
        body: JSON.stringify(newDefaultAsset),
      });
      toast.push({ title: t("common.done", null, "Done"), description: `Added ${newDefaultAsset.asset_code}`, tone: "success" });
      setNewDefaultAsset({ asset_code: "", asset_label: "", icon_url: "" });
      loadDefaultAssets();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setAddingDefault(false);
    }
  };

  /* ── Delete default asset ── */
  const handleDeleteDefaultAsset = async (assetId) => {
    try {
      await api(`/api/admin/tournaments/${tournament.id}/default-assets/${assetId}`, { method: "DELETE" });
      toast.push({ title: t("common.done", null, "Done"), description: "Removed", tone: "success" });
      loadDefaultAssets();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    }
  };

  /* ── Resolve day ── */
  const handleResolve = async () => {
    const outcomeList = assets.map((a) => ({
      asset_id: a.id,
      correct_option: outcomes[a.id] || null,
    }));
    if (outcomeList.some((o) => !o.correct_option)) {
      toast.push({ title: t("common.error", null, "Error"), description: t("admin.tournaments.voteDays.allOutcomesRequired", null, "Please set outcome for all assets"), tone: "danger" });
      return;
    }
    const multiplierLabel = pointsMultiplier !== 1 ? ` (×${pointsMultiplier})` : "";
    setConfirmAction({
      title: t("admin.tournaments.voteDays.confirmResolve", null, "Resolve Day?"),
      description: `${t("admin.tournaments.voteDays.confirmResolveDesc", null, "This will score all votes and update the leaderboard. Continue?")}${multiplierLabel}`,
      onConfirm: async () => {
        try {
          setResolving(true);
          const endpoint = dayDetail.status === "resolved" ? "re-resolve" : "resolve";
          await api(`${base}/${selectedDay}/${endpoint}`, {
            method: "POST",
            body: JSON.stringify({ outcomes: outcomeList, pointsMultiplier }),
          });
          toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.voteDays.resolved", null, "Day resolved successfully"), tone: "success" });
          loadDayDetail(selectedDay);
          loadDays();
          onReload();
        } catch (e) {
          toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
        } finally {
          setResolving(false);
          setConfirmAction(null);
        }
      },
    });
  };

  /* ── Add manual vote ── */
  const handleAddManualVote = async () => {
    if (!manualVoteNickname.trim()) {
      toast.push({ title: t("common.error", null, "Error"), description: "Nickname is required", tone: "danger" });
      return;
    }
    const selectionsList = assets.map((a) => ({
      asset_id: a.id,
      selected_option: manualVoteSelections[a.id] || null,
    }));
    if (selectionsList.some((s) => !s.selected_option)) {
      toast.push({ title: t("common.error", null, "Error"), description: "Please set vote for all assets", tone: "danger" });
      return;
    }
    try {
      setAddingManualVote(true);
      await api(`${base}/${selectedDay}/manual-vote`, {
        method: "POST",
        body: JSON.stringify({ nickname: manualVoteNickname.trim(), selections: selectionsList }),
      });
      toast.push({ title: t("common.done", null, "Done"), description: `Vote added for ${manualVoteNickname.trim()}`, tone: "success" });
      setManualVoteNickname("");
      setManualVoteSelections({});
      setShowManualVote(false);
      loadVotes(selectedDay);
      loadDays();
      onReload();
    } catch (e) {
      toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
    } finally {
      setAddingManualVote(false);
    }
  };

  /* ── Delete vote ── */
  const handleDeleteVote = (vote) => {
    setConfirmAction({
      title: t("admin.tournaments.voteDays.confirmDeleteVote", null, "Delete Vote?"),
      description: `${t("admin.tournaments.voteDays.confirmDeleteVoteDesc", null, "Delete vote from")} ${vote.nickname || "unknown"}?`,
      onConfirm: async () => {
        try {
          await api(`${base}/${selectedDay}/votes/${vote.id}`, { method: "DELETE" });
          toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.voteDays.voteDeleted", null, "Vote deleted"), tone: "success" });
          loadVotes(selectedDay);
          loadDays();
          onReload();
        } catch (e) {
          toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
        } finally {
          setConfirmAction(null);
        }
      },
    });
  };

  /* ── Invalidate vote ── */
  const handleInvalidateVote = (vote) => {
    setConfirmAction({
      title: t("admin.tournaments.voteDays.confirmInvalidateVote", null, "Reset Vote?"),
      description: `${t("admin.tournaments.voteDays.confirmInvalidateVoteDesc", null, "Invalidate vote from")} ${vote.nickname || "unknown"}? ${t("admin.tournaments.voteDays.canRevote", null, "They will be able to vote again.")}`,
      onConfirm: async () => {
        try {
          await api(`${base}/${selectedDay}/votes/${vote.id}/invalidate`, { method: "POST" });
          toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.voteDays.voteInvalidated", null, "Vote invalidated — user can re-vote"), tone: "success" });
          loadVotes(selectedDay);
          loadDays();
          onReload();
        } catch (e) {
          toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
        } finally {
          setConfirmAction(null);
        }
      },
    });
  };

  /* ── Delete vote day ── */
  const handleDeleteDay = () => {
    setConfirmAction({
      title: t("admin.tournaments.voteDays.confirmDeleteDay", null, "Delete Vote Day?"),
      description: t("admin.tournaments.voteDays.confirmDeleteDayDesc", null, "This will permanently delete this day and all associated votes, scores, and results."),
      onConfirm: async () => {
        try {
          await api(`${base}/${selectedDay}`, { method: "DELETE" });
          toast.push({ title: t("common.done", null, "Done"), description: t("admin.tournaments.voteDays.dayDeleted", null, "Vote day deleted"), tone: "success" });
          goBack();
          onReload();
        } catch (e) {
          toast.push({ title: t("common.error", null, "Error"), description: e.message, tone: "danger" });
        } finally {
          setConfirmAction(null);
        }
      },
    });
  };

  /* ── Filtered votes ── */
  const filteredVotes = useMemo(() => {
    if (!voteSearch.trim()) return votes;
    const q = voteSearch.toLowerCase();
    return votes.filter((v) =>
      (v.nickname || v.display_name || "").toLowerCase().includes(q)
    );
  }, [votes, voteSearch]);

  /* ═══ RENDER: Day Detail View ═══ */
  if (selectedDay && dayDetail) {
    return (
      <div className="space-y-6">
        {/* Back button */}
        <button onClick={goBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t("admin.tournaments.voteDays.backToList", null, "Back to days")}
        </button>

        {/* Day Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{dayDetail.title || dayDetail.date_key}</CardTitle>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${VOTE_DAY_STATUS_COLORS[dayDetail.status] || VOTE_DAY_STATUS_COLORS.upcoming}`}>
                  {t(`admin.tournaments.voteDays.statuses.${dayDetail.status}`, null, dayDetail.status)}
                </span>
                {!editingDay && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingDay(true)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleDeleteDay} className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {editingDay ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("admin.tournaments.voteDays.dateKey", null, "Date")}</label>
                    <SingleDatePicker value={dayForm.date_key} onChange={(v) => setDayForm((f) => ({ ...f, date_key: v }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("admin.tournaments.voteDays.title", null, "Title")}</label>
                    <Input value={dayForm.title} onChange={(e) => setDayForm((f) => ({ ...f, title: e.target.value }))} placeholder="Day title..." />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("admin.tournaments.voteDays.status", null, "Status")}</label>
                    <SelectDropdown
                      value={dayForm.status}
                      onChange={(val) => setDayForm((f) => ({ ...f, status: val }))}
                      options={VOTE_DAY_STATUS_OPTIONS.map((s) => ({ value: s, label: t(`admin.tournaments.voteDays.statuses.${s}`, null, s.charAt(0).toUpperCase() + s.slice(1)) }))}
                      placeholder="Status"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">🕐 {t("admin.tournaments.voteDays.openAt", null, "Opens at")}</label>
                    <input
                      type="datetime-local"
                      value={dayForm.voting_open_at}
                      onChange={(e) => setDayForm((f) => ({ ...f, voting_open_at: e.target.value }))}
                      className="w-full rounded-xl border border-border/30 bg-background/50 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">🕐 {t("admin.tournaments.voteDays.closeAt", null, "Closes at")}</label>
                    <input
                      type="datetime-local"
                      value={dayForm.voting_close_at}
                      onChange={(e) => setDayForm((f) => ({ ...f, voting_close_at: e.target.value }))}
                      className="w-full rounded-xl border border-border/30 bg-background/50 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleUpdateDay} disabled={savingDay}>
                    <Save className="h-4 w-4 mr-1" /> {savingDay ? t("common.saving", null, "Saving…") : t("common.save", null, "Save")}
                  </Button>
                  <Button variant="outline" onClick={() => setEditingDay(false)}>{t("common.cancel", null, "Cancel")}</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">{t("admin.tournaments.voteDays.dateKey", null, "Date")}</span>
                    <p className="font-medium">{dayDetail.date_key}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">{t("admin.tournaments.voteDays.status", null, "Status")}</span>
                    <p className="font-medium">{dayDetail.status}</p>
                  </div>
                  {dayDetail.voting_open_at && (
                    <div>
                      <span className="text-muted-foreground text-xs">🕐 {t("admin.tournaments.voteDays.openAt", null, "Opens at")}</span>
                      <p className="font-medium">{new Date(dayDetail.voting_open_at).toLocaleString()}</p>
                    </div>
                  )}
                  {dayDetail.voting_close_at && (
                    <div>
                      <span className="text-muted-foreground text-xs">🕐 {t("admin.tournaments.voteDays.closeAt", null, "Closes at")}</span>
                      <p className="font-medium">{new Date(dayDetail.voting_close_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
                {dayDetail.vote_token && tournament.public_slug && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Day Voting Link</label>
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-[#1a1a2e] border border-border/30">
                      <Vote className="h-4 w-4 text-accent shrink-0" />
                      <span className="text-sm text-accent truncate flex-1">
                        {window.location.origin}/tournament/{tournament.public_slug}/vote/{dayDetail.vote_token}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/tournament/${tournament.public_slug}/vote/${dayDetail.vote_token}`);
                        toast.push({ title: "Copied!", tone: "success" });
                      }} className="rounded-xl h-8 w-8 shrink-0">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <a href={`/tournament/${tournament.public_slug}/vote/${dayDetail.vote_token}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8 shrink-0">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assets Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("admin.tournaments.voteDays.assets", null, "Assets")}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleAddAllDefaults}>
                  <Plus className="h-4 w-4 mr-1" /> {t("admin.tournaments.voteDays.addAllDefaults", null, "Add All Defaults")}
                </Button>
                <Button size="sm" onClick={() => setShowAddAsset(!showAddAsset)}>
                  <Plus className="h-4 w-4 mr-1" /> {t("admin.tournaments.voteDays.addAsset", null, "Add Asset")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <AnimatePresence>
              {showAddAsset && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
                  <div className="p-4 rounded-xl bg-[#1a1a2e]/60 border border-border/30 space-y-3">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {defaultAssets.map((d) => (
                        <button key={d.asset_code} type="button" onClick={() => handleAddDefaultAsset(d)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border/30 bg-background/30 text-xs font-medium hover:border-accent/40 transition">
                          {d.icon_url ? <img src={d.icon_url} alt={d.asset_label || d.asset_code} className="h-4 w-4 rounded object-cover" /> : <span>{ASSET_ICONS[d.asset_code] || "📊"}</span>} {d.asset_code}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input value={assetForm.asset_code} onChange={(e) => setAssetForm((f) => ({ ...f, asset_code: e.target.value }))} placeholder={t("admin.tournaments.voteDays.assetCode", null, "Asset code (e.g. BTCUSD)")} />
                      <Input value={assetForm.asset_label} onChange={(e) => setAssetForm((f) => ({ ...f, asset_label: e.target.value }))} placeholder={t("admin.tournaments.voteDays.assetLabel", null, "Label (e.g. Bitcoin / USD)")} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddAsset}><Plus className="h-4 w-4 mr-1" /> {t("common.add", null, "Add")}</Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowAddAsset(false); setAssetForm({ asset_code: "", asset_label: "" }); }}>{t("common.cancel", null, "Cancel")}</Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {assets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("admin.tournaments.voteDays.noAssets", null, "No assets added yet")}</p>
            ) : (
              <div className="space-y-2">
                {assets.map((a) => {
                  const preset = defaultAssets.find((d) => d.asset_code === a.asset_code);
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-[#1a1a2e]/40 border border-border/20">
                      <div className="flex items-center gap-2">
                        {preset?.icon_url ? (
                          <img src={preset.icon_url} alt={preset.asset_label || preset.asset_code} className="h-5 w-5 rounded object-cover" />
                        ) : (
                          <span className="text-lg">{ASSET_ICONS[a.asset_code] || "📊"}</span>
                        )}
                        <span className="font-medium text-sm">{a.asset_code}</span>
                        {a.asset_label && <span className="text-xs text-muted-foreground">{a.asset_label}</span>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteAsset(a.id)}>
                        <Trash2 className="h-4 w-4 text-rose-400" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Correct Outcomes Card */}
        {(dayDetail.status === "closed" || dayDetail.status === "resolved") && assets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.tournaments.voteDays.correctOutcomes", null, "Correct Outcomes")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {assets.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-[#1a1a2e]/40 border border-border/20">
                    <span className="font-medium text-sm">{a.asset_code} {a.asset_label && <span className="text-muted-foreground text-xs">({a.asset_label})</span>}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOutcomes((prev) => ({ ...prev, [a.id]: "long" }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          outcomes[a.id] === "long"
                            ? "border border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                            : "border border-border/30 bg-background/30 text-muted-foreground hover:border-emerald-500/30"
                        }`}
                      >
                        <TrendingUp className="h-3.5 w-3.5" /> Long
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutcomes((prev) => ({ ...prev, [a.id]: "short" }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          outcomes[a.id] === "short"
                            ? "border border-rose-500/50 bg-rose-500/15 text-rose-400"
                            : "border border-border/30 bg-background/30 text-muted-foreground hover:border-rose-500/30"
                        }`}
                      >
                        <TrendingDown className="h-3.5 w-3.5" /> Short
                      </button>
                      <button
                        type="button"
                        onClick={() => setOutcomes((prev) => ({ ...prev, [a.id]: "both" }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          outcomes[a.id] === "both"
                            ? "border border-blue-500/50 bg-blue-500/15 text-blue-400"
                            : "border border-border/30 bg-background/30 text-muted-foreground hover:border-blue-500/30"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" /> Both
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Points multiplier */}
              <div className="mt-4 p-3 rounded-xl bg-[#1a1a2e]/40 border border-border/20">
                <label className="text-xs text-muted-foreground mb-2 block">Points Multiplier</label>
                <div className="flex flex-wrap gap-2">
                  {[1, 1.5, 2, 2.5, 3].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPointsMultiplier(m)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        pointsMultiplier === m
                          ? "border border-accent/60 bg-accent/20 text-accent"
                          : "border border-border/30 bg-background/30 text-muted-foreground hover:border-accent/30"
                      }`}
                    >
                      ×{m}
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={pointsMultiplier}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0 && val <= 10) setPointsMultiplier(val);
                      }}
                      className="w-20 rounded-lg border border-border/30 bg-background/50 px-2 py-1.5 text-sm text-center outline-none focus:border-accent/50 transition"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={handleResolve} disabled={resolving}>
                  <Check className="h-4 w-4 mr-1" />
                  {resolving
                    ? t("admin.tournaments.voteDays.resolving", null, "Resolving…")
                    : dayDetail.status === "resolved"
                      ? t("admin.tournaments.voteDays.reResolve", null, "Re-Resolve Day")
                      : t("admin.tournaments.voteDays.resolve", null, "Resolve Day")}
                  {pointsMultiplier !== 1 && <span className="ml-1 text-xs opacity-75">(×{pointsMultiplier})</span>}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Votes Preview Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("admin.tournaments.voteDays.votes", null, "Votes")} ({votes.length})</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowManualVote((v) => !v); setManualVoteNickname(""); setManualVoteSelections({}); }}>
                  <Plus className="h-4 w-4 mr-1" /> Manual Vote
                </Button>
                <Button variant="ghost" size="sm" onClick={() => loadVotes(selectedDay)}>
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Manual Vote Form */}
            {showManualVote && assets.length > 0 && (
              <div className="mb-4 p-4 rounded-xl bg-[#1a1a2e]/60 border border-accent/20 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Plus className="h-4 w-4 text-accent" /> Add Manual Vote
                </h4>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nickname</label>
                  <Input
                    value={manualVoteNickname}
                    onChange={(e) => setManualVoteNickname(e.target.value)}
                    placeholder="Enter participant nickname…"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground block">Selections</label>
                  {assets.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-background/30 border border-border/10">
                      <span className="font-medium text-sm">{a.asset_code} {a.asset_label && <span className="text-muted-foreground text-xs">({a.asset_label})</span>}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setManualVoteSelections((prev) => ({ ...prev, [a.id]: "long" }))}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            manualVoteSelections[a.id] === "long"
                              ? "border border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                              : "border border-border/30 bg-background/30 text-muted-foreground hover:border-emerald-500/30"
                          }`}
                        >
                          <TrendingUp className="h-3 w-3" /> Long
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualVoteSelections((prev) => ({ ...prev, [a.id]: "short" }))}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            manualVoteSelections[a.id] === "short"
                              ? "border border-rose-500/50 bg-rose-500/15 text-rose-400"
                              : "border border-border/30 bg-background/30 text-muted-foreground hover:border-rose-500/30"
                          }`}
                        >
                          <TrendingDown className="h-3 w-3" /> Short
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleAddManualVote} disabled={addingManualVote}>
                    <Plus className="h-4 w-4 mr-1" /> {addingManualVote ? "Adding…" : "Add Vote"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowManualVote(false)}>
                    {t("common.cancel", null, "Cancel")}
                  </Button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder={t("admin.tournaments.voteDays.searchVotes", null, "Search by nickname…")} value={voteSearch} onChange={(e) => setVoteSearch(e.target.value)} />
              </div>
            </div>

            {votesLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("common.loading", null, "Loading…")}</p>
            ) : filteredVotes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("admin.tournaments.voteDays.noVotes", null, "No votes yet")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-4">{t("admin.tournaments.voteDays.nickname", null, "Nickname")}</th>
                      <th className="pb-2 pr-4">{t("admin.tournaments.voteDays.submittedAt", null, "Submitted")}</th>
                      <th className="pb-2 pr-4">IP</th>
                      <th className="pb-2 pr-4">{t("admin.tournaments.voteDays.device", null, "Device")}</th>
                      {assets.map((a) => (
                        <th key={a.id} className="pb-2 pr-4">{a.asset_code}</th>
                      ))}
                      <th className="pb-2">{t("admin.tournaments.voteDays.voteStatus", null, "Status")}</th>
                      <th className="pb-2 text-right">{t("admin.tournaments.voteDays.actions", null, "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVotes.map((v, i) => (
                      <tr key={v.id || i} className="border-b border-border/10">
                        <td className="py-2 pr-4 font-medium">{v.nickname || v.display_name || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{fmtTime(v.submitted_at || v.created_at)}</td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs font-mono">{v.ip_hash || "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs max-w-[150px] truncate" title={v.user_agent || ""}>{v.user_agent ? v.user_agent.slice(0, 40) : "—"}</td>
                        {assets.map((a) => {
                          const sel = (v.selections || []).find((s) => s.asset_id === a.id);
                          const opt = sel?.selected_option;
                          return (
                            <td key={a.id} className="py-2 pr-4">
                              {opt === "long" ? (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium"><TrendingUp className="h-3 w-3" />Long</span>
                              ) : opt === "short" ? (
                                <span className="inline-flex items-center gap-1 text-rose-400 text-xs font-medium"><TrendingDown className="h-3 w-3" />Short</span>
                              ) : "—"}
                            </td>
                          );
                        })}
                        <td className="py-2">{v.status || "valid"}</td>
                        <td className="py-2 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => handleInvalidateVote(v)}
                              className="text-xs text-amber-400 hover:text-amber-300 px-1.5 py-0.5 rounded hover:bg-amber-500/10 transition"
                              title={t("admin.tournaments.voteDays.resetVote", null, "Reset")}
                            >
                              <RefreshCcw className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteVote(v)}
                              className="text-xs text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded hover:bg-rose-500/10 transition"
                              title={t("admin.tournaments.voteDays.deleteVote", null, "Delete")}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Confirmation Dialog */}
        <AnimatePresence>
          {confirmAction && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setConfirmAction(null)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-card border border-border/50 rounded-2xl p-6 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-bold text-base mb-2">{confirmAction.title}</h3>
                <p className="text-sm text-muted-foreground mb-5">{confirmAction.description}</p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
                    {t("common.cancel", null, "Cancel")}
                  </Button>
                  <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white" onClick={confirmAction.onConfirm}>
                    {t("common.confirm", null, "Confirm")}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  /* ═══ RENDER: Days List View ═══ */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("admin.tournaments.voteDays.title_plural", null, "Vote Days")}</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleQuickCreateToday} disabled={quickCreating}>
            <Clock className="h-4 w-4 mr-1" /> {quickCreating ? t("common.saving", null, "Saving…") : "⚡ Quick Create Today"}
          </Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-1" /> {t("admin.tournaments.voteDays.createDay", null, "Create Day")}
          </Button>
        </div>
      </div>

      {/* Create Day Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("admin.tournaments.voteDays.newDay", null, "New Vote Day")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("admin.tournaments.voteDays.dateKey", null, "Date")} *</label>
                    <SingleDatePicker value={createForm.date_key} onChange={(v) => setCreateForm((f) => ({ ...f, date_key: v }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("admin.tournaments.voteDays.title", null, "Title")}</label>
                    <Input value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} placeholder="Optional title…" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("admin.tournaments.voteDays.status", null, "Status")}</label>
                    <SelectDropdown
                      value={createForm.status}
                      onChange={(val) => setCreateForm((f) => ({ ...f, status: val }))}
                      options={VOTE_DAY_STATUS_OPTIONS.map((s) => ({ value: s, label: t(`admin.tournaments.voteDays.statuses.${s}`, null, s.charAt(0).toUpperCase() + s.slice(1)) }))}
                      placeholder="Status"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">🕐 {t("admin.tournaments.voteDays.openAt", null, "Opens at")}</label>
                    <input
                      type="datetime-local"
                      value={createForm.voting_open_at}
                      onChange={(e) => setCreateForm((f) => ({ ...f, voting_open_at: e.target.value }))}
                      className="w-full rounded-xl border border-border/30 bg-background/50 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">🕐 {t("admin.tournaments.voteDays.closeAt", null, "Closes at")}</label>
                    <input
                      type="datetime-local"
                      value={createForm.voting_close_at}
                      onChange={(e) => setCreateForm((f) => ({ ...f, voting_close_at: e.target.value }))}
                      className="w-full rounded-xl border border-border/30 bg-background/50 px-3 py-2 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mb-3">
                  💡 Set status to "Upcoming" with open/close times for automatic scheduling. The voting will open and close automatically.
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleCreateDay} disabled={creatingDay || !createForm.date_key}>
                    <Plus className="h-4 w-4 mr-1" /> {creatingDay ? t("common.saving", null, "Saving…") : t("common.create", null, "Create")}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>{t("common.cancel", null, "Cancel")}</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Days List */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("common.loading", null, "Loading…")}</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("admin.tournaments.voteDays.noDays", null, "No vote days created yet")}</p>
      ) : (
        <div className="space-y-2">
          {days.map((day) => (
            <motion.div
              key={day.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-4 rounded-xl bg-[#1a1a2e]/40 border border-border/20 hover:border-border/40 cursor-pointer transition-colors"
              onClick={() => selectDay(day)}
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{day.title || day.date_key}</span>
                  {day.title && <span className="text-xs text-muted-foreground">{day.date_key}</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VOTE_DAY_STATUS_COLORS[day.status] || VOTE_DAY_STATUS_COLORS.upcoming}`}>
                  {day.status}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {day.vote_count != null && (
                  <span className="text-xs text-muted-foreground">{day.vote_count} {t("admin.tournaments.voteDays.votesLabel", null, "votes")}</span>
                )}
                {day.vote_token && tournament.public_slug && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-xl h-8 w-8 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}/tournament/${tournament.public_slug}/vote/${day.vote_token}`;
                      navigator.clipboard.writeText(url);
                      toast.push({ title: "Copied voting link!", tone: "success" });
                    }}
                    title="Copy day voting link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Default Assets Management */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Default Assets</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowDefaultAssets(!showDefaultAssets)}>
              {showDefaultAssets ? <X className="h-4 w-4 mr-1" /> : <Edit2 className="h-4 w-4 mr-1" />}
              {showDefaultAssets ? t("common.close", null, "Close") : t("common.edit", null, "Edit")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">These assets are automatically added when using &quot;Quick Create Today&quot;.</p>

          {defaultAssetsLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("common.loading", null, "Loading…")}</p>
          ) : defaultAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No default assets configured</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {defaultAssets.map((da) => (
                <div key={da.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 bg-[#1a1a2e]/40 text-sm">
                  {da.icon_url ? (
                    <img src={da.icon_url} alt={da.asset_label || da.asset_code} className="h-4 w-4 rounded object-cover" />
                  ) : (
                    <span>{ASSET_ICONS[da.asset_code] || "📊"}</span>
                  )}
                  <span className="font-medium">{da.asset_code}</span>
                  {da.asset_label && <span className="text-xs text-muted-foreground">({da.asset_label})</span>}
                  {showDefaultAssets && (
                    <button onClick={() => handleDeleteDefaultAsset(da.id)} className="ml-1 text-rose-400 hover:text-rose-300">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <AnimatePresence>
            {showDefaultAssets && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="p-3 rounded-xl bg-[#1a1a2e]/60 border border-border/30 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input value={newDefaultAsset.asset_code} onChange={(e) => setNewDefaultAsset((f) => ({ ...f, asset_code: e.target.value }))} placeholder="Asset code (e.g. BTCUSD)" />
                    <Input value={newDefaultAsset.asset_label} onChange={(e) => setNewDefaultAsset((f) => ({ ...f, asset_label: e.target.value }))} placeholder="Label (e.g. Bitcoin / USD)" />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-border/30 bg-background/30 hover:bg-accent/10 transition text-sm">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{newDefaultAsset.icon_url ? "Change icon" : "Upload icon"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 512 * 1024) {
                            toast.push({ title: "Error", description: "Image must be under 512KB", tone: "danger" });
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => setNewDefaultAsset((f) => ({ ...f, icon_url: reader.result }));
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {newDefaultAsset.icon_url && (
                      <div className="flex items-center gap-2">
                        <img src={newDefaultAsset.icon_url} alt="Preview" className="h-8 w-8 rounded object-cover border border-border/30" />
                        <button onClick={() => setNewDefaultAsset((f) => ({ ...f, icon_url: "" }))} className="text-rose-400 hover:text-rose-300">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={handleAddDefaultAssetEntry} disabled={addingDefault || !newDefaultAsset.asset_code.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> {addingDefault ? t("common.saving", null, "Saving…") : "Add Default Asset"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN Component
   ═══════════════════════════════════════════════════ */

export default function AdminTournamentDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const toast = useToasts();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [participantCount, setParticipantCount] = useState(0);

  const loadTournament = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api(`/api/admin/tournaments/${id}`);
      setTournament(data.tournament || data);
      // Load participant count
      try {
        const pData = await api(`/api/admin/tournaments/${id}/participants`);
        setParticipantCount((pData.participants || []).length);
      } catch { /* ignore */ }
    } catch (e) {
      setError(e?.message || "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadTournament(); }, [loadTournament]);

  if (loading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <div className="text-muted-foreground">{t("common.loading", null, "Loading…")}</div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen app-bg">
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
        <div className="relative mx-auto max-w-4xl px-4 py-8">
          <Card className="rounded-xl border-2 border-dashed border-rose-500/30">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-rose-400/50" />
              <h3 className="text-base font-semibold mb-1 text-rose-400">{t("common.error", null, "Error")}</h3>
              <p className="text-muted-foreground text-sm mb-4">{error || "Tournament not found"}</p>
              <Link to="/admincrm-panel/tournaments">
                <Button className="rounded-xl">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("admin.tournaments.backToList", null, "Back to Tournaments")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />

      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admincrm-panel/tournaments"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card/55 glass text-muted-foreground hover:bg-card/70 transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold truncate">{tournament.name}</h1>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[tournament.status] || STATUS_COLORS.draft}`}>
                  {t(`admin.tournaments.statuses.${tournament.status}`, null, tournament.status)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {participantCount}
                </span>
                {tournament.public_slug && (
                  <span className="flex items-center gap-1 text-accent">
                    <Link2 className="h-3 w-3" /> {t("admin.tournaments.publicLink.active", null, "Public")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AdminNav />
            <Button variant="ghost" className="rounded-xl" onClick={loadTournament}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap gap-1 p-1 bg-card/50 backdrop-blur rounded-xl border border-border/30">
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab
                    ? "bg-accent/20 text-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/80"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(`admin.tournaments.tabs.${tab}`, null, tab.charAt(0).toUpperCase() + tab.slice(1))}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "leaderboard" && <LeaderboardTab tournament={tournament} onReload={loadTournament} toast={toast} />}
        {activeTab === "participants" && <ParticipantsTab tournament={tournament} onReload={loadTournament} toast={toast} />}
        {activeTab === "voteDays" && <VoteDaysTab tournament={tournament} onReload={loadTournament} toast={toast} />}
        {activeTab === "history" && <HistoryTab tournament={tournament} toast={toast} />}
        {activeTab === "public" && <PublicTab tournament={tournament} onReload={loadTournament} toast={toast} />}
        {activeTab === "settings" && <SettingsTab tournament={tournament} onReload={loadTournament} toast={toast} />}
        {activeTab === "overview" && <OverviewTab tournament={tournament} participantCount={participantCount} onReload={loadTournament} toast={toast} />}
      </div>

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </div>
  );
}
