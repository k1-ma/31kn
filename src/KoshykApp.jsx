import React, { lazy, Suspense, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { FinanceProvider } from "@/lib/finance/store.jsx";
import BottomNav from "@/components/ui/BottomNav.jsx";
import SideNav from "@/components/ui/SideNav.jsx";
import TransactionSheet from "@/pages/app/TransactionSheet.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

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

function PageFallback() {
  const { t } = useI18n();
  return <div className="p-8 text-center text-slate-500">{t("common.loading")}</div>;
}

export default function KoshykApp() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <FinanceProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 md:flex">
        <SideNav />
        <main className="flex-1 has-bottom-nav">
          <div className="max-w-3xl md:max-w-5xl mx-auto px-4 md:px-8 py-5 md:py-8">
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard onAdd={() => setAddOpen(true)} />} />
                <Route path="transactions" element={<Transactions onAdd={() => setAddOpen(true)} />} />
                <Route path="transactions/new" element={<Transactions onAdd={() => setAddOpen(true)} autoOpen />} />
                <Route path="wallets" element={<Wallets />} />
                <Route path="wallets/:id" element={<WalletDetail />} />
                <Route path="categories" element={<Categories />} />
                <Route path="budgets" element={<Budgets />} />
                <Route path="goals" element={<Goals />} />
                <Route path="recurring" element={<Recurring />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="settings" element={<Settings />} />
                <Route path="trash" element={<Trash />} />
                <Route path="*" element={<Navigate to="dashboard" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
        <BottomNav onAdd={() => setAddOpen(true)} />
        <TransactionSheet open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    </FinanceProvider>
  );
}
