import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, TrendingUp, TrendingDown, Clock, Calendar,
  Target, AlertTriangle, Award, BarChart3, Zap, Activity,
  Wallet, Lightbulb, PieChart, Brain
} from "lucide-react";
import { clampNum, fmtMoney } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { ideasApi } from "@/lib/api.js";
import { calcWinRatePct, classifyOutcomeByRRAndPnL } from "@/lib/metrics/winRate.js";
import { isDeleted } from "@/lib/syncDb.js";

// Analyze trades and generate smart insights (rule-based, no ML)
function generateInsights(trades, accounts, winRateMode = "ignore") {
  const insights = [];
  
  if (!trades || trades.length < 5) {
    return insights; // Not enough data for meaningful insights
  }
  
  // Get PnL for a trade
  const getPnL = (trade) => {
    const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
    return allocs.reduce((sum, a) => sum + clampNum(a?.pnl), 0);
  };

  // Returns true if the trade or any allocation is user-marked as break-even.
  // Recognises BU from either the isBreakEven flag or the outcome === "BE"
  // UI label (handles legacy data without the flag).
  const getIsBreakEven = (trade) => {
    if (trade?.isBreakEven === true) return true;
    if (trade?.outcome === "BE") return true;
    const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
    return allocs.some((a) => a?.isBreakEven === true);
  };

  // Classify a trade respecting isBreakEven and the global winRateMode
  const getOutcome = (trade) => classifyOutcomeByRRAndPnL({
    pnl: getPnL(trade),
    rr: trade?.rr,
    neutralRR: 0,
    isBreakEven: getIsBreakEven(trade),
    mode: winRateMode,
  });

  // Parse trade date
  const getDate = (trade) => {
    if (!trade?.date) return null;
    const d = new Date(`${trade.date}T12:00:00`);
    return isNaN(d.getTime()) ? null : d;
  };

  // Calculate overall stats with break-even handling
  const allPnL = trades.map(getPnL);
  let wins = 0, losses = 0, breakEvens = 0;
  for (const trade of trades) {
    const outcome = getOutcome(trade);
    if (outcome === "win") wins++;
    else if (outcome === "loss") losses++;
    else breakEvens++;
  }
  const winRate = calcWinRatePct({ wins, losses, breakEvens, mode: winRateMode });
  const totalPnL = allPnL.reduce((a, b) => a + b, 0);
  
  // 1. Best day of week analysis
  const dayStats = new Map();
  for (const trade of trades) {
    const d = getDate(trade);
    if (!d) continue;
    const day = d.getDay(); // 0=Sun, 1=Mon, etc.
    const pnl = getPnL(trade);
    if (!dayStats.has(day)) {
      dayStats.set(day, { pnl: 0, count: 0, wins: 0 });
    }
    const stat = dayStats.get(day);
    stat.pnl += pnl;
    stat.count++;
    if (getOutcome(trade) === "win") stat.wins++;
  }
  
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let bestDay = null, worstDay = null;
  let bestDayPnL = -Infinity, worstDayPnL = Infinity;
  
  for (const [day, stat] of dayStats) {
    if (stat.count >= 3) {
      if (stat.pnl > bestDayPnL) {
        bestDayPnL = stat.pnl;
        bestDay = { day, ...stat };
      }
      if (stat.pnl < worstDayPnL) {
        worstDayPnL = stat.pnl;
        worstDay = { day, ...stat };
      }
    }
  }
  
  if (bestDay && bestDayPnL > 0) {
    const dayWinRate = (bestDay.wins / bestDay.count) * 100;
    insights.push({
      type: "positive",
      icon: Calendar,
      title: `Best day: ${dayNames[bestDay.day]}`,
      description: `You perform best on ${dayNames[bestDay.day]}s with ${dayWinRate.toFixed(0)}% win rate and $${bestDayPnL.toFixed(0)} total profit.`,
      priority: 1,
    });
  }
  
  if (worstDay && worstDayPnL < 0 && worstDay.day !== bestDay?.day) {
    insights.push({
      type: "warning",
      icon: AlertTriangle,
      title: `Weak day: ${dayNames[worstDay.day]}`,
      description: `Consider reducing position size on ${dayNames[worstDay.day]}s. You've lost $${Math.abs(worstDayPnL).toFixed(0)} on this day.`,
      priority: 2,
    });
  }
  
  // 2. Session/time analysis (if session data available)
  const sessionStats = new Map();
  for (const trade of trades) {
    const session = trade.sessionId || trade.session || "Unknown";
    const pnl = getPnL(trade);
    if (!sessionStats.has(session)) {
      sessionStats.set(session, { pnl: 0, count: 0, wins: 0 });
    }
    const stat = sessionStats.get(session);
    stat.pnl += pnl;
    stat.count++;
    if (getOutcome(trade) === "win") stat.wins++;
  }
  
  let bestSession = null, bestSessionPnL = -Infinity;
  for (const [session, stat] of sessionStats) {
    if (session !== "Unknown" && stat.count >= 3 && stat.pnl > bestSessionPnL) {
      bestSessionPnL = stat.pnl;
      bestSession = { session, ...stat };
    }
  }
  
  if (bestSession && bestSessionPnL > 0) {
    insights.push({
      type: "positive",
      icon: Clock,
      title: `Best session: ${bestSession.session}`,
      description: `Your most profitable session is ${bestSession.session} with $${bestSessionPnL.toFixed(0)} profit across ${bestSession.count} trades.`,
      priority: 3,
    });
  }
  
  // 2b. Model analysis (if model data available)
  const modelStats = new Map();
  for (const trade of trades) {
    const model = trade.modelId || "Unknown";
    const pnl = getPnL(trade);
    if (!modelStats.has(model)) {
      modelStats.set(model, { pnl: 0, count: 0, wins: 0 });
    }
    const stat = modelStats.get(model);
    stat.pnl += pnl;
    stat.count++;
    if (getOutcome(trade) === "win") stat.wins++;
  }
  
  let bestModel = null, bestModelPnL = -Infinity;
  for (const [model, stat] of modelStats) {
    if (model !== "Unknown" && stat.count >= 3 && stat.pnl > bestModelPnL) {
      bestModelPnL = stat.pnl;
      bestModel = { model, ...stat };
    }
  }
  
  if (bestModel && bestModelPnL > 0) {
    insights.push({
      type: "positive",
      icon: Brain,
      title: `Best model: ${bestModel.model}`,
      description: `Your most profitable model is "${bestModel.model}" with $${bestModelPnL.toFixed(0)} profit across ${bestModel.count} trades (${Math.round(bestModel.wins / bestModel.count * 100)}% win rate).`,
      priority: 3,
    });
  }
  
  // 3. Win/Loss streak detection
  let currentStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
  let streakType = null;
  
  const sortedTrades = [...trades].sort((a, b) => {
    const da = getDate(a), db = getDate(b);
    return (da?.getTime() || 0) - (db?.getTime() || 0);
  });
  
  for (const trade of sortedTrades) {
    const outcome = getOutcome(trade);
    if (outcome === "win") {
      if (streakType === "win") {
        currentStreak++;
      } else {
        currentStreak = 1;
        streakType = "win";
      }
      maxWinStreak = Math.max(maxWinStreak, currentStreak);
    } else if (outcome === "loss") {
      if (streakType === "loss") {
        currentStreak++;
      } else {
        currentStreak = 1;
        streakType = "loss";
      }
      maxLossStreak = Math.max(maxLossStreak, currentStreak);
    }
  }
  
  if (maxWinStreak >= 5) {
    insights.push({
      type: "positive",
      icon: Award,
      title: `Great winning streak!`,
      description: `You've had a ${maxWinStreak}-trade winning streak. Keep up the good work!`,
      priority: 4,
    });
  }
  
  if (maxLossStreak >= 4) {
    insights.push({
      type: "warning",
      icon: AlertTriangle,
      title: `Watch for losing streaks`,
      description: `You've experienced ${maxLossStreak} consecutive losses. Consider taking a break after 3 losses.`,
      priority: 2,
    });
  }
  
  // 4. Direction analysis (Long vs Short)
  const directionStats = { Long: { pnl: 0, count: 0, wins: 0 }, Short: { pnl: 0, count: 0, wins: 0 } };
  
  for (const trade of trades) {
    const dir = trade.direction;
    if (dir === "Long" || dir === "Short") {
      const pnl = getPnL(trade);
      directionStats[dir].pnl += pnl;
      directionStats[dir].count++;
      if (getOutcome(trade) === "win") directionStats[dir].wins++;
    }
  }
  
  if (directionStats.Long.count >= 5 && directionStats.Short.count >= 5) {
    const longWR = (directionStats.Long.wins / directionStats.Long.count) * 100;
    const shortWR = (directionStats.Short.wins / directionStats.Short.count) * 100;
    
    if (longWR - shortWR > 15) {
      insights.push({
        type: "info",
        icon: TrendingUp,
        title: "Long trades perform better",
        description: `Your Long trades have ${longWR.toFixed(0)}% win rate vs ${shortWR.toFixed(0)}% for Shorts. Consider focusing on long setups.`,
        priority: 5,
      });
    } else if (shortWR - longWR > 15) {
      insights.push({
        type: "info",
        icon: TrendingDown,
        title: "Short trades perform better",
        description: `Your Short trades have ${shortWR.toFixed(0)}% win rate vs ${longWR.toFixed(0)}% for Longs. Consider focusing on short setups.`,
        priority: 5,
      });
    }
  }
  
  // 5. Recent performance trend
  const recentTrades = sortedTrades.slice(-10);
  const olderTrades = sortedTrades.slice(-20, -10);
  
  if (recentTrades.length >= 5 && olderTrades.length >= 5) {
    const recentPnL = recentTrades.reduce((s, t) => s + getPnL(t), 0);
    const olderPnL = olderTrades.reduce((s, t) => s + getPnL(t), 0);
    
    if (recentPnL > olderPnL * 1.5 && recentPnL > 0) {
      insights.push({
        type: "positive",
        icon: Zap,
        title: "You're on fire! 🔥",
        description: `Your last 10 trades are significantly more profitable than the previous 10. Great improvement!`,
        priority: 1,
      });
    } else if (recentPnL < olderPnL * 0.5 && olderPnL > 0) {
      insights.push({
        type: "warning",
        icon: AlertTriangle,
        title: "Recent performance dip",
        description: `Your recent trades are underperforming. Consider reviewing your strategy or taking a break.`,
        priority: 2,
      });
    }
  }
  
  // 6. Risk:Reward insight
  const rrValues = [];
  for (const trade of trades) {
    // Trade-level BU is global — propagate to every allocation so a BU trade
    // is never counted as a "win" here even if the alloc has positive PnL.
    const tradeIsBE = trade?.outcome === "BE" || trade?.isBreakEven === true;
    const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
    if (allocs.length > 0) {
      // For trades with allocations, check each allocation
      for (const a of allocs) {
        const pnl = clampNum(a?.pnl);
        const rr = clampNum(a?.rr);
        const isBreakEven = tradeIsBE || Boolean(a?.isBreakEven);
        // Use classification function for consistency
        const outcome = classifyOutcomeByRRAndPnL({ pnl, rr, neutralRR: 0, isBreakEven });
        // Only include winning trades with positive RR
        if (outcome === "win" && rr > 0) {
          rrValues.push(rr);
        }
      }
    } else {
      // For trades without allocations, check the trade itself
      const pnl = clampNum(trade?.pnl);
      const rr = clampNum(trade?.rr);
      const isBreakEven = tradeIsBE;
      // Use classification function for consistency
      const outcome = classifyOutcomeByRRAndPnL({ pnl, rr, neutralRR: 0, isBreakEven });
      // Only include winning trades with positive RR
      if (outcome === "win" && rr > 0) {
        rrValues.push(rr);
      }
    }
  }
  
  if (rrValues.length >= 10) {
    const avgRR = rrValues.reduce((a, b) => a + b, 0) / rrValues.length;
    if (avgRR < 1) {
      insights.push({
        type: "warning",
        icon: Target,
        title: "Low Risk:Reward ratio",
        description: `Your average RR for winning trades is ${avgRR.toFixed(2)}:1. Consider aiming for trades with at least 1:1.5 RR.`,
        priority: 3,
      });
    } else if (avgRR >= 2) {
      insights.push({
        type: "positive",
        icon: Target,
        title: "Excellent Risk:Reward!",
        description: `Your average RR of ${avgRR.toFixed(2)}:1 for winning trades is excellent. This gives you room for lower win rates.`,
        priority: 4,
      });
    }
  }
  
  // Sort by priority
  insights.sort((a, b) => a.priority - b.priority);
  
  return insights.slice(0, 5); // Limit to top 5 insights
}

// Compact insight row component
function InsightRow({ insight, index, reduceMotion }) {
  const Icon = insight.icon;
  
  const iconColors = {
    positive: "text-emerald-400",
    warning: "text-amber-400",
    info: "text-blue-400",
  };
  
  const dotColors = {
    positive: "bg-emerald-400",
    warning: "bg-amber-400",
    info: "bg-blue-400",
  };
  
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-start gap-2 py-2 border-b border-accent/10 last:border-b-0"
    >
      <div className={`shrink-0 mt-1 ${iconColors[insight.type]}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-xs font-medium leading-tight">{insight.title}</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{insight.description}</p>
      </div>
    </motion.div>
  );
}

// Mini stat card for Dashboard Intelligence - compact version
function MiniStatCard({ icon: Icon, label, value, subValue, accent }) {
  const accentClasses = {
    positive: "text-emerald-400",
    negative: "text-red-400",
    neutral: "text-blue-400",
    purple: "text-purple-400",
  };
  
  return (
    <div className="p-2.5 rounded-lg border border-accent/10 bg-card/40 hover:border-accent/20 transition-all duration-200">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={`h-3 w-3 ${accentClasses[accent] || "text-muted-foreground"}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className={`text-sm font-semibold ${accentClasses[accent] || "text-foreground"}`}>
        {value}
      </div>
      {subValue && <div className="text-[10px] text-muted-foreground">{subValue}</div>}
    </div>
  );
}

// Compute lifetime trade stats
function computeTradeStats(trades, getPnL) {
  const activeTrades = (trades || []).filter(t => !isDeleted(t));
  const totalTrades = activeTrades.length;
  
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      avgPnlPerTrade: 0,
      bestTradePnl: 0,
      worstTradePnl: 0,
      avgTradesPerTradingDay: 0,
    };
  }
  
  const pnls = activeTrades.map(getPnL);
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const avgPnlPerTrade = totalPnl / totalTrades;
  const bestTradePnl = Math.max(...pnls);
  const worstTradePnl = Math.min(...pnls);
  
  // Calculate unique trading days
  const tradingDays = new Set();
  for (const trade of activeTrades) {
    if (trade?.date) {
      const d = String(trade.date).split("T")[0];
      if (d) tradingDays.add(d);
    }
  }
  const uniqueDays = tradingDays.size || 1;
  const avgTradesPerTradingDay = totalTrades / uniqueDays;
  
  return {
    totalTrades,
    avgPnlPerTrade,
    bestTradePnl,
    worstTradePnl,
    avgTradesPerTradingDay,
  };
}

// Compute prop account stats
function computePropStats(trades, accounts, getPnL) {
  const activeTrades = (trades || []).filter(t => !isDeleted(t));
  const accountsArr = accounts || [];
  
  // Identify prop accounts (those with prop.templateId)
  const propAccountIds = new Set();
  for (const acc of accountsArr) {
    if (acc?.prop?.templateId) {
      propAccountIds.add(acc.id);
    }
  }
  
  const totalPropAccounts = propAccountIds.size;
  let totalPropPnL = 0;
  let totalNonPropPnL = 0;
  
  for (const trade of activeTrades) {
    const pnl = getPnL(trade);
    const accId = trade?.accountId;
    if (propAccountIds.has(accId)) {
      totalPropPnL += pnl;
    } else {
      totalNonPropPnL += pnl;
    }
  }
  
  return {
    totalPropAccounts,
    totalPropPnL,
    totalNonPropPnL,
    // TODO: prop fees/spend not stored in codebase - need a 'propFees' or 'propSpend' field on account or trade
    propFees: null,
  };
}

export default function SmartInsights({ trades, accounts, reduceMotion }) {
  const { t } = useI18n();
  const currency = accounts?.[0]?.currency ?? "$";
  
  // Ideas stats state
  const [ideasStats, setIdeasStats] = useState(null);
  const [ideasLoading, setIdeasLoading] = useState(true);
  
  // Fetch ideas stats on mount
  useEffect(() => {
    let mounted = true;
    
    async function fetchIdeasStats() {
      try {
        const data = await ideasApi.stats();
        if (mounted) {
          setIdeasStats(data);
        }
      } catch (err) {
        // Gracefully handle error - don't crash
        console.warn("[SmartInsights] Failed to fetch ideas stats:", err);
      } finally {
        if (mounted) {
          setIdeasLoading(false);
        }
      }
    }
    
    fetchIdeasStats();
    return () => { mounted = false; };
  }, []);
  
  // Get PnL for a trade (consistent with existing logic)
  const getPnL = (trade) => {
    const allocs = Array.isArray(trade?.allocations) ? trade.allocations : [];
    return allocs.reduce((sum, a) => sum + clampNum(a?.pnl), 0);
  };
  
  const insights = useMemo(() => {
    return generateInsights(trades, accounts);
  }, [trades, accounts]);
  
  // Compute dashboard intelligence stats
  const tradeStats = useMemo(() => computeTradeStats(trades, getPnL), [trades]);
  const propStats = useMemo(() => computePropStats(trades, accounts, getPnL), [trades, accounts]);
  
  // If no insights and no trade data, don't render
  if (insights.length === 0 && tradeStats.totalTrades === 0) {
    return null;
  }
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      {/* Left/Primary: Dashboard Intelligence - Main analytics panel */}
      <div className="rounded-xl border border-accent/15 bg-card/50 p-4 order-1">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-accent/10">
          <Activity className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {t("insights.intelligence")}
          </h3>
        </div>
        
        {/* Responsive grid of KPI tiles: 2 columns on mobile, 3-4 columns on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          <MiniStatCard
            icon={BarChart3}
            label={t("insights.stats.totalTrades")}
            value={tradeStats.totalTrades}
            accent="neutral"
          />
          <MiniStatCard
            icon={TrendingUp}
            label={t("insights.stats.avgPnl")}
            value={fmtMoney(tradeStats.avgPnlPerTrade, currency)}
            accent={tradeStats.avgPnlPerTrade >= 0 ? "positive" : "negative"}
          />
          <MiniStatCard
            icon={Award}
            label={t("insights.stats.bestTrade")}
            value={fmtMoney(tradeStats.bestTradePnl, currency)}
            accent="positive"
          />
          <MiniStatCard
            icon={TrendingDown}
            label={t("insights.stats.worstTrade")}
            value={fmtMoney(tradeStats.worstTradePnl, currency)}
            accent="negative"
          />
          <MiniStatCard
            icon={Calendar}
            label={t("insights.stats.avgPerDay")}
            value={tradeStats.avgTradesPerTradingDay.toFixed(1)}
            subValue={t("common.trades")}
            accent="neutral"
          />
          <MiniStatCard
            icon={Wallet}
            label={t("insights.stats.propAccounts")}
            value={propStats.totalPropAccounts}
            accent="purple"
          />
          <MiniStatCard
            icon={TrendingUp}
            label={t("insights.stats.propPnl")}
            value={fmtMoney(propStats.totalPropPnL, currency)}
            accent={propStats.totalPropPnL >= 0 ? "positive" : "negative"}
          />
          <MiniStatCard
            icon={TrendingUp}
            label={t("insights.stats.nonPropPnl")}
            value={fmtMoney(propStats.totalNonPropPnL, currency)}
            accent={propStats.totalNonPropPnL >= 0 ? "positive" : "negative"}
          />
          <MiniStatCard
            icon={Lightbulb}
            label={t("insights.stats.totalIdeas")}
            value={ideasLoading ? "—" : (ideasStats?.total ?? "—")}
            accent="purple"
          />
          <MiniStatCard
            icon={Zap}
            label={t("insights.stats.activeIdeas")}
            value={ideasLoading ? "—" : (ideasStats?.active ?? "—")}
            accent="neutral"
          />
          {(() => {
            const successValue = ideasLoading 
              ? "—" 
              : (ideasStats?.successRate != null ? `${ideasStats.successRate}%` : "—");
            const successSubValue = (!ideasLoading && ideasStats)
              ? `${ideasStats.worked || 0}W / ${ideasStats.failed || 0}F`
              : null;
            return (
              <MiniStatCard
                icon={PieChart}
                label={t("insights.stats.ideasSuccess")}
                value={successValue}
                subValue={successSubValue}
                accent="positive"
              />
            );
          })()}
          <MiniStatCard
            icon={Wallet}
            label={t("insights.stats.propFees")}
            value="—"
            subValue={t("insights.stats.notTracked")}
            accent="neutral"
          />
        </div>
      </div>
      
      {/* Right/Secondary: Smart Insights - Compact sidebar widget */}
      <div className="rounded-xl border border-accent/15 bg-card/50 p-3 order-2 lg:max-h-[400px] lg:overflow-y-auto">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-accent/10">
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("insights.title")}
          </h3>
        </div>
        
        <div className="space-y-0">
          {insights.length > 0 ? (
            <AnimatePresence>
              {insights.slice(0, 5).map((insight, idx) => (
                <InsightRow
                  key={insight.title}
                  insight={insight}
                  index={idx}
                  reduceMotion={reduceMotion}
                />
              ))}
            </AnimatePresence>
          ) : (
            <div className="py-3 text-center">
              <p className="text-xs text-muted-foreground">
                {t("insights.noData")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { generateInsights };
