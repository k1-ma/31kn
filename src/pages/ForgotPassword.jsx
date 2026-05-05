import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await apiJson("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setSent(true);
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
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-7">
          <h1 className="text-2xl font-bold tracking-tight">{t("auth.forgotTitle")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("auth.forgotSub")}</p>
          {sent ? (
            <div className="mt-6 text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300 px-4 py-3 rounded-xl text-sm">
              {t("toasts.exporting")}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-3">
              <Input
                type="email"
                placeholder={t("auth.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {err && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{err}</div>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? t("common.loading") : t("common.confirm")}
              </Button>
            </form>
          )}
          <Link to="/login" className="block mt-5 text-center text-sm text-slate-600 dark:text-slate-300">
            {t("common.back")} → {t("auth.login")}
          </Link>
        </div>
      </div>
    </div>
  );
}
