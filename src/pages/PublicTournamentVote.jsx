import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  Trophy, TrendingUp, TrendingDown, Clock, ArrowLeft,
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  BarChart3, UserPlus, LogIn, Send, Timer, Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ShareThemeToggle from "@/components/common/ShareThemeToggle.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import Button from "@/components/ui/Button.jsx";
import { ASSET_ICONS } from "@/lib/assetIcons.js";

/* ── Helpers ──────────────────────────────────────── */

const fmtTime = (d) => (d ? new Date(d).toLocaleString() : "—");

/**
 * Countdown hook — returns { h, m, s, total } where total is seconds remaining.
 * When total reaches 0, calls onExpire().
 */
function useCountdown(targetDate, onExpire) {
  const [remaining, setRemaining] = useState(() => {
    if (!targetDate) return null;
    const diff = Math.max(0, Math.floor((new Date(targetDate).getTime() - Date.now()) / 1000));
    return diff;
  });
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!targetDate) { setRemaining(null); return; }
    expiredRef.current = false;

    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(targetDate).getTime() - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate, onExpire]);

  if (remaining === null) return null;
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return { h, m, s, total: remaining };
}

/* ── Main Public Voting Page ──────────────────────── */

export default function PublicTournamentVote() {
  const { slug, dayToken } = useParams();
  const { t } = useI18n();

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [nickname, setNickname] = useState(() => {
    try { return localStorage.getItem("tournament_nickname") || ""; } catch { return ""; }
  });
  const [selections, setSelections] = useState({});
  const [votePassword, setVotePassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const configUrl = dayToken
        ? `/api/tournament/${slug}/vote-config/${dayToken}`
        : `/api/tournament/${slug}/vote-config`;
      const res = await fetch(configUrl);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Tournament not found");
        throw new Error(`HTTP ${res.status}`);
      }
      setConfig(await res.json());
      setError(null);
    } catch (e) {
      setError(e?.message || "Failed to load voting config");
    } finally {
      setLoading(false);
    }
  }, [slug, dayToken]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Auto-refresh config every 30 seconds to catch voting window transitions
  useEffect(() => {
    const interval = setInterval(loadConfig, 30000);
    return () => clearInterval(interval);
  }, [loadConfig]);

  const tournament = config?.tournament;
  const currentDay = config?.currentDay;
  const assets = currentDay?.assets || [];
  const isOpen = currentDay && currentDay.is_voting_open;

  // Determine if there's an upcoming day with a scheduled open time (for countdown)
  const hasUpcomingTimer = currentDay && !isOpen && currentDay.voting_open_at && new Date(currentDay.voting_open_at) > new Date();
  // Determine if there's a close timer for an open day
  const hasCloseTimer = isOpen && currentDay?.voting_close_at;

  // Countdown: time until voting opens
  const openCountdown = useCountdown(
    hasUpcomingTimer ? currentDay.voting_open_at : null,
    loadConfig
  );

  // Countdown: time until voting closes
  const closeCountdown = useCountdown(
    hasCloseTimer ? currentDay.voting_close_at : null,
    loadConfig
  );

  const toggleSelection = (assetId, option) => {
    setSelections((prev) => ({
      ...prev,
      [assetId]: prev[assetId] === option ? undefined : option,
    }));
  };

  const allSelected = assets.length > 0 && assets.every((a) => selections[a.id] !== undefined);
  const hasVotePassword = config?.tournament?.has_vote_password;
  const canSubmit = nickname.trim().length > 0 && allSelected && !submitting && (!hasVotePassword || votePassword.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        nickname: nickname.trim(),
        selections: assets.map((a) => ({
          asset_id: a.id,
          selected_option: selections[a.id],
        })),
        ...(hasVotePassword ? { vote_password: votePassword } : {}),
      };
      const voteUrl = dayToken
        ? `/api/tournament/${slug}/vote/${dayToken}`
        : `/api/tournament/${slug}/vote`;
      const res = await fetch(voteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "ip_already_voted") {
          setSubmitError(t("publicVoting.ipAlreadyVoted", null, "Another vote was already submitted from your network"));
        } else {
          setAlreadyVoted(true);
        }
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "voting_window_closed") {
          setSubmitError(t("publicVoting.windowClosed", null, "The voting window has closed"));
          loadConfig();
        } else if (data.error === "invalid_vote_password") {
          setSubmitError(t("publicVoting.invalidVotePassword", null, "Invalid voting password"));
        } else {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return;
      }
      try { localStorage.setItem("tournament_nickname", nickname.trim()); } catch {}
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e?.message || "Failed to submit vote");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Loading state ─────────────────────────────── */
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

  /* ── Error state ───────────────────────────────── */
  if (error || !config) {
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

  /* ── Render ─────────────────────────────────────── */
  return (
    <div className="min-h-screen app-bg">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.12]" />

      <div className="relative mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#3B82F6] via-[#60A5FA] to-[#22D3EE] bg-clip-text text-transparent mb-1">
            {tournament.name}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t("publicVoting.subtitle", null, "Make your predictions")}
          </p>
          {tournament.description && (
            <p className="text-muted-foreground max-w-xl mx-auto mt-2 text-sm">{tournament.description}</p>
          )}
        </motion.div>

        {/* Main Content Area */}
        <AnimatePresence mode="wait">
          {/* No active voting day */}
          {!currentDay && (
            <motion.div
              key="no-day"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md p-8 text-center mb-6"
            >
              <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <h2 className="text-lg font-bold mb-2">{t("publicVoting.noDay", null, "No Active Voting")}</h2>
              <p className="text-sm text-muted-foreground">{t("publicVoting.noDayDesc", null, "There is no active voting day right now.")}</p>
            </motion.div>
          )}

          {/* Voting closed or upcoming with countdown */}
          {currentDay && !isOpen && (
            <motion.div
              key="closed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md p-8 text-center mb-6"
            >
              {openCountdown && openCountdown.total > 0 ? (
                <>
                  <Timer className="h-12 w-12 mx-auto mb-3 text-accent/70" />
                  <h2 className="text-lg font-bold mb-3">{t("publicVoting.opensIn", null, "Voting Opens In")}</h2>
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <div className="flex flex-col items-center px-4 py-3 rounded-xl bg-accent/10 border border-accent/20 min-w-[70px]">
                      <span className="text-2xl font-bold text-accent tabular-nums">{String(openCountdown.h).padStart(2, "0")}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{t("publicVoting.hours", null, "hours")}</span>
                    </div>
                    <span className="text-xl font-bold text-muted-foreground">:</span>
                    <div className="flex flex-col items-center px-4 py-3 rounded-xl bg-accent/10 border border-accent/20 min-w-[70px]">
                      <span className="text-2xl font-bold text-accent tabular-nums">{String(openCountdown.m).padStart(2, "0")}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{t("publicVoting.minutes", null, "min")}</span>
                    </div>
                    <span className="text-xl font-bold text-muted-foreground">:</span>
                    <div className="flex flex-col items-center px-4 py-3 rounded-xl bg-accent/10 border border-accent/20 min-w-[70px]">
                      <span className="text-2xl font-bold text-accent tabular-nums">{String(openCountdown.s).padStart(2, "0")}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{t("publicVoting.seconds", null, "sec")}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("publicVoting.willOpenAt", null, "Scheduled for")} {fmtTime(currentDay.voting_open_at)}</p>
                </>
              ) : (
                <>
                  <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-400/50" />
                  <h2 className="text-lg font-bold mb-2">{t("publicVoting.closed", null, "Voting Closed")}</h2>
                  <p className="text-sm text-muted-foreground">{t("publicVoting.closedDesc", null, "Voting is currently closed. Check back later.")}</p>
                </>
              )}
            </motion.div>
          )}

          {/* Already voted */}
          {isOpen && alreadyVoted && (
            <motion.div
              key="already-voted"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-md p-8 text-center mb-6"
            >
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-400" />
              <h2 className="text-lg font-bold mb-2 text-amber-400">{t("publicVoting.alreadyVoted", null, "Already Voted")}</h2>
              <p className="text-sm text-muted-foreground">{t("publicVoting.alreadyVotedDesc", null, "You have already voted for this day.")}</p>
            </motion.div>
          )}

          {/* Success */}
          {isOpen && submitted && !alreadyVoted && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-md p-8 text-center mb-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
              >
                <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-emerald-400" />
              </motion.div>
              <h2 className="text-xl font-bold mb-2 text-emerald-400">{t("publicVoting.success", null, "Vote Submitted!")}</h2>
              <p className="text-sm text-muted-foreground">{t("publicVoting.successDesc", null, "Your predictions have been recorded.")}</p>
            </motion.div>
          )}

          {/* Voting Form */}
          {isOpen && !submitted && !alreadyVoted && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 mb-6"
            >
              {/* Close countdown timer */}
              {closeCountdown && closeCountdown.total > 0 && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 backdrop-blur-md p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Timer className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-semibold text-amber-400">{t("publicVoting.closesIn", null, "Voting closes in")}</span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-lg font-bold text-amber-400 tabular-nums">
                      {String(closeCountdown.h).padStart(2, "0")}:{String(closeCountdown.m).padStart(2, "0")}:{String(closeCountdown.s).padStart(2, "0")}
                    </span>
                  </div>
                </div>
              )}

              {/* Nickname input */}
              <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md p-4">
                <label className="block text-sm font-semibold mb-2">
                  {t("publicVoting.nickname", null, "Your nickname (Discord)")}
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t("publicVoting.nicknamePlaceholder", null, "Enter your Discord nickname")}
                  className="w-full rounded-xl border border-border/30 bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition"
                  maxLength={50}
                />
              </div>

              {/* Vote password input (shown only when required) */}
              {hasVotePassword && (
                <div className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md p-4">
                  <label className="block text-sm font-semibold mb-2">
                    {t("publicVoting.votePassword", null, "Voting Password")}
                  </label>
                  <input
                    type="password"
                    value={votePassword}
                    onChange={(e) => setVotePassword(e.target.value)}
                    placeholder={t("publicVoting.votePasswordPlaceholder", null, "Enter voting password")}
                    className="w-full rounded-xl border border-border/30 bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition"
                  />
                </div>
              )}

              {/* Asset cards */}
              {assets.map((asset, idx) => {
                const emojiIcon = ASSET_ICONS[asset.asset_code] || "📊";
                return (
                <motion.div
                  key={asset.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    {asset.icon_url ? (
                      <img src={asset.icon_url} alt={asset.asset_label || asset.asset_code} className="h-6 w-6 rounded object-cover" />
                    ) : (
                      <span className="text-xl">{emojiIcon}</span>
                    )}
                    <span className="text-sm font-semibold">{asset.asset_code}</span>
                    {asset.asset_label && asset.asset_code !== asset.asset_label && (
                      <span className="text-muted-foreground font-normal text-xs">({asset.asset_label})</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelection(asset.id, "long")}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all ${
                        selections[asset.id] === "long"
                          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 shadow-lg shadow-emerald-500/10"
                          : "border-border/30 bg-background/30 text-muted-foreground hover:border-emerald-500/30 hover:text-emerald-400"
                      }`}
                    >
                      <TrendingUp className="h-4 w-4" />
                      {t("publicVoting.long", null, "Long")}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSelection(asset.id, "skip")}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                        selections[asset.id] === "skip"
                          ? "border-slate-500/50 bg-slate-500/15 text-slate-400 shadow-lg shadow-slate-500/10"
                          : "border-border/30 bg-background/30 text-muted-foreground hover:border-slate-500/30 hover:text-slate-400"
                      }`}
                    >
                      <Minus className="h-4 w-4" />
                      {t("publicVoting.skip", null, "Skip")}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSelection(asset.id, "short")}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all ${
                        selections[asset.id] === "short"
                          ? "border-rose-500/50 bg-rose-500/15 text-rose-400 shadow-lg shadow-rose-500/10"
                          : "border-border/30 bg-background/30 text-muted-foreground hover:border-rose-500/30 hover:text-rose-400"
                      }`}
                    >
                      <TrendingDown className="h-4 w-4" />
                      {t("publicVoting.short", null, "Short")}
                    </button>
                  </div>
                </motion.div>
                );
              })}

              {/* Submit error */}
              {submitError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-400 text-center">
                  {submitError}
                </div>
              )}

              {/* Submit button */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="w-full gap-2 py-3"
                  size="lg"
                >
                  <Send className="h-4 w-4" />
                  {submitting
                    ? t("common.loading", null, "Loading…")
                    : t("publicVoting.submit", null, "Submit Vote")}
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rules (collapsible) */}
        {tournament.rules_text && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-border/30 bg-card/50 backdrop-blur-md overflow-hidden mb-6"
          >
            <button
              type="button"
              onClick={() => setRulesOpen((v) => !v)}
              className="w-full flex items-center justify-between p-4 text-sm font-semibold hover:bg-accent/5 transition"
            >
              <span>{t("publicVoting.rules", null, "Rules")}</span>
              {rulesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            <AnimatePresence>
              {rulesOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{tournament.rules_text}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Link to Leaderboard */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-center mb-8"
        >
          <Link
            to={`/tournament/${slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
          >
            <BarChart3 className="h-4 w-4" />
            {t("publicVoting.viewLeaderboard", null, "View Leaderboard")}
          </Link>
        </motion.div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-accent/10 text-center space-y-4">
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

          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-accent">Haunted</span> — Trading Journal
          </p>
          <SocialLinks variant="pill" />
        </footer>
      </div>
    </div>
  );
}
