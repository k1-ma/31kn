import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { mapAuthError } from "@/lib/authErrors.js";

export default function VerifyEmail() {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErr(t("errors.notFound"));
      return;
    }
    apiJson("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then(async () => {
        setStatus("ok");
        // The server set a session cookie on success. Reload the auth
        // context, then forward to /app once it has a user.
        try {
          const result = await refresh();
          if (result?.user) {
            // Strip ?token from history before redirecting.
            window.history.replaceState({}, "", window.location.pathname);
            nav("/app/dashboard", { replace: true });
          }
        } catch {
          // No session created → user can still click "Sign in".
        }
      })
      .catch((e) => {
        setErr(mapAuthError({ errorCode: e?.code, error: e?.message, ...(e?.data || {}) }, t));
        setStatus("error");
      });
  }, [token, t, refresh, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-b from-slate-50 to-emerald-50/40 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-7 text-center">
        {status === "loading" && <p className="text-slate-500">{t("common.loading")}</p>}
        {status === "ok" && (
          <>
            <h1 className="text-2xl font-bold mb-2">{t("common.done")}</h1>
            <p className="text-slate-500 dark:text-slate-400">{t("auth.welcome")}</p>
            <Link to="/app/dashboard" className="inline-block mt-6 text-emerald-600 font-semibold">
              {t("nav.dashboard")}
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold mb-2">{t("common.error")}</h1>
            <p className="text-red-600">{err}</p>
            <Link to="/login" className="inline-block mt-6 text-emerald-600 font-semibold">
              {t("auth.login")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
