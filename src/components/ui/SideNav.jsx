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
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function SideNav() {
  const { t } = useI18n();
  const items = [
    { to: "/app/dashboard", label: t("nav.dashboard"), icon: Home, end: true },
    { to: "/app/transactions", label: t("nav.transactions"), icon: ListTree },
    { to: "/app/wallets", label: t("nav.wallets"), icon: Wallet },
    { to: "/app/categories", label: t("nav.categories"), icon: Tags },
    { to: "/app/budgets", label: t("nav.budgets"), icon: PiggyBank },
    { to: "/app/goals", label: t("nav.goals"), icon: Target },
    { to: "/app/recurring", label: t("nav.recurring"), icon: Repeat },
    { to: "/app/analytics", label: t("nav.analytics"), icon: BarChart3 },
    { to: "/app/settings", label: t("nav.settings"), icon: SettingsIcon },
    { to: "/app/trash", label: t("nav.trash"), icon: Trash2 },
  ];
  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 self-start min-h-screen">
      <div className="px-6 pt-6 pb-4">
        <span className="text-xl font-bold tracking-tight text-emerald-600">Koshyk</span>
      </div>
      <nav className="px-3 flex-1 flex flex-col gap-0.5" aria-label="Primary">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
