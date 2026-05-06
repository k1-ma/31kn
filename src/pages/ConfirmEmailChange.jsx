import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";

export default function ConfirmEmailChange() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErr(t("errors.notFound"));
      return;
    }
    apiJson("/api/auth/confirm-email-change", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => setStatus("ok"))
      .catch((e) => {
        setErr(e?.message || t("errors.generic"));
        setStatus("error");
      });
  }, [token, t]);

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-b from-slate-50 to-indigo-50/40 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-7 text-center">
        {status === "loading" && <p className="text-slate-500">{t("common.loading")}</p>}
        {status === "ok" && (
          <>
            <h1 className="text-2xl font-bold mb-2">{t("common.done")}</h1>
            <Link to="/app/settings" className="inline-block mt-6 text-indigo-600 font-semibold">
              {t("nav.settings")}
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold mb-2">{t("common.error")}</h1>
            <p className="text-red-600">{err}</p>
            <Link to="/app/settings" className="inline-block mt-6 text-indigo-600 font-semibold">
              {t("nav.settings")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
