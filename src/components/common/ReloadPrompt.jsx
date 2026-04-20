import { useRegisterSW } from "virtual:pwa-register/react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/I18nProvider.jsx";

const HIDDEN_ROUTES = ["/", "/login", "/register"];

export default function ReloadPrompt() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const updateIntervalRef = useRef(null);
  const {
    offlineReady: [offlineReady, setOfflineReady],
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (r) {
        // Check for updates every 30 minutes
        updateIntervalRef.current = setInterval(() => { r.update(); }, 30 * 60 * 1000);
      }
    },
    onRegisterError() {},
  });

  // Show a non-intrusive banner when a new service worker takes control,
  // instead of force-reloading.  The old code called window.location.reload()
  // immediately which caused data loss when the user had unsaved documents or
  // trades open.  Now the user decides when to apply the update.
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  const redisplayTimer = useRef(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const onControllerChange = () => {
        setNeedsUpdate(true);
        setBannerVisible(true);
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        if (updateIntervalRef.current) clearInterval(updateIntervalRef.current);
        if (redisplayTimer.current) clearTimeout(redisplayTimer.current);
      };
    }
  }, []);

  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    if (offlineReady) {
      setShowOffline(true);
      const timer = setTimeout(() => {
        setShowOffline(false);
        setOfflineReady(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [offlineReady, setOfflineReady]);

  if (HIDDEN_ROUTES.includes(pathname)) return null;

  // Update-available banner (persistent until user acts)
  if (needsUpdate && bannerVisible) {
    return (
      <div role="alert" className="fixed bottom-6 right-6 z-[9999] max-w-sm animate-in fade-in slide-in-from-bottom-4">
        <div className="rounded-xl border border-white/10 dark:border-white/10 bg-white/80 dark:bg-black/60 p-4 shadow-2xl backdrop-blur-xl space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("pwa.updateAvailable")}
          </p>
          <div className="flex gap-2">
            <button
              className="h-8 px-3 rounded-lg bg-accent text-accent-foreground text-xs font-semibold"
              onClick={() => window.location.reload()}
            >
              {t("pwa.update")}
            </button>
            <button
              className="h-8 px-3 rounded-lg bg-muted/50 text-muted-foreground text-xs font-semibold"
              onClick={() => {
                setBannerVisible(false);
                // Re-show the banner after 10 minutes so the user doesn't forget
                if (redisplayTimer.current) clearTimeout(redisplayTimer.current);
                redisplayTimer.current = setTimeout(() => setBannerVisible(true), 10 * 60 * 1000);
              }}
            >
              {t("pwa.close")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!showOffline) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] max-w-sm animate-in fade-in slide-in-from-bottom-4">
      <div className="rounded-xl border border-white/10 dark:border-white/10 bg-white/80 dark:bg-black/60 p-4 shadow-2xl backdrop-blur-xl">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t("pwa.offlineReady")}
        </p>
      </div>
    </div>
  );
}
