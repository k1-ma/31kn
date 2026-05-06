import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

const DISMISS_KEY = "koshyk_pwa_install_dismissed";
const NEVER_SHOW_KEY = "koshyk_pwa_install_never_show";

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

export default function InstallPrompt() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (localStorage.getItem(NEVER_SHOW_KEY)) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if (isIos() && !navigator.standalone) setShowIosTip(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setDeferred(null);
  }, [deferred]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setShowIosTip(false);
    setDeferred(null);
    sessionStorage.setItem(DISMISS_KEY, "1");
  }, []);

  const handleNever = useCallback(() => {
    setShowBanner(false);
    setShowIosTip(false);
    setDeferred(null);
    localStorage.setItem(NEVER_SHOW_KEY, "1");
  }, []);

  const show = showBanner || showIosTip;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-24 md:bottom-6 left-4 right-4 z-[9999] mx-auto max-w-sm"
        >
          <div className="relative overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950">
                <img src="/pwa-icon-192x192.png" alt="Koshyk" className="h-9 w-9 rounded-xl" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("landing.pwaTitle")}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {showIosTip ? t("landing.pwaBody") : t("landing.pwaBody")}
                </p>
                {showBanner && !showIosTip && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleInstall}
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("common.add")}
                    </button>
                    <button
                      onClick={handleDismiss}
                      className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                )}
                {showIosTip && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                    <Share className="h-4 w-4 shrink-0 text-indigo-600" />
                    <span>{t("landing.pwaBody")}</span>
                  </div>
                )}
                <button
                  onClick={handleNever}
                  className="mt-2 text-[11px] text-slate-400 hover:text-slate-600"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
