import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { FinanceProvider, useFinance } from "@/lib/finance/store.jsx";
import { ToastProvider, useToast } from "@/components/common/ToastProvider.jsx";
import BottomNav from "@/components/ui/BottomNav.jsx";
import SideNav from "@/components/ui/SideNav.jsx";
import TransactionSheet from "@/pages/app/TransactionSheet.jsx";
import PinLock from "@/components/common/PinLock.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { computeBudgetAlerts } from "@/lib/finance/budgetAlerts.js";
import { formatMoney } from "@/lib/money.js";

const Dashboard = lazy(() => import("@/pages/app/Dashboard.jsx"));
const Transactions = lazy(() => import("@/pages/app/Transactions.jsx"));
const Wallets = lazy(() => import("@/pages/app/Wallets.jsx"));
const WalletDetail = lazy(() => import("@/pages/app/WalletDetail.jsx"));
const Categories = lazy(() => import("@/pages/app/Categories.jsx"));
const Budgets = lazy(() => import("@/pages/app/Budgets.jsx"));
const Goals = lazy(() => import("@/pages/app/Goals.jsx"));
const Recurring = lazy(() => import("@/pages/app/Recurring.jsx"));
const Analytics = lazy(() => import("@/pages/app/Analytics.jsx"));
const Settings = lazy(() => import("@/pages/app/Settings.jsx"));
const Trash = lazy(() => import("@/pages/app/Trash.jsx"));
const UiPlayground = lazy(() => import("@/pages/app/UiPlayground.jsx"));
const IS_DEV = import.meta.env?.DEV;

function PageFallback() {
  const { t } = useI18n();
  return <div className="p-8 text-center text-slate-500">{t("common.loading")}</div>;
}

/**
 * Watches budgets + transactions, fires a toast the first time a budget
 * crosses 80% / 100% within its current period. Per-session memory only
 * (so reopening the app gives one fresh reminder, not a stream).
 */
function BudgetAlertWatcher() {
  const { state, loaded } = useFinance();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const seenRef = useRef(new Set());

  useEffect(() => {
    if (!loaded) return;
    const { alerts, seen } = computeBudgetAlerts(
      state.budgets,
      state.transactions,
      seenRef.current
    );
    seenRef.current = seen;
    for (const a of alerts) {
      const titleKey = a.level === "exceeded" ? "budgets.alert100" : "budgets.alert80";
      push({
        kind: a.level === "exceeded" ? "error" : "warning",
        title: t(titleKey, { name: a.budget.name }),
        body: formatMoney(a.spent, a.budget.currency, lang),
        duration: 6000,
      });
    }
  }, [state.budgets, state.transactions, loaded, push, t, lang]);

  return null;
}

function AppShell() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <>
      <BudgetAlertWatcher />
      <PinLock>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 md:flex">
          <SideNav />
          <main className="flex-1 has-bottom-nav">
            <div className="max-w-3xl md:max-w-5xl mx-auto px-4 md:px-8 py-5 md:py-8">
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard onAdd={() => setAddOpen(true)} />} />
                  <Route path="transactions" element={<Transactions onAdd={() => setAddOpen(true)} />} />
                  <Route
                    path="transactions/new"
                    element={<Transactions onAdd={() => setAddOpen(true)} autoOpen />}
                  />
                  <Route path="wallets" element={<Wallets />} />
                  <Route path="wallets/:id" element={<WalletDetail />} />
                  <Route path="categories" element={<Categories />} />
                  <Route path="budgets" element={<Budgets />} />
                  <Route path="goals" element={<Goals />} />
                  <Route path="recurring" element={<Recurring />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="trash" element={<Trash />} />
                  {IS_DEV && <Route path="_ui" element={<UiPlayground />} />}
                  <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Routes>
              </Suspense>
            </div>
          </main>
          <BottomNav onAdd={() => setAddOpen(true)} />
          <TransactionSheet open={addOpen} onClose={() => setAddOpen(false)} />
        </div>
      </PinLock>
    </>
  );
}

export default function KoshykApp() {
  return (
    <ToastProvider>
      <FinanceProvider>
        <AppShell />
      </FinanceProvider>
    </ToastProvider>
  );
}
