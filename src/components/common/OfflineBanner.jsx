import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, RefreshCw, ExternalLink, WifiOff, Shield, CloudUpload } from "lucide-react";
import Button from "@/components/ui/Button.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useSyncWarning } from "@/lib/syncWarning.js";

/**
 * Format milliseconds as a short "Xs" / "Xm Ys" string.
 */
function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

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
 * @param {{ current: number, total: number, percent: number } | null} syncProgress - Chunk progress, when available
 *
 * Note: The sync-progress indicator (`useSyncWarning`) is owned here so its
 * 500 ms tick doesn't re-render the entire app while saving. Only this banner
 * needs the elapsed counter.
 */
export default function OfflineBanner({
  syncStatus,
  onRetry,
  lastError,
  isReadOnly = false,
  hasUnsavedChanges = false,
  userId = null,
  syncProgress = null,
}) {
  const { t } = useI18n();
  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const {
    shouldShowWarning: showDelayedSyncWarning,
    elapsedMs: syncElapsedMs,
    resetWarning: resetSyncWarning,
  } = useSyncWarning({ syncStatus, onStall: onRetry });

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
      resetSyncWarning();
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
  // Show the pending/progress banner when EITHER (a) the delayed-sync grace
  // threshold has passed, OR (b) we already have chunked-sync progress data
  // to display.  The progress branch is critical: between iterations of a
  // coalesced multi-mutation sync, useSyncWarning may briefly toggle off
  // when syncStatus passes through a non-"saving" value, which would make
  // the indicator vanish for a tick.  Honoring `syncProgress != null` keeps
  // it visible whenever there's actually progress to show.
  const showPendingBanner =
    (showDelayedSyncWarning || syncProgress != null) &&
    !showOfflineBanner &&
    !showReadOnlyBanner;

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

  // Sync-in-progress indicator is portaled so it floats above content without
  // pushing the trade list / page layout down when it appears/disappears.
  const syncIndicator = showPendingBanner && typeof document !== "undefined"
    ? createPortal(
        (() => {
          const hasProgress = !!syncProgress && syncProgress.total > 0;
          const percent = hasProgress
            ? Math.max(0, Math.min(100, Number(syncProgress.percent) || 0))
            : null;
          const elapsedLabel = formatDuration(syncElapsedMs);

          let remainingLabel = null;
          if (hasProgress && percent > 5 && percent < 100 && syncElapsedMs > 1000) {
            const totalEstimate = syncElapsedMs * (100 / percent);
            const remaining = Math.max(0, totalEstimate - syncElapsedMs);
            remainingLabel = formatDuration(remaining);
          }

          const titleText =
            t("offlineBanner.syncInProgress") || "Syncing your data";
          const descText =
            t("offlineBanner.syncInProgressDesc") ||
            "Synchronization is in progress, please wait…";

          const progressLabel = hasProgress
            ? interpolate(
                t("offlineBanner.syncProgressChunks") ||
                  "{current} of {total} ({percent}%)",
                { current: syncProgress.current, total: syncProgress.total, percent }
              )
            : null;

          return (
            <div className="fixed z-40 bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 sm:max-w-sm pointer-events-none">
              <div className="relative overflow-hidden rounded-xl border border-sky-300 dark:border-sky-500/30 bg-sky-50/95 dark:bg-sky-500/10 backdrop-blur-md shadow-lg p-4 pointer-events-auto">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-500/20 flex items-center justify-center">
                    <CloudUpload className="h-5 w-5 text-sky-600 dark:text-sky-400 animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-sky-800 dark:text-sky-200">
                        {titleText}
                      </h3>
                      <span className="text-[11px] font-mono tabular-nums text-sky-700/80 dark:text-sky-300/70 whitespace-nowrap">
                        {hasProgress
                          ? `${percent}%`
                          : interpolate(
                              t("offlineBanner.syncElapsed") || "Elapsed: {time}",
                              { time: elapsedLabel }
                            )}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-sky-700 dark:text-sky-300/80">
                      {descText}
                    </p>

                    <div className="mt-3 h-1.5 w-full rounded-full overflow-hidden bg-sky-100 dark:bg-sky-500/15">
                      {hasProgress ? (
                        <div
                          className="h-full rounded-full bg-sky-500 dark:bg-sky-400 transition-[width] duration-500 ease-out"
                          style={{ width: `${percent}%` }}
                        />
                      ) : (
                        <div className="h-full w-1/3 rounded-full bg-sky-500 dark:bg-sky-400 sync-indeterminate" />
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-sky-700/80 dark:text-sky-300/70 font-mono tabular-nums">
                      {progressLabel && (
                        <span>{progressLabel}</span>
                      )}
                      {hasProgress && (
                        <span>
                          {interpolate(
                            t("offlineBanner.syncElapsed") || "Elapsed: {time}",
                            { time: elapsedLabel }
                          )}
                        </span>
                      )}
                      {remainingLabel && (
                        <span>
                          {interpolate(
                            t("offlineBanner.syncRemaining") || "≈ {time} left",
                            { time: remainingLabel }
                          )}
                        </span>
                      )}
                    </div>

                    {onRetry && syncElapsedMs > 30000 && (
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRetry}
                          disabled={retrying}
                          className="border-sky-300 dark:border-sky-500/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 hover:text-sky-800 dark:hover:text-sky-200"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${retrying ? "animate-spin" : ""}`} />
                          {t("offlineBanner.restartSync") || "Restart sync"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )
    : null;

  // Inline banners take real layout space — they're for persistent states the
  // user must acknowledge (offline, auth error, read-only). The transient
  // sync-in-progress indicator is portaled above instead.
  const hasInlineBanner = showOfflineBanner || showDomainWarning || showReadOnlyBanner;

  if (!hasInlineBanner) {
    return syncIndicator;
  }

  return (
    <>
      {syncIndicator}
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

      </div>
    </>
  );
}
