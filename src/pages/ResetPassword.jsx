import React, { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import Input from "@/components/ui/Input.jsx";
import PasswordInput from "@/components/ui/PasswordInput.jsx";
import Button from "@/components/ui/Button.jsx";

export default function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const mismatch = pw2 && pw !== pw2;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setErr(t("auth.passwordMismatch"));
    setBusy(true);
    setErr("");
    try {
      await apiJson("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password: pw }),
      });
      nav("/login");
    } catch (e2) {
      setErr(e2?.message || t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-b from-slate-50 to-indigo-50/40 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-7">
        <h1 className="text-2xl font-bold tracking-tight">{t("auth.resetTitle")}</h1>
        {!token ? (
          <div className="mt-6 text-sm text-red-600 bg-red-50 dark:bg-red-950 px-4 py-3 rounded-xl">
            {t("auth.invalidToken")}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <PasswordInput
              placeholder={t("auth.password")}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              minLength={8}
            />
            <PasswordInput
              placeholder={t("auth.confirmPassword")}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
              minLength={8}
              invalid={mismatch}
            />
            {mismatch && (
              <div className="text-xs text-red-500">{t("auth.passwordMismatch")}</div>
            )}
            {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 px-3 py-2 rounded-xl">{err}</div>}
            <Button type="submit" size="lg" className="w-full" disabled={busy || mismatch}>
              {busy ? t("common.loading") : t("common.save")}
            </Button>
          </form>
        )}
        <Link to="/login" className="block mt-5 text-center text-sm text-slate-600">
          {t("auth.login")}
        </Link>
      </div>
    </div>
  );
}
