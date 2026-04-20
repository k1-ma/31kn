/**
 * DashboardHauntedScore - Premium Haunted Score card for Dashboard
 * 
 * Replaces the diamond radar chart with a more informative UI:
 * - Left: Logo + big Score + interpretation + "based on 4 factors"
 * - Right: 4 progress bars with subscores and raw values
 * - Focus of the week: recommendation based on weakest factor
 * 
 * NOTE: Text strings are in Russian with fallback. For full i18n support,
 * these should be moved to translations.js and accessed via t() calls.
 */

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import { computeHauntedScore, computeRawMetrics } from "@/lib/hauntedScore.js";
import hauntedLogo from "@/assets/haunted.png";
import { fadeUp } from "@/components/common/motion";
import HelpTooltip from "@/components/ui/HelpTooltip.jsx";
import { Target, Lightbulb } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

/**
 * Get score interpretation based on value
 * Using thresholds: 70+ excellent, 40-69 normal, <40 weak
 */
function getScoreInterpretation(score) {
  if (score === null) return { label: "—", color: "text-muted-foreground/60" };
  if (score >= 70) return { label: "Отлично", color: "text-emerald-400" };
  if (score >= 40) return { label: "Норма", color: "text-amber-400" };
  return { label: "Слабо", color: "text-rose-400" };
}

/**
 * Get color for subscore - aligned with interpretation thresholds
 */
function getSubscoreColor(score) {
  if (score === null) return "bg-muted-foreground/20";
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

/**
 * Weekly Focus text mapping for each weakest factor
 * Provides localized recommendations based on locale (ru/en)
 */
const WEEKLY_FOCUS_TEXTS = {
  wr: {
    ru: "Перед каждой сделкой записывай конкретную причину входа в журнал. Если не можешь объяснить — не торгуй. Отслеживай, какие сетапы дают лучший результат через Smart Insights.",
    en: "Write down the specific reason for every entry in your journal. If you can't explain it — don't trade. Track which setups perform best via Smart Insights."
  },
  rr: {
    ru: "Анализируй в аналитике, где ты закрываешь сделки раньше: какие пары и сессии страдают. Используй разбивку по R:R бакетам, чтобы найти паттерны выхода.",
    en: "Use analytics to find where you exit too early: which pairs and sessions are affected. Check R:R bucket breakdowns to identify exit patterns."
  },
  slUsage: {
    ru: "Заполняй риск для каждой сделки при записи. Проверяй раздел дисциплины на Dashboard — там видно процент сделок с заданным риском.",
    en: "Fill in risk for every trade when logging. Check the discipline section on Dashboard — it shows the percentage of trades with defined risk."
  },
  consistency: {
    ru: "Используй еженедельные обзоры в документах, чтобы выявить дни с перетрейдингом. Ограничь количество сделок в день и отслеживай результат в разбивке по дням недели.",
    en: "Use weekly reviews in documents to spot overtrading days. Limit daily trade count and track results in the weekday breakdown."
  }
};

/**
 * Get weekly focus text based on weakest factor and locale
 * @param {string} weakestFactorKey - One of: "wr", "rr", "slUsage", "consistency"
 * @param {string} locale - Language code ("ru", "en", etc.)
 * @returns {string} - Localized recommendation text
 */
function getWeeklyFocusText(weakestFactorKey, locale = "ru") {
  const effectiveLocale = locale === "en" ? "en" : "ru";
  const focusTexts = WEEKLY_FOCUS_TEXTS[weakestFactorKey];
  
  // Fallback to consistency if unknown factor
  if (!focusTexts) {
    return WEEKLY_FOCUS_TEXTS.consistency[effectiveLocale];
  }
  
  return focusTexts[effectiveLocale];
}

/**
 * Factor labels for display
 */
const FACTOR_LABELS = {
  wr: { ru: "Win Rate", en: "Win Rate" },
  rr: { ru: "Risk/Reward", en: "Risk/Reward" },
  slUsage: { ru: "Риск-дисциплина", en: "Risk Discipline" },
  consistency: { ru: "Стабильность", en: "Consistency" }
};

/**
 * Get the weakest factor from metrics
 * Returns factor key, score, and label
 * Filters out null scores before comparison
 * @param {Object} metrics - Metrics object from computeHauntedScore
 * @param {string} locale - Language code
 * @returns {Object|null} - { key, score, label } or null if no data
 */
function getWeakestFactor(metrics, locale = "ru") {
  if (!metrics || metrics.consistency === null) return null;

  const factorKeys = ["slUsage", "consistency", "rr", "wr"];
  
  const validFactors = factorKeys
    .filter(key => metrics[key] !== null && metrics[key] !== undefined)
    .map(key => ({
      key,
      score: metrics[key],
      label: FACTOR_LABELS[key][locale === "en" ? "en" : "ru"]
    }));

  if (validFactors.length === 0) return null;

  // Find the factor with the lowest score
  let weakest = validFactors[0];
  for (const f of validFactors) {
    if (f.score < weakest.score) {
      weakest = f;
    }
  }

  return weakest;
}

/**
 * Factor Progress Bar with tooltip
 */
function FactorProgressBar({ 
  label, 
  subscore, 
  rawValue, 
  rawLabel,
  helpText,
  reduceMotion = false 
}) {
  const hasData = subscore !== null;
  const displayScore = hasData ? subscore : 0;
  const barColor = getSubscoreColor(subscore);
  
  // Gradient fills for premium look
  const getBarGradient = (score) => {
    if (score === null) return "bg-muted-foreground/20";
    if (score >= 70) return "bg-gradient-to-r from-emerald-500 to-emerald-400";
    if (score >= 40) return "bg-gradient-to-r from-amber-500 to-amber-400";
    return "bg-gradient-to-r from-rose-500 to-rose-400";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          <HelpTooltip content={helpText} ariaLabel={`Помощь: ${label}`} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{rawLabel}:</span>
          <span className="font-semibold text-foreground min-w-[3rem] text-right tabular-nums">
            {hasData ? rawValue : "—"}
          </span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div 
        className="relative h-2 bg-black/[0.06] dark:bg-white/[0.04] rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
        role="progressbar"
        aria-valuenow={displayScore}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${hasData ? displayScore : 0} из 100`}
      >
        <motion.div
          initial={reduceMotion ? { width: `${displayScore}%` } : { width: 0 }}
          animate={{ width: `${displayScore}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className={`absolute inset-y-0 left-0 rounded-full ${getBarGradient(subscore)}`}
          style={{ 
            boxShadow: hasData ? `0 0 8px ${subscore >= 70 ? 'rgba(16,185,129,0.35)' : subscore >= 40 ? 'rgba(245,158,11,0.35)' : 'rgba(244,63,94,0.35)'}` : 'none'
          }}
        />
      </div>
      
      {/* Subscore value */}
      <div className="flex justify-end">
        <span className={`text-[11px] font-semibold tabular-nums ${hasData ? (subscore >= 70 ? 'text-emerald-400' : subscore >= 40 ? 'text-amber-400' : 'text-rose-400') : 'text-muted-foreground/40'}`}>
          {hasData ? `${subscore}/100` : "—/100"}
        </span>
      </div>
    </div>
  );
}

/**
 * DashboardHauntedScore Component
 */
export default function DashboardHauntedScore({
  trades,
  accountId = "all",
  reduceMotion = false,
}) {
  // Get locale from i18n context
  const { lang } = useI18n();

  // Calculate score and metrics from filtered trades
  const { score, metrics } = useMemo(() => {
    return computeHauntedScore(trades, accountId);
  }, [trades, accountId]);

  // Calculate raw metrics using the shared function
  const rawMetrics = useMemo(() => {
    return computeRawMetrics(trades, accountId);
  }, [trades, accountId]);

  // Get weakest factor for recommendation (with locale)
  const weakestFactor = useMemo(() => {
    return getWeakestFactor(metrics, lang);
  }, [metrics, lang]);

  // Get weekly focus text based on weakest factor and locale
  const weeklyFocusText = useMemo(() => {
    if (!weakestFactor) return null;
    return getWeeklyFocusText(weakestFactor.key, lang);
  }, [weakestFactor, lang]);

  const hasData = score !== null;
  const interpretation = getScoreInterpretation(score);

  // Get score color based on value
  const getScoreColor = () => {
    if (!hasData) return "text-muted-foreground/40";
    if (score >= 70) return "text-emerald-500";
    if (score >= 40) return "text-amber-500";
    return "text-rose-500";
  };

  return (
    <motion.div {...fadeUp(reduceMotion, 0.10)} className="relative z-0 w-full">
      <Card className="overflow-hidden">
        <CardContent className="p-0 relative">
          {/* TWO-COLUMN Layout */}
          <div className="flex flex-col xl:grid xl:grid-cols-[200px_1fr] min-h-0">
            
            {/* LEFT COLUMN: Logo + Score */}
            <div className="flex flex-row xl:flex-col items-start xl:items-start gap-3 p-3 sm:p-4 xl:border-r xl:border-border/30 dark:border-white/[0.05]">
              {/* Haunted Logo */}
              <div className="h-9 w-9 rounded-lg overflow-hidden ring-1 ring-white/[0.08] shrink-0">
                <img src={hauntedLogo} alt="HAUNTED" className="h-full w-full object-cover" draggable={false} />
              </div>
              
              {/* Score Section */}
              <div>
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="flex items-baseline gap-1"
                >
                  <span className={`text-4xl xl:text-5xl font-bold tracking-tighter leading-none ${getScoreColor()}`}
                    style={{
                      textShadow: hasData 
                        ? score >= 70 ? '0 0 20px rgba(16,185,129,0.2)' 
                          : score >= 40 ? '0 0 20px rgba(245,158,11,0.2)' 
                          : '0 0 20px rgba(244,63,94,0.2)'
                        : 'none'
                    }}
                  >
                    {hasData ? score : "—"}
                  </span>
                  <span className="text-sm text-dim/70 font-medium">/ 100</span>
                </motion.div>
                
                <div className="mt-1.5">
                  <span className={`text-sm font-semibold tracking-wide ${interpretation.color}`}>{interpretation.label}</span>
                </div>
                
                <p className="text-[11px] text-subtle/80 mt-0.5">
                  {hasData ? "на основе 4 факторов" : "Добавьте сделки для оценки"}
                </p>

                {hasData && (
                  <div className="mt-2 flex gap-3 text-[11px] text-dim/70 tabular-nums">
                    <span>{rawMetrics.totalTrades} сделок</span>
                    <span>{rawMetrics.tradingDays} дн.</span>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Factor breakdown + Focus */}
            <div className="flex flex-col p-3 sm:p-4 gap-2 border-t xl:border-t-0 border-border/30 dark:border-white/[0.05]">
              {/* Factor Progress Bars */}
              <div className="space-y-2">
                <FactorProgressBar
                  label="Стабильность"
                  subscore={metrics.consistency}
                  rawValue={hasData ? `${rawMetrics.tradingDays} дн.` : "—"}
                  rawLabel="Дней"
                  helpText="Оценка стабильности дневного PnL. Чем меньше разброс результатов по дням, тем выше оценка. Стремитесь к ровным результатам без резких просадок и сверхприбылей."
                  reduceMotion={reduceMotion}
                />
                
                <FactorProgressBar
                  label="Risk/Reward"
                  subscore={metrics.rr}
                  rawValue={hasData ? rawMetrics.avgRR.toFixed(2) : "—"}
                  rawLabel="Avg RR"
                  helpText="Средний Risk/Reward ваших сделок. RR ≥ 1.5 — хорошо, RR ≥ 2.0 — отлично. Показывает, сколько вы в среднем зарабатываете на единицу риска."
                  reduceMotion={reduceMotion}
                />
                
                <FactorProgressBar
                  label="Win Rate"
                  subscore={metrics.wr}
                  rawValue={hasData ? `${rawMetrics.winRatePct.toFixed(1)}%` : "—"}
                  rawLabel="WR"
                  helpText="Процент прибыльных сделок. WR ≥ 55% — хорошо для большинства стратегий. Но помните: высокий WR без хорошего RR не гарантирует прибыль."
                  reduceMotion={reduceMotion}
                />
                
                <FactorProgressBar
                  label="Риск-дисциплина"
                  subscore={metrics.slUsage}
                  rawValue={hasData ? `${rawMetrics.riskDefinedPct.toFixed(0)}%` : "—"}
                  rawLabel="С риском"
                  helpText="Процент сделок с определённым риском (SL, riskUsd или RR). Цель — 90%+. Это показывает, насколько дисциплинированно вы управляете риском."
                  reduceMotion={reduceMotion}
                />
              </div>

              {/* Focus of the Week / Growth Point */}
              {hasData && weakestFactor && weeklyFocusText && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className="pt-2 border-t border-border/30 dark:border-white/[0.05]"
                >
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gradient-to-br from-[#3B82F6]/[0.06] to-[#22D3EE]/[0.03] border border-[#3B82F6]/[0.12] shadow-[0_2px_8px_rgba(59,130,246,0.04)]">
                    <div className="shrink-0 h-7 w-7 rounded-lg bg-gradient-to-br from-[#3B82F6]/[0.15] to-[#22D3EE]/[0.08] flex items-center justify-center border border-[#3B82F6]/[0.1]">
                      <Lightbulb className="h-3.5 w-3.5 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-accent uppercase tracking-wider">
                          {lang === "en" ? "Weekly Focus" : "Фокус недели"}
                        </span>
                        <span className="text-[11px] text-dim/60 tabular-nums">
                          ({weakestFactor.label}: {weakestFactor.score}/100)
                        </span>
                      </div>
                      <p className="text-[12px] text-foreground/75 leading-snug">
                        {weeklyFocusText}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Empty state message */}
              {!hasData && (
                <div className="pt-3 flex items-center justify-center">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 dark:bg-white/[0.03] border border-border/30 dark:border-white/[0.06] text-center">
                    <Target className="h-5 w-5 text-[#9FB3D9]/40" />
                    <p className="text-sm text-muted-foreground">
                      {lang === "en" 
                        ? "Add trades to get your weekly focus." 
                        : "Добавь сделки, чтобы получить фокус недели."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
