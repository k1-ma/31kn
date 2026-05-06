import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  ListTree,
  Plus,
  PiggyBank,
  MoreHorizontal,
  Wallet,
  Tags,
  Target,
  Repeat,
  Coins,
  BarChart3,
  Bell,
  Settings as SettingsIcon,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import { useUnreadCount } from "@/lib/finance/useUnreadCount.js";

export default function BottomNav({ onAdd }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const unread = useUnreadCount();
  const [moreOpen, setMoreOpen] = useState(false);

  const linkBase =
    "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-[11px] font-medium";
  const active = "text-emerald-600 dark:text-emerald-400";
  const inactive = "text-slate-500 dark:text-slate-400";

  const more = [
    { to: "/app/wallets", label: t("nav.wallets"), icon: Wallet },
    { to: "/app/categories", label: t("nav.categories"), icon: Tags },
    { to: "/app/goals", label: t("nav.goals"), icon: Target },
    { to: "/app/recurring", label: t("nav.recurring"), icon: Repeat },
    { to: "/app/debts", label: t("nav.debts"), icon: Coins },
    { to: "/app/analytics", label: t("nav.analytics"), icon: BarChart3 },
    { to: "/app/notifications", label: t("nav.notifications"), icon: Bell, badge: unread },
    { to: "/app/settings", label: t("nav.settings"), icon: SettingsIcon },
    { to: "/app/trash", label: t("nav.trash"), icon: Trash2 },
  ];

  return (
    <>
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
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`${linkBase} ${inactive} relative`}
          >
            <MoreHorizontal className="w-5 h-5" aria-hidden />
            <span>{t("nav.more")}</span>
            {unread > 0 && (
              <span className="absolute top-1 right-[28%] inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </div>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav.more")}>
        <div className="grid grid-cols-3 gap-3 pb-2">
          {more.map(({ to, label, icon: Icon, badge }) => (
            <button
              key={to}
              type="button"
              onClick={() => {
                setMoreOpen(false);
                nav(to);
              }}
              className="relative flex flex-col items-center gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition"
            >
              <div className="h-11 w-11 rounded-2xl bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 text-center leading-tight">
                {label}
              </span>
              {badge > 0 && (
                <span className="absolute top-2 right-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
