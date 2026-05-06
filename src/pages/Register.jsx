import React, { useMemo, useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import Input from "@/components/ui/Input.jsx";
import PasswordInput from "@/components/ui/PasswordInput.jsx";
import Button from "@/components/ui/Button.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";
import { fieldError, mapAuthError } from "@/lib/authErrors.js";

function passwordStrength(pw) {
  let score = 0;
  if (!pw) return 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  const classes =
    Number(/[a-z]/.test(pw)) + Number(/[A-Z]/.test(pw)) + Number(/[0-9]/.test(pw)) + Number(/[^A-Za-z0-9]/.test(pw));
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  return Math.min(score, 4);
}

export default function Register() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [response, setResponse] = useState(null); // { error, errorCode, field }
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  if (user) return <Navigate to="/app/dashboard" replace />;

  const errUsername = fieldError(response, "username", t);
  const errEmail = fieldError(response, "email", t);
  const errPassword = fieldError(response, "password", t);
  const generalErr = response && !response.field ? mapAuthError(response, t) : "";
  const strength = useMemo(() => passwordStrength(password), [password]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setResponse(null);
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
        setResponse(res);
      }
    } catch (e2) {
      setResponse({ errorCode: e2?.code, error: e2?.message, field: e2?.data?.field });
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
          <form onSubmit={onSubmit} className="mt-6 space-y-3" noValidate>
            <div>
              <label htmlFor="rg-user" className="text-xs text-slate-500 mb-1 inline-block">
                {t("auth.name")}
              </label>
              <Input
                id="rg-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={!!errUsername}
                aria-describedby={errUsername ? "rg-user-err" : undefined}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
              {errUsername && (
                <p id="rg-user-err" className="text-xs text-red-600 mt-1">{errUsername}</p>
              )}
            </div>
            <div>
              <label htmlFor="rg-email" className="text-xs text-slate-500 mb-1 inline-block">
                {t("auth.email")}
              </label>
              <Input
                id="rg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errEmail}
                aria-describedby={errEmail ? "rg-email-err" : undefined}
                inputMode="email"
                autoCapitalize="none"
                autoComplete="email"
                spellCheck={false}
                required
              />
              {errEmail && (
                <p id="rg-email-err" className="text-xs text-red-600 mt-1">{errEmail}</p>
              )}
            </div>
            <div>
              <label htmlFor="rg-pw" className="text-xs text-slate-500 mb-1 inline-block">
                {t("auth.password")}
              </label>
              <PasswordInput
                id="rg-pw"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errPassword}
                aria-describedby={errPassword ? "rg-pw-err" : undefined}
                autoComplete="new-password"
                required
                minLength={8}
              />
              {password && (
                <div className="mt-2 flex gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition ${
                        i < strength
                          ? strength <= 1
                            ? "bg-red-400"
                            : strength === 2
                              ? "bg-amber-400"
                              : strength === 3
                                ? "bg-emerald-400"
                                : "bg-emerald-500"
                          : "bg-slate-200 dark:bg-slate-700"
                      }`}
                    />
                  ))}
                </div>
              )}
              {errPassword && (
                <p id="rg-pw-err" className="text-xs text-red-600 mt-1">{errPassword}</p>
              )}
            </div>
            {generalErr && (
              <div role="alert" className="text-sm text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300 px-3 py-2 rounded-xl">
                {generalErr}
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
