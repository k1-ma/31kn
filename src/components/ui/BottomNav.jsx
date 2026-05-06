import React from "react";
import { NavLink } from "react-router-dom";
import { Home, ListTree, Plus, PiggyBank, Settings as SettingsIcon } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function BottomNav({ onAdd }) {
  const { t } = useI18n();
  const linkBase =
    "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors";
  const active = "text-indigo-600 dark:text-indigo-400";
  const inactive = "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200";
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      <div className="relative flex items-stretch">
        <NavLink
          to="/app/dashboard"
          end
          className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
        >
          <Home className="w-5 h-5" aria-hidden />
          <span>{t("nav.dashboard")}</span>
        </NavLink>
        <NavLink
          to="/app/transactions"
          className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
        >
          <ListTree className="w-5 h-5" aria-hidden />
          <span>{t("nav.transactions")}</span>
        </NavLink>
        <button
          type="button"
          onClick={onAdd}
          aria-label={t("dashboard.quickAdd")}
          className="flex-1 flex justify-center items-end pb-1.5"
        >
          <span
            className="inline-flex items-center justify-center w-14 h-14 -mt-7 rounded-full bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white transition-all ring-4 ring-white dark:ring-slate-950 shadow-brand"
          >
            <Plus className="w-7 h-7" />
          </span>
        </button>
        <NavLink
          to="/app/budgets"
          className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
        >
          <PiggyBank className="w-5 h-5" aria-hidden />
          <span>{t("nav.budgets")}</span>
        </NavLink>
        <NavLink
          to="/app/settings"
          className={({ isActive }) => `${linkBase} ${isActive ? active : inactive}`}
        >
          <SettingsIcon className="w-5 h-5" aria-hidden />
          <span>{t("nav.settings")}</span>
        </NavLink>
      </div>
    </nav>
  );
}
