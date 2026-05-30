import React, { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import Input from "@/components/ui/Input.jsx";
import PasswordInput from "@/components/ui/PasswordInput.jsx";
import Button from "@/components/ui/Button.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";

export default function Register() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  if (user) return <Navigate to="/app/dashboard" replace />;

  const pwMismatch = password2 && password !== password2;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== password2) return setErr(t("auth.passwordMismatch"));
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
      <div
        className="min-h-screen flex flex-col items-center justify-center p-5"
        style={{
          background:
            "radial-gradient(ellipse at top, var(--brand-soft), transparent 60%), var(--bg)",
        }}
      >
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 text-center shadow-[0_14px_36px_rgba(20,20,40,0.08)]">
          <h1 className="font-display text-2xl font-bold mb-2 text-slate-900 dark:text-slate-100">{t("auth.verifyTitle")}</h1>
          <p className="text-slate-500 dark:text-slate-400">{t("auth.verifySub")}</p>
          <p className="mt-4 text-indigo-600 font-medium">{pendingEmail}</p>
          <Link to="/login" className="block mt-6 text-indigo-600 font-medium">
            {t("auth.login")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col px-5 py-8 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at top, var(--brand-soft), transparent 60%), var(--bg)",
      }}
    >
      <div className="flex justify-between items-center max-w-md w-full mx-auto relative">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500 text-white font-display font-bold">К</span>
          <span className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Koshyk</span>
        </Link>
        <LanguageSwitcher />
      </div>
      <div className="flex-1 flex items-center justify-center relative">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-[0_14px_36px_rgba(20,20,40,0.08),0_4px_12px_rgba(20,20,40,0.04)] p-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{t("auth.createTitle")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{t("auth.createSub")}</p>
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
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 inline-block">{t("auth.confirmPassword")}</label>
              <PasswordInput
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                invalid={pwMismatch}
              />
              {pwMismatch && (
                <p className="text-xs text-red-500 mt-1">{t("auth.passwordMismatch")}</p>
              )}
            </div>
            {err && (
              <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 px-3 py-2 rounded-xl">
                {err}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full mt-2" disabled={busy || pwMismatch}>
              {busy ? t("common.loading") : t("auth.register")}
            </Button>
          </form>
          <p className="mt-5 text-sm text-center text-slate-600 dark:text-slate-300">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="text-indigo-600">
              {t("auth.login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
