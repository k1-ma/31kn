import React, { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import {
  Trophy, Calendar, Users, RefreshCcw, AlertCircle,
  TrendingUp, TrendingDown, Medal, ChevronDown, X, Loader2, Gift,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ASSET_ICONS } from "@/lib/assetIcons.js";

/* ── Helpers ─────────────────────────────────────── */

const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const STATUS_MAP = {
  draft: { key: "upcoming", cls: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  active: { key: "live", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  finished: { key: "completed", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  archived: { key: "archived", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
};

const STATUS_DEFAULTS = { upcoming: "Upcoming", live: "LIVE", completed: "Completed", archived: "Archived" };

/* ── Skeleton loader ─────────────────────────────── */

function SkeletonPulse({ className = "" }) {
  return <div className={`animate-pulse bg-white/[0.06] rounded-xl ${className}`} />;
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonPulse className="h-32 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-4">
        <SkeletonPulse className="h-44" />
        <SkeletonPulse className="h-52" />
        <SkeletonPulse className="h-44" />
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <SkeletonPulse key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

/* ── Podium Card (Top 3) ─────────────────────────── */

function PodiumCard({ entry, rank, index, onSelect }) {
  const { t } = useI18n();
  const medals = ["🥇", "🥈", "🥉"];
  const gradients = [
    "from-amber-500/25 via-amber-500/5 to-transparent border-amber-500/40",
    "from-slate-400/20 via-slate-400/5 to-transparent border-slate-400/30",
    "from-amber-700/20 via-amber-700/5 to-transparent border-amber-700/30",
  ];
  const glows = [
    "shadow-[0_0_40px_-10px_rgba(245,158,11,0.35)]",
    "shadow-[0_0_30px_-10px_rgba(148,163,184,0.25)]",
    "shadow-[0_0_30px_-10px_rgba(180,83,9,0.25)]",
  ];
  const sizes = [
    { card: "py-8 px-6", avatar: "h-20 w-20 text-3xl", medal: "text-4xl", name: "text-lg", pts: "text-3xl" },
    { card: "py-6 px-5", avatar: "h-16 w-16 text-2xl", medal: "text-3xl", name: "text-base", pts: "text-2xl" },
    { card: "py-6 px-5", avatar: "h-16 w-16 text-2xl", medal: "text-2xl", name: "text-base", pts: "text-xl" },
  ];
  const s = sizes[rank] || sizes[2];

  const winRate = entry.total_voted_assets > 0
    ? Math.round((entry.total_correct / entry.total_voted_assets) * 100)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.15 + index * 0.1, type: "spring", stiffness: 200, damping: 20 }}
      className={`relative rounded-2xl border bg-gradient-to-b backdrop-blur-xl ${gradients[rank]} ${glows[rank]} ${s.card} text-center flex flex-col items-center justify-center cursor-pointer hover:ring-1 hover:ring-accent/30 transition`}
      onClick={() => onSelect?.(entry.nickname)}
    >
      {/* Rank medal */}
      <div className={`${s.medal} mb-3 drop-shadow-lg`}>{medals[rank]}</div>

      {/* Avatar */}
      <div className={`${s.avatar} rounded-full bg-white/[0.08] border-2 border-white/10 flex items-center justify-center mb-3 overflow-hidden`}>
        {entry.avatar_url ? (
          <img src={entry.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
        ) : (
          <span className="text-muted-foreground font-bold">
            {(entry.nickname || "?").charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Name */}
      <div className={`${s.name} font-bold truncate max-w-full text-accent hover:underline`}>
        {entry.nickname || "Unknown"}
      </div>

      {/* Points */}
      <div className={`mt-2 ${s.pts} font-bold bg-gradient-to-r from-accent via-blue-400 to-emerald-400 bg-clip-text text-transparent`}>
        {Number(entry.total_points) || 0}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 tracking-wider uppercase">{t("tournament.points", null, "points")}</div>

      {/* Win Rate */}
      {winRate !== null && (
        <div className={`mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block ${
          winRate >= 60 ? "bg-emerald-500/15 text-emerald-400" :
          winRate >= 40 ? "bg-amber-500/15 text-amber-400" :
          "bg-rose-500/15 text-rose-400"
        }`}>
          {winRate}% win rate
        </div>
      )}
    </motion.div>
  );
}

/* ── Leaderboard Row ─────────────────────────────── */

function LeaderboardRow({ entry, rank, index, onSelect, isSelected }) {
  const { t } = useI18n();

  const winRate = entry.total_voted_assets > 0
    ? Math.round((entry.total_correct / entry.total_voted_assets) * 100)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.03 }}
      className={`group flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border ${isSelected ? "border-accent/30 bg-accent/[0.07]" : "border-transparent hover:border-accent/20"} transition-all duration-200 cursor-pointer`}
      onClick={() => onSelect?.(entry.nickname)}
    >
      {/* Rank */}
      <div className="w-8 text-center shrink-0">
        <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">
          #{rank}
        </span>
      </div>

      {/* Avatar */}
      <div className="h-9 w-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
        {entry.avatar_url ? (
          <img src={entry.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
        ) : (
          <span className="text-xs text-muted-foreground font-medium">
            {(entry.nickname || "?").charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate text-accent group-hover:underline transition-colors">
          {entry.nickname || "Unknown"}
        </div>
      </div>

      {/* Win Rate */}
      {winRate !== null && (
        <div className="shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            winRate >= 60 ? "bg-emerald-500/15 text-emerald-400" :
            winRate >= 40 ? "bg-amber-500/15 text-amber-400" :
            "bg-rose-500/15 text-rose-400"
          }`}>
            {winRate}%
          </span>
        </div>
      )}

      {/* Points */}
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-foreground">
          {Number(entry.total_points) || 0}
        </div>
        <div className="text-[10px] text-muted-foreground">{t("tournament.pts", null, "pts")}</div>
      </div>
    </motion.div>
  );
}

/* ── Empty State ─────────────────────────────────── */

function EmptyState() {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 px-6"
    >
      <div className="relative mb-6">
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-accent/20 to-emerald-500/10 flex items-center justify-center">
          <Trophy className="h-10 w-10 text-accent/60" />
        </div>
        <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-muted/20 flex items-center justify-center text-xs">
          💤
        </div>
      </div>
      <h2 className="text-xl font-bold mb-2 text-foreground/80">
        {t("tournament.noActive", null, "No active tournament right now")}
      </h2>
      <p className="text-sm text-muted-foreground max-w-xs text-center">
        {t("tournament.noActiveDesc", null, "Check back later — tournaments will appear here when they're live.")}
      </p>
    </motion.div>
  );
}

/* ── Main Page Component ─────────────────────────── */

export default function TournamentLeaderboard({ reduceMotion, toast }) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNickname, setSelectedNickname] = useState(null);
  const [participantHistory, setParticipantHistory] = useState(null);
  const [participantLoading, setParticipantLoading] = useState(false);
  const [expandedParticipantDayId, setExpandedParticipantDayId] = useState(null);
  const [participantDayDetails, setParticipantDayDetails] = useState({});
  const [showPrizesModal, setShowPrizesModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson("/api/tournaments/active");
      setData(res);
    } catch (e) {
      setError(e?.message || "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, []);

  const clearParticipant = useCallback(() => {
    setSelectedNickname(null);
    setParticipantHistory(null);
    setExpandedParticipantDayId(null);
    setParticipantDayDetails({});
  }, []);

  const selectParticipant = useCallback(async (nickname) => {
    if (selectedNickname === nickname) {
      clearParticipant();
      return;
    }
    setSelectedNickname(nickname);
    setParticipantLoading(true);
    setExpandedParticipantDayId(null);
    setParticipantDayDetails({});
    try {
      const res = await fetch(`/api/tournaments/active/participant/${encodeURIComponent(nickname)}/history`);
      if (res.ok) {
        const json = await res.json();
        setParticipantHistory(json.days || []);
      } else {
        setParticipantHistory([]);
      }
    } catch {
      setParticipantHistory([]);
    } finally {
      setParticipantLoading(false);
    }
  }, [selectedNickname, clearParticipant]);

  const loadDayDetail = useCallback(async (dayId) => {
    if (expandedParticipantDayId === dayId) {
      setExpandedParticipantDayId(null);
      return;
    }
    setExpandedParticipantDayId(dayId);
    if (participantDayDetails[dayId]) return;
    try {
      const res = await fetch(`/api/tournaments/active/participant/${encodeURIComponent(selectedNickname)}/day/${dayId}`);
      if (res.ok) {
        const json = await res.json();
        setParticipantDayDetails((prev) => ({ ...prev, [dayId]: json }));
      }
    } catch { /* ignore */ }
  }, [selectedNickname, expandedParticipantDayId, participantDayDetails]);

  useEffect(() => {
    load();
  }, [load]);

  const tournament = data?.tournament;
  const leaderboard = data?.leaderboard || [];
  const status = STATUS_MAP[tournament?.status] || STATUS_MAP.draft;
  const isLive = tournament?.status === "active";
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  // Reorder top3 for podium display: [2nd, 1st, 3rd]
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3;
  const podiumRanks = top3.length >= 3 ? [1, 0, 2] : top3.map((_, i) => i);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <LeaderboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-16 px-6">
        <AlertCircle className="h-12 w-12 text-rose-400/60 mb-4" />
        <h3 className="text-base font-semibold text-rose-400 mb-2">{t("common.error", null, "Error")}</h3>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-sm font-medium transition"
        >
          <RefreshCcw className="h-4 w-4" />
          {t("common.refresh", null, "Retry")}
        </button>
      </div>
    );
  }

  if (!tournament) {
    return <EmptyState />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Tournament Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl border border-accent/15 bg-gradient-to-br from-card via-card/95 to-accent/[0.03] backdrop-blur-xl p-6 overflow-hidden"
      >
        {/* Decorative glow */}
        <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-emerald-500/8 blur-2xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <Trophy className="h-6 w-6 text-accent shrink-0" />
                <h1 className="text-xl sm:text-2xl font-bold truncate">{tournament.name}</h1>
                <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold border ${status.cls}`}>
                  {isLive && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}
                  {t(`tournament.status.${status.key}`, null, STATUS_DEFAULTS[status.key])}
                </span>
              </div>

              {tournament.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {tournament.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {fmtDate(tournament.start_date)} — {fmtDate(tournament.end_date)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {leaderboard.length} {t("tournament.participants", null, "participants")}
                </span>
              </div>

              {/* Discord Haunted badge */}
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#5865F2]/10 border border-[#5865F2]/20">
                  <svg className="h-4 w-4 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span className="text-xs font-medium text-[#5865F2]">
                    {t("publicTournament.discordHaunted", null, "Tournament hosted in Discord Haunted")}
                  </span>
                </div>
                {tournament.rules_text && (
                  <button
                    onClick={() => setShowPrizesModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-xs font-medium text-accent hover:bg-accent/20 transition"
                  >
                    <Gift className="h-3.5 w-3.5" />
                    {t("publicTournament.prizes", null, "Prizes")}
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={load}
              className="shrink-0 h-9 w-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition"
              title={t("common.refresh", null, "Refresh")}
            >
              <RefreshCcw className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Podium - Top 3 */}
      {top3.length > 0 && (
        <div className={`grid gap-3 ${top3.length >= 3 ? "grid-cols-3" : top3.length === 2 ? "grid-cols-2" : "grid-cols-1 max-w-xs mx-auto"}`}>
          {podiumOrder.map((entry, i) => (
            <PodiumCard
              key={entry.id}
              entry={entry}
              rank={podiumRanks[i]}
              index={i}
              onSelect={selectParticipant}
            />
          ))}
        </div>
      )}

      {/* Full Leaderboard Table */}
      {leaderboard.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-white/[0.06] bg-card/40 backdrop-blur-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
            <Medal className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold">{t("tournament.leaderboard", null, "Leaderboard")}</span>
            <span className="text-xs text-muted-foreground">({leaderboard.length})</span>
          </div>

          {/* Rows */}
          <div className="p-2 space-y-1">
            {leaderboard.map((entry, i) => (
              <LeaderboardRow
                key={entry.id}
                entry={entry}
                rank={i + 1}
                index={i}
                onSelect={selectParticipant}
                isSelected={selectedNickname === entry.nickname}
              />
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="text-center py-12">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{t("tournament.noParticipants", null, "No participants yet")}</p>
        </div>
      )}

      {/* Participant Detail Modal */}
      <AnimatePresence>
        {selectedNickname && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={clearParticipant}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg max-h-[80vh] rounded-2xl border border-accent/20 bg-card backdrop-blur-xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-accent" />
                  {selectedNickname}
                  {(() => {
                    const entry = leaderboard.find((v) => v.nickname === selectedNickname);
                    if (!entry || entry.total_voted_assets <= 0) return null;
                    const wr = Math.round((entry.total_correct / entry.total_voted_assets) * 100);
                    return (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        wr >= 60 ? "bg-emerald-500/15 text-emerald-400" :
                        wr >= 40 ? "bg-amber-500/15 text-amber-400" :
                        "bg-rose-500/15 text-rose-400"
                      }`}>
                        {wr}% win rate
                      </span>
                    );
                  })()}
                </h2>
                <button
                  onClick={clearParticipant}
                  className="p-1 rounded-lg hover:bg-white/[0.06] transition"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="p-3 overflow-y-auto">
                {participantLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
                  </div>
                ) : !participantHistory || participantHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {t("publicTournament.noDayHistory", null, "No voting history yet")}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {participantHistory.map((day) => {
                      const isExpanded = expandedParticipantDayId === day.vote_day_id;
                      const detail = participantDayDetails[day.vote_day_id];
                      return (
                        <div key={day.vote_day_id} className="rounded-xl border border-white/[0.06] overflow-hidden">
                          <button
                            onClick={() => loadDayDetail(day.vote_day_id)}
                            className="w-full flex items-center justify-between p-3 hover:bg-accent/5 transition text-left"
                          >
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium">{day.title || day.date_key}</span>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                (day.correct_count || 0) > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.04] text-muted-foreground"
                              }`}>
                                {day.correct_count ?? 0}/{day.total_assets ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-accent">{Number(day.day_points) || 0} pts</span>
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                              </motion.div>
                            </div>
                          </button>
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="px-3 pb-3">
                                  {!detail ? (
                                    <div className="flex items-center justify-center py-3">
                                      <Loader2 className="h-4 w-4 animate-spin text-accent/50" />
                                    </div>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {detail.selections.map((sel) => {
                                        const emojiIcon = ASSET_ICONS[sel.asset_code] || "📊";
                                        return (
                                          <div key={sel.asset_id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                                            <div className="flex items-center gap-1.5">
                                              {sel.icon_url ? (
                                                <img src={sel.icon_url} alt="" className="h-3.5 w-3.5 rounded" />
                                              ) : (
                                                <span>{emojiIcon}</span>
                                              )}
                                              <span className="font-medium">{sel.asset_label || sel.asset_code}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="flex items-center gap-0.5 text-muted-foreground">
                                                {sel.selected_option === "long" ? (
                                                  <TrendingUp className="h-3 w-3" />
                                                ) : (
                                                  <TrendingDown className="h-3 w-3" />
                                                )}
                                                <span className="text-[10px]">{sel.selected_option}</span>
                                              </span>
                                              {sel.correct_option && (
                                                <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] ${
                                                  sel.is_correct ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                                                }`}>
                                                  {sel.is_correct ? "✓" : "✗"}
                                                </span>
                                              )}
                                              {sel.correct_option && (
                                                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                  →
                                                  {sel.correct_option === "long" ? (
                                                    <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
                                                  ) : (
                                                    <TrendingDown className="h-2.5 w-2.5 text-rose-400" />
                                                  )}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prizes Modal */}
      <AnimatePresence>
        {showPrizesModal && tournament.rules_text && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPrizesModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg rounded-2xl border border-accent/20 bg-card backdrop-blur-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-accent" />
                  <span className="text-sm font-semibold">{t("publicTournament.prizes", null, "Prizes")}</span>
                </div>
                <button
                  onClick={() => setShowPrizesModal(false)}
                  className="p-1 rounded-lg hover:bg-white/[0.06] transition"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="p-4">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{tournament.rules_text}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discord Haunted Footer */}
      <div className="text-center pt-2 pb-4">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          {t("publicTournament.discordFooter", null, "Tournament held in")} <span className="font-semibold text-[#5865F2]">Discord Haunted</span>
        </p>
      </div>
    </div>
  );
}
