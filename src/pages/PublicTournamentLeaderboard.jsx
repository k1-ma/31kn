import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  Trophy, Users, Calendar, Clock, RefreshCcw, AlertCircle, BarChart3,
  ArrowLeft, ChevronDown, ChevronRight, TrendingUp, TrendingDown,
  Vote, X, Loader2, Gift, Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ShareThemeToggle from "@/components/common/ShareThemeToggle.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import { ASSET_ICONS } from "@/lib/assetIcons.js";

/* ── Helpers ──────────────────────────────────────── */

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtTime = (d) => (d ? new Date(d).toLocaleString() : "—");

/* ── Top 3 Podium Card ───────────────────────────── */

function TopThreeCard({ entry, rank, onSelect }) {
  const bgColors = [
    "from-amber-500/20 via-amber-500/5 to-transparent border-amber-500/30",
    "from-slate-400/20 via-slate-400/5 to-transparent border-slate-400/30",
    "from-amber-700/20 via-amber-700/5 to-transparent border-amber-700/30",
  ];
  const medals = ["🥇", "🥈", "🥉"];
  const medalSizes = ["text-4xl", "text-2xl", "text-2xl"];
  const podiumPadding = ["p-6 pt-8", "p-5 pt-6", "p-4 pt-5"];
  const pointSizes = ["text-3xl", "text-2xl", "text-xl"];

  const winRate = entry.total_voted_assets > 0
    ? Math.round((entry.total_correct / entry.total_voted_assets) * 100)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={`relative rounded-2xl border bg-gradient-to-b ${bgColors[rank]} backdrop-blur-md ${podiumPadding[rank]} text-center cursor-pointer hover:ring-1 hover:ring-accent/30 transition`}
      onClick={() => onSelect?.(entry.nickname)}
    >
      <div className={`${medalSizes[rank]} mb-2`}>{medals[rank]}</div>
      <div className={`font-bold ${rank === 0 ? "text-lg" : "text-base"} text-accent hover:underline`}>{entry.nickname}</div>
      <div className={`mt-3 ${pointSizes[rank]} font-bold bg-gradient-to-r from-accent to-emerald-400 bg-clip-text text-transparent`}>
        {Number(entry.total_points) || 0}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">points</div>
      {winRate !== null && (
        <div className={`mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block ${
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

/* ── Main Standalone Leaderboard Page ─────────────── */

export default function PublicTournamentLeaderboard() {
  const { slug } = useParams();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [voteLeaderboard, setVoteLeaderboard] = useState([]);
  const [tournament, setTournament] = useState(null);
  const [resolvedDays, setResolvedDays] = useState([]);
  const [expandedDayId, setExpandedDayId] = useState(null);
  const [selectedNickname, setSelectedNickname] = useState(null);
  const [participantHistory, setParticipantHistory] = useState(null);
  const [participantLoading, setParticipantLoading] = useState(false);
  const [expandedParticipantDayId, setExpandedParticipantDayId] = useState(null);
  const [participantDayDetails, setParticipantDayDetails] = useState({});
  const [showPrizesModal, setShowPrizesModal] = useState(false);
  const [voteDayLinks, setVoteDayLinks] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [voteRes, daysRes, linksRes] = await Promise.all([
        fetch(`/api/tournament/${slug}/vote-leaderboard`),
        fetch(`/api/tournament/${slug}/vote-days-public`).catch(() => null),
        fetch(`/api/tournament/${slug}/vote-day-links`).catch(() => null),
      ]);
      if (!voteRes.ok) {
        if (voteRes.status === 404) throw new Error("Tournament not found");
        throw new Error(`HTTP ${voteRes.status}`);
      }
      const voteJson = await voteRes.json();
      setVoteLeaderboard(voteJson.leaderboard || []);
      setTournament(voteJson.tournament || null);
      if (daysRes?.ok) {
        const daysJson = await daysRes.json();
        setResolvedDays(daysJson.days || []);
      }
      if (linksRes?.ok) {
        const linksJson = await linksRes.json();
        setVoteDayLinks(linksJson.days || []);
      }
      setError(null);
    } catch (e) {
      setError(e?.message || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const selectParticipant = useCallback(async (nickname) => {
    if (selectedNickname === nickname) {
      setSelectedNickname(null);
      setParticipantHistory(null);
      setExpandedParticipantDayId(null);
      setParticipantDayDetails({});
      return;
    }
    setSelectedNickname(nickname);
    setParticipantLoading(true);
    setExpandedParticipantDayId(null);
    setParticipantDayDetails({});
    try {
      const res = await fetch(`/api/tournament/${slug}/participant/${encodeURIComponent(nickname)}/history`);
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
  }, [slug, selectedNickname]);

  const loadDayDetail = useCallback(async (dayId) => {
    if (expandedParticipantDayId === dayId) {
      setExpandedParticipantDayId(null);
      return;
    }
    setExpandedParticipantDayId(dayId);
    if (participantDayDetails[dayId]) return;
    try {
      const res = await fetch(`/api/tournament/${slug}/participant/${encodeURIComponent(selectedNickname)}/day/${dayId}`);
      if (res.ok) {
        const json = await res.json();
        setParticipantDayDetails((prev) => ({ ...prev, [dayId]: json }));
      }
    } catch { /* ignore */ }
  }, [slug, selectedNickname, expandedParticipantDayId, participantDayDetails]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

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

  if (error || !tournament) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-rose-400/50" />
          <h1 className="text-xl font-bold mb-2 text-rose-400">{t("publicTournament.unavailable", null, "Leaderboard Unavailable")}</h1>
          <p className="text-muted-foreground mb-6">{error || "This leaderboard is not available."}</p>
          <Link to={`/tournament/${slug}`} className="inline-flex items-center gap-2 text-accent hover:underline">
            <ArrowLeft className="h-4 w-4" />
            {t("publicTournament.backToTournament", null, "Back to Tournament")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.12]" />

      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Theme toggle */}
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
          <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
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

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {voteLeaderboard.length} {t("publicTournament.participants", null, "participants")}
            </span>
            <button
              onClick={loadData}
              className="flex items-center gap-1 text-accent hover:underline"
            >
              <RefreshCcw className="h-3 w-3" />
              {t("common.refresh", null, "Refresh")}
            </button>
          </div>

          <div className="mt-2">
            <Link to={`/tournament/${slug}`} className="text-xs text-accent hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" />
              {t("publicTournament.backToTournament", null, "Back to Tournament")}
            </Link>
          </div>
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
            <div className="flex-1 pt-6">
              <TopThreeCard entry={voteLeaderboard[1]} rank={1} onSelect={selectParticipant} />
            </div>
            <div className="flex-1">
              <TopThreeCard entry={voteLeaderboard[0]} rank={0} onSelect={selectParticipant} />
            </div>
            <div className="flex-1 pt-10">
              <TopThreeCard entry={voteLeaderboard[2]} rank={2} onSelect={selectParticipant} />
            </div>
          </div>
        )}
        {voteLeaderboard.length > 0 && voteLeaderboard.length < 3 && (
          <div className={`grid gap-4 mb-8 ${voteLeaderboard.length === 1 ? "grid-cols-1 max-w-xs mx-auto" : "grid-cols-2 max-w-lg mx-auto"}`}>
            {voteLeaderboard.slice(0, 3).map((v, idx) => (
              <TopThreeCard key={v.nickname} entry={v} rank={idx} onSelect={selectParticipant} />
            ))}
          </div>
        )}

        {/* Leaderboard Table */}
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
                        className={`border-b border-border/10 cursor-pointer hover:bg-accent/[0.06] transition ${idx < 3 ? "bg-accent/[0.03]" : ""} ${selectedNickname === v.nickname ? "ring-1 ring-accent/30 bg-accent/[0.07]" : ""}`}
                        onClick={() => selectParticipant(v.nickname)}
                      >
                        <td className={`p-3 text-center font-bold ${
                          idx === 0 ? "text-amber-400" : idx === 1 ? "text-slate-300" : idx === 2 ? "text-amber-600" : "text-muted-foreground"
                        }`}>
                          {idx < 3 ? ["🥇", "🥈", "🥉"][idx] : idx + 1}
                        </td>
                        <td className="p-3 font-medium text-accent hover:underline">{v.nickname}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
              onClick={() => { setSelectedNickname(null); setParticipantHistory(null); setExpandedParticipantDayId(null); setParticipantDayDetails({}); }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-lg max-h-[80vh] rounded-2xl border border-accent/20 bg-card backdrop-blur-xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-border/20 flex items-center justify-between shrink-0">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-accent" />
                    {selectedNickname}
                    {(() => {
                      const entry = voteLeaderboard.find((v) => v.nickname === selectedNickname);
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
                    onClick={() => { setSelectedNickname(null); setParticipantHistory(null); setExpandedParticipantDayId(null); setParticipantDayDetails({}); }}
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
                          <div key={day.vote_day_id} className="rounded-xl border border-border/15 overflow-hidden">
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
                                            <div key={sel.asset_id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-white/[0.03] border border-border/10">
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
                                                    {sel.correct_option === "both" ? (
                                                      <Check className="h-2.5 w-2.5 text-blue-400" />
                                                    ) : sel.correct_option === "long" ? (
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
                <div className="flex items-center justify-between p-4 border-b border-border/20">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Gift className="h-4 w-4 text-accent" />
                    {t("publicTournament.prizes", null, "Prizes")}
                  </h2>
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

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-accent/10 text-center space-y-4">
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
    </div>
  );
}
