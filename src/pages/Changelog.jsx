import React, { useEffect, useState, useCallback } from "react";
import Header from "@/components/common/Header.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, CheckCircle2, Calendar, Sparkles, Zap,
  TrendingUp, AlertTriangle, XCircle
} from "lucide-react";
import { ideasApi } from "@/lib/api.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";

// Category colors
const CATEGORY_COLORS = {
  UI: "text-purple-400",
  Bugfix: "text-red-400",
  Analytics: "text-blue-400",
  Performance: "text-amber-400",
  Security: "text-emerald-400",
  Monetization: "text-green-400",
  Community: "text-pink-400",
  Other: "text-slate-400",
};

const OUTCOME_ICONS = {
  Success: { icon: CheckCircle2, color: "text-emerald-400" },
  Partial: { icon: AlertTriangle, color: "text-amber-400" },
  Fail: { icon: XCircle, color: "text-red-400" },
  Unknown: { icon: Sparkles, color: "text-slate-400" },
};

// Group updates by month, formatting the month name in the user's locale
// (Russian "Июль 2025" vs English "July 2025") via Intl.DateTimeFormat.
function groupByMonth(ideas, lang) {
  const groups = new Map();
  const intlLocale = lang === "ru" ? "ru-RU" : "en-US";
  const monthFormatter = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric" });

  for (const idea of ideas) {
    const date = idea.implemented_at ? new Date(idea.implemented_at) : new Date(idea.updated_at);
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = monthFormatter.format(date);
    const sortKey = `${year}-${String(month).padStart(2, "0")}`;

    if (!groups.has(key)) {
      groups.set(key, { key, sortKey, ideas: [] });
    }
    groups.get(key).ideas.push(idea);
  }

  return Array.from(groups.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

function UpdateItem({ idea, index }) {
  const implementedDate = idea.implemented_at 
    ? new Date(idea.implemented_at).toLocaleDateString() 
    : null;
  const categoryColor = CATEGORY_COLORS[idea.category] || CATEGORY_COLORS.Other;
  const outcomeInfo = OUTCOME_ICONS[idea.outcome] || OUTCOME_ICONS.Unknown;
  const OutcomeIcon = outcomeInfo.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="relative pl-6 pb-6 last:pb-0"
    >
      {/* Timeline line */}
      <div className="absolute left-[9px] top-3 bottom-0 w-px bg-gradient-to-b from-accent/40 to-transparent" />
      
      {/* Timeline dot */}
      <div className="absolute left-0 top-1.5 h-[18px] w-[18px] rounded-full bg-card border-2 border-accent flex items-center justify-center">
        <CheckCircle2 className="h-2.5 w-2.5 text-accent" />
      </div>
      
      <div className="ml-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">{idea.title}</h4>
            {idea.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {idea.description}
              </p>
            )}
          </div>
          
          {idea.outcome !== "Unknown" && (
            <div className={`flex items-center gap-1 text-xs ${outcomeInfo.color}`}>
              <OutcomeIcon className="h-3.5 w-3.5" />
              {idea.outcome}
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full bg-muted/50 font-medium ${categoryColor}`}>
            {idea.category}
          </span>
          {idea.impact_score && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 flex items-center gap-1">
              <Zap className="h-2.5 w-2.5" />
              Impact: {idea.impact_score}/10
            </span>
          )}
          {implementedDate && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {implementedDate}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Changelog({ reduceMotion }) {
  const { t, lang } = useI18n();
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ideasRes, statsRes] = await Promise.all([
        ideasApi.list({ status: "Implemented" }),
        ideasApi.stats(),
      ]);
      // Sort by implemented date, newest first
      const sorted = (ideasRes.ideas || []).sort((a, b) => {
        const dateA = a.implemented_at || a.updated_at;
        const dateB = b.implemented_at || b.updated_at;
        return new Date(dateB) - new Date(dateA);
      });
      setIdeas(sorted);
      setStats(statsRes);
    } catch (err) {
      console.error("[Changelog] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groupedIdeas = groupByMonth(ideas, lang);

  return (
    <div>
      <Header
        title="Updates & Changelog"
        subtitle="Recent improvements and implemented ideas"
        icon={<History className="h-7 w-7" />}
      />

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="rounded-xl border-2 border-accent/15 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Implemented</div>
              <div className="text-2xl font-bold">{stats.implemented || 0}</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-2 border-accent/15 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-xs font-medium text-blue-400 uppercase tracking-wider">Success Rate</div>
              <div className="text-2xl font-bold">{stats.successRate || 0}%</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-2 border-accent/15 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-xs font-medium text-purple-400 uppercase tracking-wider">Avg Impact</div>
              <div className="text-2xl font-bold">{stats.avgImpactScore || "—"}</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-2 border-accent/15 bg-gradient-to-br from-amber-500/10 to-amber-500/5">
            <CardContent className="p-4 text-center">
              <div className="text-xs font-medium text-amber-400 uppercase tracking-wider">Avg Days</div>
              <div className="text-2xl font-bold">{stats.avgDaysToImplement || "—"}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-card/50 animate-pulse" />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <Card className="rounded-xl border-2 border-dashed border-accent/20">
          <CardContent className="p-12 text-center">
            <History className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-semibold mb-2">No updates yet</h3>
            <p className="text-muted-foreground text-sm">
              Implemented ideas will appear here as a changelog.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedIdeas.map((group, groupIdx) => (
            <motion.div
              key={group.key}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: groupIdx * 0.05 }}
            >
              {/* Month Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  <Calendar className="h-4 w-4" />
                  {group.key}
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-accent/20 to-transparent" />
                <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-muted/30">
                  {group.ideas.length} updates
                </span>
              </div>
              
              {/* Updates List */}
              <Card className="rounded-xl border-2 border-accent/15">
                <CardContent className="p-4">
                  {group.ideas.map((idea, idx) => (
                    <UpdateItem key={idea.id} idea={idea} index={idx} />
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
