import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/auth/AuthProvider.jsx";
import I18nProvider, { useI18n } from "@/i18n/I18nProvider.jsx";
import { AnimationsProvider } from "@/lib/animations.jsx";
import { useLocalStorageState } from "@/lib/storage.js";
import JournalApp from "@/JournalApp.jsx";
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
// Admin pages — lazy-loaded so the ~200KB admin bundle doesn't ship to
// regular users on initial load.
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers.jsx"));
const AdminLogs = lazy(() => import("@/pages/admin/AdminLogs.jsx"));
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard.jsx"));
const AdminBans = lazy(() => import("@/pages/admin/AdminBans.jsx"));
const AdminUsage = lazy(() => import("@/pages/admin/AdminUsage.jsx"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings.jsx"));
const AdminUpdates = lazy(() => import("@/pages/admin/AdminUpdates.jsx"));
const AdminFeedback = lazy(() => import("@/pages/admin/AdminFeedback.jsx"));
const AdminEducation = lazy(() => import("@/pages/admin/AdminEducation.jsx"));
const AdminTournaments = lazy(() => import("@/pages/admin/AdminTournaments.jsx"));
const AdminTournamentDetail = lazy(() => import("@/pages/admin/AdminTournamentDetail.jsx"));
// Public share pages — also lazy. Authenticated users almost never see these,
// and unauthenticated viewers only need one of them per visit.
const PublicShare = lazy(() => import("@/pages/PublicShare.jsx"));
const PublicDocShare = lazy(() => import("@/pages/PublicDocShare.jsx"));
const PublicIdeaShare = lazy(() => import("@/pages/PublicIdeaShare.jsx"));
const PublicBacktestShare = lazy(() => import("@/pages/PublicBacktestShare.jsx"));
const PublicTournament = lazy(() => import("@/pages/PublicTournament.jsx"));
const PublicTournamentVote = lazy(() => import("@/pages/PublicTournamentVote.jsx"));
const PublicTournamentLeaderboard = lazy(() => import("@/pages/PublicTournamentLeaderboard.jsx"));

function FullscreenLoading() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
      <div className="relative text-sm text-muted-foreground">{t("common.loading")}</div>
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
  if (code === "en") return "en";
  if (code === "uk") return "uk";
  return "ru";
}

export default function App() {
  // For new users (no localStorage), detect language from browser; I18nProvider converts legacy "default" to "ru"
  const [publicLang, setPublicLang] = useLocalStorageState("tradej_lang", detectBrowserLang);
  return (
    <AuthProvider>
      <AnimationsProvider>
      <I18nProvider lang={publicLang} setLang={setPublicLang}>
      <BrowserRouter>
        <ScrollToTop />
        <ReloadPrompt />
        <InstallPrompt />
        {/* Top-level boundary catches chunk-load failures from any lazy route
            (admin, public share, tournament). Without this, a failed chunk
            request leaves the user with a blank page. */}
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
              <Route path="/admincrm-panel/updates" element={<AdminUpdates />} />
              <Route path="/admincrm-panel/feedback" element={<AdminFeedback />} />
              <Route path="/admincrm-panel/education" element={<AdminEducation />} />
              <Route path="/admincrm-panel/tournaments" element={<AdminTournaments />} />
              <Route path="/admincrm-panel/tournaments/:id" element={<AdminTournamentDetail />} />
              <Route path="/admincrm-panel/settings" element={<AdminSettings />} />
            </Route>

            {/* Public share route - accessible without authentication */}
            <Route path="/share/:shareId" element={<PublicShare />} />
            <Route path="/share-doc/:shareId" element={<PublicDocShare />} />
            <Route path="/share-idea/:shareId" element={<PublicIdeaShare />} />
            <Route path="/share-backtest/:shareId" element={<PublicBacktestShare />} />
            <Route path="/tournament/:slug" element={<PublicTournament />} />
            <Route path="/tournament/:slug/leaderboard" element={<PublicTournamentLeaderboard />} />
            <Route path="/tournament/:slug/vote" element={<PublicTournamentVote />} />
            <Route path="/tournament/:slug/vote/:dayToken" element={<PublicTournamentVote />} />

            <Route element={<RequireAuth />}>
              <Route
                path="/app/*"
                element={
                  <ErrorBoundary>
                    <JournalApp />
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
      </AnimationsProvider>
    </AuthProvider>
  );
}
