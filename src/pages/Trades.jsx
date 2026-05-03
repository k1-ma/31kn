import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Switch from "@/components/ui/Switch.jsx";
import Modal from "@/components/common/Modal.jsx";
import ConfirmDialog from "@/components/common/ConfirmDialog.jsx";
import ImageLightbox from "@/components/common/ImageLightbox.jsx";
import ImageRemoveButton from "@/components/common/ImageRemoveButton.jsx";
import SessionBadge from "@/components/common/SessionBadge.jsx";
import { AvatarPill, AvatarBubble } from "@/components/common/Avatar.jsx";
import Press from "@/components/common/Press.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";
import useSoftLoading from "@/components/common/useSoftLoading.js";
import ShareLinkModal from "@/components/common/ShareLinkModal.jsx";
import ShareOptionsModal from "@/components/common/ShareOptionsModal.jsx";
import SelectDropdown from "@/components/common/SelectDropdown.jsx";
import DateRangePicker from "@/components/common/DateRangePicker.jsx";
import SingleDatePicker from "@/components/common/SingleDatePicker.jsx";
import TradesViewToolbar from "@/components/trades/TradesViewToolbar.jsx";
import TradesGalleryGrid from "@/components/trades/TradesGalleryGrid.jsx";
import CreateAccountModal from "@/components/CreateAccountModal.jsx";
import CreateSymbolModal from "@/components/CreateSymbolModal.jsx";
import RichTextEditor from "@/components/common/RichTextEditor.jsx";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search, Trash2, ExternalLink, MinusCircle, X, TrendingUp, TrendingDown, Wallet, Calendar, ArrowUpRight, ArrowDownRight, Target, Clock, Link2, Image, FileText, MessageSquare, BookOpen, Check, Star, Minus, Share2, CheckSquare, Square, List, LayoutGrid, CalendarDays, ChevronLeft, ChevronRight, Loader2, Lightbulb, RotateCcw, DollarSign, Percent, PlusCircle, Brain, Tag, Palette } from "lucide-react";
import { uid, isoDate, clampNum, fmtMoney, fmtRR, resizeImageFileToDataUrl, fmtPct, sanitizeNumericInput, parseNullableNumber, getInputSign, fmtMoneyWithSign } from "@/lib/utils";
import { calculateAccountPnL, formatAccountPnL } from "@/lib/accountCalcs.js";
import { NO_ACCOUNT_ID, tradeHasAccount, hasTradesWithoutAccount, createNoAccountOption } from "@/lib/noAccount.js";
import { createPublicShare, createShareWithToast, sanitizeTradeForPublic, getShareUrl, compressSharePayload } from "@/lib/share.js";
import { HOVER_GLOW } from "@/lib/ui.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { calcWinRatePct, getGlobalWinRateMode } from "@/lib/metrics/winRate.js";
import { isDeleted } from "@/lib/syncDb.js";
import { setDirty } from "@/lib/navGuard.js";
import {
  buildMonthGrid,
  addMonths,
  startOfMonth,
  pad2,
  normalizeDateKey,
  isSameDay,
  getWeekdayLabels,
  localeFromLang,
  formatRange,
} from "@/lib/calendar";

// Account summary popup component for showing account details when selecting
function AccountSummaryPreview({ account, tx }) {
  if (!account) return null;
  
  const { pnlAmount, pnlPercent, isValid, currentEquity } = calculateAccountPnL(account);
  const currency = account.currency || "$";
  
  return (
    <div className="mt-2 p-2.5 rounded-xl bg-gradient-to-r from-[#0B1220]/60 to-[#0E1628]/40 border border-accent/15 shadow-[0_0_10px_rgba(59,130,246,0.08)]">
      <div className="flex items-center gap-2">
        <AvatarBubble avatar={account.avatar} color={account.color} size={32} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{account.name}</div>
          <div className="text-[10px] text-muted-foreground">{account.status}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold">{fmtMoney(currentEquity, currency)}</div>
          <div className={`text-[10px] flex items-center gap-0.5 justify-end ${pnlAmount >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {pnlAmount >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {isValid ? `${pnlAmount >= 0 ? "+" : ""}${pnlPercent.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Build account options for SelectDropdown
 * @param {Array} accounts - All available accounts
 * @param {string} currentAccountId - Currently selected account ID
 * @param {function} tx - Translation function
 * @returns {Array<{value: string, label: string, subtext?: string, icon?: React.ReactNode, disabled?: boolean}>}
 */
// Special value to detect "create account" selection
const CREATE_ACCOUNT_VALUE = "__create_new_account__";

// Special value to detect "create symbol" selection
const CREATE_SYMBOL_VALUE = "__create_new_symbol__";

function buildAccountOptions(accounts, currentAccountId, tx, includeCreate = false) {
  const all = accounts || [];
  const cur = all.find((x) => x.id === currentAccountId);
  const activeList = all.filter((x) => !x?.archivedAt && x?.status !== "Passed" && x?.status !== "Failed");
  
  const options = [];
  
  // Add current account if it's archived/passed/failed (as disabled option at top)
  if (cur && (cur.archivedAt || cur.status === "Passed" || cur.status === "Failed")) {
    const statusLabel = cur.status === "Passed" 
      ? tx("common.passed") 
      : cur.status === "Failed" 
        ? tx("common.failed") 
        : tx("common.archived");
    options.push({
      value: cur.id,
      label: cur.name,
      subtext: statusLabel,
      icon: <AvatarBubble avatar={cur.avatar} color={cur.color} size={24} />,
      disabled: true,
    });
  }
  
  // Add all active accounts with PnL percentage
  activeList.forEach((acc) => {
    const currency = acc.currency || "$";
    const status = acc.status || "Live";
    const { currentEquity, percentStr, isValid } = formatAccountPnL(acc, currency);
    
    // Format PnL display - show % only if starting equity exists
    const pnlDisplay = isValid ? ` • ${percentStr}` : "";
    
    options.push({
      value: acc.id,
      label: acc.name,
      subtext: `${fmtMoney(currentEquity, currency)}${pnlDisplay} • ${status}`,
      icon: <AvatarBubble avatar={acc.avatar} color={acc.color} size={24} />,
    });
  });
  
  // Add "+ Create account" option at the bottom if requested
  if (includeCreate) {
    options.push({
      value: CREATE_ACCOUNT_VALUE,
      label: tx("pages.trades.editor.createAccount.option") || "+ Create account",
      icon: <PlusCircle className="h-5 w-5 text-accent" />,
    });
  }
  
  return options;
}

// UI-only fields that should not be saved to storage
const UI_ONLY_ALLOC_FIELDS = ['rrInput', 'pnlInput', 'riskUsdInput', 'commissionInput', 'pnlMode', 'riskMode', 'noAccountBaseInput', 'noAccountBase'];

/**
 * Strip UI-only fields from allocation before saving
 */
function stripUIFields(alloc) {
  const result = { ...alloc };
  for (const field of UI_ONLY_ALLOC_FIELDS) {
    delete result[field];
  }
  return result;
}

function asAllocations(trade, accounts) {
  const arr = Array.isArray(trade?.allocations) ? trade.allocations : null;
  if (arr && arr.length) return arr;
  const fallbackAcc = trade?.accountId || accounts?.[0]?.id || "";
  return [
    {
      id: uid(),
      accountId: fallbackAcc,
      riskPctOverride: trade?.riskPctOverride ?? null,
      rr: clampNum(trade?.rr),
      riskUsd: clampNum(trade?.riskUsd),
      pnl: clampNum(trade?.pnl),
      commission: clampNum(trade?.commission),
    },
  ];
}

function sanitizeAlloc(a, hasAccount = true) {
  return {
    id: a?.id || uid(),
    accountId: String(a?.accountId || ""),
    riskPctOverride: a?.riskPctOverride === "" || a?.riskPctOverride === undefined ? null : a?.riskPctOverride,
    // Store as strings to allow intermediate states during editing
    rrInput: a?.rrInput !== undefined ? String(a.rrInput) : (a?.rr ? String(a.rr) : ""),
    riskUsdInput: a?.riskUsdInput !== undefined ? String(a.riskUsdInput) : (a?.riskUsd ? String(a.riskUsd) : ""),
    pnlInput: a?.pnlInput !== undefined ? String(a.pnlInput) : (a?.pnl ? String(Math.abs(a.pnl)) : ""),
    commissionInput: a?.commissionInput !== undefined ? String(a.commissionInput) : (a?.commission ? String(a.commission) : ""),
    // Keep numeric values for calculations
    rr: clampNum(a?.rr),
    riskUsd: clampNum(a?.riskUsd),
    pnl: clampNum(a?.pnl),
    commission: clampNum(a?.commission),
    // UI-only: risk mode "pct" or "usd" (default "pct" for account allocations, "usd" for no-account)
    riskMode: a?.riskMode || (hasAccount ? "pct" : "usd"),
    // UI-only: pnl mode "auto" or "manual" (default "auto" for new allocations)
    pnlMode: a?.pnlMode || "auto",
    // UI-only: no-account base balance for % risk calculation
    noAccountBaseInput: a?.noAccountBaseInput !== undefined ? String(a.noAccountBaseInput) : (a?.noAccountBase ? String(a.noAccountBase) : ""),
    noAccountBase: clampNum(a?.noAccountBase),
  };
}

function effRiskPct(a, acc) {
  const raw = a?.riskPctOverride;
  const pct = raw === null || raw === undefined || raw === "" ? clampNum(acc?.defaultRiskPct) : clampNum(raw);
  return pct;
}

function riskUsdForAlloc(a, acc) {
  // Prioritize snapshotted riskUsd if > 0 (especially for $ mode)
  const snapRisk = clampNum(a?.riskUsd);
  if (snapRisk > 0) return snapRisk;
  // Otherwise calculate from equity and %
  const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
  const pct = effRiskPct(a, acc);
  const risk = (eq * pct) / 100;
  return Number.isFinite(risk) ? risk : 0;
}

function rrForAlloc(a, acc) {
  // RR is an independent "risk:reward" value (always positive).
  // If the user didn't set RR, we show the implied RR from PnL/Risk as a helpful fallback.
  const manual = clampNum(a?.rr);
  if (manual > 0) return Math.abs(manual);

  const snapRisk = clampNum(a?.riskUsd);
  const risk = snapRisk > 0 ? snapRisk : riskUsdForAlloc(a, acc);
  if (!risk) return 0;
  return Math.abs(clampNum(a?.pnl)) / risk;
}

function sumRiskUsd(allocs, accById) {
  return (allocs || []).reduce((s, a) => {
    const acc = accById?.get?.(a?.accountId);
    const snapRisk = clampNum(a?.riskUsd);
    const risk = snapRisk > 0 ? snapRisk : riskUsdForAlloc(a, acc);
    return s + clampNum(risk);
  }, 0);
}

function totalRR(allocs, accById) {
  const items = allocs || [];
  
  // Calculate total risk - for allocations without account, use snapshotted riskUsd only
  const totalRisk = items.reduce((s, a) => {
    const acc = accById?.get?.(a?.accountId);
    const snapRisk = clampNum(a?.riskUsd);
    // For no-account allocations, only use snapRisk; for with-account, can infer from equity
    const risk = a?.accountId ? (snapRisk > 0 ? snapRisk : riskUsdForAlloc(a, acc)) : snapRisk;
    return s + clampNum(risk);
  }, 0);

  // Prefer a risk-weighted average RR across allocations.
  if (totalRisk > 0) {
    const weighted = items.reduce((s, a) => {
      const acc = accById?.get?.(a?.accountId);
      const snapRisk = clampNum(a?.riskUsd);
      // For no-account allocations, only use snapRisk; for with-account, can infer from equity
      const risk = a?.accountId ? (snapRisk > 0 ? snapRisk : riskUsdForAlloc(a, acc)) : snapRisk;
      return s + clampNum(risk) * rrForAlloc(a, acc);
    }, 0);
    return weighted / totalRisk;
  }

  // If totalRisk=0, fall back to simple average of RR values (where rr > 0)
  const rrValues = items.map((a) => {
    const acc = accById?.get?.(a?.accountId);
    return rrForAlloc(a, acc);
  }).filter(rr => rr > 0);
  
  if (!rrValues.length) return 0;
  return rrValues.reduce((s, rr) => s + rr, 0) / rrValues.length;
}

function sumPnL(allocs) {
  return (allocs || []).reduce((s, a) => {
    const grossPnl = clampNum(a?.pnl);
    const commission = Math.abs(clampNum(a?.commission));
    return s + (grossPnl - commission);
  }, 0);
}

function pnlByCurrency(allocs, accById) {
  const m = new Map();
  for (const a of allocs || []) {
    const acc = accById.get(a.accountId);
    const cur = acc?.currency ?? "$";
    const grossPnl = clampNum(a.pnl);
    const commission = Math.abs(clampNum(a.commission));
    const netPnl = grossPnl - commission;
    m.set(cur, (m.get(cur) ?? 0) + netPnl);
  }
  return m;
}

function fmtMixedPnL(allocs, accById) {
  const m = pnlByCurrency(allocs, accById);
  const parts = [];
  for (const [cur, val] of m.entries()) parts.push(fmtMoney(val, cur));
  if (!parts.length) return fmtMoney(0, "$");
  return parts.join(" • ");
}

function inferOutcomeFromTotals(pnl) {
  const p = clampNum(pnl);
  if (p === 0) return "BE";
  if (p < 0) return "Loss";
  return "Profit";
}

function applyOutcomeToAllocs(outcome, allocs) {
  return (allocs || []).map((a) => {
    // BE: allow user-entered PnL (+/-) for commissions/swaps/execution errors
    if (outcome === "BE") return { ...a, pnl: clampNum(a.pnl) };
    // Loss: force negative, Profit: force positive
    const pnlAbs = Math.abs(clampNum(a.pnl));
    const sign = outcome === "Loss" ? -1 : 1;
    return { ...a, pnl: sign * pnlAbs };
  });
}

/**
 * Calculate PnL value from user input based on outcome.
 * BE: preserve user-entered sign; Loss: force negative; Profit: force positive
 * @param {number|null} parsed - Parsed numeric value from input
 * @param {string} outcome - Trade outcome ("Profit", "Loss", "BE")
 * @returns {number} - Calculated PnL value with correct sign
 */
function calcPnlFromInput(parsed, outcome) {
  if (parsed === null) return 0;
  if (outcome === "BE") return parsed; // preserve sign for BE
  const sign = outcome === "Loss" ? -1 : 1;
  return sign * Math.abs(parsed);
}

/**
 * Compute auto PnL from risk and RR based on outcome.
 * Profit: risk * rr
 * Loss: -risk
 * BE: 0
 * @param {object} params - { outcome, riskUsd, rr }
 * @returns {{ pnl: number, pnlInput: string } | null} - computed values or null if not enough data
 */
function computeAutoPnl({ outcome, riskUsd, rr }) {
  const risk = clampNum(riskUsd);
  const rrVal = clampNum(rr);
  
  if (outcome === "BE") {
    return { pnl: 0, pnlInput: "0" };
  }
  
  if (outcome === "Loss" && risk > 0) {
    return { pnl: -risk, pnlInput: String(risk) };
  }
  
  if (outcome === "Profit" && risk > 0 && rrVal > 0) {
    const pnl = risk * rrVal;
    // Format to reasonable precision: use 2 decimals for values >= 1, else 4 significant digits for small values
    const pnlFormatted = pnl >= 1 ? pnl.toFixed(2) : pnl.toPrecision(4);
    return { pnl, pnlInput: pnlFormatted };
  }
  
  return null; // not enough data to compute
}

function normalizeTradeForDirty(t) {
  const allocs = (t?.allocations || [])
    .map((a) => ({
      accountId: String(a?.accountId || ""),
      riskPctOverride:
        a?.riskPctOverride === "" || a?.riskPctOverride === undefined ? null : a?.riskPctOverride,
      pnl: clampNum(a?.pnl),
      rr: clampNum(a?.rr),
    }))
    // stable ordering so re-renders don't cause false positives
    .sort((a, b) => `${a.accountId}`.localeCompare(`${b.accountId}`));

  // Normalize links and images for comparison
  const links = Array.isArray(t?.links) ? t.links.map(l => ({ title: String(l?.title || ""), url: String(l?.url || "") })) : [];
  const images = Array.isArray(t?.images) ? t.images.map(i => ({ title: String(i?.title || ""), dataUrl: String(i?.dataUrl || "") })) : [];

  return {
    date: String(t?.date || ""),
    symbolId: String(t?.symbolId || ""),
    sessionId: String(t?.sessionId || ""),
    direction: String(t?.direction || ""),
    outcome: String(t?.outcome || ""),
    links,
    images,
    positionNotes: String(t?.positionNotes || ""),
    comments: String(t?.comments || ""),
    notes: String(t?.notes || ""),
    journal: String(t?.journal || ""),
    tags: Array.isArray(t?.tags) ? [...t.tags].sort() : [],
    followPlan: !!t?.followPlan,
    bestTrade: !!t?.bestTrade,
    allocations: allocs,
  };
}

function TradeEditor({ initial, accounts, documents, ideas = [], libraries, onSave, onDelete, onShare, reduceMotion, onDirtyChange, saveSignal, defaultAccountId, onNavigateToDocument, onNavigateToIdea, onCreateAccount, onCreateSymbol, propTemplates, toast, isBacktestMode, modelsEnabled }) {
  const { t: tx } = useI18n();
  const accById = useMemo(() => new Map((accounts || []).map((a) => [a.id, a])), [accounts]);
  const docById = useMemo(() => new Map((documents || []).map((d) => [d.id, d])), [documents]);
  const baselineRef = useRef(null);
  const lastSaveSignalRef = useRef(saveSignal);
  
  // A5: State for showing advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  // State for CreateAccountModal
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [pendingAllocId, setPendingAllocId] = useState(null); // Track which allocation triggered the modal
  
  // State for CreateSymbolModal
  const [createSymbolOpen, setCreateSymbolOpen] = useState(false);
  
  const handleImageClick = (index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  
  // State for "no account attached" checkbox
  const [noAccountAttached, setNoAccountAttached] = useState(() => {
    // Check if existing trade has no account
    if (initial) {
      const hasAccount = initial.accountId || 
        (Array.isArray(initial.allocations) && initial.allocations.some(a => a?.accountId));
      return !hasAccount;
    }
    return false;
  });

  const [t, setT] = useState(() => {
    // Determine which account to use: defaultAccountId > first active account (excluding archived, passed, failed)
    const activeAccounts = (accounts || []).filter((x) => !x?.archivedAt && x?.status !== "Passed" && x?.status !== "Failed");
    const initialAccountId = defaultAccountId || activeAccounts?.[0]?.id || "";
    
    const base = initial ?? {
      id: uid(),
      date: isoDate(),
      symbolId: (libraries.symbols || []).find((s) => !isDeleted(s))?.id ?? "",
      sessionId: (libraries.sessions || []).find((s) => !isDeleted(s))?.id ?? "",
      direction: "Long",
      outcome: "Profit",
      allocations: [
        {
          id: uid(),
          accountId: initialAccountId,
          riskPctOverride: null,
          rr: 0,
          riskUsd: 0,
          pnl: 0,
          commission: 0,
        },
      ],
      // optional trade detail fields
      entryPrice: "",
      stopPrice: "",
      exitPrice: "",
      fees: "",
      links: [], // A3: Multiple links [{ id, title, url }]
      images: [], // A4: Multiple images [{ id, title, dataUrl }]
      positionNotes: "",
      positionNotesHtml: "",
      comments: "",
      commentsHtml: "",
      journal: "",
      journalHtml: "",
      tags: [],
      notes: "",
      notesHtml: "",
      followPlan: true,
      bestTrade: false,
      docIds: [], // Document IDs linked to this trade
      ideaIds: [], // Trading Idea IDs linked to this trade
      createdAt: monoNow(),
    };

    const allocs0 = asAllocations(base, accounts).map(a => sanitizeAlloc(a, !!a?.accountId));
    const totalPnl0 = sumPnL(allocs0);
    const outcome0 = base.outcome || inferOutcomeFromTotals(totalPnl0);
    const allocs = applyOutcomeToAllocs(outcome0, allocs0);

    // Backward compatibility: convert old tradeLink to new links array
    let links = Array.isArray(base.links) && base.links.length > 0 
      ? base.links 
      : (base.tradeLink ? [{ id: uid(), title: "Trade Link", url: base.tradeLink }] : []);
    
    // Ensure images is an array
    let images = Array.isArray(base.images) ? base.images : [];

    return {
      ...base,
      outcome: outcome0,
      allocations: allocs,
      links,
      images,
    };
  });

  const allocs = (t.allocations || []).map(a => sanitizeAlloc(a, !noAccountAttached && !!a?.accountId));
  const totalR = totalRR(allocs, accById);
  const totalPnl = sumPnL(allocs);
  const mixedPnlLabel = fmtMixedPnL(allocs, accById);

  // Helper to compute effective risk for an allocation (works for both modes)
  const getEffectiveRisk = (a, acc) => {
    const snapRisk = clampNum(a?.riskUsd);
    if (snapRisk > 0) return snapRisk;
    if (acc) {
      // Calculate from % and account equity
      const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
      const pct = effRiskPct(a, acc);
      return (eq * pct) / 100;
    }
    // For no-account with % mode, calculate from noAccountBase
    const base = clampNum(a?.noAccountBase);
    const pct = clampNum(a?.riskPctOverride);
    if (base > 0 && pct > 0) {
      return (base * pct) / 100;
    }
    return 0;
  };

  // Auto-compute PnL when pnlMode is auto and relevant fields change
  const updateAllocWithAutoPnl = (id, patch) => {
    setT((p) => ({
      ...p,
      allocations: (p.allocations || []).map((a) => {
        if (a.id !== id) return a;
        const updated = { ...a, ...patch };
        
        // If pnlMode is being set to manual, just update without recalculating
        if (patch.pnlMode === "manual") {
          return updated;
        }
        
        // Check if we should compute auto PnL
        if (updated.pnlMode === "auto") {
          const acc = accById.get(updated.accountId);
          const effectiveRisk = getEffectiveRisk(updated, acc);
          const autoPnl = computeAutoPnl({
            outcome: p.outcome,
            riskUsd: effectiveRisk,
            rr: updated.rr,
          });
          
          if (autoPnl) {
            return { ...updated, pnl: autoPnl.pnl, pnlInput: autoPnl.pnlInput };
          }
        }
        
        return updated;
      }),
    }));
  };

  const addAlloc = () => {
    const used = new Set(allocs.map((a) => a.accountId).filter(Boolean));
    const nextAcc = (accounts || []).find((a) => a.id && !used.has(a.id))?.id || accounts?.[0]?.id || "";
    setT((p) => ({
      ...p,
      allocations: applyOutcomeToAllocs(p.outcome, [
        ...(p.allocations || []).map(a => sanitizeAlloc(a, !noAccountAttached && !!a?.accountId)),
        { id: uid(), accountId: nextAcc, riskPctOverride: null, rr: 0, riskUsd: 0, pnl: 0, pnlMode: "auto", riskMode: "pct" },
      ]),
    }));
  };

  const removeAlloc = (id) => {
    setT((p) => {
      const next = (p.allocations || []).filter((a) => a.id !== id);
      return { ...p, allocations: next.length ? next : p.allocations };
    });
  };

  const setOutcome = (nextOutcome) => {
    setT((p) => {
      const updatedAllocs = applyOutcomeToAllocs(nextOutcome, (p.allocations || []).map(a => sanitizeAlloc(a, !noAccountAttached && !!a?.accountId)));
      
      // Recalculate auto PnL for allocations in auto mode
      const allocsWithAutoPnl = updatedAllocs.map((a) => {
        if (a.pnlMode !== "auto") return a;
        
        const acc = accById.get(a.accountId);
        const snapRisk = clampNum(a?.riskUsd);
        let effectiveRisk = snapRisk;
        if (effectiveRisk <= 0) {
          if (acc) {
            const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
            const pct = effRiskPct(a, acc);
            effectiveRisk = (eq * pct) / 100;
          } else {
            const base = clampNum(a?.noAccountBase);
            const pct = clampNum(a?.riskPctOverride);
            if (base > 0 && pct > 0) {
              effectiveRisk = (base * pct) / 100;
            }
          }
        }
        
        const autoPnl = computeAutoPnl({
          outcome: nextOutcome,
          riskUsd: effectiveRisk,
          rr: a.rr,
        });
        
        if (autoPnl) {
          return { ...a, pnl: autoPnl.pnl, pnlInput: autoPnl.pnlInput };
        }
        return a;
      });
      
      return {
        ...p,
        outcome: nextOutcome,
        allocations: allocsWithAutoPnl,
      };
    });
  };

  const updateAlloc = (id, patch) => {
    setT((p) => ({
      ...p,
      allocations: (p.allocations || []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  };

  // Handle account selection that may trigger "create account" modal
  const handleAccountChange = (allocId, selectedValue) => {
    if (selectedValue === CREATE_ACCOUNT_VALUE) {
      // Open CreateAccountModal and remember which allocation triggered it
      setPendingAllocId(allocId);
      setCreateAccountOpen(true);
    } else {
      updateAlloc(allocId, { accountId: selectedValue });
    }
  };

  // Handle newly created account from CreateAccountModal
  const handleAccountCreated = (newAccount) => {
    // Save the new account to the database via parent callback
    if (onCreateAccount) {
      onCreateAccount(newAccount);
    }
    
    // Update the allocation that triggered the modal with the new account
    if (pendingAllocId) {
      updateAlloc(pendingAllocId, { accountId: newAccount.id });
      setPendingAllocId(null);
    }
  };

  // Handle symbol selection that may trigger "create symbol" modal
  const handleSymbolChange = (selectedValue) => {
    if (selectedValue === CREATE_SYMBOL_VALUE) {
      setCreateSymbolOpen(true);
    } else {
      setT((p) => ({ ...p, symbolId: selectedValue }));
    }
  };

  // Handle newly created symbol from CreateSymbolModal
  const handleSymbolCreated = (newSymbol) => {
    // Save the new symbol to the database via parent callback
    if (onCreateSymbol) {
      onCreateSymbol(newSymbol);
    }
    
    // Update the trade with the new symbol
    setT((p) => ({ ...p, symbolId: newSymbol.id }));
  };

  const onSaveClick = () => {
    // Handle "no account attached" mode
    if (noAccountAttached) {
      // Create allocation without account for PnL/RR tracking
      // Use sanitized allocs which includes both raw and computed values
      const sanitizedAlloc = allocs[0] || {};
      const rawAlloc = (t.allocations || [])[0] || {};
      // Prefer values from sanitized alloc, fall back to raw allocation
      const pnlVal = clampNum(sanitizedAlloc.pnl ?? rawAlloc.pnl);
      const rrVal = clampNum(sanitizedAlloc.rr ?? rawAlloc.rr);
      const riskUsdVal = clampNum(sanitizedAlloc.riskUsd ?? rawAlloc.riskUsd);
      const commissionVal = clampNum(sanitizedAlloc.commission ?? rawAlloc.commission);
      const allocId = sanitizedAlloc.id || rawAlloc.id || uid();
      
      // BE: allow user-entered PnL (+/-); Loss: force negative; Profit: force positive
      const normalizedPnl = t.outcome === "BE" 
        ? pnlVal 
        : (t.outcome === "Loss" ? -Math.abs(pnlVal) : Math.abs(pnlVal));
      
      const allocsWithoutAccount = [{
        id: allocId,
        accountId: "",
        riskPctOverride: null,
        rr: rrVal,
        riskUsd: riskUsdVal,
        pnl: normalizedPnl,
        commission: commissionVal,
      }];
      
      // Clean up links and images
      const cleanedLinks = (t.links || []).filter(l => l.url?.trim()).map(l => ({
        id: l.id || uid(),
        title: (l.title || "").trim(),
        url: (l.url || "").trim()
      }));
      
      const cleanedImages = (t.images || []).filter(i => i.dataUrl).map(i => ({
        id: i.id || uid(),
        title: (i.title || "").trim(),
        dataUrl: i.dataUrl
      }));
      
      const item = {
        ...t,
        allocations: allocsWithoutAccount,
        accountId: "",
        riskPctOverride: null,
        rr: rrVal,
        pnl: normalizedPnl,
        outcome: t.outcome || inferOutcomeFromTotals(pnlVal),
        links: cleanedLinks,
        images: cleanedImages,
        tradeLink: cleanedLinks.length > 0 ? cleanedLinks[0].url : (t.tradeLink || ""),
      };
      onSave(item);
      return;
    }
    
    const cleaned = (t.allocations || [])
      .map(a => sanitizeAlloc(a, !!a?.accountId))
      .filter((a) => !!a.accountId);

    const fixed = cleaned.length ? cleaned : [{ id: uid(), accountId: accounts?.[0]?.id ?? "", riskPctOverride: null, rr: 0, riskUsd: 0, pnl: 0, commission: 0 }];
    const fixed2 = applyOutcomeToAllocs(t.outcome || "Profit", fixed);

    // Snapshot risk ($) per allocation and keep user-defined RR (independent from PnL).
    // If RR is empty/zero, we initialize it from |PnL|/Risk at save time (you can still change it afterwards).
    const fixed3 = fixed2.map((a) => {
      const acc = accById.get(a.accountId);
      // Use snapshotted riskUsd if > 0 (especially for $ mode), otherwise calculate from %
      const snapRisk = clampNum(a.riskUsd);
      const riskUsd = snapRisk > 0 ? snapRisk : riskUsdForAlloc(a, acc);
      const manual = clampNum(a.rr);
      const rr = manual > 0 ? Math.abs(manual) : (riskUsd ? Math.abs(clampNum(a.pnl)) / riskUsd : 0);
      // Remove UI-only fields before saving
      const cleanAlloc = stripUIFields(a);
      return { ...cleanAlloc, riskUsd, rr };
    });

    const totalPnl = sumPnL(fixed3);
    const totalR = totalRR(fixed3, accById);

    // Keep legacy fields populated for backward compatibility.
    const primaryAccId = fixed3[0]?.accountId ?? "";
    
    // Clean up links and images
    const cleanedLinks = (t.links || []).filter(l => l.url?.trim()).map(l => ({
      id: l.id || uid(),
      title: (l.title || "").trim(),
      url: (l.url || "").trim()
    }));
    
    const cleanedImages = (t.images || []).filter(i => i.dataUrl).map(i => ({
      id: i.id || uid(),
      title: (i.title || "").trim(),
      dataUrl: i.dataUrl
    }));
    
    const item = {
      ...t,
      allocations: fixed3,
      accountId: primaryAccId,
      riskPctOverride: null,
      rr: totalR,
      pnl: totalPnl,  // Always save actual PnL, even for BE (outcome is a label, pnl is money)
      outcome: t.outcome || inferOutcomeFromTotals(totalPnl),
      links: cleanedLinks,
      images: cleanedImages,
      // Keep tradeLink for backward compatibility (use first link if exists)
      tradeLink: cleanedLinks.length > 0 ? cleanedLinks[0].url : (t.tradeLink || ""),
    };
    onSave(item);
  };

  // Track dirty state (unsaved changes)
  useEffect(() => {
    // establish baseline once per mount
    if (baselineRef.current === null) {
      baselineRef.current = JSON.stringify(normalizeTradeForDirty(t));
      onDirtyChange?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (baselineRef.current === null) return;
    const cur = JSON.stringify(normalizeTradeForDirty(t));
    onDirtyChange?.(cur !== baselineRef.current);
  }, [t, onDirtyChange]);

  // Allow parent to request a save (used by the "unsaved changes" confirm)
  useEffect(() => {
    if (saveSignal === undefined) return;
    if (lastSaveSignalRef.current !== saveSignal) {
      lastSaveSignalRef.current = saveSignal;
      onSaveClick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal]);

  return (
    <div className="space-y-4 pb-4">
      {/* Bottom padding accounts for sticky footer */}
      
      {/* === Trade Summary Header === */}
      <div className="rounded-xl border-2 border-accent/15 bg-gradient-to-r from-card via-muted/20 to-card p-4 relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-accent/10 blur-2xl" />
        
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          {/* Left: Symbol with icon & Direction */}
          <div className="flex items-center gap-3">
            {(() => {
              const sym = (libraries.symbols || []).find((s) => s.id === t.symbolId);
              return (
                <AvatarBubble 
                  avatar={sym?.avatar} 
                  color={sym?.color || (t.direction === "Long" ? "#10b981" : "#f43f5e")} 
                  size={56} 
                />
              );
            })()}
            <div>
              <div className="text-lg font-bold">
                {(() => {
                  const sym = (libraries.symbols || []).find((s) => s.id === t.symbolId);
                  return sym?.name || tx("pages.trades.editor.labels.pair");
                })()}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  t.direction === "Long" 
                    ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-500" 
                    : "bg-red-500/15 text-red-500 dark:text-red-500"
                }`}>
                  {t.direction === "Long" ? <ArrowUpRight className="inline h-3 w-3 mr-0.5" /> : <ArrowDownRight className="inline h-3 w-3 mr-0.5" />}
                  {t.direction?.toUpperCase() || "LONG"}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  t.outcome === "Profit" 
                    ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-500" 
                    : t.outcome === "Loss"
                    ? "bg-red-500/15 text-red-500 dark:text-red-500"
                    : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                }`}>
                  {t.outcome || "PROFIT"}
                </span>
              </div>
            </div>
          </div>
          
          {/* Right: Key Metrics */}
          <div className="flex items-center gap-4">
            <div className="text-center px-4 py-1 rounded-xl bg-muted/30">
              <div className="text-[10px] uppercase text-muted-foreground font-medium">RR</div>
              <div className="text-lg font-bold">{fmtRR(totalR)}</div>
            </div>
            <div className="text-center px-4 py-1 rounded-xl bg-muted/30">
              <div className="text-[10px] uppercase text-muted-foreground font-medium">PnL</div>
              <div className={`text-lg font-bold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {mixedPnlLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* === Section 1: Trade Info === */}
      <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Target className="h-4 w-4 text-blue-500" />
          </div>
          <h3 className="text-sm font-semibold">{tx("pages.trades.editor.sections.tradeInfo")}</h3>
        </div>
        
        {/* Date and Symbol row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {tx("pages.trades.editor.labels.date")}
            </div>
            <SingleDatePicker 
              value={t.date} 
              onChange={(val) => setT((p) => ({ ...p, date: val }))} 
              placeholder={tx("pages.trades.editor.labels.date")}
            />
          </div>
          
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              {tx("pages.trades.editor.labels.pair")}
            </div>
            <SelectDropdown
              value={t.symbolId}
              onChange={handleSymbolChange}
              searchable={true}
              options={(() => {
                const all = libraries.symbols || [];
                const cur = all.find((x) => x.id === t.symbolId);
                const list = all.filter((x) => !isDeleted(x));
                const opts = list.map((s) => ({
                  value: s.id,
                  label: s.name,
                  icon: s.avatar?.emoji ? <span>{s.avatar.emoji}</span> : (s.avatar?.imageData ? <img src={s.avatar.imageData} alt={s.name} className="w-5 h-5 rounded object-cover" /> : null),
                }));
                // Include deleted option if current selection is deleted
                if (cur && isDeleted(cur)) {
                  opts.unshift({
                    value: cur.id,
                    label: `${cur.name} (${tx("common.deleted")})`,
                    disabled: true,
                  });
                }
                // Add "+ Create symbol" option at the bottom if callback is provided
                if (onCreateSymbol) {
                  opts.push({
                    value: CREATE_SYMBOL_VALUE,
                    label: tx("pages.trades.editor.createSymbol.option") || "+ Create symbol",
                    icon: <PlusCircle className="h-5 w-5 text-accent" />,
                  });
                }
                return opts;
              })()}
              placeholder={tx("pages.trades.editor.labels.pair")}
            />
          </div>
        </div>
        
        {/* Direction Buttons */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            {tx("pages.trades.editor.labels.direction")}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setT((p) => ({ ...p, direction: "Long" }))}
              className={`flex-1 h-11 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-colors duration-150 ${
                t.direction === "Long"
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-accent/15"
              }`}
            >
              <ArrowUpRight className="h-4 w-4" />
              {tx("common.long")}
            </button>
            <button
              type="button"
              onClick={() => setT((p) => ({ ...p, direction: "Short" }))}
              className={`flex-1 h-11 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-colors duration-150 ${
                t.direction === "Short"
                  ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-accent/15"
              }`}
            >
              <ArrowDownRight className="h-4 w-4" />
              {tx("common.short")}
            </button>
          </div>
        </div>
        
        {/* Outcome Buttons */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            {tx("pages.trades.editor.labels.result")}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOutcome("Profit")}
              className={`flex-1 h-11 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-colors duration-150 ${
                t.outcome === "Profit"
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-accent/15"
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              {tx("common.profit")}
            </button>
            <button
              type="button"
              onClick={() => setOutcome("BE")}
              className={`flex-1 h-11 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-colors duration-150 ${
                t.outcome === "BE"
                  ? "bg-amber-500 text-white shadow-lg shadow-amber-500/25"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-accent/15"
              }`}
            >
              <Minus className="h-4 w-4" />
              {tx("common.be")}
            </button>
            <button
              type="button"
              onClick={() => setOutcome("Loss")}
              className={`flex-1 h-11 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-colors duration-150 ${
                t.outcome === "Loss"
                  ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50 border border-accent/15"
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              {tx("common.loss")}
            </button>
          </div>
        </div>
        
        {/* Session */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <Clock className="h-3.5 w-3.5" />
            {tx("pages.trades.editor.labels.session")}
          </div>
          <SelectDropdown
            value={t.sessionId}
            onChange={(val) => setT((p) => ({ ...p, sessionId: val }))}
            searchable={false}
            options={(() => {
              const all = libraries.sessions || [];
              const cur = all.find((x) => x.id === t.sessionId);
              const list = all.filter((x) => !isDeleted(x));
              const opts = list.map((s) => ({
                value: s.id,
                label: s.name,
                icon: <SessionBadge name={s.name} />,
              }));
              // Include deleted option if current selection is deleted
              if (cur && isDeleted(cur)) {
                opts.unshift({
                  value: cur.id,
                  label: `${cur.name} (${tx("common.deleted")})`,
                  disabled: true,
                });
              }
              return opts;
            })()}
            placeholder={tx("pages.trades.editor.labels.session")}
          />
        </div>

        {/* Model */}
        {modelsEnabled && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <Brain className="h-3.5 w-3.5" />
            {tx("pages.trades.editor.labels.model")}
          </div>
          <SelectDropdown
            value={t.modelId || ""}
            onChange={(val) => setT((p) => ({ ...p, modelId: val }))}
            searchable={false}
            options={(() => {
              const all = libraries.models || [];
              const cur = all.find((x) => x.id === t.modelId);
              const list = all.filter((x) => !isDeleted(x));
              const opts = [
                { value: "", label: tx("pages.trades.editor.labels.noModel") },
                ...list.map((m) => ({
                  value: m.id,
                  label: m.name,
                })),
              ];
              // Include deleted option if current selection is deleted
              if (cur && isDeleted(cur)) {
                opts.splice(1, 0, {
                  value: cur.id,
                  label: `${cur.name} (${tx("common.deleted")})`,
                  disabled: true,
                });
              }
              return opts;
            })()}
            placeholder={tx("pages.trades.editor.labels.model")}
          />
        </div>
        )}
      </div>

      {/* Hidden: old tradeLink single field, kept for backward compat but not shown */}
      <input type="hidden" value={t.tradeLink || ""} />

      {/* Custom Tags */}
      {(() => {
        const allTags = libraries.customTags || [];
        const activeTags = allTags.filter((tg) => !isDeleted(tg));
        const selectedTagIds = Array.isArray(t.tags) ? t.tags : [];
        const availableTags = activeTags.filter((tg) => !selectedTagIds.includes(tg.id));
        return (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <Tag className="h-3.5 w-3.5" />
              {tx("pages.trades.editor.labels.tags", null, "Tags")}
            </div>
            <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-accent/20 bg-card/30 min-h-[48px]">
              {selectedTagIds.map((tagId) => {
                const tagObj = allTags.find((tg) => tg.id === tagId);
                const tagName = tagObj?.name || tagId;
                const tagColor = tagObj?.avatar?.color || tagObj?.color || "#6b7280";
                return (
                  <Badge
                    key={tagId}
                    variant="secondary"
                    className="text-xs gap-1 cursor-pointer hover:bg-destructive/20 transition-colors"
                    style={{ backgroundColor: tagColor + "22", borderColor: tagColor + "44", color: tagColor }}
                    onClick={() => setT((p) => ({ ...p, tags: (p.tags || []).filter((id) => id !== tagId) }))}
                  >
                    {tagObj?.avatar?.emoji ? <span className="mr-0.5">{tagObj.avatar.emoji}</span> : null}
                    {tagName}
                    <X className="h-3 w-3" />
                  </Badge>
                );
              })}
              {availableTags.length > 0 && (
                <SelectDropdown
                  value=""
                  onChange={(value) => {
                    if (value) {
                      setT((p) => ({ ...p, tags: [...new Set([...(p.tags || []), value])] }));
                    }
                  }}
                  options={availableTags.map((tg) => ({
                    value: tg.id,
                    label: tg.name,
                    icon: tg.avatar?.emoji ? <span>{tg.avatar.emoji}</span> : <Tag className="h-4 w-4" style={{ color: tg.avatar?.color || tg.color || "#6b7280" }} />,
                  }))}
                  placeholder={tx("pages.trades.editor.labels.addTag", null, "+ Add tag")}
                  searchable={true}
                  className="!mt-0 min-w-[140px]"
                />
              )}
              {activeTags.length === 0 && selectedTagIds.length === 0 && (
                <span className="text-xs text-muted-foreground">{tx("pages.trades.editor.labels.noTags", null, "No tags created yet")}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Highlight Color */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
          <Palette className="h-3.5 w-3.5" />
          {tx("pages.trades.editor.labels.highlightColor", null, "Highlight")}
        </div>
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-accent/20 bg-card/30 min-h-[48px]">
          {[
            "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
            "#3b82f6", "#8b5cf6", "#ec4899",
          ].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setT((p) => ({ ...p, highlightColor: p.highlightColor === c ? null : c }))}
              className="h-7 w-7 rounded-lg border-2 transition-all shrink-0"
              style={{
                backgroundColor: c + "33",
                borderColor: t.highlightColor === c ? c : "transparent",
                boxShadow: t.highlightColor === c ? `0 0 0 2px ${c}44` : "none",
              }}
            >
              <span className="block h-full w-full rounded-md" style={{ backgroundColor: c }} />
            </button>
          ))}
          {t.highlightColor && (
            <button
              type="button"
              onClick={() => setT((p) => ({ ...p, highlightColor: null }))}
              className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-accent/20 hover:bg-muted/30 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

        {/* === Section 2: Links === */}
        <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Link2 className="h-4 w-4 text-violet-500" />
              </div>
              <h3 className="text-sm font-semibold">Links</h3>
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => setT(p => ({ 
                ...p, 
                links: [...(p.links || []), { id: uid(), title: "", url: "" }] 
              }))}
              className="gap-1 h-8"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {(t.links || []).length > 0 ? (
            <div className="space-y-2">
              {(t.links || []).map((link, idx) => (
                <div key={link.id} className="flex gap-2 items-center p-2 rounded-xl bg-muted/20 border border-accent/20">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      placeholder="Title"
                      className="h-9"
                      value={link.title || ""}
                      onChange={(e) => setT(p => ({
                        ...p,
                        links: p.links.map((l, i) => i === idx ? { ...l, title: e.target.value } : l)
                      }))}
                    />
                    <Input
                      placeholder="https://..."
                      className="h-9"
                      value={link.url || ""}
                      onChange={(e) => setT(p => ({
                        ...p,
                        links: p.links.map((l, i) => i === idx ? { ...l, url: e.target.value } : l)
                      }))}
                    />
                  </div>
                  {link.url && (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-accent/10 hover:bg-accent/20 text-accent"
                      title="Open link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setT(p => ({
                      ...p,
                      links: p.links.filter((_, i) => i !== idx)
                    }))}
                    className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/15 text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">No links added yet</p>
          )}
        </div>

        {/* === Section 3: Screenshots === */}
        <div 
          className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4"
          onPaste={async (e) => {
            // Handle clipboard paste
            const items = e.clipboardData?.items;
            if (!items) return;
            
            const imageFiles = [];
            for (const item of items) {
              if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
              }
            }
            
            if (imageFiles.length === 0) return;
            e.preventDefault();
            
            for (const file of imageFiles) {
              try {
                const dataUrl = await resizeImageFileToDataUrl(file, { maxSize: 1920, quality: 0.92 });
                setT(p => ({
                  ...p,
                  images: [...(p.images || []), { id: uid(), title: file.name?.trim() || tx("pages.trades.editor.images.pastedImage"), dataUrl }]
                }));
              } catch (err) {
                console.error('Image paste failed:', err);
              }
            }
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-pink-500/10 flex items-center justify-center">
                <Image className="h-4 w-4 text-pink-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{tx("pages.trades.editor.images.title")}</h3>
                <p className="text-[10px] text-muted-foreground">{tx("pages.trades.editor.images.pasteHint")}</p>
              </div>
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.multiple = true;
                input.onchange = async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  
                  for (const file of files) {
                    try {
                      const dataUrl = await resizeImageFileToDataUrl(file, { maxSize: 1920, quality: 0.92 });
                      setT(p => ({
                        ...p,
                        images: [...(p.images || []), { id: uid(), title: file.name, dataUrl }]
                      }));
                    } catch (err) {
                      console.error('Image upload failed:', err);
                    }
                  }
                };
                input.click();
              }}
              className="gap-1 h-8"
            >
              <Plus className="h-3.5 w-3.5" /> {tx("pages.trades.editor.images.add")}
            </Button>
          </div>
          {(t.images || []).length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(t.images || []).map((img, idx) => (
                <div key={img.id} className="relative group">
                  <div 
                    className="aspect-video rounded-xl overflow-hidden border-2 border-accent/15 bg-muted/20 cursor-pointer hover:border-pink-500/50 transition shadow-sm"
                    onClick={() => handleImageClick(idx)}
                  >
                    <img 
                      src={img.dataUrl} 
                      alt={img.title || `Image ${idx + 1}`} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <ImageRemoveButton
                    onClick={() => setT(p => ({
                      ...p,
                      images: p.images.filter((_, i) => i !== idx)
                    }))}
                    title={tx("common.remove") || "Remove"}
                    size="md"
                  />
                  {(t.images || []).length > 1 && (
                    <div className="absolute bottom-[calc(2rem+0.75rem)] left-2 flex gap-1">
                      {idx > 0 && (
                        <button
                          type="button"
                          title={tx("pages.trades.editor.images.moveLeft") || "Move left"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setT(p => {
                              const imgs = [...(p.images || [])];
                              [imgs[idx - 1], imgs[idx]] = [imgs[idx], imgs[idx - 1]];
                              return { ...p, images: imgs };
                            });
                          }}
                          className="h-7 w-7 rounded-lg flex items-center justify-center bg-black/60 text-white shadow-lg ring-1 ring-black/20 backdrop-blur-sm hover:bg-black/80 active:scale-95 transition-all"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {idx < (t.images || []).length - 1 && (
                        <button
                          type="button"
                          title={tx("pages.trades.editor.images.moveRight") || "Move right"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setT(p => {
                              const imgs = [...(p.images || [])];
                              [imgs[idx], imgs[idx + 1]] = [imgs[idx + 1], imgs[idx]];
                              return { ...p, images: imgs };
                            });
                          }}
                          className="h-7 w-7 rounded-lg flex items-center justify-center bg-black/60 text-white shadow-lg ring-1 ring-black/20 backdrop-blur-sm hover:bg-black/80 active:scale-95 transition-all"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  <Input
                    placeholder={tx("pages.trades.editor.images.caption")}
                    className="mt-2 h-8 text-xs"
                    value={img.title || ""}
                    onChange={(e) => setT(p => ({
                      ...p,
                      images: p.images.map((i, ii) => ii === idx ? { ...i, title: e.target.value } : i)
                    }))}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 border-2 border-dashed border-accent/15 rounded-xl">
              <div className="text-center">
                <Image className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground">{tx("pages.trades.editor.images.empty")}</p>
              </div>
            </div>
          )}
        </div>

      {/* === Section: Related Documents / Plans === */}
      {documents && !isBacktestMode && (
        <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-500" />
              </div>
              <h3 className="text-sm font-semibold">{tx("pages.trades.editor.sections.relatedDocs") || "Related Documents"}</h3>
            </div>
            <div className="w-52">
              <SelectDropdown
                value=""
                onChange={(value) => {
                  if (value) {
                    setT(p => ({
                      ...p,
                      docIds: [...new Set([...(p.docIds || []), value])]
                    }));
                  }
                }}
                options={(documents || [])
                  .filter(doc => !(t.docIds || []).includes(doc.id))
                  // Limit to 30 documents for dropdown performance; searchable allows finding any doc
                  .slice(0, 30)
                  .map(doc => {
                    const typeLabel = (doc.type || "note").replace(/_/g, ' ');
                    return {
                      value: doc.id,
                      label: `${doc.title || "Untitled"} • ${typeLabel}`,
                    };
                  })}
                placeholder={`+ ${tx("pages.trades.editor.labels.linkDocument") || "Link Document"}`}
                searchable={true}
                className="!mt-0"
              />
            </div>
          </div>
          
          {(t.docIds || []).length > 0 ? (
            <div className="space-y-2">
              {(t.docIds || []).map(docId => {
                const doc = docById.get(docId);
                if (!doc) return null;
                const typeLabel = doc.type ? doc.type.replace(/_/g, ' ') : "note";
                const dateLabel = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : "";
                return (
                  <div key={docId} className="flex gap-2 items-center p-2 rounded-xl bg-muted/20 border border-accent/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        <span className="text-sm font-medium truncate">{doc.title || "Untitled"}</span>
                        <span className="text-[10px] text-muted-foreground capitalize shrink-0">{typeLabel}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{dateLabel}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateToDocument?.(docId)}
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-accent/10 hover:bg-accent/20 text-accent"
                      title={tx("common.open") || "Open"}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setT(p => ({
                        ...p,
                        docIds: (p.docIds || []).filter(id => id !== docId)
                      }))}
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/15 text-red-500"
                      title={tx("common.unlink") || "Unlink"}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">{tx("pages.trades.editor.labels.noLinkedDocs") || "No documents linked yet"}</p>
          )}
        </div>
      )}

      {/* === Section: Related Trading Ideas === */}
      {ideas && ideas.length > 0 && !isBacktestMode && (
        <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Lightbulb className="h-4 w-4 text-amber-500" />
              </div>
              <h3 className="text-sm font-semibold">{tx("pages.trades.editor.sections.relatedIdeas") || "Related Ideas"}</h3>
            </div>
            <div className="w-52">
              <SelectDropdown
                value=""
                onChange={(value) => {
                  if (value) {
                    setT(p => ({
                      ...p,
                      ideaIds: [...new Set([...(p.ideaIds || []), String(value)])]
                    }));
                  }
                }}
                options={(ideas || [])
                  .filter(idea => !(t.ideaIds || []).map(String).includes(String(idea.id)))
                  .slice(0, 30)
                  .map(idea => ({
                    value: String(idea.id),
                    label: idea.title || "Untitled",
                    subtext: `${idea.status || "Planned"} • ${idea.pair || "—"}`,
                  }))}
                placeholder={`+ ${tx("pages.trades.editor.labels.linkIdea") || "Link Idea"}`}
                searchable={true}
                className="!mt-0"
              />
            </div>
          </div>
          
          {(t.ideaIds || []).length > 0 ? (
            <div className="space-y-2">
              {(t.ideaIds || []).map(ideaId => {
                const idea = ideas.find(i => String(i.id) === String(ideaId));
                if (!idea) return null;
                const resultColor = idea.result === "Worked" ? "text-emerald-400" 
                  : idea.result === "Failed" ? "text-red-400" 
                  : idea.result === "Partial" ? "text-amber-400" 
                  : "text-muted-foreground";
                return (
                  <div key={ideaId} className="flex gap-2 items-center p-2 rounded-xl bg-muted/20 border border-accent/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="text-sm font-medium truncate">{idea.title || "Untitled"}</span>
                        <span className={`text-[10px] shrink-0 ${resultColor}`}>{idea.result || "Unknown"}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {idea.pair || "—"} • {idea.status || "Planned"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateToIdea?.(ideaId)}
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-accent/10 hover:bg-accent/20 text-accent"
                      title={tx("common.open") || "Open"}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setT(p => ({
                        ...p,
                        ideaIds: (p.ideaIds || []).filter(id => String(id) !== String(ideaId))
                      }))}
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/15 text-red-500"
                      title={tx("common.unlink") || "Unlink"}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">{tx("pages.trades.editor.labels.noLinkedIdeas") || "No ideas linked yet"}</p>
          )}
        </div>
      )}

      {/* === Section 4: Account Allocations === */}
      <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-[#3B82F6]/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{tx("pages.trades.editor.labels.accounts")}</h3>
              <p className="text-[10px] text-muted-foreground hidden sm:block">{tx("pages.trades.editor.labels.allocationsHint")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!noAccountAttached && (
              <Button variant="secondary" size="sm" onClick={addAlloc} className="gap-1 h-8">
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* "Don't attach account" toggle */}
        <div className="mb-4 flex items-center justify-between p-3 rounded-xl border border-accent/15 bg-muted/10">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <div className="text-sm font-medium">{tx("pages.trades.editor.labels.noAccountAttach")}</div>
              <div className="text-[10px] text-muted-foreground">{tx("pages.trades.editor.labels.noAccount")}</div>
            </div>
          </div>
          <Switch checked={noAccountAttached} onCheckedChange={setNoAccountAttached} />
        </div>

        {/* Show allocations only if account is attached */}
        {!noAccountAttached && (
          <>
        {/* Mobile: Card layout */}
        <div className="mt-3 space-y-3 md:hidden">
          {allocs.map((a) => {
            const acc = accById.get(a.accountId);
            const effRisk = (a.riskPctOverride === null || a.riskPctOverride === undefined || a.riskPctOverride === "")
              ? clampNum(acc?.defaultRiskPct)
              : clampNum(a.riskPctOverride);
            return (
              <div key={a.id} className="rounded-xl border border-accent/20 bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <SelectDropdown
                    value={a.accountId}
                    options={buildAccountOptions(accounts, a.accountId, tx, !!onCreateAccount && !isBacktestMode)}
                    onChange={(val) => handleAccountChange(a.id, val)}
                    searchable
                    placeholder={tx("pages.trades.editor.labels.selectAccount")}
                    className="flex-1"
                  />
                  {allocs.length > 1 && (
                    <button
                      type="button"
                      className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border border-accent/15 bg-muted/25 hover:bg-muted/40"
                      onClick={() => removeAlloc(a.id)}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {/* Account summary preview */}
                <AccountSummaryPreview account={acc} tx={tx} />
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
                  <div>
                    {/* Risk Mode Toggle - Mobile */}
                    <div className="flex items-center gap-1 mb-1">
                      <div className="text-[10px] text-muted-foreground">{tx("common.risk")}</div>
                      <div className="flex ml-auto rounded-lg bg-muted/30 p-0.5">
                        <button
                          type="button"
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${a.riskMode === "pct" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          onClick={() => updateAllocWithAutoPnl(a.id, { riskMode: "pct" })}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${a.riskMode === "usd" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          onClick={() => updateAllocWithAutoPnl(a.id, { riskMode: "usd" })}
                        >
                          $
                        </button>
                      </div>
                    </div>
                    {a.riskMode === "pct" ? (
                      <>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-9 text-sm"
                          value={a.riskPctOverride === null ? "" : a.riskPctOverride}
                          onChange={(e) => {
                            const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                            const parsed = parseNullableNumber(v);
                            // Calculate riskUsd from % for auto PnL
                            const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
                            const pct = parsed !== null ? parsed : effRisk;
                            const riskUsd = eq > 0 ? (eq * pct) / 100 : 0;
                            updateAllocWithAutoPnl(a.id, { riskPctOverride: v === "" ? null : v, riskUsd });
                          }}
                          onBlur={(e) => {
                            const parsed = parseNullableNumber(e.target.value);
                            updateAlloc(a.id, { riskPctOverride: parsed });
                          }}
                          placeholder={String(effRisk || 1)}
                        />
                        <div className="mt-1 text-[9px] text-muted-foreground">
                          ≈ {fmtMoney(riskUsdForAlloc(a, acc), acc?.currency ?? "$")}
                        </div>
                      </>
                    ) : (
                      <>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-9 text-sm"
                          value={a.riskUsdInput ?? ""}
                          onChange={(e) => {
                            const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                            const parsed = parseNullableNumber(v);
                            updateAllocWithAutoPnl(a.id, { riskUsdInput: v, riskUsd: parsed !== null ? parsed : 0 });
                          }}
                          placeholder="0"
                        />
                        {(() => {
                          const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
                          const pctEquiv = eq > 0 ? (clampNum(a.riskUsd) / eq) * 100 : 0;
                          return eq > 0 ? (
                            <div className="mt-1 text-[9px] text-muted-foreground">
                              ≈ {pctEquiv.toFixed(2)}%
                            </div>
                          ) : null;
                        })()}
                      </>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">RR</div>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-9 text-sm"
                      value={a.rrInput ?? ""}
                      onChange={(e) => {
                        const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                        const parsed = parseNullableNumber(v);
                        updateAllocWithAutoPnl(a.id, { rrInput: v, rr: parsed !== null ? Math.abs(parsed) : 0 });
                      }}
                      placeholder={fmtRR(rrForAlloc(a, acc))}
                    />
                  </div>
                  <div>
                    {/* Commission Toggle - Mobile */}
                    <div className="flex items-center gap-2 mb-2">
                      <Switch 
                        checked={showAdvanced} 
                        onCheckedChange={setShowAdvanced}
                      />
                      <label className="text-[10px] text-muted-foreground cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
                        {tx("pages.trades.editor.labels.commission")}
                      </label>
                    </div>
                    
                    <div className="flex items-center gap-1 mb-1">
                      <div className="text-[10px] text-muted-foreground">PnL</div>
                      {a.pnlMode === "manual" && (
                        <button
                          type="button"
                          className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                          onClick={() => {
                            // Switch back to auto and recalculate
                            const effectiveRisk = getEffectiveRisk(a, acc);
                            const autoPnl = computeAutoPnl({
                              outcome: t.outcome,
                              riskUsd: effectiveRisk,
                              rr: a.rr,
                            });
                            if (autoPnl) {
                              updateAlloc(a.id, { pnlMode: "auto", pnl: autoPnl.pnl, pnlInput: autoPnl.pnlInput });
                            } else {
                              updateAlloc(a.id, { pnlMode: "auto" });
                            }
                          }}
                          title={tx("common.auto")}
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          {tx("common.auto")}
                        </button>
                      )}
                    </div>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-9 text-sm"
                      value={a.pnlInput ?? ""}
                      onChange={(e) => {
                        const v = sanitizeNumericInput(e.target.value, { allowSign: true, allowDecimal: true });
                        const parsed = parseNullableNumber(v);
                        // Mark as manual when user edits PnL directly
                        updateAlloc(a.id, { pnlInput: v, pnl: calcPnlFromInput(parsed, t.outcome || "Profit"), pnlMode: "manual" });
                      }}
                      placeholder="0"
                    />
                    
                    {/* Commission Input - Mobile */}
                    <AnimatePresence>
                      {showAdvanced && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              className="h-8 text-sm"
                              value={a.commissionInput ?? ""}
                              onChange={(e) => {
                                const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                                const parsed = parseNullableNumber(v);
                                updateAlloc(a.id, { commissionInput: v, commission: parsed !== null ? Math.abs(parsed) : 0 });
                              }}
                              placeholder="0.00"
                            />
                            <div className="mt-1 text-[9px] text-muted-foreground leading-snug">
                              ℹ️ {tx("pages.trades.editor.labels.commissionHint")}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Risk: {fmtMoney(riskUsdForAlloc(a, acc), acc?.currency ?? "$")} • 
                  RR: {fmtRR(rrForAlloc(a, acc))} • 
                  PnL: {fmtMoney(a.pnl, acc?.currency ?? "$")}
                  {a.pnlMode === "auto" && <span className="ml-1 text-accent">(auto)</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: Table layout - overflow-visible to allow SelectDropdown menus to display outside */}
        <div className="mt-3 overflow-visible hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-2">{tx("pages.trades.editor.table.account")}</th>
                <th className="pb-2 pr-2 w-[140px]">{tx("common.risk")}</th>
                <th className="pb-2 pr-2 w-[100px]">{tx("pages.trades.editor.table.rr")}</th>
                <th className="pb-2 pr-2 w-[160px]">{tx("pages.trades.editor.table.pnl", { cur: "$" })}</th>
                <th className="pb-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="align-top">
              {allocs.map((a) => {
                const acc = accById.get(a.accountId);
                const effRisk = (a.riskPctOverride === null || a.riskPctOverride === undefined || a.riskPctOverride === "")
                  ? clampNum(acc?.defaultRiskPct)
                  : clampNum(a.riskPctOverride);
                return (
                  <tr key={a.id} className="border-t border-accent/15">
                    <td className="py-2 pr-2">
                      <SelectDropdown
                        value={a.accountId}
                        options={buildAccountOptions(accounts, a.accountId, tx, !!onCreateAccount && !isBacktestMode)}
                        onChange={(val) => handleAccountChange(a.id, val)}
                        searchable
                        placeholder={tx("pages.trades.editor.labels.selectAccount")}
                        className="w-full"
                      />
                      {/* Account summary preview on desktop */}
                      <AccountSummaryPreview account={acc} tx={tx} />
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {tx("common.effective")}: <b>{Number.isFinite(effRisk) ? effRisk.toFixed(2) : "0.00"}%</b>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      {/* Risk Mode Toggle - Desktop */}
                      <div className="flex items-center gap-1 mb-1">
                        <div className="flex rounded-lg bg-muted/30 p-0.5">
                          <button
                            type="button"
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${a.riskMode === "pct" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            onClick={() => updateAllocWithAutoPnl(a.id, { riskMode: "pct" })}
                          >
                            %
                          </button>
                          <button
                            type="button"
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${a.riskMode === "usd" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            onClick={() => updateAllocWithAutoPnl(a.id, { riskMode: "usd" })}
                          >
                            $
                          </button>
                        </div>
                      </div>
                      {a.riskMode === "pct" ? (
                        <>
                          <Input
                            type="text"
                            inputMode="decimal"
                            className="h-9"
                            value={a.riskPctOverride === null ? "" : a.riskPctOverride}
                            onChange={(e) => {
                              const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                              const parsed = parseNullableNumber(v);
                              // Calculate riskUsd from % for auto PnL
                              const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
                              const pct = parsed !== null ? parsed : effRisk;
                              const riskUsd = eq > 0 ? (eq * pct) / 100 : 0;
                              updateAllocWithAutoPnl(a.id, { riskPctOverride: v === "" ? null : v, riskUsd });
                            }}
                            onBlur={(e) => {
                              const parsed = parseNullableNumber(e.target.value);
                              updateAlloc(a.id, { riskPctOverride: parsed });
                            }}
                            placeholder={String(clampNum(acc?.defaultRiskPct) || 1)}
                          />
                          <div className="mt-1 text-[9px] text-muted-foreground">
                            ≈ {fmtMoney(riskUsdForAlloc(a, acc), acc?.currency ?? "$")}
                          </div>
                        </>
                      ) : (
                        <>
                          <Input
                            type="text"
                            inputMode="decimal"
                            className="h-9"
                            value={a.riskUsdInput ?? ""}
                            onChange={(e) => {
                              const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                              const parsed = parseNullableNumber(v);
                              updateAllocWithAutoPnl(a.id, { riskUsdInput: v, riskUsd: parsed !== null ? parsed : 0 });
                            }}
                            placeholder="0"
                          />
                          {(() => {
                            const eq = clampNum(acc?.currentEquity ?? acc?.startingEquity);
                            const pctEquiv = eq > 0 ? (clampNum(a.riskUsd) / eq) * 100 : 0;
                            return eq > 0 ? (
                              <div className="mt-1 text-[9px] text-muted-foreground">
                                ≈ {pctEquiv.toFixed(2)}%
                              </div>
                            ) : null;
                          })()}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-9"
                        value={a.rrInput ?? ""}
                        onChange={(e) => {
                          const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                          const parsed = parseNullableNumber(v);
                          updateAllocWithAutoPnl(a.id, { rrInput: v, rr: parsed !== null ? Math.abs(parsed) : 0 });
                        }}
                        placeholder={fmtRR(rrForAlloc(a, acc))}
                      />
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {tx("common.risk")}: {fmtMoney(riskUsdForAlloc(a, acc), acc?.currency ?? "$")}
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      {/* Commission Toggle - Desktop */}
                      <div className="flex items-center gap-2 mb-2">
                        <Switch 
                          checked={showAdvanced} 
                          onCheckedChange={setShowAdvanced}
                        />
                        <label className="text-[10px] text-muted-foreground cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
                          {tx("pages.trades.editor.labels.commission")}
                        </label>
                        {a.pnlMode === "manual" && (
                          <button
                            type="button"
                            className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                            onClick={() => {
                              // Switch back to auto and recalculate
                              const effectiveRisk = getEffectiveRisk(a, acc);
                              const autoPnl = computeAutoPnl({
                                outcome: t.outcome,
                                riskUsd: effectiveRisk,
                                rr: a.rr,
                              });
                              if (autoPnl) {
                                updateAlloc(a.id, { pnlMode: "auto", pnl: autoPnl.pnl, pnlInput: autoPnl.pnlInput });
                              } else {
                                updateAlloc(a.id, { pnlMode: "auto" });
                              }
                            }}
                            title={tx("common.auto")}
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                            {tx("common.auto")}
                          </button>
                        )}
                      </div>
                      
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-9"
                        value={a.pnlInput ?? ""}
                        onChange={(e) => {
                          const v = sanitizeNumericInput(e.target.value, { allowSign: true, allowDecimal: true });
                          const parsed = parseNullableNumber(v);
                          // Mark as manual when user edits PnL directly
                          updateAlloc(a.id, { pnlInput: v, pnl: calcPnlFromInput(parsed, t.outcome || "Profit"), pnlMode: "manual" });
                        }}
                        placeholder="0"
                      />
                      
                      {/* Commission Input - Desktop */}
                      <AnimatePresence>
                        {showAdvanced && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2">
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="h-8 text-sm"
                                value={a.commissionInput ?? ""}
                                onChange={(e) => {
                                  const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                                  const parsed = parseNullableNumber(v);
                                  updateAlloc(a.id, { commissionInput: v, commission: parsed !== null ? Math.abs(parsed) : 0 });
                                }}
                                placeholder="0.00"
                              />
                              <div className="mt-1 text-[9px] text-muted-foreground leading-snug">
                                ℹ️ {tx("pages.trades.editor.labels.commissionHint")}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        RR: {fmtRR(rrForAlloc(a, acc))} • PnL: {fmtMoney(a.pnl, acc?.currency ?? "$")}
                        {a.pnlMode === "auto" && <span className="ml-1 text-accent">(auto)</span>}
                      </div>
                    </td>
                    <td className="py-2">
                      {(allocs.length > 1) ? (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-accent/15 bg-muted/25 hover:bg-muted/40"
                          onClick={() => removeAlloc(a.id)}
                          title={tx("common.removeAccount")}
                        >
                          <MinusCircle className="h-4 w-4" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-muted/20 border border-accent/20">
          <div className="text-xs text-muted-foreground">
            {tx("common.total")}: <span className="font-semibold text-foreground">{fmtRR(totalR)}</span> • <span className={`font-semibold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>{mixedPnlLabel}</span>
          </div>
        </div>
          </>
        )}
        
        {/* Simple PnL input when no account attached */}
        {noAccountAttached && (
          <div className="mt-3 p-4 rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/5 to-transparent">
            {/* Risk Mode Toggle for no-account */}
            <div className="flex items-center gap-2 mb-3">
              <div className="text-[10px] text-muted-foreground">{tx("common.risk")} mode:</div>
              <div className="flex rounded-lg bg-muted/30 p-0.5">
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${allocs[0]?.riskMode === "usd" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    const allocId = allocs[0]?.id;
                    if (allocId) updateAllocWithAutoPnl(allocId, { riskMode: "usd" });
                  }}
                >
                  $
                </button>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${allocs[0]?.riskMode === "pct" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => {
                    const allocId = allocs[0]?.id;
                    if (allocId) updateAllocWithAutoPnl(allocId, { riskMode: "pct" });
                  }}
                >
                  %
                </button>
              </div>
            </div>
            
            {/* Balance input for % mode */}
            {allocs[0]?.riskMode === "pct" && (
              <div className="mb-3 p-3 rounded-lg bg-muted/20 border border-accent/10">
                <div className="text-[10px] text-muted-foreground mb-1">Balance / Equity</div>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-9 text-sm"
                  value={allocs[0]?.noAccountBaseInput ?? ""}
                  onChange={(e) => {
                    const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                    const parsed = parseNullableNumber(v);
                    const allocId = allocs[0]?.id;
                    if (allocId) {
                      const base = parsed !== null ? parsed : 0;
                      const pct = clampNum(allocs[0]?.riskPctOverride);
                      const riskUsd = base > 0 && pct > 0 ? (base * pct) / 100 : 0;
                      updateAllocWithAutoPnl(allocId, { noAccountBaseInput: v, noAccountBase: base, riskUsd });
                    }
                  }}
                  placeholder="10000"
                />
                {!clampNum(allocs[0]?.noAccountBase) && (
                  <div className="mt-1 text-[9px] text-amber-500">
                    ⚠️ Enter balance to calculate risk in $
                  </div>
                )}
              </div>
            )}
            
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <div>
                {allocs[0]?.riskMode === "pct" ? (
                  <>
                    <div className="text-[10px] text-muted-foreground mb-1">{tx("common.risk")} (%)</div>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-9 text-sm"
                      value={allocs[0]?.riskPctOverride === null ? "" : allocs[0]?.riskPctOverride}
                      onChange={(e) => {
                        const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                        const parsed = parseNullableNumber(v);
                        const allocId = allocs[0]?.id;
                        if (allocId) {
                          const base = clampNum(allocs[0]?.noAccountBase);
                          const pct = parsed !== null ? parsed : 0;
                          const riskUsd = base > 0 && pct > 0 ? (base * pct) / 100 : 0;
                          updateAllocWithAutoPnl(allocId, { riskPctOverride: v === "" ? null : v, riskUsd });
                        }
                      }}
                      placeholder="1"
                    />
                    {(() => {
                      const base = clampNum(allocs[0]?.noAccountBase);
                      const pct = clampNum(allocs[0]?.riskPctOverride);
                      const riskUsd = base > 0 && pct > 0 ? (base * pct) / 100 : 0;
                      return riskUsd > 0 ? (
                        <div className="mt-1 text-[9px] text-muted-foreground">
                          ≈ ${riskUsd.toFixed(2)}
                        </div>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <>
                    <div className="text-[10px] text-muted-foreground mb-1">{tx("common.risk")} ($)</div>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-9 text-sm"
                      value={allocs[0]?.riskUsdInput ?? ""}
                      onChange={(e) => {
                        const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                        const parsed = parseNullableNumber(v);
                        const allocId = allocs[0]?.id;
                        if (allocId) updateAllocWithAutoPnl(allocId, { riskUsdInput: v, riskUsd: parsed !== null ? parsed : 0 });
                      }}
                      placeholder="0"
                    />
                  </>
                )}
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">RR</div>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-9 text-sm"
                  value={allocs[0]?.rrInput ?? ""}
                  onChange={(e) => {
                    const v = sanitizeNumericInput(e.target.value, { allowSign: false, allowDecimal: true });
                    const parsed = parseNullableNumber(v);
                    const allocId = allocs[0]?.id;
                    if (allocId) updateAllocWithAutoPnl(allocId, { rrInput: v, rr: parsed !== null ? Math.abs(parsed) : 0 });
                  }}
                  placeholder="0"
                />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <div className="text-[10px] text-muted-foreground">PnL ($)</div>
                  {allocs[0]?.pnlMode === "manual" && (
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                      onClick={() => {
                        const allocId = allocs[0]?.id;
                        if (allocId) {
                          const effectiveRisk = getEffectiveRisk(allocs[0], null);
                          const autoPnl = computeAutoPnl({
                            outcome: t.outcome,
                            riskUsd: effectiveRisk,
                            rr: allocs[0]?.rr,
                          });
                          if (autoPnl) {
                            updateAlloc(allocId, { pnlMode: "auto", pnl: autoPnl.pnl, pnlInput: autoPnl.pnlInput });
                          } else {
                            updateAlloc(allocId, { pnlMode: "auto" });
                          }
                        }
                      }}
                      title={tx("common.auto")}
                    >
                      <RotateCcw className="h-2.5 w-2.5" />
                      {tx("common.auto")}
                    </button>
                  )}
                </div>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-9 text-sm"
                  value={allocs[0]?.pnlInput ?? ""}
                  onChange={(e) => {
                    const v = sanitizeNumericInput(e.target.value, { allowSign: true, allowDecimal: true });
                    const parsed = parseNullableNumber(v);
                    const allocId = allocs[0]?.id;
                    if (allocId) updateAlloc(allocId, { pnlInput: v, pnl: calcPnlFromInput(parsed, t.outcome || "Profit"), pnlMode: "manual" });
                  }}
                  placeholder="0"
                />
                {allocs[0]?.pnlMode === "auto" && (
                  <div className="mt-1 text-[9px] text-accent">(auto)</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* === Section 5: Notes & Journal === */}
      <div className="rounded-xl border border-accent/15 bg-gradient-to-br from-card/80 to-card/40 p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-cyan-500" />
          </div>
          <h3 className="text-sm font-semibold">{tx("pages.trades.editor.sections.notes")}</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          {!isBacktestMode && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <FileText className="h-3.5 w-3.5" />
              {tx("pages.trades.editor.labels.positionNotes")}
            </div>
            <RichTextEditor
              value={t.positionNotesHtml || (t.positionNotes ? `<p>${t.positionNotes}</p>` : "")}
              onChange={(html, text) => setT((p) => ({ ...p, positionNotesHtml: html, positionNotes: text }))}
              placeholder={tx("pages.trades.editor.placeholders.positionNotes")}
              minHeight={120}
              variant="compact"
            />
          </div>
          )}

          {!isBacktestMode && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              {tx("pages.trades.editor.labels.comments")}
            </div>
            <RichTextEditor
              value={t.commentsHtml || (t.comments ? `<p>${t.comments}</p>` : "")}
              onChange={(html, text) => setT((p) => ({ ...p, commentsHtml: html, comments: text }))}
              placeholder={tx("pages.trades.editor.placeholders.comments")}
              minHeight={120}
              variant="compact"
            />
          </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <FileText className="h-3.5 w-3.5" />
              {tx("pages.trades.editor.labels.notes")}
            </div>
            <RichTextEditor
              value={t.notesHtml || (t.notes ? `<p>${t.notes}</p>` : "")}
              onChange={(html, text) => setT((p) => ({ ...p, notesHtml: html, notes: text }))}
              placeholder={tx("pages.trades.editor.placeholders.notes")}
              minHeight={120}
              variant="compact"
            />
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {tx("pages.trades.editor.labels.journal")}
            </div>
            <RichTextEditor
              value={t.journalHtml || (t.journal ? `<p>${t.journal}</p>` : "")}
              onChange={(html, text) => setT((p) => ({ ...p, journalHtml: html, journal: text }))}
              placeholder={tx("pages.trades.editor.placeholders.journal")}
              minHeight={150}
              variant="compact"
            />
          </div>

        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl bg-muted/20 border border-accent/20">
          <div className="flex items-center gap-2.5">
            <Switch checked={!!t.followPlan} onCheckedChange={(v) => setT((p) => ({ ...p, followPlan: !!v }))} />
            <div className="flex items-center gap-1.5 text-sm">
              <Check className="h-4 w-4 text-emerald-500" />
              {tx("common.followedPlan")}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Switch checked={!!t.bestTrade} onCheckedChange={(v) => setT((p) => ({ ...p, bestTrade: !!v }))} />
            <div className="flex items-center gap-1.5 text-sm">
              <Star className="h-4 w-4 text-amber-500" />
              {tx("common.bestTrade")}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Footer - sticky at bottom of modal, always visible */}
      <div className="sticky bottom-0 left-0 right-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3 border-t border-accent/15 pt-3 pb-3 sm:pt-4 sm:pb-4 -mx-3 sm:-mx-6 px-3 sm:px-6 -mb-3 sm:-mb-5 bg-[rgb(var(--card))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
        <div className="text-xs text-muted-foreground">
          {tx("common.total")}: <span className="font-semibold text-foreground">{fmtRR(totalR)}</span> • <span className={`font-semibold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>{mixedPnlLabel}</span>
        </div>
        <div className="flex gap-2">
          {onShare && initial?.id ? (
            <Button variant="outline" onClick={() => onShare(t)} className="gap-1.5">
              <Share2 className="h-4 w-4" /> {tx("common.share") || "Share"}
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="outline" onClick={onDelete} className="gap-1.5">
              <Trash2 className="h-4 w-4" /> {tx("common.delete")}
            </Button>
          ) : null}

          <Button onClick={onSaveClick} className="gap-1.5 px-6 shadow-lg shadow-accent/20">
            <Check className="h-4 w-4" /> {tx("common.save")}
          </Button>
        </div>
      </div>
      
      {/* Image Lightbox */}
      <ImageLightbox
        images={t.images || []}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Create Account Modal */}
      {onCreateAccount && !isBacktestMode && (
        <CreateAccountModal
          open={createAccountOpen}
          onClose={() => {
            setCreateAccountOpen(false);
            setPendingAllocId(null);
          }}
          onSave={handleAccountCreated}
          propTemplates={propTemplates}
          existingAccounts={accounts}
          toast={toast}
        />
      )}

      {/* Create Symbol Modal */}
      {onCreateSymbol && (
        <CreateSymbolModal
          open={createSymbolOpen}
          onClose={() => setCreateSymbolOpen(false)}
          onSave={handleSymbolCreated}
          existingSymbols={libraries.symbols || []}
          toast={toast}
        />
      )}
    </div>
  );
}

export default function Trades({ trades, accounts, documents, ideas = [], libraries, onUpsert, onUpsertAccount, onUpsertSymbol, propTemplates, onRemove, onRemoveBulk, onNavigateToDocument, onNavigateToIdea, reduceMotion, toast, user, quickTradeAccountId, onClearQuickTrade, openNewTrade, onClearOpenNewTrade, selectedTradeId, onClearSelectedTrade, isBacktestMode, modelsEnabled, flushSync, setShareInFlight, ui }) {
  const { t, tPlural } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // View state: list or gallery (persisted in URL and localStorage)
  const getInitialView = () => {
    const urlView = searchParams.get("view");
    if (urlView === "list" || urlView === "gallery") return urlView;
    const stored = localStorage.getItem("tradesView");
    if (stored === "list" || stored === "gallery") return stored;
    return "list";
  };
  const [view, setView] = useState(getInitialView);
  
  // Enhanced sorting
  const [sortBy, setSortBy] = useState("date"); // date | pnl | rr | outcome | symbol
  const [sortDir, setSortDir] = useState("desc"); // desc = newest/highest first
  
  // Outcome filter
  const [outcomeFilter, setOutcomeFilter] = useState("all"); // all | Profit | Loss | BE
  
  // Account filter
  const [accountFilter, setAccountFilter] = useState("all"); // "all" | NO_ACCOUNT_ID | accountId
  
  // Tag filter
  const [tagFilter, setTagFilter] = useState("all"); // "all" | tagId
  
  const [q, setQ] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [active, setActive] = useState(null);
  const [rangePreset, setRangePreset] = useState("all"); // all | 7d | 30d | custom
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [quickAccountId, setQuickAccountId] = useState(null);
  
  // Multi-select mode for sharing
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTradeIds, setSelectedTradeIds] = useState([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareOptionsOpen, setShareOptionsOpen] = useState(false);
  const [pendingShareTrades, setPendingShareTrades] = useState([]);
  
  // Bulk delete confirmation modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Daily Summary modal state
  const [dailySummaryOpen, setDailySummaryOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null); // "YYYY-MM-DD"
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  
  // Persist view preference
  const handleViewChange = (newView) => {
    setView(newView);
    localStorage.setItem("tradesView", newView);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("view", newView);
    setSearchParams(newParams, { replace: true });
  };
  
  // Handle quick trade from accounts page
  useEffect(() => {
    if (quickTradeAccountId) {
      setQuickAccountId(quickTradeAccountId);
      setOpenCreate(true);
      onClearQuickTrade?.();
    }
  }, [quickTradeAccountId, onClearQuickTrade]);
  
  // Handle "Add Trade" from sidebar — open creation dialog directly
  useEffect(() => {
    if (openNewTrade) {
      setOpenCreate(true);
      onClearOpenNewTrade?.();
    }
  }, [openNewTrade, onClearOpenNewTrade]);
  
  // Handle selected trade from analytics
  useEffect(() => {
    if (selectedTradeId) {
      const trade = trades.find(t => t.id === selectedTradeId);
      if (trade) {
        setActive(trade);
        setOpenEdit(true);
      }
      onClearSelectedTrade?.();
    }
  }, [selectedTradeId, onClearSelectedTrade, trades]);

  const [createDirty, setCreateDirty] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [saveSignalCreate, setSaveSignalCreate] = useState(0);
  const [saveSignalEdit, setSaveSignalEdit] = useState(0);
  const [confirmUnsaved, setConfirmUnsaved] = useState({ open: false, target: null }); // target: 'create' | 'edit'
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Warn the user before navigating away (closing tab, refresh) when a trade
  // editor has unsaved changes. The in-app modal-close path already shows a
  // confirmUnsaved dialog; this covers the browser-level navigation case.
  useEffect(() => {
    const dirty = createDirty || editDirty;
    if (!dirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [createDirty, editDirty]);

  // Register dirty state with the cross-component navGuard so the layout's
  // setActive() can prompt for confirmation before switching pages.
  useEffect(() => {
    setDirty("trades:create", createDirty);
    return () => setDirty("trades:create", false);
  }, [createDirty]);
  useEffect(() => {
    setDirty("trades:edit", editDirty);
    return () => setDirty("trades:edit", false);
  }, [editDirty]);

  const symById = useMemo(() => new Map((libraries.symbols || []).map((s) => [s.id, s])), [libraries]);
  const sesById = useMemo(() => new Map((libraries.sessions || []).map((s) => [s.id, s])), [libraries]);
  const tagById = useMemo(() => new Map((libraries.customTags || []).map((t) => [t.id, t])), [libraries]);
  const accById = useMemo(() => new Map((accounts || []).map((a) => [a.id, a])), [accounts]);
  const docById = useMemo(() => new Map((documents || []).map((d) => [d.id, d])), [documents]);

  // Build account filter options for dropdown
  const accountFilterOptions = useMemo(() => {
    const options = [
      { 
        value: "all", 
        label: t("accounts.allAccounts"), 
        icon: <Wallet className="h-4 w-4 text-accent" /> 
      },
    ];
    
    // Add "No account" option if there are trades without account
    if (hasTradesWithoutAccount(trades)) {
      options.push({ 
        value: NO_ACCOUNT_ID, 
        label: t("accounts.noAccount"), 
        icon: <MinusCircle className="h-4 w-4 text-amber-500" /> 
      });
    }
    
    // Add active accounts (not archived, not deleted)
    const activeAccounts = (accounts || []).filter(a => !isDeleted(a) && !a?.archivedAt);
    for (const acc of activeAccounts) {
      options.push({
        value: acc.id,
        label: acc.name || acc.id,
        icon: <AvatarBubble avatar={acc.avatar} color={acc.color} size={20} />,
      });
    }
    
    return options;
  }, [accounts, trades, t]);

  // Locale for calendar
  const { lang } = useI18n();
  const locale = localeFromLang(lang);
  const today = new Date();
  const currency = useMemo(() => accounts?.[0]?.currency ?? "$", [accounts]);

  // Daily aggregation for calendar (moved from Analytics)
  const dailyAgg = useMemo(() => {
    const map = new Map();
    for (const tr of trades ?? []) {
      const key = normalizeDateKey(tr?.date);
      if (!key) continue;

      const allocs = asAllocations(tr, accounts).map(sanitizeAlloc);
      const pnl = sumPnL(allocs);

      const prev = map.get(key) || { pnl: 0, trades: 0, wins: 0, losses: 0, tradeList: [] };
      const next = { ...prev };
      next.pnl += pnl;
      next.trades += 1;
      if (pnl > 0) next.wins += 1;
      if (pnl < 0) next.losses += 1;
      next.tradeList = [...prev.tradeList, tr];

      map.set(key, next);
    }
    return map;
  }, [trades, accounts]);

  // Trades for the selected month
  const monthTrades = useMemo(() => {
    const m = viewMonth.getMonth();
    const y = viewMonth.getFullYear();
    return (trades ?? []).filter((tr) => {
      const key = normalizeDateKey(tr?.date);
      if (!key) return false;
      const d = new Date(`${key}T00:00:00`);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [trades, viewMonth]);

  // Month metrics for quick stats
  const monthMetrics = useMemo(() => {
    const uniqDays = new Set();
    let pnl = 0;
    let wins = 0;
    let losses = 0;
    let breakEvens = 0;
    let biggestWin = 0;
    let biggestLoss = 0;

    for (const tr of monthTrades) {
      const key = normalizeDateKey(tr?.date);
      if (key) uniqDays.add(key);
      const allocs = asAllocations(tr, accounts).map(sanitizeAlloc);
      const p = sumPnL(allocs);
      pnl += p;
      if (p > 0) wins += 1;
      else if (p < 0) losses += 1;
      else breakEvens += 1;
      if (p > biggestWin) biggestWin = p;
      if (p < biggestLoss) biggestLoss = p;
    }

    const totalTrades = monthTrades.length;
    const winRateMode = getGlobalWinRateMode(ui);
    const winRate = calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode });

    return {
      tradingDays: uniqDays.size,
      totalTrades,
      pnl,
      wins,
      losses,
      winRate,
      biggestWin,
      biggestLoss,
    };
  }, [monthTrades, accounts, ui]);

  // Calendar grid weeks
  const gridWeeks = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  // Month label for display
  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
    const s = fmt.format(viewMonth);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [viewMonth, locale]);

  // Localized month names for dropdown
  const calMonthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => {
      const s = fmt.format(new Date(2000, i));
      return s.charAt(0).toUpperCase() + s.slice(1);
    });
  }, [locale]);

  const calYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 2000 + 2 }, (_, i) => 2000 + i);
  }, []);

  // Weekly summaries for the calendar modal
  const weekSummaries = useMemo(() => {
    return gridWeeks.map((week, idx) => {
      let pnl = 0;
      let days = 0;
      for (const d of week) {
        const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const hit = dailyAgg.get(key);
        if (hit?.trades) days += 1;
        pnl += clampNum(hit?.pnl);
      }
      const start = week[0];
      const end = week[6];
      return {
        idx,
        title: t("pages.dashboard.week", { n: idx + 1 }),
        range: formatRange(start, end, locale),
        pnl,
        days,
      };
    });
  }, [gridWeeks, dailyAgg, locale, t]);

  // Weekday labels
  const weekdays = useMemo(() => getWeekdayLabels(locale), [locale]);

  const parseDay = (d) => {
    if (!d) return NaN;
    const dt = new Date(`${d}T00:00:00`);
    return dt.getTime();
  };

  const dayAdd = (d, days) => {
    const dt = new Date(`${d}T00:00:00`);
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
  };

  // PERFORMANCE OPTIMIZATION: Pre-compute derived values for each trade
  // This avoids recalculating sumPnL, totalRR, and search text on every filter/sort
  const derivedTrades = useMemo(() => {
    const startMark = performance.now();
    const result = (trades || []).map((t) => {
      const allocs = asAllocations(t, accounts).map(sanitizeAlloc);
      const sym = symById.get(t.symbolId);
      const ses = sesById.get(t.sessionId);
      
      // Pre-compute expensive values
      const pnlTotal = sumPnL(allocs);
      const rrTotal = totalRR(allocs, accById);
      const outcomeFinal = t.outcome || inferOutcomeFromTotals(pnlTotal);
      const dateTs = parseDay(t.date);
      
      // Pre-build search haystack (lowercase, concatenated)
      const accNames = allocs
        .map((a) => accById.get(a.accountId)?.name || "")
        .filter(Boolean)
        .join(" ");
      const tags = Array.isArray(t.tags) ? t.tags.map((id) => tagById.get(id)?.name || id).join(" ") : String(t.tags || "");
      const comments = Array.isArray(t.comments) ? t.comments.join(" ") : String(t.comments || "");
      const searchText = [
        sym?.name || "",
        ses?.name || "",
        accNames,
        t.direction || "",
        tags,
        t.positionNotes || "",
        comments,
        t.notes || "",
        t.journal || "",
      ].join(" ").toLowerCase();
      
      return {
        ...t,
        _derived: {
          allocs,
          pnlTotal,
          rrTotal,
          outcomeFinal,
          dateTs,
          symbolName: sym?.name || "",
          sessionName: ses?.name || "",
          searchText,
        },
      };
    });
    
    if (process.env.NODE_ENV === "development") {
      const duration = performance.now() - startMark;
      if (duration > 20) {
        console.log(`[Trades] derivedTrades computed in ${duration.toFixed(1)}ms for ${result.length} trades`);
      }
    }
    
    return result;
  }, [trades, accounts, symById, sesById, accById, tagById]);

  const filtered = useMemo(() => {
    const startMark = performance.now();
    const s = q.trim().toLowerCase();
    const today = isoDate();

    let minTs = NaN;
    let maxTs = NaN;
    if (rangePreset === "7d") {
      minTs = parseDay(dayAdd(today, -6));
      maxTs = parseDay(today);
    } else if (rangePreset === "30d") {
      minTs = parseDay(dayAdd(today, -29));
      maxTs = parseDay(today);
    } else if (rangePreset === "custom") {
      minTs = fromDate ? parseDay(fromDate) : NaN;
      maxTs = toDate ? parseDay(toDate) : NaN;
    }

    // OPTIMIZED: Use pre-computed dateTs from derived values
    const inRange = (t) => {
      if (rangePreset === "all") return true;
      const ts = t._derived?.dateTs ?? parseDay(t.date);
      if (Number.isNaN(ts)) return false;
      if (!Number.isNaN(minTs) && ts < minTs) return false;
      if (!Number.isNaN(maxTs) && ts > maxTs) return false;
      return true;
    };

    // OPTIMIZED: Use pre-computed searchText from derived values
    const matchesSearch = (t) => {
      if (!s) return true;
      const searchText = t._derived?.searchText;
      if (searchText) {
        return searchText.includes(s);
      }
      // Fallback for trades without _derived (shouldn't happen)
      const sym = symById.get(t.symbolId)?.name || "";
      const ses = sesById.get(t.sessionId)?.name || "";
      const allocs = asAllocations(t, accounts);
      const accNames = allocs.map((a) => accById.get(a.accountId)?.name || "").filter(Boolean).join(" ");
      const tags = Array.isArray(t.tags) ? t.tags.map((id) => tagById.get(id)?.name || id).join(" ") : String(t.tags || "");
      const comments = Array.isArray(t.comments) ? t.comments.join(" ") : String(t.comments || "");
      const haystack = [sym, ses, accNames, t.direction || "", tags, t.positionNotes || "", comments, t.notes || "", t.journal || ""].join(" ").toLowerCase();
      return haystack.includes(s);
    };

    // OPTIMIZED: Use pre-computed outcome from derived values
    const matchesOutcome = (t) => {
      if (outcomeFilter === "all") return true;
      const outcome = t._derived?.outcomeFinal ?? (t.outcome || inferOutcomeFromTotals(sumPnL(asAllocations(t, accounts).map(sanitizeAlloc))));
      return outcome === outcomeFilter;
    };

    // Account filter
    const matchesAccount = (t) => {
      if (accountFilter === "all") return true;
      return tradeHasAccount(t, accountFilter);
    };

    // Selected day filter (from calendar modal)
    const matchesSelectedDay = (t) => {
      if (!selectedDay) return true;
      return normalizeDateKey(t.date) === selectedDay;
    };

    // Tag filter
    const matchesTags = (t) => {
      if (tagFilter === "all") return true;
      const tradeTags = Array.isArray(t.tags) ? t.tags : [];
      return tradeTags.includes(tagFilter);
    };

    const list = [...derivedTrades].filter((t) => inRange(t) && matchesSearch(t) && matchesOutcome(t) && matchesAccount(t) && matchesSelectedDay(t) && matchesTags(t));
    
    // OPTIMIZED sorting using pre-computed values
    list.sort((a, b) => {
      let cmp = 0;
      
      if (sortBy === "date") {
        // Use pre-computed dateTs for faster comparison
        const tsA = a._derived?.dateTs ?? 0;
        const tsB = b._derived?.dateTs ?? 0;
        cmp = tsA - tsB;
      } else if (sortBy === "pnl") {
        // Use pre-computed pnlTotal
        const pnlA = a._derived?.pnlTotal ?? 0;
        const pnlB = b._derived?.pnlTotal ?? 0;
        cmp = pnlA - pnlB;
      } else if (sortBy === "rr") {
        // Use pre-computed rrTotal
        const rrA = a._derived?.rrTotal ?? 0;
        const rrB = b._derived?.rrTotal ?? 0;
        cmp = rrA - rrB;
      } else if (sortBy === "outcome") {
        const outcomeOrder = { "Profit": 3, "BE": 2, "Loss": 1 };
        const outcomeA = a._derived?.outcomeFinal ?? "BE";
        const outcomeB = b._derived?.outcomeFinal ?? "BE";
        cmp = (outcomeOrder[outcomeA] || 0) - (outcomeOrder[outcomeB] || 0);
      } else if (sortBy === "symbol") {
        // Use pre-computed symbolName
        const symA = a._derived?.symbolName ?? "";
        const symB = b._derived?.symbolName ?? "";
        cmp = symA.localeCompare(symB);
      }
      
      if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
      // Secondary sort by date then createdAt
      const tsA = a._derived?.dateTs ?? 0;
      const tsB = b._derived?.dateTs ?? 0;
      if (tsA !== tsB) return tsB - tsA;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    
    if (process.env.NODE_ENV === "development") {
      const duration = performance.now() - startMark;
      if (duration > 10) {
        console.log(`[Trades] filtered computed in ${duration.toFixed(1)}ms for ${list.length}/${derivedTrades.length} trades`);
      }
    }
    
    return list;
  }, [derivedTrades, q, symById, sesById, accById, accounts, sortDir, sortBy, outcomeFilter, accountFilter, tagFilter, rangePreset, fromDate, toDate, selectedDay]);

  const loading = useSoftLoading(`${q}|${filtered.length}|${(trades || []).length}`, reduceMotion ? 0 : 160);

  const openTrade = (t) => {
    setActive(t);
    setOpenEdit(true);
    setEditDirty(false);
  };

  // Multi-select mode handlers
  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Exiting selection mode - clear selection
      setSelectedTradeIds([]);
    }
    setSelectionMode(!selectionMode);
  };

  const toggleTradeSelection = (tradeId) => {
    setSelectedTradeIds((prev) =>
      prev.includes(tradeId) ? prev.filter((id) => id !== tradeId) : [...prev, tradeId]
    );
  };

  const selectAllFiltered = () => {
    const allIds = filtered.map((t) => t.id);
    setSelectedTradeIds(allIds);
  };

  const clearSelection = () => {
    setSelectedTradeIds([]);
  };

  const handleShareSelected = () => {
    if (selectedTradeIds.length === 0) return;
    
    // Collect trades to share
    const tradesToShare = selectedTradeIds
      .map((id) => trades.find((t) => t.id === id))
      .filter(Boolean);
    
    setPendingShareTrades(tradesToShare);
    setShareOptionsOpen(true);
  };

  // Create share with selected options (called from ShareOptionsModal)
  const handleCreateShare = async ({ includeDocs, includeIdeas, includeScreenshot, includeAnalytics }) => {
    if (pendingShareTrades.length === 0) return;
    
    // CRITICAL: Mark share operation as in-flight to prevent visibility-change
    // fetchState from overwriting local state with stale server data.
    // This is needed because opening the share URL in a new tab triggers
    // visibilitychange → hidden → visible cycle.
    if (setShareInFlight) setShareInFlight(true);
    
    try {
      // Force immediate sync to server before creating the share.
      // This ensures the server has the latest state, preventing the scenario
      // where visibility-change fetchState gets stale data and drops trades.
      if (flushSync) {
        await flushSync();
      }
      
      // Get author name from user (display_name > nickname > username > fallback "Trader")
      const authorName = (user?.display_name || user?.nickname || user?.username || "").trim() || "Trader";
      
      // Build sanitized trades payload with share options
      // Pass isMultiTrade flag to reduce payload size for multiple trades
      const isMultiTrade = pendingShareTrades.length > 1;
      const shareOptions = { includeDocs, includeIdeas, isMultiTrade };
      const embeddedTrades = pendingShareTrades
        .map((trade) => sanitizeTradeForPublic(trade, libraries, accounts, documents, ideas, shareOptions))
        .filter(Boolean);
      
      let payload = {
        tradeIds: pendingShareTrades.map(t => t.id),
        trades: embeddedTrades,
        authorName,
        includeScreenshot: !!includeScreenshot,
        includeAnalytics: !!includeAnalytics,
      };
      
      // Compress images in the payload to prevent "too large" errors
      try {
        payload = await compressSharePayload(payload, isMultiTrade);
      } catch (err) {
        console.warn("Image compression failed, sending uncompressed payload:", err);
      }
      
      const url = await createShareWithToast({
        type: "trade",
        payload,
        getUrl: getShareUrl,
        toast,
      });
      
      if (url) {
        setShareUrl(url);
        setShareModalOpen(true);
      }
      
      // Exit selection mode after sharing
      setSelectionMode(false);
      setSelectedTradeIds([]);
      setPendingShareTrades([]);
    } finally {
      // Clear share guard after a delay — the user may still be looking at the
      // share modal and might open the link in a new tab, causing another
      // visibility change. Keep the guard active for 10s after share completes.
      const SHARE_GUARD_DURATION_MS = 10000;
      if (setShareInFlight) {
        setTimeout(() => setShareInFlight(false), SHARE_GUARD_DURATION_MS);
      }
    }
  };

  // Handle bulk delete - opens confirmation modal
  const handleDeleteSelectedClick = () => {
    if (selectedTradeIds.length === 0) return;
    setDeleteConfirmOpen(true);
  };

  // Confirm bulk delete - actually delete the trades
  const handleConfirmBulkDelete = () => {
    if (selectedTradeIds.length === 0) return;
    
    setDeleteLoading(true);
    
    const count = selectedTradeIds.length;
    onRemoveBulk(selectedTradeIds);

    // Show success toast (uses CLDR plural rules so "1 trade" / "1 сделка"
    // are grammatical instead of "1 trades").
    toast?.push({
      title: tPlural("common.deleteSelectedSuccessPlural", count) ||
        t("common.deleteSelectedSuccess")?.replace("{count}", count) ||
        `Deleted trades: ${count}`,
      description: "",
      tone: "success"
    });
    
    // Close modal and exit selection mode
    setDeleteConfirmOpen(false);
    setSelectionMode(false);
    setSelectedTradeIds([]);
    setDeleteLoading(false);
  };

  const handleTradeRowClick = (t) => {
    if (selectionMode) {
      toggleTradeSelection(t.id);
    } else {
      openTrade(t);
    }
  };

  const requestCloseModal = (target) => {
    const dirty = target === "create" ? createDirty : editDirty;
    if (dirty) {
      setConfirmUnsaved({ open: true, target });
      return;
    }
    if (target === "create") {
      setOpenCreate(false);
      setCreateDirty(false);
    } else {
      setOpenEdit(false);
      setEditDirty(false);
      setActive(null);
    }
  };

  return (
    <div className="space-y-4">
      <Header
        title={t("pages.trades.title")}
        subtitle={t("pages.trades.subtitle")}
        reduceMotion={reduceMotion}
        right={
          <>
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pages.trades.searchPlaceholder")} className="pl-9 w-full sm:w-[220px] md:w-[280px]" />
            </div>

            {/* Date Range Filter - Custom Dropdown */}
            <div className="w-full sm:w-[140px] md:w-[160px]">
              <SelectDropdown
                label={t("pages.trades.dateRange")}
                value={rangePreset}
                onChange={setRangePreset}
                searchable={false}
                options={[
                  { value: "all", label: t("pages.trades.allTime"), icon: <Calendar className="h-4 w-4 text-accent" /> },
                  { value: "7d", label: t("pages.trades.last7"), icon: <Calendar className="h-4 w-4 text-blue-500" /> },
                  { value: "30d", label: t("pages.trades.last30"), icon: <Calendar className="h-4 w-4 text-emerald-500" /> },
                  { value: "custom", label: t("pages.trades.custom"), icon: <Calendar className="h-4 w-4 text-amber-500" /> },
                ]}
              />
            </div>

            {/* Account Filter */}
            <div className="w-full sm:w-[160px] md:w-[180px]">
              <SelectDropdown
                label={t("accounts.filterByAccount")}
                value={accountFilter}
                onChange={setAccountFilter}
                searchable={true}
                options={accountFilterOptions}
              />
            </div>

            {/* Tag Filter */}
            {(() => {
              const activeTags = (libraries.customTags || []).filter((tg) => !isDeleted(tg));
              if (activeTags.length === 0) return null;
              return (
                <div className="w-full sm:w-[140px] md:w-[160px]">
                  <SelectDropdown
                    label={t("pages.trades.filterByTag", null, "Filter by tag")}
                    value={tagFilter}
                    onChange={setTagFilter}
                    searchable={true}
                    options={[
                      { value: "all", label: t("pages.trades.allTags", null, "All tags"), icon: <Tag className="h-4 w-4 text-muted-foreground" /> },
                      ...activeTags.map((tg) => ({
                        value: tg.id,
                        label: tg.name,
                        icon: tg.avatar?.emoji ? <span>{tg.avatar.emoji}</span> : <Tag className="h-4 w-4" style={{ color: tg.avatar?.color || tg.color || "#6b7280" }} />,
                      })),
                    ]}
                  />
                </div>
              );
            })()}

            {rangePreset === "custom" ? (
              <div className="w-full sm:w-auto md:w-[260px]">
                <DateRangePicker
                  fromValue={fromDate}
                  toValue={toDate}
                  onFromChange={setFromDate}
                  onToChange={setToDate}
                  fromLabel={t("pages.trades.from") || "From"}
                  toLabel={t("pages.trades.to") || "To"}
                />
              </div>
            ) : null}

            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button onClick={() => { setOpenCreate(true); setCreateDirty(false); }}>
                <Plus className="h-4 w-4" /> {t("pages.trades.add")}
              </Button>
            </Press>

            {/* Select mode toggle */}
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button 
                variant={selectionMode ? "secondary" : "outline"} 
                onClick={toggleSelectionMode}
                className={selectionMode ? "border-accent/40" : ""}
              >
                <CheckSquare className="h-4 w-4" />
                {selectionMode ? t("common.cancel") || "Cancel" : t("common.select") || "Select"}
              </Button>
            </Press>
          </>
        }
      />

      {/* View Toggle & Sorting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TradesViewToolbar
          view={view}
          onViewChange={handleViewChange}
          sortBy={sortBy}
          onSortChange={setSortBy}
          sortDir={sortDir}
          onSortDirChange={setSortDir}
          outcomeFilter={outcomeFilter}
          onOutcomeFilterChange={setOutcomeFilter}
          onOpenCalendar={() => setDailySummaryOpen(true)}
          calendarActive={!!selectedDay}
          tradeOpen={openEdit}
          t={t}
        />
        <div className="flex items-center gap-2">
          {/* Selected day badge - hide when trade is open */}
          {selectedDay && !openEdit && (
            <Badge variant="secondary" className="rounded-full gap-1.5 py-1 px-3">
              <CalendarDays className="h-3 w-3" />
              {selectedDay}
              <button
                onClick={() => setSelectedDay(null)}
                className="ml-1 hover:text-foreground"
                title={t("pages.trades.clearDayFilter") || "Clear day filter"}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <div className="text-sm text-muted-foreground">
            {filtered.length} {t("pages.trades.tradesCount") || "trades"}
          </div>
        </div>
      </div>

      {/* Selection Action Bar */}
      <AnimatePresence mode="wait">
        {selectionMode && (
          <motion.div
            key="selection-action-bar"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-accent/20 bg-card/90 glass p-3 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {(t("common.selected") || "{count} selected").replace("{count}", selectedTradeIds.length)}
              </span>
              <button
                onClick={selectAllFiltered}
                className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
              >
                {t("common.selectAll") || "Select All"} ({filtered.length})
              </button>
              {selectedTradeIds.length > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  {t("common.clearSelection") || "Clear"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Press reduceMotion={reduceMotion} className="inline-block">
                <Button
                  onClick={handleShareSelected}
                  disabled={selectedTradeIds.length === 0}
                  className="gap-1.5"
                >
                  <Share2 className="h-4 w-4" />
                  {t("common.share") || "Share"} {selectedTradeIds.length > 0 ? `(${selectedTradeIds.length})` : ""}
                </Button>
              </Press>
              <Press reduceMotion={reduceMotion} className="inline-block">
                <Button
                  onClick={handleDeleteSelectedClick}
                  disabled={selectedTradeIds.length === 0}
                  variant="danger"
                  className="gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("common.deleteSelected") || "Delete selected"}
                </Button>
              </Press>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gallery View */}
      {view === "gallery" && (
        <TradesGalleryGrid
          trades={filtered}
          symById={symById}
          accById={accById}
          asAllocations={asAllocations}
          sanitizeAlloc={sanitizeAlloc}
          totalRR={totalRR}
          sumPnL={sumPnL}
          fmtMixedPnL={fmtMixedPnL}
          inferOutcome={inferOutcomeFromTotals}
          loading={loading}
          onTradeClick={openTrade}
          selectionMode={selectionMode}
          selectedTradeIds={selectedTradeIds}
          onToggleSelect={toggleTradeSelection}
          reduceMotion={reduceMotion}
          accounts={accounts}
          noAccountLabel={t("pages.trades.editor.labels.noAccount")}
        />
      )}

      {/* List View */}
      {view === "list" && (
      <Card className={`relative z-0 rounded-xl overflow-hidden ${HOVER_GLOW}`}>
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-0 scrollbar-thin">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 z-[1] bg-[rgb(var(--card))]/80 glass">
                <tr className="text-left text-xs text-muted-foreground">
                  {selectionMode && (
                    <th className="px-3 pt-4 pb-3 w-[50px]">
                      <button
                        onClick={() => {
                          if (selectedTradeIds.length === filtered.length) {
                            clearSelection();
                          } else {
                            selectAllFiltered();
                          }
                        }}
                        className="h-5 w-5 rounded border border-accent/30 flex items-center justify-center hover:bg-accent/10 transition-colors"
                      >
                        {selectedTradeIds.length === filtered.length && filtered.length > 0 ? (
                          <Check className="h-3 w-3 text-accent" />
                        ) : null}
                      </button>
                    </th>
                  )}
                  <th className="px-3 pt-4 pb-3 w-[90px]">Date</th>
                  <th className="px-3 pt-4 pb-3 w-[70px]">Side</th>
                  <th className="px-3 pt-4 pb-3 w-[140px]">Pair</th>
                  <th className="px-3 pt-4 pb-3 w-[100px] hidden lg:table-cell">Session</th>
                  <th className="px-3 pt-4 pb-3 w-[150px] hidden md:table-cell">Account</th>
                  <th className="px-3 pt-4 pb-3 w-[90px]">Result</th>
                  <th className="px-3 pt-4 pb-3 w-[80px]">RR</th>
                  <th className="px-3 pt-4 pb-3 w-[120px]">PnL</th>
                  <th className="px-3 pt-4 pb-3 w-[50px]">Link</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <tr key={`sk_${i}`} className="border-t border-accent/15">
                      {selectionMode && <td className="px-3 pt-5 pb-3"><Skeleton className="h-5 w-5" /></td>}
                      <td className="px-3 pt-5 pb-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-3 pt-5 pb-3"><Skeleton className="h-6 w-16" /></td>
                      <td className="px-3 pt-5 pb-3"><Skeleton className="h-10 w-56" /></td>
                      <td className="px-3 pt-5 pb-3 hidden lg:table-cell"><Skeleton className="h-6 w-28" /></td>
                      <td className="px-3 pt-5 pb-3 hidden md:table-cell"><Skeleton className="h-10 w-52" /></td>
                      <td className="px-3 pt-5 pb-3"><Skeleton className="h-6 w-16" /></td>
                      <td className="px-3 pt-5 pb-3"><Skeleton className="h-6 w-20" /></td>
                      <td className="px-3 pt-5 pb-3"><Skeleton className="h-6 w-24" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr key="empty-state">
                    <td colSpan={selectionMode ? 10 : 9} className="p-10 text-center text-muted-foreground">
                      No trades
                    </td>
                  </tr>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {filtered.map((trade, idx) => {
                        const sym = symById.get(trade.symbolId);
                        const ses = sesById.get(trade.sessionId);
                        const rawAllocs = asAllocations(trade, accounts).map(sanitizeAlloc);
                        // For account display, filter to those with accounts
                        const allocsWithAccount = rawAllocs.filter((a) => !!a.accountId);
                        const firstAcc = allocsWithAccount.length ? accById.get(allocsWithAccount[0].accountId) : null;
                        const more = Math.max(0, allocsWithAccount.length - 1);

                        // For stats, use all allocations (including those without account)
                        const rTotal = totalRR(rawAllocs, accById);
                        const pnlText = fmtMixedPnL(rawAllocs, accById);
                        const pnlTotal = sumPnL(rawAllocs);
                        const outcome = trade.outcome || inferOutcomeFromTotals(pnlTotal);
                        const isSelected = selectedTradeIds.includes(trade.id);

                        return (
                          <motion.tr
                            key={trade.id}
                            layout
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 0.16, delay: Math.min(idx * 0.02, 0.12) }}
                            className={`border-t border-accent/15 hover:bg-white/30 dark:hover:bg-slate-900/30 cursor-pointer ${isSelected ? "bg-accent/10" : ""}`}
                            style={trade.highlightColor ? { borderLeft: `3px solid ${trade.highlightColor}`, backgroundColor: trade.highlightColor + "0a" } : undefined}
                            onClick={() => handleTradeRowClick(trade)}
                          >
                            {selectionMode && (
                              <td className="px-3 pt-5 pb-3">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTradeSelection(trade.id);
                                  }}
                                  className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? "border-accent bg-accent text-white"
                                      : "border-accent/30 hover:bg-accent/10"
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                </button>
                              </td>
                            )}
                            <td className="px-3 pt-5 pb-3 font-mono text-xs">{trade.date}</td>
                            <td className="px-3 pt-5 pb-3">
                              <Badge
                                variant="outline"
                                className={
                                  String(trade.direction || "").toLowerCase() === "short"
                                    ? "border-rose-400/40 bg-rose-400/10 text-red-500"
                                    : "border-emerald-400/40 bg-emerald-400/10 text-emerald-500"
                                }
                              >
                                {trade.direction || "—"}
                              </Badge>
                            </td>
                            <td className="px-3 pt-5 pb-3">
                              <AvatarPill avatar={sym?.avatar} color={sym?.color} label={sym?.name || "—"} sub={""} />
                            </td>
                            <td className="px-3 pt-5 pb-3 hidden lg:table-cell">
                              <SessionBadge name={ses?.name || "—"} reduceMotion={reduceMotion} />
                            </td>
                            <td className="px-3 pt-5 pb-3 hidden md:table-cell">
                              {firstAcc ? (
                                <AvatarPill
                                  avatar={firstAcc?.avatar}
                                  color={firstAcc?.color}
                                  label={firstAcc?.name || "—"}
                                  sub={more ? `+${more}` : ""}
                                />
                              ) : (
                                <Badge variant="outline" className="text-xs border-amber-400/40 bg-amber-400/10 text-amber-500">
                                  {t("pages.trades.editor.labels.noAccount")}
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 pt-5 pb-3">
                              {(() => {
                                const cls =
                                  outcome === "Profit"
                                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-500"
                                    : outcome === "Loss"
                                    ? "border-rose-400/40 bg-rose-400/10 text-red-500"
                                    : "border-orange-400/40 bg-orange-400/10 text-orange-400";
                                return (
                                  <Badge variant="outline" className={cls}>
                                    {outcome}
                                  </Badge>
                                );
                              })()}
                            </td>
                            <td className="px-3 pt-5 pb-3">
                              <Badge variant="solid">{fmtRR(rTotal)}</Badge>
                            </td>
                            <td className="px-3 pt-5 pb-3">
                              <Badge
                                variant="outline"
                                className={
                                  clampNum(pnlTotal) < 0
                                    ? "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-red-500"
                                    : "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-500"
                                }
                              >
                                {pnlText}
                              </Badge>
                            </td>
                            <td className="px-3 pt-5 pb-3">
                              {trade.tradeLink ? (
                                <a
                                  href={trade.tradeLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center justify-center rounded-xl border border-accent/15 bg-[rgb(var(--muted))]/25 p-2 hover:bg-[rgb(var(--muted))]/40"
                                  title="Open trade link"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                  </AnimatePresence>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}

      <Modal
        open={openCreate}
        onOpenChange={(v) => {
          if (v) {
            setOpenCreate(true);
            setCreateDirty(false);
            return;
          }
          requestCloseModal("create");
        }}
        title="Add trade"
        reduceMotion={reduceMotion}
      >
        <TradeEditor
          accounts={accounts}
          documents={documents}
          ideas={ideas}
          libraries={libraries}
          reduceMotion={reduceMotion}
          onDirtyChange={setCreateDirty}
          saveSignal={saveSignalCreate}
          defaultAccountId={quickAccountId}
          onNavigateToDocument={onNavigateToDocument}
          onNavigateToIdea={onNavigateToIdea}
          onCreateAccount={onUpsertAccount}
          onCreateSymbol={onUpsertSymbol}
          propTemplates={propTemplates}
          toast={toast}
          isBacktestMode={isBacktestMode}
          modelsEnabled={modelsEnabled}
          onSave={(trade) => {
            onUpsert(trade);
            setOpenCreate(false);
            setCreateDirty(false);
            setQuickAccountId(null);
            toast.push({ title: t("pages.trades.editor.unsaved.toasts.created"), description: trade.date || "", tone: "success" });
          }}
        />
      </Modal>

      <Modal
        open={openEdit}
        onOpenChange={(v) => {
          if (v) {
            setOpenEdit(true);
            setEditDirty(false);
            return;
          }
          requestCloseModal("edit");
        }}
        title="Trade details"
        reduceMotion={reduceMotion}
      >
        {active ? (
          <TradeEditor
            initial={active}
            accounts={accounts}
            documents={documents}
            ideas={ideas}
            libraries={libraries}
            reduceMotion={reduceMotion}
            onDirtyChange={setEditDirty}
            saveSignal={saveSignalEdit}
            onNavigateToDocument={onNavigateToDocument}
            onNavigateToIdea={onNavigateToIdea}
            onCreateAccount={onUpsertAccount}
            onCreateSymbol={onUpsertSymbol}
            propTemplates={propTemplates}
            toast={toast}
            isBacktestMode={isBacktestMode}
            modelsEnabled={modelsEnabled}
            onSave={(trade) => {
              onUpsert(trade);
              setOpenEdit(false);
              setActive(null);
              setEditDirty(false);
              toast.push({ title: t("pages.trades.editor.unsaved.toasts.updated"), description: trade.date || "", tone: "success" });
            }}
            onDelete={() => setConfirmDeleteOpen(true)}
            onShare={(trade) => {
              // Share single trade from editor - open options modal
              setPendingShareTrades([trade]);
              setShareOptionsOpen(true);
            }}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t("common.delete") + "?"}
        description={t("pages.trades.editor.confirmDeleteDescription") || "The trade will be moved to trash. You can restore it from there later."}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        tone="danger"
        reduceMotion={reduceMotion}
        onConfirm={() => {
          if (active?.id) onRemove(active.id);
          setOpenEdit(false);
          setActive(null);
          setEditDirty(false);
          toast.push({ title: t("pages.trades.editor.unsaved.toasts.deleted"), description: "" });
        }}
      />

      <Modal
        open={confirmUnsaved.open}
        onOpenChange={(v) => setConfirmUnsaved((p) => ({ ...p, open: v }))}
        title={t("pages.trades.editor.unsaved.title")}
        reduceMotion={reduceMotion}
      >
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t("pages.trades.editor.unsaved.description")}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button
                variant="outline"
                onClick={() => setConfirmUnsaved({ open: false, target: null })}
              >
                {t("pages.trades.editor.unsaved.cancel")}
              </Button>
            </Press>
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button
                variant="secondary"
                onClick={() => {
                  // Exit without saving
                  const target = confirmUnsaved.target;
                  setConfirmUnsaved({ open: false, target: null });
                  if (target === "create") {
                    setOpenCreate(false);
                    setCreateDirty(false);
                  } else {
                    setOpenEdit(false);
                    setEditDirty(false);
                    setActive(null);
                  }
                }}
              >
                {t("pages.trades.editor.unsaved.discard")}
              </Button>
            </Press>
            <Press reduceMotion={reduceMotion} className="inline-block">
              <Button
                onClick={() => {
                  const target = confirmUnsaved.target;
                  setConfirmUnsaved({ open: false, target: null });
                  if (target === "create") setSaveSignalCreate((x) => x + 1);
                  if (target === "edit") setSaveSignalEdit((x) => x + 1);
                }}
              >
                {t("pages.trades.editor.unsaved.save")}
              </Button>
            </Press>
          </div>
        </div>
      </Modal>

      {/* Daily Summary Modal */}
      <Modal
        open={dailySummaryOpen}
        onOpenChange={setDailySummaryOpen}
        title={t("pages.dashboard.dailySummary")}
        size="xl"
        reduceMotion={reduceMotion}
      >
        {/* Month selector and badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMonth((d) => addMonths(d, -1))}
                aria-label={t("pages.dashboard.prevMonth")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMonth((d) => addMonths(d, 1))}
                aria-label={t("pages.dashboard.nextMonth")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 px-2">
                <select
                  value={viewMonth.getMonth()}
                  onChange={(e) => setViewMonth(prev => {
                    const d = new Date(prev);
                    d.setMonth(Number(e.target.value));
                    return startOfMonth(d);
                  })}
                  className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer text-foreground/90 appearance-none hover:text-accent transition pr-1"
                >
                  {calMonthNames.map((label, i) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
                <select
                  value={viewMonth.getFullYear()}
                  onChange={(e) => setViewMonth(prev => {
                    const d = new Date(prev);
                    d.setFullYear(Number(e.target.value));
                    return startOfMonth(d);
                  })}
                  className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer text-foreground/90 appearance-none hover:text-accent transition"
                >
                  {calYearOptions.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <Button
                variant="secondary"
                size="md"
                className="rounded-xl"
                onClick={() => setViewMonth(startOfMonth(new Date()))}
              >
                <CalendarDays className="h-4 w-4" />
                {t("pages.dashboard.today")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t("common.pnl")}: {fmtMoney(monthMetrics.pnl, currency)}</Badge>
            <Badge variant="secondary">{t("common.days")}: {monthMetrics.tradingDays}</Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-4">
          <div className="rounded-xl border border-accent/15 bg-card/80 p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("pages.dashboard.stats.daysTraded")}</div>
            <div className="mt-1 text-xl font-bold">{monthMetrics.tradingDays}</div>
            <div className="text-[10px] text-muted-foreground">{t("pages.dashboard.stats.thisMonth")}</div>
          </div>
          <div className="rounded-xl border border-accent/15 bg-card/80 p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("pages.dashboard.stats.tradesTaken")}</div>
            <div className="mt-1 text-xl font-bold">{monthMetrics.totalTrades}</div>
            <div className="text-[10px] text-muted-foreground">{monthMetrics.wins}W / {monthMetrics.losses}L</div>
          </div>
          <div className="rounded-xl border border-accent/15 bg-card/80 p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("pages.dashboard.stats.biggestWin")}</div>
            <div className="mt-1 text-xl font-bold text-emerald-500">{monthMetrics.biggestWin ? fmtMoney(monthMetrics.biggestWin, currency) : "—"}</div>
            <div className="text-[10px] text-muted-foreground">{t("pages.dashboard.stats.bestSingleTrade")}</div>
          </div>
          <div className="rounded-xl border border-accent/15 bg-card/80 p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("pages.dashboard.stats.biggestLoss")}</div>
            <div className="mt-1 text-xl font-bold text-red-500">{monthMetrics.biggestLoss ? fmtMoney(monthMetrics.biggestLoss, currency) : "—"}</div>
            <div className="text-[10px] text-muted-foreground">{t("pages.dashboard.stats.worstSingleTrade")}</div>
          </div>
          <div className="rounded-xl border border-accent/15 bg-card/80 p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("pages.dashboard.stats.winRate")}</div>
            <div className="mt-1 text-xl font-bold">{fmtPct(monthMetrics.winRate)}</div>
            <div className="text-[10px] text-muted-foreground">{monthMetrics.wins}W / {monthMetrics.losses}L</div>
          </div>
        </div>

        {/* Calendar + Weekly Summary */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
          {/* Calendar Grid */}
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base uppercase tracking-wider">
                {t("pages.dashboard.calendarView")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {weekdays.map((w) => (
                  <div key={w} className="px-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {w}
                  </div>
                ))}

                {gridWeeks.flat().map((d, idx) => {
                  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
                  const hit = dailyAgg.get(key);
                  const pnl = clampNum(hit?.pnl);
                  const tradesCount = hit?.trades ?? 0;

                  const inMonth = d.getMonth() === viewMonth.getMonth();
                  const isToday = isSameDay(d, today);
                  const isSelected = selectedDay === key;

                  const bg = pnl > 0 ? "rgba(59,130,246,0.12)" : pnl < 0 ? "rgba(220,90,90,0.10)" : "rgba(30,50,100,0.25)";
                  const br = pnl > 0 ? "rgba(59,130,246,0.35)" : pnl < 0 ? "rgba(220,90,90,0.35)" : "rgba(59,130,246,0.15)";
                  const txt = pnl > 0 ? "text-emerald-500" : pnl < 0 ? "text-red-500" : "text-muted-foreground";
                  const glow = pnl > 0 ? "shadow-[0_0_12px_rgba(59,130,246,0.2)]" : pnl < 0 ? "shadow-[0_0_12px_rgba(220,90,90,0.15)]" : "";

                  return (
                    <div
                      key={`${key}_${idx}`}
                      onClick={() => {
                        if (tradesCount > 0) {
                          setSelectedDay(key);
                          setDailySummaryOpen(false);
                        }
                      }}
                      className={`relative min-h-[70px] rounded-xl border p-2 transition-all duration-200 hover:scale-[1.02] cursor-pointer ${glow} ${
                        inMonth ? "" : "opacity-45"
                      } ${isToday ? "ring-2 ring-[#3B82F6]/50 shadow-[0_0_20px_rgba(59,130,246,0.25)]" : ""} ${
                        isSelected ? "ring-2 ring-accent shadow-[0_0_15px_rgba(59,130,246,0.3)]" : ""
                      }`}
                      style={{ backgroundColor: bg, borderColor: br }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-sm font-semibold">{d.getDate()}</div>
                        {tradesCount ? (
                          <div className="text-[11px] font-semibold text-muted-foreground">{tradesCount} →</div>
                        ) : null}
                      </div>

                      <div className="absolute bottom-2 right-2 text-right">
                        {tradesCount ? (
                          <div className={`text-xs font-semibold ${txt}`}>{fmtMoney(pnl, currency)}</div>
                        ) : (
                          <div className="text-xs text-muted-foreground">—</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Weekly Summary */}
          <Card className="rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base uppercase tracking-wider">{t("pages.dashboard.weeklySummary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {weekSummaries.map((w) => {
                const pos = w.pnl >= 0;
                return (
                  <div key={w.idx} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-accent/10 bg-card/30 hover:border-accent/25 hover:shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-all duration-200">
                    <div>
                      <div className="text-sm font-semibold">{w.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{w.range}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${pos ? "text-emerald-500" : "text-red-500"}`}>
                        {w.days ? fmtMoney(w.pnl, currency) : t("pages.dashboard.noTrades")}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{t("common.days")}: {w.days}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Selected day trades preview */}
        {(() => {
          const selectedDayData = selectedDay ? dailyAgg.get(selectedDay) : null;
          const selectedDayTrades = selectedDayData?.tradeList || [];
          if (!selectedDay || selectedDayTrades.length === 0) return null;
          
          return (
            <div className="mt-4 border-t border-border/50 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">
                  {t("pages.trades.dayTrades") || "Trades for day"}: {selectedDay}
                </h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedDay(null)}
                >
                  <X className="h-3 w-3 mr-1" />
                  {t("pages.trades.clearDayFilter") || "Clear"}
                </Button>
              </div>
              <div className="space-y-2 max-h-[200px] overflow-auto">
                {selectedDayTrades.slice(0, 10).map((tr) => {
                  const allocs = asAllocations(tr, accounts).map(sanitizeAlloc);
                  const pnl = sumPnL(allocs);
                  const sym = symById.get(tr.symbolId);
                  const isWin = pnl > 0;
                  const isLoss = pnl < 0;
                  
                  return (
                    <div
                      key={tr.id}
                      onClick={() => {
                        openTrade(tr);
                        setDailySummaryOpen(false);
                      }}
                      className={`rounded-xl border p-2 cursor-pointer transition-all hover:scale-[1.01] ${
                        isWin ? "border-emerald-500/30 bg-emerald-500/5" : 
                        isLoss ? "border-rose-500/30 bg-rose-500/5" : 
                        "border-border bg-muted/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{sym?.name || tr.symbolId || "—"}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {tr.direction?.toUpperCase() || "—"}
                          </Badge>
                        </div>
                        <div className={`text-sm font-bold ${isWin ? "text-emerald-500" : isLoss ? "text-red-500" : "text-muted-foreground"}`}>
                          {pnl >= 0 ? "+" : ""}{fmtMoney(pnl, currency)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {selectedDayTrades.length > 10 && (
                  <div className="text-center text-xs text-muted-foreground py-1">
                    +{selectedDayTrades.length - 10} more
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Share Options Modal */}
      <ShareOptionsModal
        open={shareOptionsOpen}
        onOpenChange={setShareOptionsOpen}
        onConfirm={handleCreateShare}
        tradeCount={pendingShareTrades.length}
        hasLinkedDocs={pendingShareTrades.some(t => t.docIds && t.docIds.length > 0)}
        hasLinkedIdeas={pendingShareTrades.some(t => t.ideaIds && t.ideaIds.length > 0)}
        hasImages={pendingShareTrades.some(t => Array.isArray(t.images) && t.images.length > 0)}
        reduceMotion={reduceMotion}
        t={t}
      />

      {/* Share Link Modal */}
      <ShareLinkModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        shareUrl={shareUrl}
        toast={toast}
        reduceMotion={reduceMotion}
      />

      {/* Bulk Delete Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("common.deleteSelectedConfirmTitle") || "Are you sure?"}
        reduceMotion={reduceMotion}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            {tPlural("common.deleteSelectedConfirmMessagePlural", selectedTradeIds.length) ||
              (t("common.deleteSelectedConfirmMessage") || "You are about to delete {count} trades. This action cannot be undone.")
                .replace("{count}", selectedTradeIds.length)}
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteLoading}
            >
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmBulkDelete}
              disabled={deleteLoading}
              className="gap-1.5"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("common.deleting") || "Deleting..."}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete") || "Delete"}
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
