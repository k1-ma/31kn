/**
 * MetricsCard - Global performance/metrics settings card
 * 
 * Contains settings for how metrics are calculated across the journal.
 * This is a GLOBAL setting stored in ui.winRateMode, not per-account.
 * 
 * UI label is "Performance" for user-friendliness, but file remains
 * MetricsCard.jsx for consistency with existing imports.
 */

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { TrendingUp, Percent, DollarSign } from "lucide-react";

export default function MetricsCard({ winRateMode, onWinRateModeChange, avgRRMode, onAvgRRModeChange, pnlDisplayMode, onPnlDisplayModeChange }) {
  const { t } = useI18n();
  
  return (
    <Card className="premium-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {t("settings.performance.title") || "Performance"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          {t("settings.performance.subtitle") || "Configure how trading metrics are calculated"}
        </div>
        
        {/* Win Rate Calculation Mode */}
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {t("settings.performance.winRateCalculation") || "Win rate calculation"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.performance.winRateHint") || "Choose how break-even trades affect Win Rate and averages."}
                </div>
              </div>
            </div>
            <select
              value={winRateMode || "ignore"}
              onChange={(e) => onWinRateModeChange(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-card/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors cursor-pointer"
            >
              <option value="ignore">
                {t("settings.performance.winRateModeIgnore") || "Neutral (exclude break-even)"}
              </option>
              <option value="loss">
                {t("settings.performance.winRateModeLoss") || "Count break-even as loss"}
              </option>
            </select>
          </div>
        </div>

        {/* Average RR Calculation Mode */}
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {t("settings.performance.avgRRCalculation") || "Average RR calculation"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.performance.avgRRHint") || "Choose whether break-even trades are included in the average RR calculation."}
                </div>
              </div>
            </div>
            <select
              value={avgRRMode || "winsOnly"}
              onChange={(e) => onAvgRRModeChange(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-card/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors cursor-pointer"
            >
              <option value="winsOnly">
                {t("settings.performance.avgRRModeWinsOnly") || "Wins only (exclude break-even)"}
              </option>
              <option value="all">
                {t("settings.performance.avgRRModeAll") || "Include break-even trades"}
              </option>
            </select>
          </div>
        </div>

        {/* PNL Display Mode */}
        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                {(pnlDisplayMode || "money") === "percent" ? (
                  <Percent className="h-5 w-5 text-accent" />
                ) : (
                  <DollarSign className="h-5 w-5 text-accent" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {t("settings.performance.pnlDisplayMode") || "P&L display mode"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.performance.pnlDisplayHint") || "Choose whether to show P&L in currency or as a percentage of starting equity."}
                </div>
              </div>
            </div>
            <select
              value={pnlDisplayMode || "money"}
              onChange={(e) => onPnlDisplayModeChange(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-border bg-card/50 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors cursor-pointer"
            >
              <option value="money">
                {t("settings.performance.pnlDisplayMoney") || "Currency ($)"}
              </option>
              <option value="percent">
                {t("settings.performance.pnlDisplayPercent") || "Percentage (%)"}
              </option>
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
