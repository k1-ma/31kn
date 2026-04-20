import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import SelectDropdown from "@/components/common/SelectDropdown.jsx";
import SingleDatePicker from "@/components/common/SingleDatePicker.jsx";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import AdminLayout from "./AdminLayout.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  Trophy, RefreshCcw, Plus, Edit2, Trash2, Copy,
  Archive, ArchiveRestore, ExternalLink, Calendar, Users, Table2,
  Search, X, AlertCircle, Eye, EyeOff, Lock, Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Switch from "@/components/ui/Switch.jsx";

const STATUS_OPTIONS = ["draft", "active", "finished", "archived"];

const STATUS_COLORS = {
  draft: "bg-slate-500/20 text-slate-400",
  active: "bg-emerald-500/20 text-emerald-400",
  finished: "bg-blue-500/20 text-blue-400",
  archived: "bg-amber-500/20 text-amber-400",
};

/* Consistent dark-theme class for textarea */
const textareaCls = "w-full px-4 py-3 rounded-xl bg-[#1a1a2e] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-accent/50";

function useStatusLabel() {
  const { t } = useI18n();
  return (s) => t(`admin.tournaments.statuses.${s}`, null, s.charAt(0).toUpperCase() + s.slice(1));
}

function TournamentForm({ tournament, onSave, onCancel, saving }) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const [name, setName] = useState(tournament?.name || "");
  const [description, setDescription] = useState(tournament?.description || "");
  const [startDate, setStartDate] = useState(() => {
    if (tournament?.start_date) return new Date(tournament.start_date).toISOString().split("T")[0];
    return "";
  });
  const [endDate, setEndDate] = useState(() => {
    if (tournament?.end_date) return new Date(tournament.end_date).toISOString().split("T")[0];
    return "";
  });
  const [status, setStatus] = useState(tournament?.status || "draft");
  const [rulesText, setRulesText] = useState(tournament?.rules_text || "");
  const [votePassword, setVotePassword] = useState(tournament?.vote_password || "");
  const [wrongGuessPenalty, setWrongGuessPenalty] = useState(
    (tournament?.scoring_config?.wrong_guess_penalty ?? 0).toString()
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      status,
      rules_text: rulesText.trim() || null,
      vote_password: votePassword.trim() || null,
      scoring_config: {
        ...(tournament?.scoring_config || {}),
        wrong_guess_penalty: parseFloat(wrongGuessPenalty) || 0,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.tournamentName", null, "Tournament name")}</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("admin.tournaments.tournamentName", null, "Tournament name")}
          maxLength={200}
          className="rounded-xl"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.description", null, "Description")}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("admin.tournaments.description", null, "Description")}
          maxLength={5000}
          rows={3}
          className={textareaCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.startDate", null, "Start date")}</label>
          <SingleDatePicker
            value={startDate}
            onChange={setStartDate}
            placeholder={t("admin.tournaments.startDate", null, "Start date")}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.endDate", null, "End date")}</label>
          <SingleDatePicker
            value={endDate}
            onChange={setEndDate}
            placeholder={t("admin.tournaments.endDate", null, "End date")}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.status", null, "Status")}</label>
        <SelectDropdown
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabel(s) }))}
          placeholder={t("admin.tournaments.status", null, "Status")}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.rules", null, "Rules")}</label>
        <textarea
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          placeholder={t("admin.tournaments.rules", null, "Rules")}
          maxLength={10000}
          rows={4}
          className={textareaCls}
        />
      </div>

      {/* ── Voting Settings ─────────────────────── */}
      <div className="rounded-xl border border-border/30 p-4 space-y-4 bg-[#1a1a2e]/30">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" />
          {t("admin.tournaments.detail.votingSettings", null, "Voting Settings")}
        </h4>
        <div>
          <label className="text-sm font-medium mb-1 block">{t("admin.tournaments.form.votePassword", null, "Voting Password")}</label>
          <input
            type="text"
            value={votePassword}
            onChange={(e) => setVotePassword(e.target.value)}
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
            value={wrongGuessPenalty}
            onChange={(e) => setWrongGuessPenalty(e.target.value)}
            placeholder="0"
            className="w-full px-4 py-2.5 rounded-xl bg-[#1a1a2e] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <p className="text-xs text-muted-foreground mt-1">{t("admin.tournaments.form.wrongGuessPenaltyHint", null, "Points deducted per wrong guess when resolving a day. Set to 0 to disable.")}</p>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-xl">
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!name.trim() || saving} className="rounded-xl">
          {saving ? t("common.working") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function TournamentCard({ tournament, onEdit, onDelete, onDuplicate, onArchiveToggle, onNavigate, onSetDisplayed }) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const startDate = tournament.start_date ? new Date(tournament.start_date).toLocaleDateString() : "—";
  const endDate = tournament.end_date ? new Date(tournament.end_date).toLocaleDateString() : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card/80 backdrop-blur border rounded-2xl p-5 hover:border-accent/40 transition-all ${tournament.is_displayed ? "border-emerald-500/50 ring-1 ring-emerald-500/20" : "border-border/50"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <button
              onClick={() => onNavigate(tournament.id)}
              className="font-semibold text-sm hover:text-accent transition truncate text-left"
            >
              {tournament.name}
            </button>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[tournament.status] || STATUS_COLORS.draft}`}>
              {statusLabel(tournament.status)}
            </span>
            {tournament.is_displayed && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                <Eye className="h-2.5 w-2.5" />
                {t("admin.tournaments.displayed", null, "Displayed")}
              </span>
            )}
          </div>

          {tournament.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tournament.description}</p>
          )}

          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {startDate} — {endDate}
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-2.5 w-2.5" />
              {tournament.participant_count ?? 0} {t("admin.tournaments.participants.title", null, "participants")}
            </span>
            {tournament.public_slug && (
              <span className="flex items-center gap-1">
                <ExternalLink className="h-2.5 w-2.5" />
                {t("admin.tournaments.publicLink.title", null, "Public")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl h-8 w-8"
            onClick={() => onEdit(tournament)}
            title={t("common.edit")}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl h-8 w-8"
            onClick={() => onDuplicate(tournament)}
            title={t("admin.tournaments.actions.duplicate", null, "Duplicate")}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl h-8 w-8"
            onClick={() => onArchiveToggle(tournament)}
            title={tournament.status === "archived"
              ? t("admin.tournaments.actions.unarchive", null, "Unarchive")
              : t("admin.tournaments.actions.archive", null, "Archive")}
          >
            {tournament.status === "archived"
              ? <ArchiveRestore className="h-4 w-4" />
              : <Archive className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl h-8 w-8 text-rose-400 hover:text-rose-500"
            onClick={() => onDelete(tournament)}
            title={t("common.delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Display toggle for journal users */}
      <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tournament.is_displayed ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
          <span className={`text-sm font-medium ${tournament.is_displayed ? "text-emerald-400" : "text-muted-foreground"}`}>
            {t("admin.tournaments.showForUsers", null, "Show in journal for all users")}
          </span>
        </div>
        <Switch
          checked={!!tournament.is_displayed}
          onCheckedChange={() => onSetDisplayed(tournament)}
          aria-label={t("admin.tournaments.showForUsers", null, "Show in journal for all users")}
        />
      </div>
    </motion.div>
  );
}

export default function AdminTournaments() {
  const { t } = useI18n();
  const toast = useToasts();
  const navigate = useNavigate();
  const statusLabel = useStatusLabel();

  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString();
      const res = await fetch(`/api/admin/tournaments${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTournaments(data.tournaments || []);
    } catch (e) {
      setError(e?.message || "Failed to load tournaments");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  const handleSave = async (data) => {
    setSaving(true);
    try {
      const url = editingTournament
        ? `/api/admin/tournaments/${editingTournament.id}`
        : "/api/admin/tournaments";
      const method = editingTournament ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast.push({
        title: t("common.done"),
        description: editingTournament
          ? t("admin.tournaments.toasts.saved", null, "Tournament saved")
          : t("admin.tournaments.toasts.created", null, "Tournament created"),
        tone: "success",
      });
      setShowForm(false);
      setEditingTournament(null);
      loadTournaments();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || "Failed to save", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tournament) => {
    setEditingTournament(tournament);
    setShowForm(true);
  };

  const handleDelete = async (tournament) => {
    if (!confirm(`${t("common.delete")} "${tournament.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/tournaments/${tournament.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.push({ title: t("common.done"), description: t("admin.tournaments.toasts.deleted", null, "Tournament deleted"), tone: "success" });
      loadTournaments();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.tournaments.toasts.deleteFailed", null, "Failed to delete"), tone: "danger" });
    }
  };

  const handleDuplicate = async (tournament) => {
    try {
      const res = await fetch(`/api/admin/tournaments/${tournament.id}/duplicate`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.push({ title: t("common.done"), description: t("admin.tournaments.toasts.duplicated", null, "Tournament duplicated"), tone: "success" });
      loadTournaments();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.tournaments.toasts.duplicateFailed", null, "Failed to duplicate"), tone: "danger" });
    }
  };

  const handleArchiveToggle = async (tournament) => {
    const action = tournament.status === "archived" ? "unarchive" : "archive";
    try {
      const res = await fetch(`/api/admin/tournaments/${tournament.id}/${action}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.push({
        title: t("common.done"),
        description: action === "archive"
          ? t("admin.tournaments.toasts.archived", null, "Tournament archived")
          : t("admin.tournaments.toasts.unarchived", null, "Tournament unarchived"),
        tone: "success",
      });
      loadTournaments();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.tournaments.toasts.archiveFailed", null, "Failed to update"), tone: "danger" });
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingTournament(null);
  };

  const handleSetDisplayed = async (tournament) => {
    try {
      const endpoint = tournament.is_displayed
        ? `/api/admin/tournaments/${tournament.id}/clear-displayed`
        : `/api/admin/tournaments/${tournament.id}/set-displayed`;
      const res = await fetch(endpoint, { method: "PUT", credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.push({
        title: t("common.done"),
        description: tournament.is_displayed
          ? t("admin.tournaments.toasts.hidden", null, "Tournament hidden from users")
          : t("admin.tournaments.toasts.displayed", null, "Tournament now displayed to users"),
        tone: "success",
      });
      loadTournaments();
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || t("admin.tournaments.toasts.displayFailed", null, "Failed to update display"), tone: "danger" });
    }
  };

  const handleNavigate = (id) => {
    navigate(`/admincrm-panel/tournaments/${id}`);
  };

  return (
    <AdminLayout
      title={t("admin.nav.tournaments", null, "Tournaments")}
      subtitle={t("admin.tournaments.subtitle", null, "Manage trading tournaments")}
      actions={
        <Button variant="ghost" className="rounded-xl" onClick={loadTournaments} title={t("common.refresh")}>
          <RefreshCcw className="h-4 w-4" />
        </Button>
      }
    >
        {/* Search & Filter Bar */}
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.tournaments.search", null, "Search tournaments…")}
              className="rounded-xl pl-9"
            />
          </div>
          <SelectDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: t("admin.tournaments.filterByStatus", null, "All statuses") },
              ...STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabel(s) })),
            ]}
            placeholder={t("admin.tournaments.filterByStatus", null, "All statuses")}
            className="w-auto min-w-[160px]"
          />
        </div>

        {/* Error message */}
        {error && (
          <Card className="mb-6 rounded-xl border-2 border-dashed border-rose-500/30">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-rose-400/50" />
              <h3 className="text-base font-semibold mb-1 text-rose-400">{t("common.error")}</h3>
              <p className="text-muted-foreground text-sm mb-4">{error}</p>
              <Button onClick={loadTournaments} className="rounded-xl">
                <RefreshCcw className="h-4 w-4 mr-2" />
                {t("common.refresh")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Add/Edit Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {editingTournament ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                    {editingTournament
                      ? t("admin.tournaments.editTournament", null, "Edit Tournament")
                      : t("admin.tournaments.createTournament", null, "New Tournament")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TournamentForm
                    tournament={editingTournament}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    saving={saving}
                  />
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create Button */}
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            className="mb-6 rounded-xl shadow-[0_0_20px_-6px_rgba(var(--accent-rgb),0.4)]"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("admin.tournaments.createTournament", null, "Create Tournament")}
          </Button>
        )}

        {/* Tournaments List */}
        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              {t("admin.tournaments.title", null, "Tournaments")}
              <span className="text-sm font-normal text-muted-foreground">({tournaments.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : tournaments.length === 0 ? (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <h3 className="text-base font-semibold mb-1 text-muted-foreground">
                  {t("admin.tournaments.empty", null, "No tournaments yet")}
                </h3>
              </div>
            ) : (
              tournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onArchiveToggle={handleArchiveToggle}
                  onSetDisplayed={handleSetDisplayed}
                  onNavigate={handleNavigate}
                />
              ))
            )}
          </CardContent>
        </Card>

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </AdminLayout>
  );
}
