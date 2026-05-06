import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";

const HIDDEN_ROUTES = ["/", "/login", "/register"];

export default function ReloadPrompt() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const updateRef = useRef(null);
  const {
    offlineReady: [offlineReady, setOfflineReady],
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) updateRef.current = setInterval(() => r.update(), 30 * 60 * 1000);
    },
    onRegisterError() {},
  });

  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onChange = () => setNeedsUpdate(true);
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      if (updateRef.current) clearInterval(updateRef.current);
    };
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    setShowOffline(true);
    const t = setTimeout(() => {
      setShowOffline(false);
      setOfflineReady(false);
    }, 2500);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (HIDDEN_ROUTES.includes(pathname)) return null;

  if (needsUpdate) {
    return (
      <div className="fixed bottom-24 md:bottom-6 right-4 left-4 md:left-auto z-[9999] max-w-sm">
        <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl space-y-2">
          <p className="text-sm text-slate-700 dark:text-slate-200">{t("common.retry")}?</p>
          <div className="flex gap-2">
            <button
              className="h-9 px-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold"
              onClick={() => window.location.reload()}
            >
              {t("common.confirm")}
            </button>
            <button
              className="h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              onClick={() => setNeedsUpdate(false)}
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!showOffline) return null;
  return (
    <div className="fixed bottom-24 md:bottom-6 right-4 z-[9999]">
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 dark:bg-indigo-950 px-4 py-2 text-sm text-indigo-800 dark:text-indigo-200">
        {t("common.done")}
      </div>
    </div>
  );
}
