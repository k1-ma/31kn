import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

const DISMISS_KEY = "tradej_pwa_install_dismissed";
const NEVER_SHOW_KEY = "tradej_pwa_install_never_show";

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

export default function InstallPrompt() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return;

    if (localStorage.getItem(NEVER_SHOW_KEY)) return;

    const dismissed = sessionStorage.getItem(DISMISS_KEY);
    if (dismissed) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // iOS doesn't fire beforeinstallprompt, show a tip instead
    if (isIos() && !navigator.standalone) {
      setShowIosTip(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setShowIosTip(false);
    setDeferredPrompt(null);
    sessionStorage.setItem(DISMISS_KEY, "1");
  }, []);

  const handleNeverShow = useCallback(() => {
    setShowBanner(false);
    setShowIosTip(false);
    setDeferredPrompt(null);
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
          className="fixed bottom-6 left-4 right-4 z-[9999] mx-auto max-w-sm sm:left-auto sm:right-6"
        >
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#0f1129]/95 to-[#0a0a1a]/95 p-5 shadow-2xl backdrop-blur-xl">
            {/* Decorative glow */}
            <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-purple-500/15 blur-2xl" />

            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 rounded-lg p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative flex items-start gap-4">
              {/* App icon */}
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-1 ring-white/10">
                <img
                  src="/pwa-icon-192x192.png"
                  alt="Haunted Dev"
                  className="h-10 w-10 rounded-xl"
                />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">
                  {t("pwa.installTitle")}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  {showIosTip
                    ? t("pwa.iosTip")
                    : t("pwa.installDesc")}
                </p>

                {/* Buttons — only for Android/Chrome; iOS shows only the tip */}
                {showBanner && !showIosTip && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={handleInstall}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 active:scale-95"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("pwa.install")}
                    </button>
                    <button
                      onClick={handleDismiss}
                      className="rounded-xl px-4 py-2 text-xs font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-300"
                    >
                      {t("pwa.later")}
                    </button>
                  </div>
                )}

                {/* iOS share tip */}
                {showIosTip && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-gray-400">
                    <Share className="h-4 w-4 flex-shrink-0 text-blue-400" />
                    <span>{t("pwa.iosShareTip")}</span>
                  </div>
                )}

                {/* Never show again */}
                <button
                  onClick={handleNeverShow}
                  className="mt-2 text-[11px] text-gray-500 transition-colors hover:text-gray-300"
                >
                  {t("pwa.neverShow")}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
