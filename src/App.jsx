import React from "react";
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
import AdminUsers from "@/pages/admin/AdminUsers.jsx";
import AdminLogs from "@/pages/admin/AdminLogs.jsx";
import AdminDashboard from "@/pages/admin/AdminDashboard.jsx";
import AdminBans from "@/pages/admin/AdminBans.jsx";
import AdminUsage from "@/pages/admin/AdminUsage.jsx";
import AdminSettings from "@/pages/admin/AdminSettings.jsx";
import AdminUpdates from "@/pages/admin/AdminUpdates.jsx";
import AdminFeedback from "@/pages/admin/AdminFeedback.jsx";
import AdminEducation from "@/pages/admin/AdminEducation.jsx";
import AdminTournaments from "@/pages/admin/AdminTournaments.jsx";
import AdminTournamentDetail from "@/pages/admin/AdminTournamentDetail.jsx";
import PublicShare from "@/pages/PublicShare.jsx";
import PublicDocShare from "@/pages/PublicDocShare.jsx";
import PublicIdeaShare from "@/pages/PublicIdeaShare.jsx";
import PublicBacktestShare from "@/pages/PublicBacktestShare.jsx";
import PublicTournament from "@/pages/PublicTournament.jsx";
import PublicTournamentVote from "@/pages/PublicTournamentVote.jsx";
import PublicTournamentLeaderboard from "@/pages/PublicTournamentLeaderboard.jsx";

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
      </BrowserRouter>
      </I18nProvider>
      </AnimationsProvider>
    </AuthProvider>
  );
}
