import React, { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, ListTree, Plus, PiggyBank, MoreHorizontal, Wallet, Tags, Target, Repeat, BarChart3, Bell, Trash2, Coins } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { motion, AnimatePresence } from "framer-motion";
import { useUnreadCount } from "@/lib/finance/useUnreadCount.js";

const MORE_ROUTES = [
  { to: "/app/wallets", icon: Wallet, key: "wallets" },
  { to: "/app/categories", icon: Tags, key: "categories" },
  { to: "/app/goals", icon: Target, key: "goals" },
  { to: "/app/recurring", icon: Repeat, key: "recurring" },
  { to: "/app/debts", icon: Coins, key: "debts" },
  { to: "/app/analytics", icon: BarChart3, key: "analytics" },
  { to: "/app/notifications", icon: Bell, key: "notifications" },
  { to: "/app/trash", icon: Trash2, key: "trash" },
];

export default function BottomNav({ onAdd }) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const menuRef = useRef(null);
  const unread = useUnreadCount();

  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [moreOpen]);

  const moreActive = MORE_ROUTES.some((r) => location.pathname.startsWith(r.to));

  const linkBase =
    "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors";
  const active = "text-indigo-600 dark:text-indigo-400";
  const inactive = "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
      ref={menuRef}
    >
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-2 mb-2 w-48 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden"
          >
            {MORE_ROUTES.map(({ to, icon: Icon, key }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 text-sm transition ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-medium"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`
                }
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="flex-1">{t(`nav.${key}`)}</span>
                {key === "notifications" && unread > 0 && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

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
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`${linkBase} ${moreActive ? active : inactive} relative`}
        >
          <MoreHorizontal className="w-5 h-5" aria-hidden />
          <span>{t("nav.more")}</span>
          {unread > 0 && !moreOpen && (
            <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-indigo-500" />
          )}
        </button>
      </div>
    </nav>
  );
}
