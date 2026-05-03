import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import {
  LayoutDashboard,
  Users,
  Shield,
  BarChart3,
  ScrollText,
  Sparkles,
  MessageSquare,
  GraduationCap,
  Trophy,
  Settings,
  DatabaseBackup,
} from "lucide-react";

// Hover/focus prefetch: calling import() warms the module cache so
// the lazy() loader in App.jsx resolves synchronously when the user
// actually clicks the tab. Browsers de-dup repeated import() calls,
// so multiple hovers are free.
const PREFETCH = {
  "/admincrm-panel/dashboard": () => import("@/pages/admin/AdminDashboard.jsx"),
  "/admincrm-panel/users": () => import("@/pages/admin/AdminUsers.jsx"),
  "/admincrm-panel/bans": () => import("@/pages/admin/AdminBans.jsx"),
  "/admincrm-panel/usage": () => import("@/pages/admin/AdminUsage.jsx"),
  "/admincrm-panel/logs": () => import("@/pages/admin/AdminLogs.jsx"),
  "/admincrm-panel/updates": () => import("@/pages/admin/AdminUpdates.jsx"),
  "/admincrm-panel/feedback": () => import("@/pages/admin/AdminFeedback.jsx"),
  "/admincrm-panel/education": () => import("@/pages/admin/AdminEducation.jsx"),
  "/admincrm-panel/tournaments": () => import("@/pages/admin/AdminTournaments.jsx"),
  "/admincrm-panel/settings": () => import("@/pages/admin/AdminSettings.jsx"),
  "/admincrm-panel/backups": () => import("@/pages/admin/AdminBackups.jsx"),
};
const prefetchRoute = (to) => {
  const fn = PREFETCH[to];
  if (fn) fn().catch(() => { /* prefetch is best-effort */ });
};

function Tab({ to, label, icon: Icon, badge }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== "/admincrm-panel/dashboard" && loc.pathname.startsWith(to));

  return (
    <Link
      to={to}
      onMouseEnter={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
      onTouchStart={() => prefetchRoute(to)}
      className={
        "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition " +
        "border border-border/70 " +
        (active
          ? "bg-accent text-[rgb(var(--on-accent))] shadow-[0_18px_55px_-40px_rgba(0,0,0,0.45)] border-accent/50"
          : "bg-card/55 glass text-foreground hover:bg-card/70")
      }
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="hidden sm:inline">{label}</span>
      {badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-lg">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export default function AdminNav() {
  const { t } = useI18n();
  const [feedbackBadge, setFeedbackBadge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiJson("/api/admin/feedback-counts");
        if (!cancelled) setFeedbackBadge(data?.unreadCount || 0);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <Tab to="/admincrm-panel/dashboard" label={t("admin.nav.dashboard", null, "Dashboard")} icon={LayoutDashboard} />
      <Tab to="/admincrm-panel/users" label={t("admin.nav.users", null, "Users")} icon={Users} />
      <Tab to="/admincrm-panel/bans" label={t("admin.nav.bans", null, "Bans")} icon={Shield} />
      <Tab to="/admincrm-panel/usage" label={t("admin.nav.usage", null, "Usage")} icon={BarChart3} />
      <Tab to="/admincrm-panel/logs" label={t("admin.nav.logs", null, "Logs")} icon={ScrollText} />
      <Tab to="/admincrm-panel/updates" label={t("admin.nav.updates", null, "Updates")} icon={Sparkles} />
      <Tab to="/admincrm-panel/feedback" label={t("admin.nav.feedback", null, "Feedback")} icon={MessageSquare} badge={feedbackBadge} />
      <Tab to="/admincrm-panel/education" label={t("admin.nav.education", null, "Education")} icon={GraduationCap} />
      <Tab to="/admincrm-panel/tournaments" label={t("admin.nav.tournaments", null, "Tournaments")} icon={Trophy} />
      <Tab to="/admincrm-panel/settings" label={t("admin.nav.settings", null, "Settings")} icon={Settings} />
      <Tab to="/admincrm-panel/backups" label={t("admin.nav.backups", null, "Backups")} icon={DatabaseBackup} />
    </div>
  );
}
