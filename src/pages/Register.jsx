import React, { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";

export default function Register() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  if (user) return <Navigate to="/app/dashboard" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await apiJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      if (res?.emailVerificationRequired) {
        setPendingEmail(email.trim());
      } else if (res?.user) {
        await refresh();
        nav("/app/dashboard");
      } else {
        setErr(res?.error || t("errors.generic"));
      }
    } catch (e2) {
      setErr(e2?.message || t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  if (pendingEmail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5 bg-gradient-to-b from-slate-50 to-emerald-50/40 dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-7 text-center">
          <h1 className="text-2xl font-bold mb-2">{t("auth.verifyTitle")}</h1>
          <p className="text-slate-500 dark:text-slate-400">{t("auth.verifySub")}</p>
          <p className="mt-4 text-emerald-600 font-medium">{pendingEmail}</p>
          <Link to="/login" className="block mt-6 text-emerald-600">
            {t("auth.login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-emerald-50/40 dark:from-slate-950 dark:to-slate-900 flex flex-col px-5 py-8">
      <div className="flex justify-between items-center max-w-md w-full mx-auto">
        <Link to="/" className="text-xl font-bold text-emerald-600">Koshyk</Link>
        <LanguageSwitcher />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-[0_8px_32px_rgba(15,23,42,0.06)] p-7">
          <h1 className="text-2xl font-bold tracking-tight">{t("auth.createTitle")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("auth.createSub")}</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("auth.name")}</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("auth.email")}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            {err && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 px-3 py-2 rounded-xl">
                {err}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full mt-2" disabled={busy}>
              {busy ? t("common.loading") : t("auth.register")}
            </Button>
          </form>
          <p className="mt-5 text-sm text-center text-slate-600 dark:text-slate-300">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="text-emerald-600">
              {t("auth.login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
