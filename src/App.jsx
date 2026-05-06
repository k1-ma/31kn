import React, { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider.jsx";
import I18nProvider, { useI18n } from "@/i18n/I18nProvider.jsx";
import { useLocalStorageState } from "@/lib/storage.js";
import { useThemeListener } from "@/lib/theme.js";
import { ErrorBoundary } from "@/components/ErrorBoundary.jsx";
import { AdminErrorBoundary } from "@/components/AdminErrorBoundary.jsx";
import ScrollToTop from "@/components/common/ScrollToTop.jsx";
import ReloadPrompt from "@/components/common/ReloadPrompt.jsx";
import InstallPrompt from "@/components/common/InstallPrompt.jsx";
import Landing from "@/pages/Landing.jsx";
import Login from "@/pages/Login.jsx";
import Register from "@/pages/Register.jsx";
import VerifyEmail from "@/pages/VerifyEmail.jsx";
import ForgotPassword from "@/pages/ForgotPassword.jsx";
import ResetPassword from "@/pages/ResetPassword.jsx";
import ConfirmEmailChange from "@/pages/ConfirmEmailChange.jsx";
import AdminLogin from "@/pages/AdminLogin.jsx";

const KoshykApp = lazy(() => import("@/KoshykApp.jsx"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers.jsx"));
const AdminLogs = lazy(() => import("@/pages/admin/AdminLogs.jsx"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard.jsx"));
const AdminBans = lazy(() => import("@/pages/admin/AdminBans.jsx"));
const AdminUsage = lazy(() => import("@/pages/admin/AdminUsage.jsx"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings.jsx"));

function FullscreenLoading() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="text-sm text-slate-500">{t("common.loading")}</div>
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullscreenLoading />;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <FullscreenLoading />;
  if (!user) return <Navigate to="/admincrm-panel" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return (
    <AdminErrorBoundary>
      <Outlet />
    </AdminErrorBoundary>
  );
}

function detectBrowserLang() {
  const nav = navigator.language || navigator.userLanguage || "";
  const code = nav.split("-")[0].toLowerCase();
  return code === "en" ? "en" : "uk";
}

export default function App() {
  const [lang, setLang] = useLocalStorageState("koshyk_lang", detectBrowserLang);
  useThemeListener();
  useEffect(() => {
    document.documentElement.lang = lang || "uk";
  }, [lang]);
  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.__clearBootScreen === "function") {
      window.__clearBootScreen();
    }
  }, []);
  return (
    <AuthProvider>
      <I18nProvider lang={lang} setLang={setLang}>
        <BrowserRouter>
          <ScrollToTop />
          <ReloadPrompt />
          <InstallPrompt />
          <ErrorBoundary>
            <Suspense fallback={<FullscreenLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />

                <Route path="/admincrm-panel" element={<AdminLogin />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/admincrm-panel/dashboard" element={<AdminDashboard />} />
                  <Route path="/admincrm-panel/users" element={<AdminUsers />} />
                  <Route path="/admincrm-panel/bans" element={<AdminBans />} />
                  <Route path="/admincrm-panel/usage" element={<AdminUsage />} />
                  <Route path="/admincrm-panel/logs" element={<AdminLogs />} />
                  <Route path="/admincrm-panel/settings" element={<AdminSettings />} />
                </Route>

                <Route element={<RequireAuth />}>
                  <Route
                    path="/app/*"
                    element={
                      <ErrorBoundary>
                        <KoshykApp />
                      </ErrorBoundary>
                    }
                  />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </I18nProvider>
    </AuthProvider>
  );
}
