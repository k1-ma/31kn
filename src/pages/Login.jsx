import React, { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";

export default function Login() {
  const { t } = useI18n();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app/dashboard" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await login({ username: username.trim(), password, remember: true });
      if (res?.ok) nav("/app/dashboard");
      else setErr(res?.error || t("errors.generic"));
    } catch (e2) {
      setErr(e2?.message || t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-emerald-50/40 dark:from-slate-950 dark:to-slate-900 flex flex-col px-5 py-8">
      <div className="flex justify-between items-center max-w-md w-full mx-auto">
        <Link to="/" className="text-xl font-bold text-emerald-600">Koshyk</Link>
        <LanguageSwitcher />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-7">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t("auth.welcome")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("auth.welcomeSub")}</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("auth.email")}</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("auth.password")}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {err && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 px-3 py-2 rounded-xl">
                {err}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full mt-2" disabled={busy}>
              {busy ? t("common.loading") : t("auth.login")}
            </Button>
          </form>
          <div className="flex items-center justify-between mt-5 text-sm">
            <Link to="/forgot-password" className="text-emerald-600 hover:text-emerald-700">
              {t("auth.forgot")}
            </Link>
            <Link to="/register" className="text-slate-600 dark:text-slate-300">
              {t("auth.noAccount")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
