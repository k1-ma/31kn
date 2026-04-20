/**
 * DashboardPropProgress - Prop Firm Progress section
 */

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Badge from "@/components/ui/Badge.jsx";
import {
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Wallet,
} from "lucide-react";
import { fmtMoney, fmtPct, clampNum } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Skeleton from "@/components/common/Skeleton.jsx";
import { mergePropTemplates, getTemplate, summarizePayouts } from "@/lib/prop.js";
import { isDeleted } from "@/lib/syncDb.js";

// Progress bar component
function ProgressBar({ value, max, variant = "default", showLabel = true, size = "md" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  const variants = {
    default: "bg-accent",
    success: "bg-emerald-500",
    danger: "bg-rose-500",
    warning: "bg-amber-500",
  };

  const sizes = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${sizes[size]} rounded-full bg-muted/50 overflow-hidden`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`h-full rounded-full ${variants[variant]}`}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium tabular-nums w-12 text-right">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

// Status badge
function StatusBadge({ status }) {
  const configs = {
    passed: { icon: CheckCircle2, color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Passed" },
    failed: { icon: XCircle, color: "bg-rose-500/15 text-rose-400 border-rose-500/30", label: "Failed" },
    in_progress: { icon: Clock, color: "bg-blue-500/15 text-blue-400 border-blue-500/30", label: "In Progress" },
    funded: { icon: CheckCircle2, color: "bg-purple-500/15 text-purple-400 border-purple-500/30", label: "Funded" },
  };

  const config = configs[status] || configs.in_progress;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// Single prop account card
function PropAccountCard({ account, template, trades, currency }) {
  const prop = account?.prop || {};
  const phase = (template?.phases || []).find((p) => p.id === prop.phaseId) || template?.phases?.[0];
  const rules = { ...phase?.rules, ...(prop.rulesOverride || {}) };

  // Calculate current equity and progress
  // For rule-based calculations (progress, targets, limits), ALWAYS use prop.size
  // as that's what the prop firm evaluates against, not the user's custom startingEquity.
  const propAccountSize = clampNum(prop.size);
  
  // Safeguard: if prop.size is missing, skip this account
  if (propAccountSize <= 0) {
    console.warn(`[DashboardPropProgress] Account ${account?.id} has invalid prop.size`);
    return null;
  }
  
  const currentEq = clampNum(account?.currentEquity || propAccountSize);
  const pnl = currentEq - propAccountSize;
  const pnlPct = propAccountSize > 0 ? (pnl / propAccountSize) * 100 : 0;

  // Profit target progress
  const profitTarget = rules.profitTargetPct ? (propAccountSize * rules.profitTargetPct) / 100 : null;
  const profitProgress = profitTarget ? Math.max(0, pnl) / profitTarget : 0;

  // Max loss (drawdown used)
  const maxLoss = rules.maxLossPct ? (propAccountSize * rules.maxLossPct) / 100 : null;
  const lossUsed = pnl < 0 ? Math.abs(pnl) : 0;
  const lossProgress = maxLoss ? (lossUsed / maxLoss) * 100 : 0;

  // Trading days progress
  const minDays = rules.minTradingDays || 0;
  const accountTrades = trades.filter((t) => {
    const allocations = t?.allocations || [];
    return allocations.some((a) => a?.accountId === account?.id) || t?.accountId === account?.id;
  });
  const tradingDays = new Set(accountTrades.map((t) => t?.date?.split("T")[0]).filter(Boolean)).size;
  const daysProgress = minDays > 0 ? (tradingDays / minDays) * 100 : 100;

  // Determine status
  const status = account?.status?.toLowerCase()?.includes("passed")
    ? "passed"
    : account?.status?.toLowerCase()?.includes("failed")
    ? "failed"
    : phase?.kind === "funded"
    ? "funded"
    : "in_progress";

  return (
    <div className="p-4 rounded-xl border border-border/50 bg-card/50 hover:border-accent/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-sm">{account?.name || "Prop Account"}</h4>
          <div className="text-xs text-muted-foreground mt-0.5">
            {template?.firm} • {phase?.label || "Phase 1"}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Current Equity */}
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs text-muted-foreground">Current Equity</span>
        <div className="text-right">
          <span className="text-lg font-bold">{fmtMoney(currentEq, currency)}</span>
          <span
            className={`ml-2 text-xs ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
          >
            {pnl >= 0 ? "+" : ""}
            {fmtPct(pnlPct)}
          </span>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="space-y-3">
        {profitTarget && (
          <div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>Profit Target</span>
              <span>
                {fmtMoney(Math.max(0, pnl), currency)} / {fmtMoney(profitTarget, currency)}
              </span>
            </div>
            <ProgressBar
              value={Math.max(0, pnl)}
              max={profitTarget}
              variant={profitProgress >= 100 ? "success" : "default"}
            />
          </div>
        )}

        {maxLoss && (
          <div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>Drawdown Used</span>
              <span>
                {fmtMoney(lossUsed, currency)} / {fmtMoney(maxLoss, currency)}
              </span>
            </div>
            <ProgressBar
              value={lossUsed}
              max={maxLoss}
              variant={lossProgress >= 80 ? "danger" : lossProgress >= 50 ? "warning" : "success"}
            />
          </div>
        )}

        {minDays > 0 && (
          <div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>Trading Days</span>
              <span>
                {tradingDays} / {minDays}
              </span>
            </div>
            <ProgressBar
              value={tradingDays}
              max={minDays}
              variant={daysProgress >= 100 ? "success" : "default"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPropProgress({ accounts, trades, propTemplates, loading = false }) {
  const { t } = useI18n();

  // Get prop accounts
  const { propAccounts, summary, templates } = useMemo(() => {
    const templates = mergePropTemplates(propTemplates);
    const propAccounts = (accounts || []).filter(
      (a) => a?.prop?.templateId && !isDeleted(a) && !a?.archivedAt
    );

    // Calculate summary
    let totalSpent = 0;
    let totalEarned = 0;
    let passedCount = 0;
    let failedCount = 0;
    let inProgressCount = 0;
    let pendingPayouts = 0;

    for (const acc of propAccounts) {
      const template = getTemplate(templates, acc?.prop?.templateId);
      if (!template) continue;

      // Get phase from template to determine status consistently with cards
      const phase = (template.phases || []).find((p) => p.id === acc?.prop?.phaseId) || template.phases?.[0];
      const accStatus = acc?.status?.toLowerCase() || "";

      // Determine status using same logic as PropAccountCard
      // Priority: failed status > passed status > funded phase > active
      if (accStatus.includes("failed")) {
        failedCount++;
      } else if (accStatus.includes("passed") || phase?.kind === "funded") {
        passedCount++;
      } else {
        inProgressCount++;
      }

      // Payouts - use paidTrader and pendingTrader (not total/pending which don't exist)
      const payoutSummary = summarizePayouts(acc, templates);
      totalEarned += payoutSummary.paidTrader || 0;
      pendingPayouts += payoutSummary.pendingTrader || 0;
    }

    const roi = totalSpent > 0 ? ((totalEarned - totalSpent) / totalSpent) * 100 : 0;

    return {
      propAccounts,
      templates,
      summary: {
        totalSpent,
        totalEarned,
        roi,
        passedCount,
        failedCount,
        inProgressCount,
        pendingPayouts,
        total: propAccounts.length,
      },
    };
  }, [accounts, propTemplates]);

  if (loading) {
    return (
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
            <Building2 className="h-4 w-4 text-accent" />
            Prop Firm Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (propAccounts.length === 0) {
    return null; // Don't show if no prop accounts
  }

  const currency = propAccounts[0]?.currency || "$";

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
          <Building2 className="h-4 w-4 text-accent" />
          Prop Firm Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 pb-4 border-b border-border/30">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Passed</span>
            </div>
            <span className="text-xl font-bold text-emerald-400">{summary.passedCount}</span>
          </div>

          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-rose-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed</span>
            </div>
            <span className="text-xl font-bold text-rose-400">{summary.failedCount}</span>
          </div>

          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</span>
            </div>
            <span className="text-xl font-bold text-blue-400">{summary.inProgressCount}</span>
          </div>

          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-purple-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Earned</span>
            </div>
            <span className="text-xl font-bold text-purple-400">
              {fmtMoney(summary.totalEarned, currency)}
            </span>
          </div>
        </div>

        {/* Account Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {propAccounts.slice(0, 4).map((account) => {
            const template = getTemplate(templates, account?.prop?.templateId);
            return (
              <PropAccountCard
                key={account.id}
                account={account}
                template={template}
                trades={trades || []}
                currency={account?.currency || currency}
              />
            );
          })}
        </div>

        {propAccounts.length > 4 && (
          <div className="mt-3 text-center">
            <span className="text-xs text-muted-foreground">
              +{propAccounts.length - 4} more accounts
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
