import React from "react";
import { NavLink } from "react-router-dom";
import {
  Home,
  ListTree,
  Wallet,
  PiggyBank,
  Target,
  Repeat,
  BarChart3,
  Settings as SettingsIcon,
  Trash2,
  Tags,
  Bell,
  Coins,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useUnreadCount } from "@/lib/finance/useUnreadCount.js";

export default function SideNav() {
  const { t } = useI18n();
  const unread = useUnreadCount();

  // Grouped like the Haunted CRM sidebar: daily workspace vs. system.
  const groups = [
    {
      label: t("nav.dashboard") === "Dashboard" ? "Workspace" : "Робота",
      items: [
        { to: "/app/dashboard", label: t("nav.dashboard"), icon: Home, end: true },
        { to: "/app/transactions", label: t("nav.transactions"), icon: ListTree },
        { to: "/app/wallets", label: t("nav.wallets"), icon: Wallet },
        { to: "/app/categories", label: t("nav.categories"), icon: Tags },
        { to: "/app/budgets", label: t("nav.budgets"), icon: PiggyBank },
        { to: "/app/goals", label: t("nav.goals"), icon: Target },
        { to: "/app/debts", label: t("nav.debts"), icon: Coins },
      ],
    },
    {
      label: t("nav.dashboard") === "Dashboard" ? "Insights" : "Аналітика",
      items: [
        { to: "/app/recurring", label: t("nav.recurring"), icon: Repeat },
        { to: "/app/analytics", label: t("nav.analytics"), icon: BarChart3 },
        { to: "/app/notifications", label: t("nav.notifications"), icon: Bell, badge: unread },
      ],
    },
    {
      label: t("nav.dashboard") === "Dashboard" ? "System" : "Система",
      items: [
        { to: "/app/settings", label: t("nav.settings"), icon: SettingsIcon },
        { to: "/app/trash", label: t("nav.trash"), icon: Trash2 },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 border-r border-slate-200/70 dark:border-slate-800/70 glass sticky top-0 self-start h-screen overflow-y-auto no-scrollbar">
      <div className="px-6 pt-6 pb-5 flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-gradient text-white font-display font-bold shadow-brand">К</span>
        <span className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Koshyk</span>
      </div>
      <nav className="px-3 flex-1 flex flex-col gap-5 pb-6" aria-label="Primary">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <span className="px-3 mb-1 text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              {group.label}
            </span>
            {group.items.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                      : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                    )}
                    <Icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
                    <span className="flex-1">{label}</span>
                    {badge > 0 && (
                      <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
