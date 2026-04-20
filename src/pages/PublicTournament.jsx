import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  Trophy, Users, Calendar, Clock, ArrowLeft,
  RefreshCcw, AlertCircle, BarChart3,
  X, ChevronRight, ChevronDown, UserPlus, LogIn,
  CheckCircle2, XCircle, TrendingUp, TrendingDown, Vote, Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ShareThemeToggle from "@/components/common/ShareThemeToggle.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import Button from "@/components/ui/Button.jsx";
import { ASSET_ICONS } from "@/lib/assetIcons.js";

/* ── Helpers ──────────────────────────────────────── */

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtTime = (d) => (d ? new Date(d).toLocaleString() : "—");

const STATUS_COLORS = {
  draft: "text-slate-400",
  active: "text-emerald-400",
  finished: "text-blue-400",
  archived: "text-amber-400",
};

/* ── Top 3 Podium Card ───────────────────────────── */

function TopThreeCard({ entry, rank }) {
  const bgColors = [
    "from-amber-500/20 via-amber-500/5 to-transparent border-amber-500/30",
    "from-slate-400/20 via-slate-400/5 to-transparent border-slate-400/30",
    "from-amber-700/20 via-amber-700/5 to-transparent border-amber-700/30",
  ];
  const medals = ["🥇", "🥈", "🥉"];
  const medalSizes = ["text-4xl", "text-2xl", "text-2xl"];
  const podiumPadding = ["p-6 pt-8", "p-5 pt-6", "p-4 pt-5"];
  const pointSizes = ["text-3xl", "text-2xl", "text-xl"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={`relative rounded-2xl border bg-gradient-to-b ${bgColors[rank]} backdrop-blur-md ${podiumPadding[rank]} text-center`}
    >
      <div className={`${medalSizes[rank]} mb-2`}>{medals[rank]}</div>
      <div className={`font-bold ${rank === 0 ? "text-lg" : "text-base"}`}>{entry.nickname}</div>
      <div className={`mt-3 ${pointSizes[rank]} font-bold bg-gradient-to-r from-accent to-emerald-400 bg-clip-text text-transparent`}>
        {Number(entry.total_points) || 0}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">points</div>
    </motion.div>
  );
}

/* ── Main Public Page ─────────────────────────────── */

export default function PublicTournament() {
  const { slug } = useParams();
  const { t } = useI18n();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantHistory, setParticipantHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [voteLeaderboard, setVoteLeaderboard] = useState([]);
  const [selectedVoteParticipant, setSelectedVoteParticipant] = useState(null);
  const [voteDayHistory, setVoteDayHistory] = useState([]);
  const [voteDayHistoryLoading, setVoteDayHistoryLoading] = useState(false);
  const [selectedVoteDay, setSelectedVoteDay] = useState(null);
  const [voteDayDetail, setVoteDayDetail] = useState(null);
  const [voteDayDetailLoading, setVoteDayDetailLoading] = useState(false);
  const [resolvedDays, setResolvedDays] = useState([]);
  const [expandedDayId, setExpandedDayId] = useState(null);
  const [voteDayLinks, setVoteDayLinks] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [res, voteRes, daysRes, linksRes] = await Promise.all([
        fetch(`/api/tournament/${slug}`),
        fetch(`/api/tournament/${slug}/vote-leaderboard`).catch(() => null),
        fetch(`/api/tournament/${slug}/vote-days-public`).catch(() => null),
        fetch(`/api/tournament/${slug}/vote-day-links`).catch(() => null),
      ]);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Tournament not found");
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      if (voteRes?.ok) {
        const voteJson = await voteRes.json();
        setVoteLeaderboard(voteJson.leaderboard || []);
      }
      if (daysRes?.ok) {
        const daysJson = await daysRes.json();
        setResolvedDays(daysJson.days || []);
      }
      if (linksRes?.ok) {
        const linksJson = await linksRes.json();
        setVoteDayLinks(linksJson.days || []);
      }
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e?.message || "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const openParticipantHistory = async (participant) => {
    setSelectedParticipant(participant);
    setHistoryLoading(true);
    setParticipantHistory([]);
    try {
      const res = await fetch(`/api/tournament/${slug}/participants/${participant.id}/history`);
      if (!res.ok) throw new Error("Failed to load history");
      const json = await res.json();
      setParticipantHistory(json.logs || []);
    } catch {
      setParticipantHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openVoteParticipantHistory = async (nickname) => {
    setSelectedVoteParticipant(nickname);
    setVoteDayHistory([]);
    setSelectedVoteDay(null);
    setVoteDayDetail(null);
    setVoteDayHistoryLoading(true);
    try {
      const res = await fetch(`/api/tournament/${slug}/participant/${encodeURIComponent(nickname)}/history`);
      if (!res.ok) throw new Error("Failed to load history");
      const json = await res.json();
      setVoteDayHistory(json.days || []);
    } catch {
      setVoteDayHistory([]);
    } finally {
      setVoteDayHistoryLoading(false);
    }
  };

  const openVoteDayDetail = async (dayId) => {
    setSelectedVoteDay(dayId);
    setVoteDayDetail(null);
    setVoteDayDetailLoading(true);
    try {
      const res = await fetch(`/api/tournament/${slug}/participant/${encodeURIComponent(selectedVoteParticipant)}/day/${dayId}`);
      if (!res.ok) throw new Error("Failed to load day detail");
      setVoteDayDetail(await res.json());
    } catch {
      setVoteDayDetail(null);
    } finally {
      setVoteDayDetailLoading(false);
    }
  };

  const closeVoteModal = () => {
    setSelectedVoteParticipant(null);
    setVoteDayHistory([]);
    setSelectedVoteDay(null);
    setVoteDayDetail(null);
  };

  // Group history by day
  const groupedHistory = useMemo(() => {
    if (!participantHistory.length) return [];
    const groups = {};
    for (const log of participantHistory) {
      const day = new Date(log.created_at).toLocaleDateString();
      if (!groups[day]) groups[day] = { date: day, entries: [], dayTotal: 0 };
      groups[day].entries.push(log);
      groups[day].dayTotal += Number(log.points_delta) || 0;
    }
    return Object.values(groups);
  }, [participantHistory]);

  if (loading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <div className="text-center">
          <Trophy className="h-12 w-12 mx-auto mb-3 text-accent/50 animate-pulse" />
          <p className="text-muted-foreground">{t("common.loading", null, "Loading…")}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-rose-400/50" />
          <h1 className="text-xl font-bold mb-2 text-rose-400">{t("publicTournament.unavailable", null, "Tournament Unavailable")}</h1>
          <p className="text-muted-foreground mb-6">{error || t("publicTournament.unavailableDesc", null, "This tournament is not available.")}</p>
          <Link to="/" className="inline-flex items-center gap-2 text-accent hover:underline">
            <ArrowLeft className="h-4 w-4" />
            {t("publicTournament.backHome", null, "Back to Home")}
          </Link>
        </div>
      </div>
    );
  }

  const { tournament, participants = [] } = data;

  return (
    <div className="min-h-screen app-bg">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.12]" />

      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Theme toggle — top right */}
        <div className="absolute top-4 right-4 sm:right-6 lg:right-8 z-10">
          <ShareThemeToggle />
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
            <Trophy className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#3B82F6] via-[#60A5FA] to-[#22D3EE] bg-clip-text text-transparent mb-2">
            {tournament.name}
          </h1>
          {tournament.description && (
            <p className="text-muted-foreground max-w-xl mx-auto mb-3 text-sm">{tournament.description}</p>
          )}

          {/* Discord Haunted mention */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#5865F2]/10 border border-[#5865F2]/20 mb-3">
            <svg className="h-4 w-4 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            <span className="text-xs font-medium text-[#5865F2]">
              {t("publicTournament.discordHaunted", null, "Tournament hosted in Discord Haunted")}
            </span>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className={`font-medium ${STATUS_COLORS[tournament.status] || ""}`}>
              {t(`admin.tournaments.statuses.${tournament.status}`, null, tournament.status?.toUpperCase())}
            </span>
            {tournament.start_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmtDate(tournament.start_date)} — {fmtDate(tournament.end_date)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {voteLeaderboard.length} {t("publicTournament.participants", null, "participants")}
            </span>
          </div>
          {lastRefresh && (
            <div className="text-[10px] text-muted-foreground/50 mt-2 flex items-center justify-center gap-1">
              <RefreshCcw className="h-2.5 w-2.5" />
              {t("publicTournament.autoRefresh", null, "Auto-updates every 30s")} • {fmtTime(lastRefresh)}
            </div>
          )}
        </motion.div>

        {/* Active Voting Days */}
        {voteDayLinks.length > 0 && (
          <div className="rounded-2xl border border-accent/30 bg-accent/5 backdrop-blur-md overflow-hidden mb-8">
            <div className="p-4 border-b border-accent/15">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Vote className="h-4 w-4 text-accent" />
                {t("publicTournament.activeVoting", null, "Voting")}
              </h2>
            </div>
            <div className="p-3 space-y-2">
              {voteDayLinks.map((day) => {
                const isOpen = day.status === "open";
                const voteUrl = day.vote_token
                  ? `/tournament/${slug}/vote/${day.vote_token}`
                  : `/tournament/${slug}/vote`;
                return (
                  <Link
                    key={day.id}
                    to={voteUrl}
                    className="flex items-center justify-between p-3 rounded-xl border border-border/20 bg-card/50 hover:bg-accent/10 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <span className="text-sm font-medium">{day.title || day.date_key}</span>
                        {day.vote_count > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-2">
                            {day.vote_count} {t("publicTournament.votes", null, "votes")}
                          </span>
                        )}
                        {!isOpen && day.voting_open_at && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {t("publicTournament.opensAt", null, "Opens")} {fmtTime(day.voting_open_at)}
                          </div>
                        )}
                        {isOpen && day.voting_close_at && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {t("publicTournament.closesAt", null, "Closes")} {fmtTime(day.voting_close_at)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                          {t("publicTournament.voteNow", null, "Vote now")}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                          {t("publicTournament.upcoming", null, "Upcoming")}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-accent transition" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Top 3 Podium */}
        {voteLeaderboard.length >= 3 && (
          <div className="flex items-end justify-center gap-3 sm:gap-4 mb-8 max-w-2xl mx-auto">
            {/* 2nd place */}
            <div className="flex-1 pt-6">
              <TopThreeCard entry={voteLeaderboard[1]} rank={1} />
            </div>
            {/* 1st place — tallest */}
            <div className="flex-1">
              <TopThreeCard entry={voteLeaderboard[0]} rank={0} />
            </div>
            {/* 3rd place — shortest */}
            <div className="flex-1 pt-10">
              <TopThreeCard entry={voteLeaderboard[2]} rank={2} />
            </div>
          </div>
        )}
        {voteLeaderboard.length > 0 && voteLeaderboard.length < 3 && (
          <div className={`grid gap-4 mb-8 ${voteLeaderboard.length === 1 ? "grid-cols-1 max-w-xs mx-auto" : "grid-cols-2 max-w-lg mx-auto"}`}>
            {voteLeaderboard.slice(0, 3).map((v, idx) => (
              <TopThreeCard key={v.nickname} entry={v} rank={idx} />
            ))}
          </div>
        )}

        {/* Prediction Leaderboard */}
        {voteLeaderboard.length > 0 && (
          <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md overflow-hidden mb-6">
            <div className="p-4 border-b border-border/20">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                {t("publicTournament.leaderboard", null, "Leaderboard")}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/20 text-xs text-muted-foreground">
                    <th className="p-3 text-center w-12">#</th>
                    <th className="p-3 text-left">{t("publicTournament.player", null, "Name")}</th>
                    <th className="p-3 text-center">{t("publicTournament.points", null, "Points")}</th>
                    <th className="p-3 text-center">{t("publicTournament.winRate", null, "Win Rate")}</th>
                    <th className="p-3 text-center">{t("publicTournament.resolvedDays", null, "Days")}</th>
                    <th className="p-3 text-center w-10 hidden sm:table-cell"></th>
                  </tr>
                </thead>
                <tbody>
                  {voteLeaderboard.map((v, idx) => {
                    const winRate = v.total_voted_assets > 0
                      ? Math.round((v.total_correct / v.total_voted_assets) * 100)
                      : null;
                    return (
                    <tr
                      key={v.nickname}
                      className={`border-b border-border/10 cursor-pointer hover:bg-accent/10 transition ${idx < 3 ? "bg-accent/[0.03]" : ""}`}
                      onClick={() => openVoteParticipantHistory(v.nickname)}
                    >
                      <td className={`p-3 text-center font-bold ${
                        idx === 0 ? "text-amber-400" : idx === 1 ? "text-slate-300" : idx === 2 ? "text-amber-600" : "text-muted-foreground"
                      }`}>
                        {idx < 3 ? ["🥇", "🥈", "🥉"][idx] : idx + 1}
                      </td>
                      <td className="p-3 font-medium">{v.nickname}</td>
                      <td className="p-3 text-center font-bold text-base">{Number(v.total_points) || 0}</td>
                      <td className="p-3 text-center">
                        {winRate !== null ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                            winRate >= 60 ? "bg-emerald-500/15 text-emerald-400" :
                            winRate >= 40 ? "bg-amber-500/15 text-amber-400" :
                            "bg-rose-500/15 text-rose-400"
                          }`}>
                            {winRate}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center text-xs text-muted-foreground">{v.resolved_days ?? "—"}</td>
                      <td className="p-3 text-center hidden sm:table-cell">
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Expandable Voting Days */}
        {resolvedDays.length > 0 && (
          <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md overflow-hidden mb-6">
            <div className="p-4 border-b border-border/20">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Vote className="h-4 w-4 text-accent" />
                {t("publicTournament.votingDays", null, "Voting Days")}
                <span className="text-xs text-muted-foreground font-normal">({resolvedDays.length})</span>
              </h2>
            </div>
            <div className="p-2 space-y-1">
              {resolvedDays.map((day) => {
                const isExpanded = expandedDayId === day.id;
                return (
                  <div key={day.id} className="rounded-xl border border-border/15 overflow-hidden">
                    {/* Day Header (clickable) */}
                    <button
                      onClick={() => setExpandedDayId(isExpanded ? null : day.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-accent/5 transition text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{day.title || day.date_key}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {day.votes.length} {t("publicTournament.votes", null, "votes")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Outcomes summary */}
                        <div className="hidden sm:flex items-center gap-1">
                          {day.outcomes.slice(0, 4).map((o) => {
                            const emojiIcon = ASSET_ICONS[o.asset_code] || "📊";
                            return (
                              <span key={o.asset_id} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04]">
                                {o.icon_url ? (
                                  <img src={o.icon_url} alt="" className="h-3 w-3 rounded" />
                                ) : (
                                  <span>{emojiIcon}</span>
                                )}
                                {o.correct_option === "long" ? (
                                  <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
                                ) : (
                                  <TrendingDown className="h-2.5 w-2.5 text-rose-400" />
                                )}
                              </span>
                            );
                          })}
                          {day.outcomes.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">+{day.outcomes.length - 4}</span>
                          )}
                        </div>
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                        </motion.div>
                      </div>
                    </button>

                    {/* Expanded Content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 space-y-3">
                            {/* Correct outcomes */}
                            <div className="flex flex-wrap gap-2">
                              {day.outcomes.map((o) => {
                                const emojiIcon = ASSET_ICONS[o.asset_code] || "📊";
                                return (
                                  <div key={o.asset_id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-white/[0.04] border border-border/10">
                                    {o.icon_url ? (
                                      <img src={o.icon_url} alt="" className="h-3.5 w-3.5 rounded" />
                                    ) : (
                                      <span>{emojiIcon}</span>
                                    )}
                                    <span className="font-medium">{o.asset_label || o.asset_code}</span>
                                    {o.correct_option === "both" ? (
                                      <Check className="h-3 w-3 text-blue-400" />
                                    ) : o.correct_option === "long" ? (
                                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3 text-rose-400" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* All votes table */}
                            <div className="overflow-x-auto rounded-lg border border-border/10">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border/15 text-[10px] text-muted-foreground">
                                    <th className="p-2 text-left">{t("publicTournament.player", null, "Name")}</th>
                                    {day.outcomes.map((o) => {
                                      const emojiIcon = ASSET_ICONS[o.asset_code] || "📊";
                                      return (
                                        <th key={o.asset_id} className="p-2 text-center" title={o.asset_label || o.asset_code}>
                                          {o.icon_url ? (
                                            <img src={o.icon_url} alt={o.asset_label} className="h-3.5 w-3.5 rounded mx-auto" />
                                          ) : (
                                            <span>{emojiIcon}</span>
                                          )}
                                        </th>
                                      );
                                    })}
                                    <th className="p-2 text-center">{t("publicTournament.score", null, "Score")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {day.votes.map((vote) => (
                                      <tr key={vote.nickname} className="border-b border-border/5 hover:bg-white/[0.02]">
                                        <td className="p-2 font-medium whitespace-nowrap">{vote.nickname}</td>
                                        {day.outcomes.map((o) => {
                                          const sel = vote.selections.find((s) => s.asset_id === o.asset_id);
                                          const isCorrect = sel && (o.correct_option === "both" || sel.selected_option === o.correct_option);
                                          return (
                                            <td key={o.asset_id} className="p-2 text-center">
                                              {sel ? (
                                                <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full ${
                                                  isCorrect ? "bg-emerald-500/15" : "bg-rose-500/15"
                                                }`}>
                                                  {sel.selected_option === "long" ? (
                                                    <TrendingUp className={`h-3 w-3 ${isCorrect ? "text-emerald-400" : "text-rose-400"}`} />
                                                  ) : (
                                                    <TrendingDown className={`h-3 w-3 ${isCorrect ? "text-emerald-400" : "text-rose-400"}`} />
                                                  )}
                                                </span>
                                              ) : (
                                                <span className="text-muted-foreground/30">—</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td className="p-2 text-center">
                                          <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px] ${
                                            (vote.day_points || 0) > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-white/[0.04] text-muted-foreground"
                                          }`}>
                                            {vote.correct_count ?? 0}/{vote.total_assets ?? day.outcomes.length}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tournament Rules */}
        {tournament.rules_text && (
          <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md p-4">
            <h3 className="text-sm font-semibold mb-2">{t("publicTournament.rules", null, "Rules")}</h3>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{tournament.rules_text}</p>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-accent/10 text-center space-y-4">
          {/* CTA to create own journal */}
          <div className="bg-card/50 border border-accent/20 rounded-2xl p-4 mx-auto max-w-md">
            <p className="text-sm text-foreground mb-3">
              {t("publicTournament.cta", null, "Want to track your own trades?")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/register">
                <Button size="sm" className="gap-1.5">
                  <UserPlus className="h-4 w-4" />
                  {t("publicTournament.createAccount", null, "Create account")}
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <LogIn className="h-4 w-4" />
                  {t("publicTournament.signIn", null, "Sign in")}
                </Button>
              </Link>
            </div>
          </div>

          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            {t("publicTournament.discordFooter", null, "Tournament held in")} <span className="font-semibold text-[#5865F2]">Discord Haunted</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-accent">Haunted</span> — Trading Journal
          </p>
          <SocialLinks variant="pill" />
        </footer>
      </div>

      {/* Participant History Modal */}
      <AnimatePresence>
        {selectedParticipant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedParticipant(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-card border border-border/50 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-5 border-b border-border/20 flex items-center gap-3">
                {selectedParticipant.avatar_url && (
                  <img src={selectedParticipant.avatar_url} alt="" className="h-10 w-10 rounded-full border-2 border-white/10" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base">{selectedParticipant.display_name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selectedParticipant.username && <span>@{selectedParticipant.username}</span>}
                    {selectedParticipant.role && (
                      <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[10px]">
                        {selectedParticipant.role}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold bg-gradient-to-r from-accent to-emerald-400 bg-clip-text text-transparent">
                    {Number(selectedParticipant.total_points) || 0}
                  </div>
                  <div className="text-[10px] text-muted-foreground">total points</div>
                </div>
                <button
                  onClick={() => setSelectedParticipant(null)}
                  className="ml-2 h-8 w-8 rounded-xl flex items-center justify-center hover:bg-accent/10 transition"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* History Content — daily summary only */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {historyLoading ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Clock className="h-6 w-6 mx-auto mb-2 animate-pulse opacity-50" />
                    {t("common.loading", null, "Loading…")}
                  </div>
                ) : groupedHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t("publicTournament.noHistory", null, "No points history yet")}
                  </div>
                ) : (
                  groupedHistory.map((group) => (
                    <div key={group.date} className="flex items-center justify-between p-3 rounded-xl bg-card/50 border border-border/15">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{group.date}</span>
                      </div>
                      <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                        group.dayTotal >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                      }`}>
                        {group.dayTotal >= 0 ? "+" : ""}{group.dayTotal}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voting History Modal */}
      <AnimatePresence>
        {selectedVoteParticipant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={closeVoteModal}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-card border border-border/50 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-5 border-b border-border/20 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <Vote className="h-5 w-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base">{selectedVoteParticipant}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("publicTournament.votingHistory", null, "Voting History")}
                  </div>
                </div>
                {selectedVoteDay && (
                  <button
                    onClick={() => { setSelectedVoteDay(null); setVoteDayDetail(null); }}
                    className="text-xs text-accent hover:underline mr-1"
                  >
                    ← {t("publicTournament.selectDay", null, "Back to days")}
                  </button>
                )}
                <button
                  onClick={closeVoteModal}
                  className="ml-1 h-8 w-8 rounded-xl flex items-center justify-center hover:bg-accent/10 transition"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {/* Day detail view */}
                {selectedVoteDay ? (
                  voteDayDetailLoading ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Clock className="h-6 w-6 mx-auto mb-2 animate-pulse opacity-50" />
                      {t("common.loading", null, "Loading…")}
                    </div>
                  ) : voteDayDetail ? (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold">
                          {t("publicTournament.dayDetail", null, "Day Detail")} — {voteDayDetail.title || voteDayDetail.date_key}
                        </h3>
                        {voteDayDetail.day_points != null && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                            {voteDayDetail.correct_count}/{voteDayDetail.total_assets} • {voteDayDetail.day_points}pts
                          </span>
                        )}
                      </div>
                      {(voteDayDetail.selections || voteDayDetail.breakdown || []).map((asset) => {
                        const emojiIcon = ASSET_ICONS[asset.asset_code] || "📊";
                        const resolved = asset.correct_option != null;
                        return (
                        <div
                          key={asset.asset_code || asset.asset_id}
                          className={`flex items-center gap-3 p-3 rounded-xl border ${
                            !resolved ? "border-border/20 bg-card/30"
                            : asset.is_correct ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"
                          }`}
                        >
                          {resolved ? (
                            asset.is_correct
                              ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                              : <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
                          ) : (
                            <Clock className="h-5 w-5 text-muted-foreground/50 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              {asset.icon_url ? (
                                <img src={asset.icon_url} alt={asset.asset_label || asset.asset_code} className="h-4 w-4 rounded object-cover" />
                              ) : (
                                <span className="text-base">{emojiIcon}</span>
                              )}
                              {asset.asset_label || asset.asset_code}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-0.5">
                                {t("publicTournament.yourVote", null, "You")}:
                                {asset.selected_option === "long"
                                  ? <TrendingUp className="h-3 w-3 text-emerald-400" />
                                  : <TrendingDown className="h-3 w-3 text-rose-400" />}
                                {asset.selected_option}
                              </span>
                              {resolved && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-0.5">
                                    {t("publicTournament.correct", null, "Correct")}:
                                    {asset.correct_option === "both"
                                      ? <Check className="h-3 w-3 text-blue-400" />
                                      : asset.correct_option === "long"
                                      ? <TrendingUp className="h-3 w-3 text-emerald-400" />
                                      : <TrendingDown className="h-3 w-3 text-rose-400" />}
                                    {asset.correct_option}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      {t("publicTournament.noDayHistory", null, "No detail available")}
                    </div>
                  )
                ) : (
                  /* Day list view */
                  voteDayHistoryLoading ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Clock className="h-6 w-6 mx-auto mb-2 animate-pulse opacity-50" />
                      {t("common.loading", null, "Loading…")}
                    </div>
                  ) : voteDayHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      {t("publicTournament.noDayHistory", null, "No voting history yet")}
                    </div>
                  ) : (
                    voteDayHistory.map((day) => (
                      <div
                        key={day.vote_day_id || day.date_key}
                        className="flex items-center justify-between p-3 rounded-xl bg-card/50 border border-border/15 cursor-pointer hover:bg-accent/10 transition"
                        onClick={() => openVoteDayDetail(day.vote_day_id)}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <span className="text-sm font-medium">{day.title || day.date_key}</span>
                            <div className="text-[10px] text-muted-foreground">
                              {day.correct_count}/{day.total_assets} {t("publicTournament.correct", null, "correct")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                            (day.day_points || 0) >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                          }`}>
                            {(day.day_points || 0) >= 0 ? "+" : ""}{day.day_points || 0}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
