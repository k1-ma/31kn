import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Default threshold in milliseconds before showing sync indicator.
 * Short — we want to inform the user as soon as a sync is in progress
 * (not pretend it's "longer than usual"), but skip flicker on instant saves.
 */
export const DEFAULT_SYNC_WARNING_THRESHOLD_MS = 1500;

/**
 * Hook that exposes a friendly "sync in progress" indicator.
 *
 * Behaviour:
 * - When sync enters the "saving" state, start a small grace timer (thresholdMs)
 *   to avoid flicker on near-instant saves.
 * - After the grace period, expose `shouldShowWarning = true` and start
 *   ticking `elapsedMs` once per second so the UI can show how long the
 *   sync has been running.
 * - When sync reaches a terminal state ("synced", "error", "offline",
 *   "unauthorized"), reset everything.
 *
 * @param {Object} options
 * @param {string} options.syncStatus - Current sync status from useSyncedDb
 * @param {number} [options.thresholdMs=1500] - Grace period before showing
 * @returns {{ shouldShowWarning: boolean, elapsedMs: number, resetWarning: () => void }}
 */
export function useSyncWarning(options = {}) {
  const {
    syncStatus,
    thresholdMs = DEFAULT_SYNC_WARNING_THRESHOLD_MS,
  } = options;

  const warningTimerRef = useRef(null);
  const tickTimerRef = useRef(null);
  const startedAtRef = useRef(null);
  const isSavingRef = useRef(false);
  const mountedRef = useRef(true);

  const [shouldShowWarning, setShouldShowWarning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const startTicking = useCallback(() => {
    if (tickTimerRef.current) return;
    tickTimerRef.current = setInterval(() => {
      if (!mountedRef.current || !startedAtRef.current) return;
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 500);
  }, []);

  const isActivelySaving = (status) => status === "saving";
  const isSaveComplete = (status) =>
    ["synced", "error", "offline", "unauthorized"].includes(status);

  useEffect(() => {
    const wasSaving = isSavingRef.current;
    const nowSaving = isActivelySaving(syncStatus);

    if (!wasSaving && nowSaving) {
      isSavingRef.current = true;
      startedAtRef.current = Date.now();
      clearTimers();

      warningTimerRef.current = setTimeout(() => {
        if (!mountedRef.current || !isSavingRef.current) return;
        setShouldShowWarning(true);
        if (startedAtRef.current) {
          setElapsedMs(Date.now() - startedAtRef.current);
        }
        startTicking();
      }, thresholdMs);
    }

    if (wasSaving && isSaveComplete(syncStatus)) {
      isSavingRef.current = false;
      startedAtRef.current = null;
      clearTimers();
      if (mountedRef.current) {
        setShouldShowWarning(false);
        setElapsedMs(0);
      }
    }
  }, [syncStatus, thresholdMs, clearTimers, startTicking]);

  /**
   * Reset the indicator (e.g. user clicked "retry").
   * If a save is still in progress, restart the grace timer so the
   * indicator briefly disappears and then reappears.
   */
  const resetWarning = useCallback(() => {
    clearTimers();
    if (mountedRef.current) {
      setShouldShowWarning(false);
      setElapsedMs(0);
    }
    if (isSavingRef.current) {
      startedAtRef.current = Date.now();
      warningTimerRef.current = setTimeout(() => {
        if (!mountedRef.current || !isSavingRef.current) return;
        setShouldShowWarning(true);
        if (startedAtRef.current) {
          setElapsedMs(Date.now() - startedAtRef.current);
        }
        startTicking();
      }, thresholdMs);
    }
  }, [thresholdMs, clearTimers, startTicking]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  return {
    shouldShowWarning,
    elapsedMs,
    resetWarning,
  };
}
