import React, { useCallback, useEffect, useMemo, useState, useRef, lazy, Suspense } from "react";
import Shell from "@/components/layout/Shell.jsx";
import UserMenu from "@/components/common/UserMenu.jsx";
import CommandPalette from "@/components/common/CommandPalette.jsx";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import OfflineBanner from "@/components/common/OfflineBanner.jsx";
import {
  useToasts } from "@/components/common/toast.js";
import { useSyncedDb, isDeleted } from "@/lib/syncDb.js";
import { useSyncWarning } from "@/lib/syncWarning.js";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { SEED } from "@/lib/seed.js";
import { uid,
  isoDate,
  clampNum } from "@/lib/utils";
import { ideasApi } from "@/lib/api.js";
import { isAnyDirty, clearDirty } from "@/lib/navGuard.js";
import {
  mergePropTemplates,
  mapLegacyPropToTemplateId,
  getTemplate,
  getNextPhaseId,
  evaluatePropAccount,
  deriveAccountStatusFromProp,
  createNextPropAccountFrom,
  normalizePayouts,
  getPhase,
  getPhaseIndex,
  phaseStatusLabel,
} from "@/lib/prop.js";
import I18nProvider from "@/i18n/I18nProvider.jsx";
import { applyPalette, getDefaultPalettes, getPresetById, COLOR_KEYS, ensureReadable } from "@/lib/theme.js";

const PURPLE_HEXES = ["#7C3AED","#8B5CF6","#A78BFA","#6D28D9","#7c3aed","#8b5cf6","#a78bfa","#6d28d9"];
const hasPurplePalette = (pal) =>
  pal && typeof pal === "object" && PURPLE_HEXES.some((c) => Object.values(pal).includes(c));

// Dashboard and Analytics pages
import DashboardPage from "@/pages/DashboardPage.jsx";
import Trades from "@/pages/Trades.jsx";
import Accounts from "@/pages/Accounts.jsx";
// Less-frequently visited pages — lazy so the initial bundle doesn't
// include their (often heavy: charts, tiptap, recharts) deps.
const Analytics = lazy(() => import("@/pages/Analytics.jsx"));
const PropPrograms = lazy(() => import("@/pages/PropPrograms.jsx"));
const TrashPage = lazy(() => import("@/pages/Trash.jsx"));
const Pairs = lazy(() => import("@/pages/Pairs.jsx"));
const Sessions = lazy(() => import("@/pages/Sessions.jsx"));
const Models = lazy(() => import("@/pages/Models.jsx"));
const Tags = lazy(() => import("@/pages/Tags.jsx"));
const Settings = lazy(() => import("@/pages/Settings.jsx"));
const Ideas = lazy(() => import("@/pages/Ideas.jsx"));
const Changelog = lazy(() => import("@/pages/Changelog.jsx"));
const Documents = lazy(() => import("@/pages/Documents.jsx"));
const Inbox = lazy(() => import("@/pages/Inbox.jsx"));
const UpdatesAndFeedback = lazy(() => import("@/pages/UpdatesAndFeedback.jsx"));
const Backtests = lazy(() => import("@/pages/Backtests.jsx"));
const BacktestDashboard = lazy(() => import("@/pages/BacktestDashboard.jsx"));
const Education = lazy(() => import("@/pages/Education.jsx"));
const TournamentLeaderboard = lazy(() => import("@/pages/TournamentLeaderboard.jsx"));
import BacktestModeBar from "@/components/backtest/BacktestModeBar.jsx";
import BacktestCreateModal from "@/components/backtest/BacktestCreateModal.jsx";
import NotificationBell from "@/components/common/NotificationBell.jsx";

import {
  BarChart3,
  BookOpen,
  Wallet,
  Trash2,
  Shapes,
  Clock,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Download,
  Lightbulb,
  History,
  FileText,
  LayoutDashboard,
  GraduationCap,
  Trophy,
} from "lucide-react";


export default function JournalApp() {
  const toast = useToasts();
  const { user, logout, lastKnownUserId } = useAuth();
  const role = user?.role || "user";
  // Dashboard is the default landing page
  const allowedNavKeys = role === "loh" ? ["dashboard", "analytics", "trades", "settings"] : null;
  const navBanner = role === "loh" ? { i18nKey: "roles.lohBanner" } : null;
  const { db, setDb, syncStatus, refetch, retrySync, flushSync, setShareInFlight, lastError, hasUnsavedChanges, syncProgress, isReadOnly } = useSyncedDb(user?.id, SEED, { lastKnownUserId });
  
  // Sync-in-progress indicator — shows a friendly card with progress + elapsed time
  // after a short grace period to avoid flickering on near-instant saves.
  const {
    shouldShowWarning: showDelayedSyncWarning,
    elapsedMs: syncElapsedMs,
    resetWarning: resetSyncWarning,
  } = useSyncWarning({ syncStatus, onStall: retrySync });
  
  const [active, setActive] = useState("dashboard");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [quickTradeAccountId, setQuickTradeAccountId] = useState(null);
  const [openNewTrade, setOpenNewTrade] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState(null);
  
  // Ideas state (fetched from server API)
  const [ideas, setIdeas] = useState([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const ideasFetchedRef = useRef(false);
  
  // Handler for quick trade from account card
  const handleQuickTrade = (accountId) => {
    setQuickTradeAccountId(accountId);
    setActive("trades");
  };
  
  // Handler for clicking on a trade from analytics
  const handleTradeClick = (trade) => {
    setSelectedTradeId(trade.id);
    setActive("trades");
  };
  
  // Handler for navigating to a document from trade editor
  const handleNavigateToDocument = (docId) => {
    setSelectedDocumentId(docId);
    setActive("documents");
  };
  
  // Handler for navigating to an idea from trade editor
  const handleNavigateToIdea = (ideaId) => {
    setSelectedIdeaId(ideaId);
    setActive("ideas");
  };
  
  // Handler for navigating to a trade from documents/ideas
  const handleNavigateToTrade = (tradeId) => {
    setSelectedTradeId(tradeId);
    setActive("trades");
  };

  // clamp active to allowed nav for restricted roles
  useEffect(() => {
    if (Array.isArray(allowedNavKeys) && allowedNavKeys.length && !allowedNavKeys.includes(active)) {
      setActive(allowedNavKeys[0]);
    }
  }, [active, allowedNavKeys]);

  // -----------------------------
  // Ideas Loading & Sync
  // -----------------------------
  const loadIdeas = useCallback(async () => {
    if (ideasLoading) return;
    setIdeasLoading(true);
    try {
      const res = await ideasApi.list({});
      setIdeas(res?.ideas || []);
    } catch (e) {
      console.error("[JournalApp] Failed to load ideas:", e);
    } finally {
      setIdeasLoading(false);
    }
  }, [ideasLoading]);

  // Fetch ideas on mount
  useEffect(() => {
    if (user?.id && !ideasFetchedRef.current) {
      ideasFetchedRef.current = true;
      loadIdeas();
    }
  }, [user?.id, loadIdeas]);

  // Refresh ideas when navigating to ideas, trades, or dashboard page (only if not already loading)
  useEffect(() => {
    if ((active === "ideas" || active === "trades" || active === "dashboard") && !ideasLoading) {
      loadIdeas();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // -----------------------------
  // Migrations (backward compatible localStorage)
  // -----------------------------
  const migrateDb = (raw) => {
    if (!raw || typeof raw !== "object") return raw;
    let changed = false;

    // UI defaults (lang + theme palettes)
    const uiIn = raw.ui ?? {};
    let ui = { ...uiIn };
    if (!ui.lang || typeof ui.lang !== "string") {
      // New users get Russian by default
      ui.lang = "ru";
      changed = true;
    } else if (ui.lang === "default") {
      // Migrate existing users with "default" to "ru"
      ui.lang = "ru";
      changed = true;
    }

    if (!Array.isArray(ui.customPresets)) {
      ui.customPresets = [];
      changed = true;
    }
    if (ui.customPresets.length > 2) {
      ui.customPresets = ui.customPresets.slice(0, 2);
      changed = true;
    }

    // One-time migration: reset old neon-night purple theme to blue-steel
    if (!ui._paletteV3) {
      ui._paletteV3 = true;
      changed = true;
      if (!ui.presetId || ui.presetId === "neon-night" || hasPurplePalette(ui.colors) || hasPurplePalette(ui.colorsDark)) {
        ui.presetId = "blue-steel";
        ui.colors = undefined;
        ui.colorsDark = undefined;
      }
    }

    // Ensure color palettes exist (light + dark)
    const def = getDefaultPalettes();
    const preset = getPresetById(ui.presetId || def.presetId, ui.customPresets || []);
    const presetLight = ensureReadable(preset.light);
    const presetDark = ensureReadable(preset.dark);
    if (!ui.presetId || preset.id !== ui.presetId) {
      ui.presetId = preset.id;
      changed = true;
    }
    if (!ui.colors || typeof ui.colors !== "object") {
      ui.colors = { ...presetLight };
      changed = true;
    }
    if (!ui.colorsDark || typeof ui.colorsDark !== "object") {
      ui.colorsDark = { ...presetDark };
      changed = true;
    }

    // Fill missing slots (forward-compatible)
    for (const k of COLOR_KEYS) {
      if (!ui.colors[k] && presetLight[k]) {
        ui.colors[k] = presetLight[k];
        changed = true;
      }
      if (!ui.colorsDark[k] && presetDark[k]) {
        ui.colorsDark[k] = presetDark[k];
        changed = true;
      }
    }

    // Global winRateMode setting (default: "ignore")
    // This replaces the per-account metricsPrefs.winRateBreakEvenMode
    if (!ui.winRateMode || (ui.winRateMode !== "ignore" && ui.winRateMode !== "loss")) {
      ui.winRateMode = "ignore";
      changed = true;
    }

    const tradesIn = Array.isArray(raw.trades) ? raw.trades : [];
    const accountsIn = Array.isArray(raw.accounts) ? raw.accounts : [];
    const propTemplates = Array.isArray(raw.propTemplates) ? raw.propTemplates : [];
    if (!Array.isArray(raw.propTemplates)) changed = true;
    const accById = new Map(accountsIn.map((a) => [a?.id, a]));

    const inferOutcome = (pnl) => {
      const p = clampNum(pnl);
      if (p === 0) return "BE";
      if (p < 0) return "Loss";
      return "Profit";
    };

    const effRiskPct = (alloc, acc) => {
      const raw = alloc?.riskPctOverride;
      const pct = raw === null || raw === undefined || raw === "" ? clampNum(acc?.defaultRiskPct) : clampNum(raw);
      return pct;
    };

    const riskUsdForAlloc = (alloc, acc) => {
      const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
      const pct = effRiskPct(alloc, acc);
      const risk = (eq * pct) / 100;
      return Number.isFinite(risk) ? risk : 0;
    };

    const inferRiskUsd = (alloc, acc) => {
      const snap = clampNum(alloc?.riskUsd);
      if (snap > 0) return snap;
      const rrAbs = Math.abs(clampNum(alloc?.rr));
      const pnlAbs = Math.abs(clampNum(alloc?.pnl));
      if (rrAbs > 0 && pnlAbs > 0) return pnlAbs / rrAbs;
      return riskUsdForAlloc(alloc, acc);
    };

    const normalizeAllocs = (t) => {
      const arr = Array.isArray(t?.allocations) ? t.allocations : null;
      if (arr && arr.length) return arr;
      return [
        {
          id: uid(),
          accountId: t?.accountId || "",
          riskPctOverride: t?.riskPctOverride ?? null,
          rr: clampNum(t?.rr),
          riskUsd: clampNum(t?.riskUsd),
          pnl: clampNum(t?.pnl),
          commission: Math.abs(clampNum(t?.commission)),
        },
      ];
    };

    const applyOutcome = (outcome, a) => {
      // BE: allow user-entered PnL (+/-) for commissions/swaps/execution errors
      if (outcome === "BE") return { ...a, pnl: clampNum(a?.pnl) };
      const pnlAbs = Math.abs(clampNum(a?.pnl));
      const sign = outcome === "Loss" ? -1 : 1;
      return { ...a, pnl: sign * pnlAbs };
    };

    const trades = tradesIn.map((t) => {
      let allocs = normalizeAllocs(t)
        .map((a) => ({
          id: a?.id || uid(),
          accountId: String(a?.accountId || ""),
          riskPctOverride: a?.riskPctOverride === "" || a?.riskPctOverride === undefined ? null : a?.riskPctOverride,
          rr: clampNum(a?.rr),
          riskUsd: clampNum(a?.riskUsd),
          pnl: clampNum(a?.pnl),
          commission: Math.abs(clampNum(a?.commission)),
        }));

      // Keep at least one allocation (even without accountId for trades without account)
      if (!allocs.length) allocs = [{ id: uid(), accountId: "", riskPctOverride: null, rr: 0, pnl: 0, commission: 0 }];

      // Compute netPnL for outcome inference (users expect commission/swap to affect outcome)
      const preNetPnL = allocs.reduce((s, a) => s + clampNum(a.pnl) - Math.abs(clampNum(a.commission)), 0);
      const outcome = t?.outcome || inferOutcome(preNetPnL);

      // Apply outcome sign to PnL.
      allocs = allocs.map((a) => {
        const acc = accById.get(a.accountId);
        const base = applyOutcome(outcome, a);
        // Snapshot riskUsd if missing; keep rr if it exists, otherwise infer from |PnL|/risk.
        const riskUsd = inferRiskUsd(base, acc);
        const rrManual = Math.abs(clampNum(base.rr));
        const rrInferred = riskUsd ? Math.abs(clampNum(base.pnl)) / riskUsd : 0;
        const rr = rrManual > 0 ? rrManual : rrInferred;
        return { ...base, riskUsd, rr };
      });

      // Compute trade.pnl as NET (gross - abs(commission)) so commission is reflected
      const pnl = allocs.reduce((s, a) => s + clampNum(a.pnl) - Math.abs(clampNum(a.commission)), 0);
      const totalRisk = allocs.reduce((s, a) => s + clampNum(a.riskUsd), 0);
      // Trade-level RR is a risk-weighted average of per-allocation RR (independent from PnL sign).
      // Fallback to simple average of RR values if totalRisk=0 (e.g., no-account trades)
      let rr;
      if (totalRisk > 0) {
        rr = allocs.reduce((s, a) => s + clampNum(a.riskUsd) * Math.abs(clampNum(a.rr)), 0) / totalRisk;
      } else {
        const rrValues = allocs.map(a => Math.abs(clampNum(a.rr))).filter(r => r > 0);
        rr = rrValues.length ? rrValues.reduce((s, r) => s + r, 0) / rrValues.length : 0;
      }

      const next = {
        ...t,
        allocations: allocs,
        accountId: allocs[0]?.accountId ?? "",
        riskPctOverride: allocs[0]?.riskPctOverride ?? null,
        pnl,
        rr,
        outcome,
        deletedAt: typeof t?.deletedAt === "number" ? t.deletedAt : null,
      };

      if (
        !Array.isArray(t?.allocations) ||
        next.accountId !== t.accountId ||
        next.pnl !== t.pnl ||
        next.rr !== t.rr ||
        next.outcome !== t.outcome ||
        next.deletedAt !== (typeof t?.deletedAt === "number" ? t.deletedAt : null)
      ) {
        changed = true;
      }
      return next;
    });

    // If account has no currentEquity, initialize it as startingEquity + sum(netPnL) from allocations
    // Net PnL = pnl - abs(commission) to ensure consistent equity tracking
    const pnlByAcc = new Map();
    for (const t of trades) {
      if (isDeleted(t)) continue;
      const allocs = Array.isArray(t.allocations) ? t.allocations : [];
      for (const a of allocs) {
        const id = a.accountId;
        if (!id) continue;
        const netPnl = clampNum(a.pnl) - Math.abs(clampNum(a.commission));
        pnlByAcc.set(id, (pnlByAcc.get(id) ?? 0) + netPnl);
      }
    }

    const accounts = accountsIn.map((a) => {
      let startingEquity = clampNum(a?.startingEquity);
      const defaultRiskPct = clampNum(a?.defaultRiskPct);
      const hasCur = !(a?.currentEquity === undefined || a?.currentEquity === null);
      let currentEquity = hasCur ? clampNum(a.currentEquity) : startingEquity + (pnlByAcc.get(a.id) ?? 0);
      let prop = a?.prop || null;
      if (prop && (prop.templateId || prop.firmId)) {
        const before = JSON.stringify(prop);
        const mapped = prop.templateId ? String(prop.templateId) : mapLegacyPropToTemplateId(prop.firmId, prop.programId);
        if (!mapped) {
          prop = null;
        } else {
          prop = {
            templateId: String(mapped),
            phaseId: String(prop.phaseId || "phase1"),
            size: clampNum(prop.size ?? startingEquity),
            startedAt: Number(prop.startedAt || a?.createdAt || Date.now()),
            autoProgress: prop.autoProgress === undefined ? true : !!prop.autoProgress,
            profitSplitPctOverride: prop.profitSplitPctOverride ?? null,
            previousAccountId: prop.previousAccountId || null,
            nextAccountId: prop.nextAccountId || null,
            rulesOverride: {
              profitTargetPct: prop?.rulesOverride?.profitTargetPct ?? null,
              maxLossPct: prop?.rulesOverride?.maxLossPct ?? null,
              maxDailyLossPct: prop?.rulesOverride?.maxDailyLossPct ?? null,
              minTradingDays: prop?.rulesOverride?.minTradingDays ?? null,
              minDaysMode: prop?.rulesOverride?.minDaysMode ?? null,
              profitableDayMinPct: prop?.rulesOverride?.profitableDayMinPct ?? null,
              maxLossType: prop?.rulesOverride?.maxLossType ?? null,
            },
            autoProgressDone: prop.autoProgressDone || {},
            eval: prop.eval || null,
            payouts: normalizePayouts(prop.payouts),
          };
        }
        if (before !== JSON.stringify(prop)) changed = true;
      }

      // For prop accounts, if startingEquity is 0 or missing, fall back to prop.size.
      // But do NOT overwrite a user-set startingEquity that differs from prop.size,
      // because users may intentionally set a different starting balance (e.g. they
      // started tracking the account after some initial drawdown).
      // Rule thresholds (profit target, max loss, etc.) are always based on prop.size
      // in evaluatePropAccount(), so this does not affect rule evaluation.
      if (prop?.templateId && startingEquity <= 0) {
        const size = clampNum(prop.size);
        if (size > 0) {
          startingEquity = size;
          if (!hasCur) currentEquity = size;
          changed = true;
        }
      }

      if (!hasCur || startingEquity !== a.startingEquity || defaultRiskPct !== a.defaultRiskPct) changed = true;
      const archivedAt = typeof a?.archivedAt === "number" ? a.archivedAt : null;
      const deletedAt = typeof a?.deletedAt === "number" ? a.deletedAt : null;
      if (archivedAt !== a?.archivedAt || deletedAt !== a?.deletedAt) changed = true;
      if ((a?.prop || null) !== prop) changed = true;
      
      // Ensure limits structure exists for future use.
      // We initialize the structure but don't mark it as a migration change
      // to avoid unnecessary saves when loading existing data.
      const limits = a?.limits || {};
      const normalizedLimits = {
        dailyLossPct: limits.dailyLossPct ?? null,
        maxLossPct: limits.maxLossPct ?? null,
        profitTargetPct: limits.profitTargetPct ?? null,
      };
      
      return { ...a, startingEquity, currentEquity, defaultRiskPct, archivedAt, deletedAt, prop, limits: normalizedLimits };
    });
    const librariesIn = raw.libraries ?? { symbols: [], sessions: [], models: [], customTags: [] };
    const symbols = Array.isArray(librariesIn.symbols) ? librariesIn.symbols.map((s) => ({ ...s, deletedAt: typeof s?.deletedAt === "number" ? s.deletedAt : null })) : [];
    const sessions = Array.isArray(librariesIn.sessions) ? librariesIn.sessions.map((s) => ({ ...s, deletedAt: typeof s?.deletedAt === "number" ? s.deletedAt : null })) : [];
    const models = Array.isArray(librariesIn.models) ? librariesIn.models.map((s) => ({ ...s, deletedAt: typeof s?.deletedAt === "number" ? s.deletedAt : null })) : [];
    const customTags = Array.isArray(librariesIn.customTags) ? librariesIn.customTags.map((s) => ({ ...s, deletedAt: typeof s?.deletedAt === "number" ? s.deletedAt : null })) : [];
    if ((librariesIn.symbols?.length ?? 0) !== symbols.length || (librariesIn.sessions?.length ?? 0) !== sessions.length || (librariesIn.models?.length ?? 0) !== models.length || (librariesIn.customTags?.length ?? 0) !== customTags.length) changed = true;
    // If any item missed deletedAt, mark changed
    if (symbols.some((s) => s.deletedAt === null && typeof (librariesIn.symbols||[]).find?.((o) => o.id === s.id)?.deletedAt !== "number")) changed = true;
    if (sessions.some((s) => s.deletedAt === null && typeof (librariesIn.sessions||[]).find?.((o) => o.id === s.id)?.deletedAt !== "number")) changed = true;
    if (models.some((s) => s.deletedAt === null && typeof (librariesIn.models||[]).find?.((o) => o.id === s.id)?.deletedAt !== "number")) changed = true;
    if (customTags.some((s) => s.deletedAt === null && typeof (librariesIn.customTags||[]).find?.((o) => o.id === s.id)?.deletedAt !== "number")) changed = true;
    const libraries = { ...librariesIn, symbols, sessions, models, customTags };

    // Migration: Fix Funding Pips Pro accounts that have 8% default profit targets
    // Funding Pips Pro uses 6% targets by default for Phase 1 and Phase 2
    const migratedAccounts = accounts.map((acc) => {
      if (!acc?.id || isDeleted(acc)) return acc;
      
      // Check if this is a Funding Pips Pro account
      const templateId = acc?.prop?.templateId;
      if (templateId !== "fundingpips_pro") return acc;
      
      // Check if rulesOverride has 8% target (old default) that should be corrected
      const override = acc?.prop?.rulesOverride || {};
      if (override.profitTargetPct === 8) {
        // Reset to null so template default (6%) is used
        const newProp = {
          ...acc.prop,
          rulesOverride: {
            ...override,
            profitTargetPct: null,
          },
        };
        changed = true;
        return { ...acc, prop: newProp };
      }
      
      return acc;
    });

    // Reconciliation: Fix account currentEquity if it doesn't match computed net PnL
    // This ensures existing users' accounts are auto-corrected without data loss
    const reconciledAccounts = migratedAccounts.map((acc) => {
      if (!acc?.id || isDeleted(acc)) return acc;
      
      // Compute expected currentEquity from all non-deleted trade allocations
      let netSum = 0;
      for (const t of trades) {
        if (isDeleted(t)) continue;
        const allocs = Array.isArray(t.allocations) ? t.allocations : [];
        for (const a of allocs) {
          if (a?.accountId === acc.id) {
            netSum += clampNum(a.pnl) - Math.abs(clampNum(a.commission));
          }
        }
      }
      
      const startEq = clampNum(acc.startingEquity);
      const expectedCurrent = startEq + netSum + clampNum(acc.equityCorrection);
      const actualCurrent = clampNum(acc.currentEquity);
      
      // If mismatch > 0.01, fix currentEquity
      if (Math.abs(expectedCurrent - actualCurrent) > 0.01) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[migrateDb] Reconciliation: Account "${acc.name || acc.id}" currentEquity mismatch. ` +
            `Expected: ${expectedCurrent.toFixed(2)}, Actual: ${actualCurrent.toFixed(2)}. Fixing...`
          );
        }
        changed = true;
        return { ...acc, currentEquity: expectedCurrent };
      }
      return acc;
    });

    // ── Backtests migration ──
    if (!Array.isArray(raw.backtests)) {
      raw = { ...raw, backtests: [] };
      changed = true;
    }
    if (!ui.backtests || typeof ui.backtests !== "object") {
      ui.backtests = { activeId: null, showArchived: false, sort: "updatedDesc", query: "" };
      changed = true;
    }
    // Ensure each backtest has required fields
    const migratedBacktests = (raw.backtests || []).map((bt) => {
      let btChanged = false;
      const out = { ...bt };
      if (!Array.isArray(out.trades)) { out.trades = []; btChanged = true; }
      if (!out.createdAt) { out.createdAt = Date.now(); btChanged = true; }
      if (!out.updatedAt) { out.updatedAt = Date.now(); btChanged = true; }
      if (!out.period || typeof out.period !== "object") {
        out.period = { from: "", to: "" };
        btChanged = true;
      }
      if (!Array.isArray(out.symbols)) { out.symbols = []; btChanged = true; }
      if (!Array.isArray(out.timeframes)) { out.timeframes = []; btChanged = true; }
      // Ensure single account exists
      if (!out.account || typeof out.account !== "object" || !out.account.id) {
        out.account = { id: uid(), name: "Backtest Account", initialEquity: out.initialEquity || 10000 };
        btChanged = true;
      }
      // Ensure notes structure
      if (!out.notes || typeof out.notes !== "object") {
        out.notes = { plan: "", description: "" };
        btChanged = true;
      }
      if (btChanged) changed = true;
      return btChanged ? out : bt;
    });
    if (changed && raw.backtests !== migratedBacktests) {
      raw = { ...raw, backtests: migratedBacktests };
    }

    if (!changed) return raw;
    return { ...raw, ui, accounts: reconciledAccounts, trades, libraries, propTemplates };
  };

  useEffect(() => {
    // run once on mount
    setDb((prev) => migrateDb(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-delete items from trash after 30 days
  useEffect(() => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Helper function to filter items older than 30 days
    const filterExpiredItems = (items, changedRef) => {
      return (items ?? []).filter((item) => {
        if (!isDeleted(item)) return true;
        if (now - item.deletedAt > THIRTY_DAYS_MS) {
          changedRef.value = true;
          return false;
        }
        return true;
      });
    };
    
    setDb((prev) => {
      if (!prev) return prev;
      
      const changedRef = { value: false };
      
      const trades = filterExpiredItems(prev.trades, changedRef);
      const accounts = filterExpiredItems(prev.accounts, changedRef);
      const backtests = filterExpiredItems(prev.backtests, changedRef);
      
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const symbols = filterExpiredItems(lib.symbols, changedRef);
      const sessions = filterExpiredItems(lib.sessions, changedRef);
      
      if (!changedRef.value) return prev;
      return { ...prev, trades, accounts, backtests, libraries: { ...lib, symbols, sessions } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ui = db?.ui ?? {};
  const theme = ui.theme ?? "dark";
  const reduceMotion = false;
  const setReduceMotion = () => {}; // UI control removed
  const lang = ui.lang ?? "default";
  const colors = ui.colors;
  const colorsDark = ui.colorsDark;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    const pal = theme === "dark" ? colorsDark : colors;
    applyPalette(pal);
    // setDb is a stable useState setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, colors, colorsDark]);

  useEffect(() => {
    const onKey = (e) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const accounts = db.accounts ?? [];
  const trades = db.trades ?? [];
  const libraries = db.libraries ?? { symbols: [], sessions: [], models: [], customTags: [] };
  
  // Memoize filtered library items to prevent unnecessary rerenders in Pairs/Sessions/Models pages
  const activePairs = useMemo(
    () => (libraries.symbols ?? []).filter((s) => !isDeleted(s)),
    [libraries.symbols]
  );
  const activeSessions = useMemo(
    () => (libraries.sessions ?? []).filter((s) => !isDeleted(s)),
    [libraries.sessions]
  );
  const activeModels = useMemo(
    () => (libraries.models ?? []).filter((m) => !isDeleted(m)),
    [libraries.models]
  );
  const activeCustomTags = useMemo(
    () => (libraries.customTags ?? []).filter((t) => !isDeleted(t)),
    [libraries.customTags]
  );
  
  const documents = db.documents ?? [];
  const docFolders = db.docFolders ?? [];
  const docShares = db.docShares ?? [];

  // -----------------------------
  // Prop automation (evaluation + auto-progression)
  // -----------------------------
  // We keep it deterministic (based on trades + stored equity) to avoid render loops.
  useEffect(() => {
    setDb((prev) => {
      const accs = Array.isArray(prev?.accounts) ? prev.accounts : [];
      const trs = Array.isArray(prev?.trades) ? prev.trades : [];

      const templates = mergePropTemplates(prev?.propTemplates);

      let changed = false;
      let nextAccs = accs;

      const toPrepend = [];

      nextAccs = nextAccs.map((acc) => {
        if (!acc?.prop?.templateId && !acc?.prop?.firmId) return acc;

        // Legacy safety (if a record still has firmId/programId)
        let prop = acc?.prop || null;
        if (prop && !prop.templateId && prop.firmId) {
          const mapped = mapLegacyPropToTemplateId(prop.firmId, prop.programId);
          prop = mapped ? { ...prop, templateId: mapped } : null;
        }
        if (!prop?.templateId) return acc;

        const template = getTemplate(templates, prop.templateId);
        if (!template) return acc;

        // Enforce: payouts only for live/funded phase
        const phaseId = String(prop.phaseId || "phase1");
        const phase = (template.phases || []).find((p) => String(p.id) === phaseId) || template.phases?.[0] || null;
        const isFunded = phase?.kind === "funded";
        const payouts = normalizePayouts(prop.payouts);
        const payoutsSanitized = isFunded ? payouts : [];
        const payoutsChanged = JSON.stringify(payoutsSanitized) !== JSON.stringify(prop.payouts || []);

        const accWithProp = payoutsChanged || prop !== acc.prop ? { ...acc, prop: { ...(prop || {}), payouts: payoutsSanitized } } : acc;

        const evalRes = evaluatePropAccount(accWithProp, trs, templates);
        if (!evalRes) return accWithProp;

        const prevEval = accWithProp?.prop?.eval || null;
        const evalChanged = JSON.stringify(prevEval) !== JSON.stringify(evalRes);

        const desiredStatus = deriveAccountStatusFromProp(accWithProp, evalRes, templates);
        const statusChanged = desiredStatus && desiredStatus !== accWithProp.status;

        let out = accWithProp;
        if (evalChanged || statusChanged || payoutsChanged || prop !== acc.prop) {
          out = {
            ...out,
            status: statusChanged ? desiredStatus : out.status,
            prop: { ...(out.prop || {}), templateId: String(prop.templateId), eval: evalRes, payouts: payoutsSanitized },
          };
          changed = true;
        }

        // Auto progression (create next account once per phase).
        const autoOn = !!out?.prop?.autoProgress;
        const doneMap = out?.prop?.autoProgressDone || {};
        const already = !!doneMap?.[phaseId];
        // Check if next account already exists (linked or in accounts array)
        const hasNextAccountLinked = !!out?.prop?.nextAccountId;

        if (autoOn && evalRes.status === "passed" && !already && !hasNextAccountLinked) {
          const nextPid = getNextPhaseId(template, phaseId);
          if (nextPid) {
            // Check if an account for the next phase already exists
            const nextPhaseExists = nextAccs.some(
              (a) =>
                a.id !== out.id &&
                !isDeleted(a) &&
                a.prop?.templateId === out?.prop?.templateId &&
                String(a.prop?.phaseId) === String(nextPid) &&
                a.prop?.previousAccountId === out.id
            );
            if (nextPhaseExists) {
              // Mark as done without creating duplicate
              out = {
                ...out,
                prop: {
                  ...(out.prop || {}),
                  autoProgressDone: { ...(doneMap || {}), [phaseId]: true },
                },
              };
              changed = true;
              return out;
            }
            const created = createNextPropAccountFrom(out, templates, nextPid);
            if (created) {
              toPrepend.push(created);
              out = {
                ...out,
                prop: {
                  ...(out.prop || {}),
                  isCurrent: false,
                  completedAt: Date.now(),
                  nextAccountId: created.id,
                  autoProgressDone: { ...(doneMap || {}), [phaseId]: true },
                },
              };
              changed = true;
            }
          } else {
            out = {
              ...out,
              prop: {
                ...(out.prop || {}),
                autoProgressDone: { ...(doneMap || {}), [phaseId]: true },
              },
            };
            changed = true;
          }
        }
        return out;
      });

      if (toPrepend.length) {
        nextAccs = [...toPrepend, ...nextAccs];
        changed = true;
      }

      if (!changed) return prev;
      return { ...prev, accounts: nextAccs };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db?.trades, db?.accounts, db?.propTemplates]);

  const setTheme = (t) => setDb((prev) => ({ ...prev, ui: { ...(prev.ui ?? {}), theme: t } }));
  const setLang = useCallback((l) => setDb((prev) => ({ ...prev, ui: { ...(prev.ui ?? {}), lang: l } })), []);
  const setUiPatch = (patch) =>
    setDb((prev) => ({ ...prev, ui: { ...(prev.ui ?? {}), ...(patch || {}) } }));

  const setPropTemplates = (nextTemplates) =>
    setDb((prev) => ({ ...prev, propTemplates: Array.isArray(nextTemplates) ? nextTemplates : [] }));

  // -----------------------------
  // Accounts
  // -----------------------------
  const upsertAccount = (acc) => {
    // NOTE: must be mutable because we may normalize/augment the record
    // (e.g. linking placeholder phases for prop accounts).
    let item = {
      ...acc,
      id: acc.id || uid(),
      startingEquity: clampNum(acc?.startingEquity),
      currentEquity: clampNum(acc?.currentEquity ?? acc?.startingEquity),
      equityCorrection: clampNum(acc?.equityCorrection),
      defaultRiskPct: clampNum(acc?.defaultRiskPct) || 0,
      archivedAt: typeof acc?.archivedAt === "number" ? acc.archivedAt : null,
      deletedAt: typeof acc?.deletedAt === "number" ? acc.deletedAt : null,
      updatedAt: Date.now(),
    };
    setDb((prev) => {
      const list = prev.accounts ?? [];

      // Auto-create missing earlier prop phases (if user adds Phase 2/Funded directly)
      const templates = mergePropTemplates(prev?.propTemplates);
      let toPrepend = [];
      if (item?.prop?.templateId) {
        const tpl = getTemplate(templates, item.prop.templateId);
        const phases = Array.isArray(tpl?.phases) ? tpl.phases : [];
        const phaseId = String(item.prop.phaseId || phases[0]?.id || 'phase1');
        const idxPhase = getPhaseIndex(tpl, phaseId);
        const hasPrev = !!item?.prop?.previousAccountId;
        // Check if the current phase being added is a funded/live account
        const currentPhase = getPhase(tpl, phaseId);
        const isFunded = currentPhase?.kind === "funded";
        if (tpl && idxPhase > 0 && !hasPrev) {
          const size = clampNum(item?.prop?.size ?? item?.startingEquity);
          const currency = String(tpl.currency || item?.currency || '$');
          const baseStartedAt = typeof item?.prop?.startedAt === 'number' ? item.prop.startedAt : (typeof item?.createdAt === 'number' ? item.createdAt : Date.now());
          let prevId = null;
          for (let i = 0; i < idxPhase; i++) {
            const ph = phases[i];
            if (!ph) continue;
            const id = uid();
            const nameBase = `${tpl.firm || 'Prop'} ${size}${currency === '$' ? '' : ''}`.trim();
            const name = `${nameBase}${ph?.label ? ` • ${ph.label}` : ''}`.trim();
            const placeholder = {
              id,
              name,
              currency,
              startingEquity: size,
              currentEquity: size,
              defaultRiskPct: 0,
              avatar: item?.avatar || { type: 'emoji', emoji: '💼' },
              color: item?.color || '#6366f1',
              createdAt: baseStartedAt - (idxPhase - i) * 1000,
              status: phaseStatusLabel(tpl, ph.id, []),
              notes: '',
              // If adding a funded/live account directly, archive the placeholder phases
              archivedAt: isFunded ? Date.now() : null,
              prop: {
                templateId: tpl.id,
                phaseId: ph.id,
                size,
                startedAt: baseStartedAt,
                isCurrent: false,
                completedAt: null,
                autoProgress: true,
                rulesOverride: {},
                profitSplitPctOverride: item?.prop?.profitSplitPctOverride ?? null,
                previousAccountId: prevId,
                nextAccountId: null,
                autoProgressDone: {},
                eval: null,
                payouts: [],
                isPlaceholder: true,
              },
            };
            if (prevId) {
              // link previous placeholder -> this placeholder
              const prevIdx = toPrepend.findIndex((a) => a.id === prevId);
              if (prevIdx >= 0) {
                const prevAcc = toPrepend[prevIdx];
                toPrepend[prevIdx] = {
                  ...prevAcc,
                  prop: { ...(prevAcc.prop || {}), nextAccountId: id },
                };
              }
            }
            toPrepend.push(placeholder);
            prevId = id;
          }
          // Link last placeholder to the real account
          item = {
            ...item,
            prop: { ...(item.prop || {}), previousAccountId: prevId, isCurrent: true, completedAt: item?.prop?.completedAt ?? null },
          };
          if (prevId) {
            const lastIdx = toPrepend.findIndex((a) => a.id === prevId);
            if (lastIdx >= 0) {
              const last = toPrepend[lastIdx];
              toPrepend[lastIdx] = { ...last, prop: { ...(last.prop || {}), nextAccountId: item.id } };
            }
          }
        } else if (tpl) {
          item = { ...item, prop: { ...(item.prop || {}), isCurrent: true } };
        }
      }

      const base = toPrepend.length ? [...toPrepend, ...list] : list;
      const idx = base.findIndex((a) => a.id === item.id);
      const next = idx >= 0 ? base.map((a, i) => (i === idx ? { ...a, ...item } : a)) : [item, ...base];
      return { ...prev, accounts: next };
    });
  };

  const archiveAccount = (id) =>
    setDb((prev) => ({
      ...prev,
      accounts: (prev.accounts ?? []).map((a) =>
        a.id === id ? { ...a, archivedAt: Date.now(), deletedAt: null, updatedAt: Date.now() } : a
      ),
    }));

  const unarchiveAccount = (id) =>
    setDb((prev) => ({
      ...prev,
      accounts: (prev.accounts ?? []).map((a) =>
        a.id === id ? { ...a, archivedAt: null, updatedAt: Date.now() } : a
      ),
    }));

  const trashAccount = (id) =>
    setDb((prev) => ({
      ...prev,
      accounts: (prev.accounts ?? []).map((a) =>
        a.id === id ? { ...a, deletedAt: Date.now(), archivedAt: null, updatedAt: Date.now() } : a
      ),
    }));

  const restoreAccount = (id) =>
    setDb((prev) => {
      const list = prev.accounts ?? [];
      const hit = list.find((a) => a.id === id);
      if (!hit) return prev;

      // Recompute equity from non-deleted trades allocations using net PnL
      const netPnl = (prev.trades ?? [])
        .filter((t) => !isDeleted(t))
        .flatMap((t) => (Array.isArray(t.allocations) ? t.allocations : []))
        .filter((a) => a?.accountId === id)
        .reduce((s, a) => s + clampNum(a?.pnl) - Math.abs(clampNum(a?.commission)), 0);

      const startingEquity = clampNum(hit.startingEquity);
      const currentEquity = startingEquity + netPnl;

      const next = list.map((a) =>
        a.id === id ? { ...a, deletedAt: null, archivedAt: null, startingEquity, currentEquity, equityCorrection: 0, updatedAt: Date.now() } : a
      );
      return { ...prev, accounts: next };
    });

  const deleteAccountForever = (id) =>
    setDb((prev) => ({
      ...prev,
      accounts: (prev.accounts ?? []).filter((a) => a.id !== id),
    }));

  // -----------------------------
  // Trade ↔ Document Link Sync
  // -----------------------------
  /**
   * Synchronizes bidirectional links between trades and documents.
   * When a trade's docIds changes or a document's linkedTradeIds changes,
   * this function ensures both sides stay in sync.
   * 
   * Note: This function is designed to be called with either a trade OR a document,
   * not both at the same time. Each upsert function calls this separately with 
   * the relevant entity that was just updated.
   * 
   * @param {Object} db - Current database state
   * @param {Object} options - Sync options
   * @param {Object} options.trade - Trade that was just updated (provide one of trade/document)
   * @param {Object} options.document - Document that was just updated (provide one of trade/document)
   * @returns {Object} Updated db state with synced links
   */
  const syncTradeDocLinks = (db, { trade, document }) => {
    let trades = [...(db.trades ?? [])];
    let documents = [...(db.documents ?? [])];
    
    if (trade) {
      // Trade was updated - sync its docIds to corresponding documents' linkedTradeIds
      const tradeIdx = trades.findIndex(t => t.id === trade.id);
      const currentTrade = tradeIdx >= 0 ? trades[tradeIdx] : trade;
      const newDocIds = Array.isArray(currentTrade.docIds) ? [...new Set(currentTrade.docIds)] : [];
      
      // Find documents that should have this trade linked (in newDocIds)
      // and documents that should NOT have this trade linked (not in newDocIds)
      documents = documents.map(doc => {
        const hasLink = (doc.linkedTradeIds || []).includes(trade.id);
        const shouldHaveLink = newDocIds.includes(doc.id);
        
        if (shouldHaveLink && !hasLink) {
          // Add trade to document's linkedTradeIds
          return {
            ...doc,
            linkedTradeIds: [...new Set([...(doc.linkedTradeIds || []), trade.id])]
          };
        } else if (!shouldHaveLink && hasLink) {
          // Remove trade from document's linkedTradeIds
          return {
            ...doc,
            linkedTradeIds: (doc.linkedTradeIds || []).filter(id => id !== trade.id)
          };
        }
        return doc;
      });
    }
    
    if (document) {
      // Document was updated - sync its linkedTradeIds to corresponding trades' docIds
      const docIdx = documents.findIndex(d => d.id === document.id);
      const currentDoc = docIdx >= 0 ? documents[docIdx] : document;
      const newLinkedTradeIds = Array.isArray(currentDoc.linkedTradeIds) ? [...new Set(currentDoc.linkedTradeIds)] : [];
      
      // Find trades that should have this document linked (in newLinkedTradeIds)
      // and trades that should NOT have this document linked (not in newLinkedTradeIds)
      trades = trades.map(tr => {
        const hasLink = (tr.docIds || []).includes(document.id);
        const shouldHaveLink = newLinkedTradeIds.includes(tr.id);
        
        if (shouldHaveLink && !hasLink) {
          // Add document to trade's docIds
          return {
            ...tr,
            docIds: [...new Set([...(tr.docIds || []), document.id])]
          };
        } else if (!shouldHaveLink && hasLink) {
          // Remove document from trade's docIds
          return {
            ...tr,
            docIds: (tr.docIds || []).filter(id => id !== document.id)
          };
        }
        return tr;
      });
    }
    
    return { ...db, trades, documents };
  };

  // -----------------------------
  // Trade ↔ Idea Link Sync (async - ideas are server-side)
  // -----------------------------
  /**
   * Synchronizes bidirectional links between trades and ideas.
   * When a trade's ideaIds changes, this function updates the corresponding ideas' linked_trade_ids.
   * Since ideas are stored server-side, this performs API calls.
   * 
   * @param {Object} trade - Trade that was just updated
   * @param {string[]} prevIdeaIds - Previous ideaIds array (before update)
   */
  const syncTradeIdeaLinks = useCallback(async (trade, prevIdeaIds = []) => {
    if (!trade?.id) return;
    
    const newIdeaIds = Array.isArray(trade.ideaIds) ? [...new Set(trade.ideaIds)] : [];
    const prevIds = Array.isArray(prevIdeaIds) ? [...new Set(prevIdeaIds)] : [];
    
    // Find ideas that need to be updated
    const toAdd = newIdeaIds.filter(id => !prevIds.includes(id));
    const toRemove = prevIds.filter(id => !newIdeaIds.includes(id));
    
    // Update ideas that should have this trade linked
    for (const ideaId of toAdd) {
      try {
        const idea = ideas.find(i => String(i.id) === String(ideaId));
        if (idea) {
          const currentLinkedTrades = Array.isArray(idea.linked_trade_ids) ? idea.linked_trade_ids 
            : (typeof idea.linked_trade_ids === 'string' ? JSON.parse(idea.linked_trade_ids || '[]') : []);
          if (!currentLinkedTrades.includes(trade.id)) {
            await ideasApi.update(ideaId, {
              linkedTradeIds: [...new Set([...currentLinkedTrades, trade.id])]
            });
          }
        }
      } catch (e) {
        console.error(`[syncTradeIdeaLinks] Failed to add trade ${trade.id} to idea ${ideaId}:`, e);
      }
    }
    
    // Update ideas that should NOT have this trade linked
    for (const ideaId of toRemove) {
      try {
        const idea = ideas.find(i => String(i.id) === String(ideaId));
        if (idea) {
          const currentLinkedTrades = Array.isArray(idea.linked_trade_ids) ? idea.linked_trade_ids 
            : (typeof idea.linked_trade_ids === 'string' ? JSON.parse(idea.linked_trade_ids || '[]') : []);
          if (currentLinkedTrades.includes(trade.id)) {
            await ideasApi.update(ideaId, {
              linkedTradeIds: currentLinkedTrades.filter(id => id !== trade.id)
            });
          }
        }
      } catch (e) {
        console.error(`[syncTradeIdeaLinks] Failed to remove trade ${trade.id} from idea ${ideaId}:`, e);
      }
    }
    
    // Refresh ideas list if any updates were made
    if (toAdd.length > 0 || toRemove.length > 0) {
      loadIdeas();
    }
  }, [ideas, loadIdeas]);

  /**
   * Sync idea's linkedTradeIds to trades' ideaIds (reverse direction)
   * Called when an idea is saved with updated linkedTradeIds
   * 
   * @param {Object} idea - Idea that was just updated  
   * @param {string[]} prevLinkedTradeIds - Previous linkedTradeIds array
   */
  const syncIdeaTradeLinks = useCallback((idea, prevLinkedTradeIds = []) => {
    if (!idea?.id) return;
    
    const ideaId = String(idea.id);
    const newLinkedTradeIds = Array.isArray(idea.linkedTradeIds) 
      ? [...new Set(idea.linkedTradeIds)] 
      : (Array.isArray(idea.linked_trade_ids) 
        ? (typeof idea.linked_trade_ids === 'string' ? JSON.parse(idea.linked_trade_ids || '[]') : idea.linked_trade_ids)
        : []);
    const prevIds = Array.isArray(prevLinkedTradeIds) ? [...new Set(prevLinkedTradeIds)] : [];
    
    // Find trades that need to be updated
    const toAdd = newLinkedTradeIds.filter(id => !prevIds.includes(id));
    const toRemove = prevIds.filter(id => !newLinkedTradeIds.includes(id));
    
    if (toAdd.length === 0 && toRemove.length === 0) return;
    
    setDb((prev) => {
      let trades = [...(prev.trades ?? [])];
      
      // Add idea to trades that should have it linked
      for (const tradeId of toAdd) {
        trades = trades.map(tr => {
          if (tr.id !== tradeId) return tr;
          const currentIdeaIds = tr.ideaIds || [];
          if (currentIdeaIds.includes(ideaId)) return tr;
          return { ...tr, ideaIds: [...new Set([...currentIdeaIds, ideaId])] };
        });
      }
      
      // Remove idea from trades that should NOT have it linked
      for (const tradeId of toRemove) {
        trades = trades.map(tr => {
          if (tr.id !== tradeId) return tr;
          const currentIdeaIds = tr.ideaIds || [];
          if (!currentIdeaIds.includes(ideaId)) return tr;
          return { ...tr, ideaIds: currentIdeaIds.filter(id => id !== ideaId) };
        });
      }
      
      return { ...prev, trades };
    });
  }, [setDb]);

// -----------------------------
  // Trades
  // -----------------------------
  const upsertTrade = (trade) => {
    // Capture prev ideaIds for sync (will be looked up inside setDb)
    let prevIdeaIds = [];
    
    const normalizeAllocs = (t) => {
      const arr = Array.isArray(t?.allocations) ? t.allocations : null;
      if (arr && arr.length) return arr;
      return [
        {
          id: uid(),
          accountId: t?.accountId || "",
          riskPctOverride: t?.riskPctOverride ?? null,
          rr: clampNum(t?.rr),
          riskUsd: clampNum(t?.riskUsd),
          pnl: clampNum(t?.pnl),
          commission: Math.abs(clampNum(t?.commission)),
        },
      ];
    };

    // Sum net PnL (pnl - abs(commission)) per account for equity tracking
    const sumByAcc = (allocs) => {
      const m = new Map();
      for (const a of allocs || []) {
        const id = a?.accountId;
        if (!id) continue;
        const netPnl = clampNum(a?.pnl) - Math.abs(clampNum(a?.commission));
        m.set(id, (m.get(id) ?? 0) + netPnl);
      }
      return m;
    };

    let allocs = normalizeAllocs(trade)
      .map((a) => ({
        id: a?.id || uid(),
        accountId: String(a?.accountId || ""),
        riskPctOverride: a?.riskPctOverride === "" || a?.riskPctOverride === undefined ? null : a?.riskPctOverride,
        pnl: clampNum(a?.pnl),
        riskUsd: clampNum(a?.riskUsd),
        // RR is user-controlled and independent from PnL.
        rr: Math.abs(clampNum(a?.rr)),
        commission: Math.abs(clampNum(a?.commission)),
      }));

    // Ensure at least one allocation exists (even without accountId)
    if (!allocs.length) allocs = [{ id: uid(), accountId: "", riskPctOverride: null, rr: 0, riskUsd: 0, pnl: 0, commission: 0 }];

    // Use netPnL for outcome inference so commission affects outcome
    const preNetPnL = allocs.reduce((s, a) => s + clampNum(a.pnl) - Math.abs(clampNum(a.commission)), 0);
    const inferred = preNetPnL === 0 ? "BE" : preNetPnL < 0 ? "Loss" : "Profit";
    const outcome = trade?.outcome || inferred;

    // Apply outcome sign normalization: BE allows +/- PnL; Loss forces negative; Profit forces positive
    allocs = allocs.map((a) => {
      // BE: allow user-entered PnL (+/-) for commissions/swaps/execution errors
      if (outcome === "BE") return { ...a, pnl: clampNum(a.pnl) };
      const pnlAbs = Math.abs(clampNum(a.pnl));
      const sign = outcome === "Loss" ? -1 : 1;
      return { ...a, pnl: sign * pnlAbs };
    });

    // Compute trade.pnl as NET (gross - abs(commission)) so commission is reflected
    const pnl = allocs.reduce((s, a) => s + clampNum(a.pnl) - Math.abs(clampNum(a.commission)), 0);
    const totalRisk = allocs.reduce((s, a) => s + clampNum(a.riskUsd), 0);
    // Trade-level RR is a risk-weighted average of allocation RR values (if risk snapshots exist).
    // Fallback to simple average of RR values if totalRisk=0 (e.g., no-account trades)
    let rr;
    if (totalRisk > 0) {
      rr = allocs.reduce((s, a) => s + clampNum(a.riskUsd) * Math.abs(clampNum(a.rr)), 0) / totalRisk;
    } else {
      const rrValues = allocs.map(a => Math.abs(clampNum(a.rr))).filter(r => r > 0);
      rr = rrValues.length ? rrValues.reduce((s, r) => s + r, 0) / rrValues.length : 0;
    }

    const item = {
      ...trade,
      id: trade.id || uid(),
      deletedAt: typeof trade?.deletedAt === "number" ? trade.deletedAt : null,
      allocations: allocs,
      accountId: allocs[0]?.accountId ?? "",
      riskPctOverride: allocs[0]?.riskPctOverride ?? null,
      outcome,
      pnl,
      rr,
    };

    setDb((prev) => {
      const accById = new Map((prev.accounts ?? []).map((a) => [a?.id, a]));

      const effRiskPct = (alloc, acc) => {
        const raw = alloc?.riskPctOverride;
        return raw === null || raw === undefined || raw === "" ? clampNum(acc?.defaultRiskPct) : clampNum(raw);
      };

      const riskUsdForAlloc = (alloc, acc) => {
        const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
        const pct = effRiskPct(alloc, acc);
        const risk = (eq * pct) / 100;
        return Number.isFinite(risk) ? risk : 0;
      };

      const list = prev.trades ?? [];
      const idx = list.findIndex((t) => t.id === item.id);
      const prevTrade = idx >= 0 ? list[idx] : null;
      
      // Capture prev ideaIds for async sync
      prevIdeaIds = prevTrade?.ideaIds || [];

      // Snapshot riskUsd if missing, but KEEP user-defined RR (independent from PnL).
      // For no-account allocations: infer riskUsd from |pnl|/|rr| if both are available
      const allocsFixed = (item.allocations || []).map((a) => {
        const acc = accById.get(a.accountId);
        const rrAbs = Math.abs(clampNum(a?.rr));
        const pnlAbs = Math.abs(clampNum(a?.pnl));
        let riskUsd = clampNum(a?.riskUsd);
        
        // Infer riskUsd if missing: from pnl/rr for no-account, or from equity for with-account
        if (riskUsd <= 0) {
          if (rrAbs > 0 && pnlAbs > 0) {
            // Infer from pnl and rr: risk = |pnl| / |rr|
            riskUsd = pnlAbs / rrAbs;
          } else if (a.accountId) {
            // Infer from account equity
            riskUsd = riskUsdForAlloc(a, acc);
          }
          // else: keep riskUsd = 0 for no-account without pnl/rr
        }
        
        const rr = rrAbs;
        return { ...a, riskUsd, rr };
      });

      // Compute trade.pnl as NET (gross - abs(commission)) so commission is reflected
      const pnlFixed = allocsFixed.reduce((s, a) => s + clampNum(a?.pnl) - Math.abs(clampNum(a?.commission)), 0);
      const totalRiskFixed = allocsFixed.reduce((s, a) => s + clampNum(a?.riskUsd), 0);
      // Fallback to simple average of RR values if totalRiskFixed=0 (e.g., no-account trades)
      let rrFixed;
      if (totalRiskFixed > 0) {
        rrFixed = allocsFixed.reduce((s, a) => s + clampNum(a?.riskUsd) * Math.abs(clampNum(a?.rr)), 0) / totalRiskFixed;
      } else {
        const rrValues = allocsFixed.map(a => Math.abs(clampNum(a?.rr))).filter(r => r > 0);
        rrFixed = rrValues.length ? rrValues.reduce((s, r) => s + r, 0) / rrValues.length : 0;
      }

      const itemFixed = { ...item, allocations: allocsFixed, pnl: pnlFixed, rr: rrFixed };

      const nextTrades = idx >= 0 ? list.map((t, i) => (i === idx ? itemFixed : t)) : [itemFixed, ...list];

      let nextAccounts = prev.accounts ?? [];

      const oldBy = prevTrade ? sumByAcc(prevTrade.allocations || []) : new Map();
      const newBy = sumByAcc(itemFixed.allocations || []);
      const ids = new Set([...oldBy.keys(), ...newBy.keys()]);
      for (const id of ids) {
        const delta = (newBy.get(id) ?? 0) - (oldBy.get(id) ?? 0);
        if (!delta) continue;
        nextAccounts = (nextAccounts ?? []).map((a) =>
          a.id === id
            ? { ...a, currentEquity: clampNum(a.currentEquity ?? a.startingEquity) + clampNum(delta) }
            : a
        );
      }

      // Sync trade-document bidirectional links
      const baseResult = { ...prev, trades: nextTrades, accounts: nextAccounts };
      return syncTradeDocLinks(baseResult, { trade: itemFixed });
    });
    
    // Async: Sync trade-idea bidirectional links (ideas are server-side)
    const newIdeaIds = trade.ideaIds || [];
    if (trade.id && (newIdeaIds.length > 0 || prevIdeaIds.length > 0)) {
      syncTradeIdeaLinks({ ...trade, ideaIds: newIdeaIds }, prevIdeaIds);
    }
  };

  const trashTrade = (id) =>
    setDb((prev) => {
      const list = prev.trades ?? [];
      const idx = list.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const hit = list[idx];
      if (isDeleted(hit)) return prev;

      const allocs = Array.isArray(hit?.allocations)
        ? hit.allocations
        : hit
        ? [{ accountId: hit.accountId, pnl: hit.pnl, commission: Math.abs(clampNum(hit.commission)) }]
        : [];

      let nextAccounts = prev.accounts ?? [];
      for (const a of allocs) {
        if (!a?.accountId) continue;
        // Use net PnL (pnl - abs(commission)) for consistent equity tracking
        const netDelta = clampNum(a?.pnl) - Math.abs(clampNum(a?.commission));
        if (!netDelta) continue;
        nextAccounts = (nextAccounts ?? []).map((x) =>
          x.id === a.accountId
            ? { ...x, currentEquity: clampNum(x.currentEquity ?? x.startingEquity) - netDelta }
            : x
        );
      }

      const now = Date.now();
      const nextTrades = list.map((t, i) => (i === idx ? { ...t, deletedAt: now, updatedAt: now } : t));
      return { ...prev, trades: nextTrades, accounts: nextAccounts };
    });

  /**
   * Bulk delete multiple trades at once (move to trash).
   * This function marks all selected trades as deleted and rolls back their net PnL
   * from the associated accounts to maintain accurate equity tracking.
   * 
   * @param {string[]} ids - Array of trade IDs to delete
   */
  const trashTradesBulk = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    
    setDb((prev) => {
      const list = prev.trades ?? [];
      let nextAccounts = prev.accounts ?? [];
      const idsSet = new Set(ids);
      
      // Rollback net PnL for all trades being trashed
      for (const id of ids) {
        const hit = list.find((t) => t.id === id);
        if (!hit || isDeleted(hit)) continue;
        
        const allocs = Array.isArray(hit?.allocations)
          ? hit.allocations
          : hit
          ? [{ accountId: hit.accountId, pnl: hit.pnl, commission: Math.abs(clampNum(hit.commission)) }]
          : [];
        
        for (const a of allocs) {
          if (!a?.accountId) continue;
          // Use net PnL (pnl - abs(commission)) for consistent equity tracking
          const netDelta = clampNum(a?.pnl) - Math.abs(clampNum(a?.commission));
          if (!netDelta) continue;
          nextAccounts = nextAccounts.map((x) =>
            x.id === a.accountId
              ? { ...x, currentEquity: clampNum(x.currentEquity ?? x.startingEquity) - netDelta }
              : x
          );
        }
      }
      
      // Mark all selected trades as deleted
      const deletedNow = Date.now();
      const nextTrades = list.map((t) =>
        idsSet.has(t.id) && t.deletedAt == null ? { ...t, deletedAt: deletedNow, updatedAt: deletedNow } : t
      );
      
      return { ...prev, trades: nextTrades, accounts: nextAccounts };
    });
  };

  const restoreTrade = (id) =>
    setDb((prev) => {
      const list = prev.trades ?? [];
      const idx = list.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const hit = list[idx];
      if (!isDeleted(hit)) return prev;

      const allocs = Array.isArray(hit?.allocations)
        ? hit.allocations
        : hit
        ? [{ accountId: hit.accountId, pnl: hit.pnl, commission: Math.abs(clampNum(hit.commission)) }]
        : [];

      let nextAccounts = prev.accounts ?? [];
      for (const a of allocs) {
        if (!a?.accountId) continue;
        // Use net PnL (pnl - abs(commission)) for consistent equity tracking
        const netDelta = clampNum(a?.pnl) - Math.abs(clampNum(a?.commission));
        if (!netDelta) continue;
        nextAccounts = (nextAccounts ?? []).map((x) =>
          x.id === a.accountId
            ? { ...x, currentEquity: clampNum(x.currentEquity ?? x.startingEquity) + netDelta }
            : x
        );
      }

      const nextTrades = list.map((t, i) => (i === idx ? { ...t, deletedAt: null, updatedAt: Date.now() } : t));
      return { ...prev, trades: nextTrades, accounts: nextAccounts };
    });

  const deleteTradeForever = (id) =>
    setDb((prev) => {
      const list = prev.trades ?? [];
      const hit = list.find((t) => t.id === id);
      if (!hit) return prev;

      // If trade isn't in trash yet, first rollback its net PnL from accounts.
      let nextAccounts = prev.accounts ?? [];
      if (!isDeleted(hit)) {
        const allocs = Array.isArray(hit?.allocations)
          ? hit.allocations
          : hit
          ? [{ accountId: hit.accountId, pnl: hit.pnl, commission: Math.abs(clampNum(hit.commission)) }]
          : [];
        for (const a of allocs) {
          if (!a?.accountId) continue;
          // Use net PnL (pnl - abs(commission)) for consistent equity tracking
          const netDelta = clampNum(a?.pnl) - Math.abs(clampNum(a?.commission));
          if (!netDelta) continue;
          nextAccounts = (nextAccounts ?? []).map((x) =>
            x.id === a.accountId
              ? { ...x, currentEquity: clampNum(x.currentEquity ?? x.startingEquity) - netDelta }
              : x
          );
        }
      }

      const nextTrades = list.filter((t) => t.id !== id);
      return { ...prev, trades: nextTrades, accounts: nextAccounts };
    });


  // -----------------------------
  // Libraries (Pairs / Sessions)
  // -----------------------------
  // Libraries (Pairs / Sessions)
  // -----------------------------
  const upsertSymbol = useCallback((sym) => {
    const item = { 
      ...sym, 
      id: sym.id || uid(), 
      deletedAt: null,
      updatedAt: Date.now(),
      createdAt: sym.createdAt || Date.now()
    };
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const list = lib.symbols ?? [];
      const idx = list.findIndex((x) => x.id === item.id);
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? { ...x, ...item } : x)) : [item, ...list];
      return { ...prev, libraries: { ...lib, symbols: next } };
    });
  }, [setDb]);

  const trashSymbol = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const list = lib.symbols ?? [];
      const now = Date.now();
      return {
        ...prev,
        libraries: { ...lib, symbols: list.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x)) },
      };
    }), [setDb]);

  const restoreSymbol = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const list = lib.symbols ?? [];
      return {
        ...prev,
        libraries: { ...lib, symbols: list.map((x) => (x.id === id ? { ...x, deletedAt: null, updatedAt: Date.now() } : x)) },
      };
    }), [setDb]);

  const deleteSymbolForever = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      return { ...prev, libraries: { ...lib, symbols: (lib.symbols ?? []).filter((x) => x.id !== id) } };
    }), [setDb]);

  const reorderSymbols = useCallback((nextActive) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const all = lib.symbols ?? [];
      const activeIds = new Set((nextActive ?? []).map((x) => x.id));
      const rest = all.filter((x) => !activeIds.has(x.id));
      const newSymbols = [...(nextActive ?? []), ...rest];
      // Skip update if order hasn't actually changed
      if (newSymbols.length === all.length && newSymbols.every((s, i) => s.id === all[i]?.id)) return prev;
      return { ...prev, libraries: { ...lib, symbols: newSymbols } };
    }), [setDb]);

  const upsertSession = useCallback((ses) => {
    const item = { 
      ...ses, 
      id: ses.id || uid(), 
      deletedAt: null,
      updatedAt: Date.now(),
      createdAt: ses.createdAt || Date.now()
    };
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const list = lib.sessions ?? [];
      const idx = list.findIndex((x) => x.id === item.id);
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? { ...x, ...item } : x)) : [item, ...list];
      return { ...prev, libraries: { ...lib, sessions: next } };
    });
  }, [setDb]);

  const trashSession = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const list = lib.sessions ?? [];
      const now = Date.now();
      return {
        ...prev,
        libraries: { ...lib, sessions: list.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x)) },
      };
    }), [setDb]);

  const restoreSession = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const list = lib.sessions ?? [];
      return {
        ...prev,
        libraries: { ...lib, sessions: list.map((x) => (x.id === id ? { ...x, deletedAt: null, updatedAt: Date.now() } : x)) },
      };
    }), [setDb]);

  const deleteSessionForever = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      return { ...prev, libraries: { ...lib, sessions: (lib.sessions ?? []).filter((x) => x.id !== id) } };
    }), [setDb]);

  const reorderSessions = useCallback((nextActive) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [] };
      const all = lib.sessions ?? [];
      const activeIds = new Set((nextActive ?? []).map((x) => x.id));
      const rest = all.filter((x) => !activeIds.has(x.id));
      const newSessions = [...(nextActive ?? []), ...rest];
      // Skip update if order hasn't actually changed
      if (newSessions.length === all.length && newSessions.every((s, i) => s.id === all[i]?.id)) return prev;
      return { ...prev, libraries: { ...lib, sessions: newSessions } };
    }), [setDb]);

  // -----------------------------
  // Models (trading models/strategies)
  // -----------------------------
  const upsertModel = useCallback((mdl) => {
    const item = { 
      ...mdl, 
      id: mdl.id || uid(), 
      deletedAt: null,
      updatedAt: Date.now(),
      createdAt: mdl.createdAt || Date.now()
    };
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [] };
      const list = lib.models ?? [];
      const idx = list.findIndex((x) => x.id === item.id);
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? { ...x, ...item } : x)) : [item, ...list];
      return { ...prev, libraries: { ...lib, models: next } };
    });
  }, [setDb]);

  const trashModel = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [] };
      const list = lib.models ?? [];
      const now = Date.now();
      return {
        ...prev,
        libraries: { ...lib, models: list.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x)) },
      };
    }), [setDb]);

  const restoreModel = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [] };
      const list = lib.models ?? [];
      return {
        ...prev,
        libraries: { ...lib, models: list.map((x) => (x.id === id ? { ...x, deletedAt: null, updatedAt: Date.now() } : x)) },
      };
    }), [setDb]);

  const deleteModelForever = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [] };
      return { ...prev, libraries: { ...lib, models: (lib.models ?? []).filter((x) => x.id !== id) } };
    }), [setDb]);

  const reorderModels = useCallback((nextActive) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [] };
      const all = lib.models ?? [];
      const activeIds = new Set((nextActive ?? []).map((x) => x.id));
      const rest = all.filter((x) => !activeIds.has(x.id));
      const newModels = [...(nextActive ?? []), ...rest];
      // Skip update if order hasn't actually changed
      if (newModels.length === all.length && newModels.every((s, i) => s.id === all[i]?.id)) return prev;
      return { ...prev, libraries: { ...lib, models: newModels } };
    }), [setDb]);

  // -----------------------------
  // Custom Tags
  // -----------------------------
  const upsertCustomTag = useCallback((tag) => {
    const item = { 
      ...tag, 
      id: tag.id || uid(), 
      deletedAt: null,
      updatedAt: Date.now(),
      createdAt: tag.createdAt || Date.now()
    };
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [], customTags: [] };
      const list = lib.customTags ?? [];
      const idx = list.findIndex((x) => x.id === item.id);
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? { ...x, ...item } : x)) : [item, ...list];
      return { ...prev, libraries: { ...lib, customTags: next } };
    });
  }, [setDb]);

  const trashCustomTag = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [], customTags: [] };
      const list = lib.customTags ?? [];
      const now = Date.now();
      return {
        ...prev,
        libraries: { ...lib, customTags: list.map((x) => (x.id === id ? { ...x, deletedAt: now, updatedAt: now } : x)) },
      };
    }), [setDb]);

  const restoreCustomTag = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [], customTags: [] };
      const list = lib.customTags ?? [];
      return {
        ...prev,
        libraries: { ...lib, customTags: list.map((x) => (x.id === id ? { ...x, deletedAt: null, updatedAt: Date.now() } : x)) },
      };
    }), [setDb]);

  const deleteCustomTagForever = useCallback((id) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [], customTags: [] };
      return { ...prev, libraries: { ...lib, customTags: (lib.customTags ?? []).filter((x) => x.id !== id) } };
    }), [setDb]);

  const reorderCustomTags = useCallback((nextActive) =>
    setDb((prev) => {
      const lib = prev.libraries ?? { symbols: [], sessions: [], models: [], customTags: [] };
      const all = lib.customTags ?? [];
      const activeIds = new Set((nextActive ?? []).map((x) => x.id));
      const rest = all.filter((x) => !activeIds.has(x.id));
      const newTags = [...(nextActive ?? []), ...rest];
      if (newTags.length === all.length && newTags.every((s, i) => s.id === all[i]?.id)) return prev;
      return { ...prev, libraries: { ...lib, customTags: newTags } };
    }), [setDb]);

  // -----------------------------
  // Documents
  // -----------------------------
  const upsertDocument = (doc) => {
    const item = { ...doc, id: doc.id || uid(), updatedAt: Date.now() };
    setDb((prev) => {
      const list = prev.documents ?? [];
      const idx = list.findIndex((d) => d.id === item.id);
      const next = idx >= 0 ? list.map((d, i) => (i === idx ? { ...d, ...item } : d)) : [item, ...list];
      // Sync trade-document bidirectional links
      const baseResult = { ...prev, documents: next };
      return syncTradeDocLinks(baseResult, { document: item });
    });
  };

  const deleteDocument = (id) =>
    setDb((prev) => ({
      ...prev,
      documents: (prev.documents ?? []).map((d) =>
        d.id === id ? { ...d, archivedAt: Date.now(), updatedAt: Date.now() } : d
      ),
    }));

  const restoreDocument = (id) =>
    setDb((prev) => ({
      ...prev,
      documents: (prev.documents ?? []).map((d) =>
        d.id === id ? { ...d, archivedAt: null, updatedAt: Date.now() } : d
      ),
    }));

  const deleteDocumentForever = (id) =>
    setDb((prev) => ({
      ...prev,
      documents: (prev.documents ?? []).filter((d) => d.id !== id),
    }));


  // -----------------------------
  // Backup
  // -----------------------------
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tradecrm_backup_${isoDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push({ title: "Exported", description: "Backup downloaded" });
  };

  const importJSON = async (file) => {
    try {
      const text = await file.text();
      const v = JSON.parse(text);
      if (!v || typeof v !== "object") throw new Error("Bad JSON");

      const migrated = migrateDb({
        ui: { theme: v?.ui?.theme ?? theme, reduceMotion: !!v?.ui?.reduceMotion, showArchive: v?.ui?.showArchive ?? true },
        accounts: Array.isArray(v.accounts) ? v.accounts : accounts,
        trades: Array.isArray(v.trades) ? v.trades : trades,
        libraries: v.libraries ?? libraries,
      });
      setDb(migrated);
      toast.push({ title: "Imported", description: "Data restored" });
    } catch (e) {
      toast.push({ title: "Import failed", description: String(e) });
    }
  };

  const resetAll = () => {
    setDb((prev) => ({
      ...(prev || {}),
      ui: prev?.ui || {},
      accounts: [],
      trades: [],
      libraries: { symbols: [], sessions: [], tags: [] },
    }));
    toast.push({ title: "Deleted", description: "Journal data cleared" });
  };

  // -----------------------------
  // Command palette actions
  // -----------------------------
  const actions = useMemo(
  () => {
    const full = [
      {
        id: "go_dashboard",
        label: "Go to Dashboard",
        hint: "premium overview",
        icon: <LayoutDashboard className="h-4 w-4" />,
        shortcut: "G D",
        onRun: () => setActive("dashboard"),
      },
      {
        id: "go_analytics",
        label: "Go to Analytics",
        hint: "filters + breakdowns",
        icon: <BarChart3 className="h-4 w-4" />,
        shortcut: "G R",
        onRun: () => setActive("analytics"),
      },
      {
        id: "go_trades",
        label: "Go to Trades",
        hint: "table + modal",
        icon: <BookOpen className="h-4 w-4" />,
        shortcut: "G T",
        onRun: () => setActive("trades"),
      },
      {
        id: "go_accounts",
        label: "Go to Accounts",
        hint: "manage",
        icon: <Wallet className="h-4 w-4" />,
        shortcut: "G A",
        onRun: () => setActive("accounts"),
      },
      {
        id: "go_documents",
        label: "Go to Documents",
        hint: "plans, strategies, ideas",
        icon: <FileText className="h-4 w-4" />,
        shortcut: "G O",
        onRun: () => setActive("documents"),
      },
      {
        id: "go_trash",
        label: "Go to Trash",
        hint: "restore / delete forever",
        icon: <Trash2 className="h-4 w-4" />,
        shortcut: "G X",
        onRun: () => setActive("trash"),
      },
      {
        id: "go_pairs",
        label: "Go to Pairs",
        hint: "library",
        icon: <Shapes className="h-4 w-4" />,
        shortcut: "G P",
        onRun: () => setActive("pairs"),
      },
      {
        id: "go_education",
        label: "Go to Education",
        hint: "learning",
        icon: <GraduationCap className="h-4 w-4" />,
        shortcut: "G E",
        onRun: () => setActive("education"),
      },
      {
        id: "go_tournament",
        label: "Go to Tournament",
        hint: "library leaderboard",
        icon: <Trophy className="h-4 w-4" />,
        onRun: () => setActive("tournament"),
      },
      {
        id: "go_sessions",
        label: "Go to Sessions",
        hint: "library",
        icon: <Clock className="h-4 w-4" />,
        shortcut: "G S",
        onRun: () => setActive("sessions"),
      },
      {
        id: "go_settings",
        label: "Go to Settings",
        hint: "export/import",
        icon: <SettingsIcon className="h-4 w-4" />,
        shortcut: "G ,",
        onRun: () => setActive("settings"),
      },
      {
        id: "toggle_theme",
        label: "Toggle theme",
        hint: theme === "dark" ? "light" : "dark",
        icon: theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        shortcut: "T",
        onRun: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "export",
        label: "Export backup",
        hint: "json",
        icon: <Download className="h-4 w-4" />,
        shortcut: "E",
        onRun: exportJSON,
      },

    ];
    const allowed = Array.isArray(allowedNavKeys) && allowedNavKeys.length ? new Set(allowedNavKeys) : null;
    if (!allowed) return full;
    return full.filter((a) => {
      if (String(a.id || "").startsWith("go_")) {
        const key = String(a.id).slice(3);
        return allowed.has(key);
      }
      return true;
    });
  },
  [theme, allowedNavKeys]
);

  // ── Backtest handlers ──
  // activeBacktestId is ephemeral (not persisted) to prevent:
  // - auto-entering backtest mode on page load from stale localStorage/server state
  // - sync merges switching the user to a different backtest
  const [activeBacktestId, setActiveBacktestId] = useState(null);
  const [backtestTab, setBacktestTab] = useState("dashboard");
  const [backtestSettingsOpen, setBacktestSettingsOpen] = useState(false);

  // Helper: calculate total PnL across trades' allocations
  const calcBacktestPnl = (trades) => {
    return trades.filter(t => !isDeleted(t)).reduce((sum, t) => {
      const allocs = Array.isArray(t.allocations) ? t.allocations : [];
      return sum + allocs.reduce((s, a) => s + (Number(a?.pnl) || 0) - Math.abs(Number(a?.commission) || 0), 0);
    }, 0);
  };

  // Helper: duplicate a trade with new IDs for a new account
  const duplicateTradeForAccount = (trade, newAccountId) => ({
    ...trade,
    id: uid(),
    accountId: newAccountId,
    allocations: (trade.allocations || []).map(a => ({ ...a, id: uid(), accountId: newAccountId })),
  });

  const activeBacktest = useMemo(() => {
    if (!activeBacktestId) return null;
    return (db.backtests || []).find((bt) => bt.id === activeBacktestId) || null;
  }, [activeBacktestId, db.backtests]);

  const openBacktest = useCallback((id) => {
    setActiveBacktestId(id);
    setBacktestTab("dashboard");
  }, []);

  const closeBacktest = useCallback(() => {
    setActiveBacktestId(null);
    setActive("backtests");
  }, []);

  const createBacktest = useCallback((data) => {
    const now = Date.now();
    const equity = Math.max(0, Number(data.initialEquity) || 10000);
    const accountId = uid();
    const newBt = {
      id: uid(),
      name: data.name || "Untitled",
      period: data.period || { from: "", to: "" },
      symbols: data.symbols || [],
      timeframes: data.timeframes || [],
      initialEquity: equity,
      account: { id: accountId, name: `Backtest Account ${equity.toLocaleString()}`, initialEquity: equity, startingEquity: equity, currentEquity: equity, defaultRiskPct: 1 },
      trades: [],
      notes: data.notes || { plan: "", description: "" },
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
    };
    setDb((prev) => ({ ...prev, backtests: [...(prev.backtests || []), newBt] }));
  }, [setDb]);

  const updateBacktest = useCallback((id, patch) => {
    setDb((prev) => ({
      ...prev,
      backtests: (prev.backtests || []).map((bt) =>
        bt.id === id ? { ...bt, ...patch, updatedAt: Date.now() } : bt
      ),
    }));
  }, [setDb]);

  const duplicateBacktest = useCallback((id, copySuffix = " (copy)") => {
    setDb((prev) => {
      const bt = (prev.backtests || []).find((b) => b.id === id);
      if (!bt) return prev;
      const now = Date.now();
      const newAccountId = uid();
      const copy = {
        ...bt,
        id: uid(),
        name: bt.name + " " + copySuffix,
        account: { ...bt.account, id: newAccountId },
        trades: (bt.trades || []).map((tr) => duplicateTradeForAccount(tr, newAccountId)),
        notes: { ...(bt.notes || { plan: "", description: "" }) },
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
      };
      return {
        ...prev,
        backtests: [...(prev.backtests || []), copy],
      };
    });
  }, [setDb]);

  const archiveBacktest = useCallback((id, archive) => {
    setDb((prev) => ({
      ...prev,
      backtests: (prev.backtests || []).map((bt) =>
        bt.id === id ? { ...bt, archivedAt: archive ? Date.now() : null, updatedAt: Date.now() } : bt
      ),
    }));
  }, [setDb]);

  const deleteBacktest = useCallback((id) => {
    // If the active backtest is being deleted, exit backtest mode
    setActiveBacktestId((prev) => (prev === id ? null : prev));
    setDb((prev) => {
      return {
        ...prev,
        backtests: (prev.backtests || []).map((bt) =>
          bt.id === id ? { ...bt, deletedAt: Date.now(), updatedAt: Date.now() } : bt
        ),
      };
    });
  }, [setDb]);

  // ── Backtest trade handlers (scoped to active backtest) ──
  const upsertBacktestTrade = useCallback((trade) => {
    if (!activeBacktestId) return;
    const now = Date.now();
    setDb((prev) => ({
      ...prev,
      backtests: (prev.backtests || []).map((bt) => {
        if (bt.id !== activeBacktestId) return bt;
        const trades = bt.trades || [];
        const idx = trades.findIndex((t) => t.id === trade.id);
        // Auto-set accountId to backtest's single account
        const updatedTrade = { ...trade, id: trade.id || uid(), accountId: bt.account?.id || "" };
        if (updatedTrade.allocations) {
          updatedTrade.allocations = updatedTrade.allocations.map(a => ({ ...a, accountId: bt.account?.id || "" }));
        }
        const nextTrades = idx >= 0
          ? trades.map((t, i) => (i === idx ? updatedTrade : t))
          : [...trades, updatedTrade];
        const newEquity = (bt.account?.initialEquity || bt.initialEquity || 0) + calcBacktestPnl(nextTrades);
        return { ...bt, trades: nextTrades, account: { ...bt.account, currentEquity: newEquity }, updatedAt: now };
      }),
    }));
  }, [activeBacktestId, setDb]);

  const trashBacktestTrade = useCallback((tradeId) => {
    if (!activeBacktestId) return;
    setDb((prev) => ({
      ...prev,
      backtests: (prev.backtests || []).map((bt) => {
        if (bt.id !== activeBacktestId) return bt;
        const nextTrades = (bt.trades || []).map((t) =>
          t.id === tradeId ? { ...t, deletedAt: Date.now() } : t
        );
        const newEquity = (bt.account?.initialEquity || bt.initialEquity || 0) + calcBacktestPnl(nextTrades);
        return { ...bt, trades: nextTrades, account: { ...bt.account, currentEquity: newEquity }, updatedAt: Date.now() };
      }),
    }));
  }, [activeBacktestId, setDb]);

  const trashBacktestTradesBulk = useCallback((ids) => {
    if (!activeBacktestId || !Array.isArray(ids) || ids.length === 0) return;
    const idsSet = new Set(ids);
    setDb((prev) => ({
      ...prev,
      backtests: (prev.backtests || []).map((bt) => {
        if (bt.id !== activeBacktestId) return bt;
        const nextTrades = (bt.trades || []).map((t) =>
          idsSet.has(t.id) && !isDeleted(t) ? { ...t, deletedAt: Date.now() } : t
        );
        const newEquity = (bt.account?.initialEquity || bt.initialEquity || 0) + calcBacktestPnl(nextTrades);
        return { ...bt, trades: nextTrades, account: { ...bt.account, currentEquity: newEquity }, updatedAt: Date.now() };
      }),
    }));
  }, [activeBacktestId, setDb]);

  // ── Backtest notes handler ──
  const updateBacktestNotes = useCallback((notes) => {
    if (!activeBacktestId) return;
    setDb((prev) => ({
      ...prev,
      backtests: (prev.backtests || []).map((bt) =>
        bt.id === activeBacktestId ? { ...bt, notes: { ...(bt.notes || {}), ...notes }, updatedAt: Date.now() } : bt
      ),
    }));
  }, [activeBacktestId, setDb]);

  // ── Scoped data for backtest workspace ──
  const scopedTrades = useMemo(() => {
    if (!activeBacktest) return (db.trades ?? []).filter((t) => !isDeleted(t));
    return (activeBacktest.trades || []).filter((t) => !isDeleted(t));
  }, [activeBacktest, db.trades]);

  const scopedAccounts = useMemo(() => {
    if (!activeBacktest) return (db.accounts ?? []).filter((a) => !isDeleted(a));
    // In backtest mode, use ONLY the backtest's single account
    return activeBacktest.account ? [activeBacktest.account] : [];
  }, [activeBacktest, db.accounts]);

  // Map sidebar nav keys to backtest tabs when a backtest is open
  const BACKTEST_TAB_MAP = { dashboard: "dashboard", analytics: "analytics", trades: "trades" };

  const handleSetActive = useCallback((key) => {
    // Block in-app navigation when a registered editor has unsaved changes.
    // Pages opt-in via lib/navGuard.js setDirty(). The browser-level beforeunload
    // guard covers tab close/refresh; this covers sidebar/command-palette nav.
    if (isAnyDirty()) {
      const ok = window.confirm(
        "You have unsaved changes. Leave this page anyway?"
      );
      if (!ok) return;
      clearDirty();
    }
    if (activeBacktestId) {
      // In backtest mode: map core nav items to backtest tabs
      const mapped = BACKTEST_TAB_MAP[key];
      if (mapped) {
        setBacktestTab(mapped);
        return;
      }
      // Any other nav item exits backtest mode
      setActiveBacktestId(null);
    }
    setActive(key);
  }, [activeBacktestId]);

  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <Shell
        active={activeBacktestId ? backtestTab : active}
        setActive={handleSetActive}
        theme={theme}
        setTheme={setTheme}
        reduceMotion={reduceMotion}
        setReduceMotion={setReduceMotion}
        allowedNavKeys={allowedNavKeys}
        hiddenNavItems={ui?.hiddenNavItems}
        modelsEnabled={!!ui?.modelsEnabled}
        banner={navBanner}
        onOpenCommand={() => setCmdOpen(true)}
        onQuickTrade={() => { setOpenNewTrade(true); handleSetActive("trades"); }}
        onLogout={logout}
        onInboxClick={() => handleSetActive("inbox")}
        topRight={
          <div className="flex items-center gap-2">
            <NotificationBell 
              onInboxClick={() => handleSetActive("inbox")} 
              onOpenUpdates={() => handleSetActive("updates")}
              onOpenFeedback={(feedbackId) => {
                handleSetActive("updates");
                // Dispatch event to open the specific feedback ticket
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("open-feedback", { detail: { id: feedbackId } }));
                }, 100);
              }}
            />
            <UserMenu syncStatus={syncStatus} hasUnsavedChanges={hasUnsavedChanges} onRetrySync={retrySync} lastError={lastError} syncProgress={syncProgress} />
          </div>
        }
      >
        {/* Offline/Domain Warning Banner */}
        <OfflineBanner 
          syncStatus={syncStatus} 
          onRetry={retrySync} 
          lastError={lastError}
          isReadOnly={isReadOnly}
          hasUnsavedChanges={hasUnsavedChanges}
          userId={user?.id}
          showDelayedSyncWarning={showDelayedSyncWarning}
          syncElapsedMs={syncElapsedMs}
          syncProgress={syncProgress}
          onResetSyncWarning={resetSyncWarning}
        />

        {/* All routed pages below are lazy-loaded; keep one Suspense
            boundary so chunk-fetch shows a fallback instead of blanking
            the whole shell. */}
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
        {/* ── Backtest workspace mode ── */}
        {activeBacktest ? (
          <>
            <BacktestModeBar
              backtest={activeBacktest}
              onExit={closeBacktest}
              onSettings={() => setBacktestSettingsOpen(true)}
              onDuplicate={() => duplicateBacktest(activeBacktestId)}
              activeTab={backtestTab}
              setActiveTab={setBacktestTab}
            />
            {backtestTab === "dashboard" ? (
              <BacktestDashboard
                backtest={activeBacktest}
                trades={scopedTrades}
                accounts={scopedAccounts}
                libraries={libraries}
                reduceMotion={reduceMotion}
                onAddTrade={() => setBacktestTab("trades")}
                onTradeClick={(trade) => {
                  setSelectedTradeId(trade.id);
                  setBacktestTab("trades");
                }}
                onNotesChange={updateBacktestNotes}
                ui={ui}
              />
            ) : backtestTab === "analytics" ? (
              <Analytics
                trades={scopedTrades}
                accounts={scopedAccounts}
                libraries={libraries}
                reduceMotion={reduceMotion}
                onTradeClick={(trade) => {
                  setSelectedTradeId(trade.id);
                  setBacktestTab("trades");
                }}
                ui={ui}
              />
            ) : (
              <Trades
                trades={scopedTrades}
                accounts={scopedAccounts}
                documents={[]}
                ideas={[]}
                libraries={libraries}
                onUpsert={upsertBacktestTrade}
                onUpsertAccount={() => {}}
                onUpsertSymbol={upsertSymbol}
                propTemplates={[]}
                onRemove={trashBacktestTrade}
                onRemoveBulk={trashBacktestTradesBulk}
                onNavigateToDocument={() => {}}
                onNavigateToIdea={() => {}}
                reduceMotion={reduceMotion}
                toast={toast}
                user={user}
                quickTradeAccountId={null}
                onClearQuickTrade={() => {}}
                openNewTrade={false}
                onClearOpenNewTrade={() => {}}
                selectedTradeId={selectedTradeId}
                onClearSelectedTrade={() => setSelectedTradeId(null)}
                isBacktestMode={true}
                modelsEnabled={!!ui?.modelsEnabled}
              />
            )}
            {/* Backtest settings modal (reuse create modal in edit mode) */}
            {backtestSettingsOpen && (
              <BacktestCreateModal
                open={backtestSettingsOpen}
                onClose={() => setBacktestSettingsOpen(false)}
                onSave={(data) => { updateBacktest(activeBacktestId, data); setBacktestSettingsOpen(false); }}
                editBacktest={activeBacktest}
                availableSymbols={(libraries.symbols || []).filter(s => !isDeleted(s)).map(s => s.name || s.id)}
              />
            )}
          </>
        ) : active === "backtests" ? (
          <Backtests
            backtests={db.backtests || []}
            uiBacktests={ui.backtests || {}}
            onCreateBacktest={createBacktest}
            onUpdateBacktest={updateBacktest}
            onOpenBacktest={openBacktest}
            onDuplicateBacktest={duplicateBacktest}
            onArchiveBacktest={archiveBacktest}
            onDeleteBacktest={deleteBacktest}
            reduceMotion={reduceMotion}
            toast={toast}
            libraries={libraries}
            flushSync={flushSync}
            setShareInFlight={setShareInFlight}
          />
        ) : active === "dashboard" ? (
          <DashboardPage
            trades={(db.trades ?? []).filter((t) => !isDeleted(t))}
            accounts={(db.accounts ?? []).filter((a) => !isDeleted(a))}
            libraries={libraries}
            propTemplates={db.propTemplates ?? []}
            reduceMotion={reduceMotion}
            onAddTrade={() => setActive("trades")}
            onTradeClick={handleTradeClick}
            ui={ui}
            ideas={ideas}
          />
        ) : active === "analytics" ? (
          <Analytics
            trades={(db.trades ?? []).filter((t) => !isDeleted(t))}
            accounts={(db.accounts ?? []).filter((a) => !isDeleted(a))}
            libraries={libraries}
            reduceMotion={reduceMotion}
            onTradeClick={handleTradeClick}
            ui={ui}
          />
        ) : active === "trades" ? (
          <Trades
            trades={(db.trades ?? []).filter((t) => !isDeleted(t))}
            accounts={(db.accounts ?? []).filter((a) => !isDeleted(a))}
            documents={(db.documents ?? []).filter((d) => !d?.archivedAt)}
            ideas={ideas}
            libraries={libraries}
            onUpsert={upsertTrade}
            onUpsertAccount={upsertAccount}
            onUpsertSymbol={upsertSymbol}
            propTemplates={db.propTemplates ?? []}
            onRemove={trashTrade}
            onRemoveBulk={trashTradesBulk}
            onNavigateToDocument={handleNavigateToDocument}
            onNavigateToIdea={handleNavigateToIdea}
            reduceMotion={reduceMotion}
            toast={toast}
            user={user}
            quickTradeAccountId={quickTradeAccountId}
            onClearQuickTrade={() => setQuickTradeAccountId(null)}
            openNewTrade={openNewTrade}
            onClearOpenNewTrade={() => setOpenNewTrade(false)}
            selectedTradeId={selectedTradeId}
            onClearSelectedTrade={() => setSelectedTradeId(null)}
            modelsEnabled={!!ui?.modelsEnabled}
            flushSync={flushSync}
            setShareInFlight={setShareInFlight}
            ui={ui}
          />
        ) : active === "accounts" ? (
          <Accounts
            accounts={(db.accounts ?? []).filter((a) => !isDeleted(a))}
            trades={(db.trades ?? []).filter((t) => !isDeleted(t))}
            symbols={(libraries.symbols ?? []).filter((s) => !isDeleted(s))}
            propTemplates={db.propTemplates ?? []}
            onSetPropTemplates={setPropTemplates}
            onUpsert={upsertAccount}
            onTrash={trashAccount}
            onArchive={archiveAccount}
            onQuickTrade={handleQuickTrade}
            onNavigateToTrade={(tradeId) => {
              setSelectedTradeId(tradeId);
              setActive("trades");
            }}
            reduceMotion={reduceMotion}
            toast={toast}
            ui={ui}
          />
        ) : active === "programs" ? (
          <PropPrograms
            propTemplates={db.propTemplates ?? []}
            onSetPropTemplates={setPropTemplates}
            toast={toast}
          />
        ) : active === "documents" ? (
          <Documents
            documents={documents}
            docFolders={docFolders}
            trades={(db.trades ?? []).filter((t) => !isDeleted(t))}
            libraries={libraries}
            onUpsertDocument={upsertDocument}
            onDeleteDocument={deleteDocument}
            reduceMotion={reduceMotion}
            toast={toast}
            user={user}
            selectedDocumentId={selectedDocumentId}
            onClearSelectedDocument={() => setSelectedDocumentId(null)}
            onNavigateToTrade={handleNavigateToTrade}
          />
        ) : active === "ideas" ? (
          <Ideas
            reduceMotion={reduceMotion}
            toast={toast}
            libraries={libraries}
            trades={(db.trades ?? []).filter((t) => !isDeleted(t))}
            onIdeaSaved={syncIdeaTradeLinks}
            selectedIdeaId={selectedIdeaId}
            onClearSelectedIdea={() => setSelectedIdeaId(null)}
            onNavigateToTrade={handleNavigateToTrade}
            modelsEnabled={!!ui?.modelsEnabled}
          />
        ) : active === "models" ? (
          <Models
            items={activeModels}
            onUpsert={upsertModel}
            onRemove={trashModel}
            onReorder={reorderModels}
            reduceMotion={reduceMotion}
            toast={toast}
          />
        ) : active === "tags" ? (
          <Tags
            items={activeCustomTags}
            onUpsert={upsertCustomTag}
            onRemove={trashCustomTag}
            onReorder={reorderCustomTags}
            reduceMotion={reduceMotion}
            toast={toast}
          />
        ) : active === "changelog" ? (
          <Changelog
            reduceMotion={reduceMotion}
          />
        ) : active === "updates" ? (
          <UpdatesAndFeedback
            reduceMotion={reduceMotion}
          />
        ) : active === "trash" ? (
          <TrashPage
            trades={(db.trades ?? []).filter((t) => isDeleted(t))}
            accounts={(db.accounts ?? []).filter((a) => isDeleted(a))}
            documents={(db.documents ?? []).filter((d) => !!d?.archivedAt)}
            pairs={(libraries.symbols ?? []).filter((s) => isDeleted(s))}
            sessions={(libraries.sessions ?? []).filter((s) => isDeleted(s))}
            models={(libraries.models ?? []).filter((m) => isDeleted(m))}
            customTags={(libraries.customTags ?? []).filter((t) => isDeleted(t))}
            onRestoreTrade={restoreTrade}
            onDeleteTrade={deleteTradeForever}
            onRestoreAccount={restoreAccount}
            onDeleteAccount={deleteAccountForever}
            onRestoreSymbol={restoreSymbol}
            onDeleteSymbol={deleteSymbolForever}
            onRestoreSession={restoreSession}
            onDeleteSession={deleteSessionForever}
            onRestoreModel={restoreModel}
            onDeleteModel={deleteModelForever}
            onRestoreCustomTag={restoreCustomTag}
            onDeleteCustomTag={deleteCustomTagForever}
            onRestoreDocument={restoreDocument}
            onDeleteDocument={deleteDocumentForever}
            reduceMotion={reduceMotion}
            toast={toast}
          />
        ) : active === "pairs" ? (
          <Pairs
            items={activePairs}
            onUpsert={upsertSymbol}
            onRemove={trashSymbol}
            onReorder={reorderSymbols}
            reduceMotion={reduceMotion}
            toast={toast}
          />
        ) : active === "education" ? (
          <Education
            reduceMotion={reduceMotion}
            toast={toast}
          />
        ) : active === "tournament" ? (
          <TournamentLeaderboard
            reduceMotion={reduceMotion}
            toast={toast}
          />
        ) : active === "sessions" ? (
          <Sessions
            items={activeSessions}
            onUpsert={upsertSession}
            onRemove={trashSession}
            onReorder={reorderSessions}
            reduceMotion={reduceMotion}
            toast={toast}
          />
        ) : active === "settings" ? (
          <Settings
            theme={theme}
            setTheme={setTheme}
            exportJSON={exportJSON}
            importJSON={importJSON}
            resetAll={resetAll}
            ui={ui}
            setUiPatch={setUiPatch}
          />
        ) : active === "inbox" ? (
          <Inbox />
        ) : (
          <Settings
            theme={theme}
            setTheme={setTheme}
            exportJSON={exportJSON}
            importJSON={importJSON}
            resetAll={resetAll}
            ui={ui}
            setUiPatch={setUiPatch}
          />
        )}
        </Suspense>
      </Shell>

      <CommandPalette open={cmdOpen} setOpen={setCmdOpen} actions={actions} reduceMotion={reduceMotion} />
      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </I18nProvider>
  );
}
