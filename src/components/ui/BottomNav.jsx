import React from "react";
import { NavLink } from "react-router-dom";
import { Home, ListTree, Plus, PiggyBank, Settings as SettingsIcon } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function BottomNav({ onAdd }) {
  const { t } = useI18n();
  const linkBase = "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-[11px] font-medium";
  const active = "text-emerald-600 dark:text-emerald-400";
  const inactive = "text-slate-500 dark:text-slate-400";
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)] md:hidden"
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
          <span className="inline-flex items-center justify-center w-14 h-14 -mt-6 rounded-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-lg shadow-emerald-500/30 transition">
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
