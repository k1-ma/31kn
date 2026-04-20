import React, { useState, useMemo, useEffect, useRef } from "react";
import { AlertTriangle, RefreshCw, ExternalLink, WifiOff, Shield, CloudOff } from "lucide-react";
import Button from "@/components/ui/Button.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

/**
 * Get the canonical domain for this app.
 * Returns the apex domain without www prefix.
 */
function getCanonicalHost() {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  // Remove www. prefix if present
  if (host.startsWith("www.")) {
    return host.slice(4);
  }
  return host;
}

/**
 * Check if current host is the www subdomain (non-canonical)
 */
function isWwwSubdomain() {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  return host.startsWith("www.");
}

/**
 * Get current hostname
 */
function getCurrentHost() {
  return typeof window !== "undefined" ? window.location.hostname : "";
}

/**
 * Build URL to canonical domain
 */
function getCanonicalUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.hostname = getCanonicalHost();
  return url.toString();
}

/**
 * Check if there's pending data in the outbox
 */
function getOutboxInfo(userId) {
  if (!userId) return { hasOutbox: false, timestamp: null };
  try {
    const raw = localStorage.getItem(`tradecrm:outbox:${userId}`);
    if (!raw) return { hasOutbox: false, timestamp: null };
    const data = JSON.parse(raw);
    return { hasOutbox: true, timestamp: data?.timestamp };
  } catch {
    return { hasOutbox: false, timestamp: null };
  }
}

/**
 * OfflineBanner - Shows when sync/auth is unavailable or domain mismatch detected
 * 
 * @param {string} syncStatus - Current sync status from useSyncedDb
 * @param {function} onRetry - Callback to retry sync
 * @param {object} lastError - Last error object from sync
 * @param {boolean} isReadOnly - Whether app is in read-only mode (using cached userId)
 * @param {boolean} hasUnsavedChanges - Whether there are unsaved changes
 * @param {string} userId - Current user ID for outbox lookup
 * @param {boolean} showDelayedSyncWarning - Whether to show the delayed sync warning (save taking longer than threshold)
 * @param {function} onResetSyncWarning - Callback to reset the sync warning timer when retrying
 */
export default function OfflineBanner({ 
  syncStatus, 
  onRetry, 
  lastError,
  isReadOnly = false,
  hasUnsavedChanges = false,
  userId = null,
  showDelayedSyncWarning = false,
  onResetSyncWarning,
}) {
  const { t } = useI18n();
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Delay showing red error banner by 10 seconds
  const ERROR_DELAY_MS = 10000;
  const [showDelayedError, setShowDelayedError] = useState(false);
  const errorTimerRef = useRef(null);

  const isErrorStatus = syncStatus === "error" || syncStatus === "offline" || syncStatus === "unauthorized";

  useEffect(() => {
    if (isErrorStatus) {
      // Start timer - only show error banner after delay
      if (!errorTimerRef.current) {
        errorTimerRef.current = setTimeout(() => {
          setShowDelayedError(true);
          errorTimerRef.current = null;
        }, ERROR_DELAY_MS);
      }
    } else {
      // Status resolved - clear timer and hide banner
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      setShowDelayedError(false);
    }
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [isErrorStatus]);

  // Reset dismissed state when status changes significantly
  useEffect(() => {
    if (syncStatus === "synced") {
      setDismissed(false);
    }
  }, [syncStatus]);

  const handleRetry = async () => {
    if (retrying || !onRetry) return;
    setRetrying(true);
    try {
      // Reset the sync warning timer when retrying
      if (onResetSyncWarning) {
        onResetSyncWarning();
      }
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  // Determine if we should show the banner (only after 10s delay)
  const showOfflineBanner = isErrorStatus && showDelayedError;
  // Domain warning disabled - redirect doesn't work and causes confusion
  const showDomainWarning = false;
  const showReadOnlyBanner = isReadOnly;
  // CHANGED: Only show pending banner after the delayed sync warning threshold has passed
  // This prevents flickering on quick saves - the warning only appears if save takes > thresholdMs
  const showPendingBanner = showDelayedSyncWarning && !showOfflineBanner && !showReadOnlyBanner;

  // Compute display values - memoize to avoid recalculating on every render
  const currentHost = useMemo(() => getCurrentHost(), []);
  const canonicalHost = useMemo(() => getCanonicalHost(), []);
  const isWww = useMemo(() => isWwwSubdomain(), []);
  const outboxInfo = useMemo(() => getOutboxInfo(userId), [userId]);

  // Detect network/timeout errors for specific messaging
  const isNetworkOrTimeout = syncStatus === "offline" || ["NETWORK_ERROR", "TIMEOUT"].includes(lastError?.code);

  // Log diagnostic info to console when banner is shown
  useEffect(() => {
    if (showOfflineBanner || showDomainWarning || showReadOnlyBanner || showPendingBanner) {
      console.log('[TradeJ] OfflineBanner diagnostics:', {
        syncStatus,
        isReadOnly,
        hasUnsavedChanges,
        showDelayedSyncWarning,
        hasOutbox: outboxInfo.hasOutbox,
        outboxTimestamp: outboxInfo.timestamp,
        lastErrorCode: lastError?.code,
        lastErrorStatus: lastError?.status,
        currentHost,
        isWwwSubdomain: isWww,
        online: navigator.onLine,
      });
    }
  }, [showOfflineBanner, showDomainWarning, showReadOnlyBanner, showPendingBanner, 
      syncStatus, lastError, isReadOnly, hasUnsavedChanges, showDelayedSyncWarning, outboxInfo, currentHost, isWww]);

  // Helper to replace placeholders in translation strings
  const interpolate = (str, vars) => {
    if (!str) return str;
    return str.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
  };

  // Don't render if nothing to show
  if (!showOfflineBanner && !showDomainWarning && !showReadOnlyBanner && !showPendingBanner) {
    return null;
  }

  return (
    <div className="space-y-3 mb-4">
      {/* Domain Mismatch Warning */}
      {showDomainWarning && (
        <div className="relative overflow-hidden rounded-xl border border-amber-400/30 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 backdrop-blur-sm p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {t("offlineBanner.domainMismatch")}
              </h3>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300/80">
                {interpolate(t("offlineBanner.domainMismatchDesc"), { currentHost, canonicalHost })}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <a
                  href={getCanonicalUrl()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 transition-colors"
                >
                  {interpolate(t("offlineBanner.useCanonical"), { canonicalHost })}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  onClick={() => setDismissed(true)}
                  className="text-xs text-amber-500 dark:text-amber-400/60 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                >
                  {t("offlineBanner.dismiss") || "Dismiss"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offline/Auth Error Banner */}
      {showOfflineBanner && (
        <div className="relative overflow-hidden rounded-xl border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 backdrop-blur-sm p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
              {syncStatus === "unauthorized" ? (
                <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-600 dark:text-red-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">
                {isNetworkOrTimeout
                  ? (t("offlineBanner.networkTitle") || "Offline / unstable connection")
                  : t("offlineBanner.title")}
              </h3>
              <p className="mt-1 text-xs text-red-700 dark:text-red-300/80">
                {isNetworkOrTimeout
                  ? (t("offlineBanner.networkDesc") || "Cannot reach the server. Check your internet or VPN connection.")
                  : t("offlineBanner.description")}
              </p>
              <p className="mt-2 text-xs font-medium text-red-800 dark:text-red-200">
                ⚠️ {t("offlineBanner.warning")}
              </p>
              
              {/* Host info for support */}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-red-600 dark:text-red-300/70">
                <span>{t("offlineBanner.currentHost")}: <code className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-500/20 font-mono">{currentHost}</code></span>
                {lastError?.code && (
                  <span>Error: <code className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-500/20 font-mono">{lastError.code}</code></span>
                )}
                {outboxInfo.hasOutbox && (
                  <span>{t("offlineBanner.pendingChanges") || "Pending changes"}: <code className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-500/20 font-mono">✓</code></span>
                )}
              </div>
              
              {/* Retry button */}
              {onRetry && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    disabled={retrying}
                    className="border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-800 dark:hover:text-red-200"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? "animate-spin" : ""}`} />
                    {t("offlineBanner.retry")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Read-Only Mode Banner */}
      {showReadOnlyBanner && !showOfflineBanner && (
        <div className="relative overflow-hidden rounded-xl border border-blue-300 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 backdrop-blur-sm p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                {t("offlineBanner.readOnlyMode")}
              </h3>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300/80">
                {t("offlineBanner.readOnlyDesc")}
              </p>
              
              {/* Retry button */}
              {onRetry && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    disabled={retrying}
                    className="border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? "animate-spin" : ""}`} />
                    {t("offlineBanner.retry")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delayed Sync Warning Banner - shown when save takes longer than threshold */}
      {showPendingBanner && (
        <div className="relative overflow-hidden rounded-xl border border-yellow-300 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10 backdrop-blur-sm p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center">
              <CloudOff className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                {t("offlineBanner.syncTakingLong") || "Saving is taking longer than usual…"}
              </h3>
              <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300/80">
                {t("offlineBanner.syncTakingLongDesc") || "Your changes are saved locally. Sync will complete when connection is stable."}
              </p>
              
              {/* Retry button */}
              {onRetry && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    disabled={retrying}
                    className="border-yellow-300 dark:border-yellow-500/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 hover:text-yellow-800 dark:hover:text-yellow-200"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? "animate-spin" : ""}`} />
                    {t("offlineBanner.restartSync") || "Restart sync"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
