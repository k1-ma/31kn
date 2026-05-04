import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Default threshold in milliseconds before showing sync indicator.
 * Short — we want to inform the user as soon as a sync is in progress
 * (not pretend it's "longer than usual"), but skip flicker on instant saves.
 */
export const DEFAULT_SYNC_WARNING_THRESHOLD_MS = 1500;

/**
 * If sync has been in "saving" state for longer than this, the active sync
 * attempt is considered stuck and `onStall` is invoked so the caller can
 * restart it.
 */
export const DEFAULT_SYNC_STALL_TIMEOUT_MS = 30000;

/**
 * If the tick interval hasn't fired for this long while saving, the timer
 * itself is treated as frozen and we trigger a restart.
 */
export const DEFAULT_SYNC_STALL_DETECT_MS = 5000;

const WATCHDOG_INTERVAL_MS = 1000;

/**
 * Hold the indicator visible briefly after `saving` ends so a follow-up save
 * within this window doesn't blink the indicator off→on. A 409 conflict
 * resolves via merge+retry which can drive a saving→synced→saving cycle in
 * under a second; without this grace the portal indicator flickers and
 * heavy re-renders make the page appear to jump.
 */
const HIDE_GRACE_MS = 800;

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
 * - If the elapsed counter stops progressing (interval frozen) or the sync
 *   stays in "saving" beyond `stallTimeoutMs`, call `onStall` so the caller
 *   can restart the sync.
 *
 * @param {Object} options
 * @param {string} options.syncStatus - Current sync status from useSyncedDb
 * @param {number} [options.thresholdMs=1500] - Grace period before showing
 * @param {number} [options.stallTimeoutMs=30000] - Max sync duration before restart
 * @param {number} [options.stallDetectMs=5000] - Max gap between ticks before restart
 * @param {() => void} [options.onStall] - Called when stall is detected
 * @returns {{ shouldShowWarning: boolean, elapsedMs: number, resetWarning: () => void }}
 */
export function useSyncWarning(options = {}) {
  const {
    syncStatus,
    thresholdMs = DEFAULT_SYNC_WARNING_THRESHOLD_MS,
    stallTimeoutMs = DEFAULT_SYNC_STALL_TIMEOUT_MS,
    stallDetectMs = DEFAULT_SYNC_STALL_DETECT_MS,
    onStall,
  } = options;

  const warningTimerRef = useRef(null);
  const tickTimerRef = useRef(null);
  const watchdogTimerRef = useRef(null);
  const stallCooldownRef = useRef(null);
  const hideTimerRef = useRef(null);
  const startedAtRef = useRef(null);
  const lastTickAtRef = useRef(null);
  const stallTriggeredRef = useRef(false);
  const isSavingRef = useRef(false);
  const mountedRef = useRef(true);
  const onStallRef = useRef(onStall);

  useEffect(() => {
    onStallRef.current = onStall;
  }, [onStall]);

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
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    if (stallCooldownRef.current) {
      clearTimeout(stallCooldownRef.current);
      stallCooldownRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const triggerStall = useCallback(() => {
    if (stallTriggeredRef.current) return;
    stallTriggeredRef.current = true;
    // Reset the visible counter so the user sees a fresh restart attempt;
    // the actual sync state machine is restarted via the caller-provided cb.
    startedAtRef.current = Date.now();
    lastTickAtRef.current = Date.now();
    if (mountedRef.current) setElapsedMs(0);

    const cb = onStallRef.current;
    if (typeof cb === "function") {
      try {
        const maybePromise = cb();
        if (maybePromise && typeof maybePromise.catch === "function") {
          maybePromise.catch((e) => {
            console.error("[useSyncWarning] onStall callback rejected:", e);
          });
        }
      } catch (e) {
        console.error("[useSyncWarning] onStall callback failed:", e);
      }
    }

    // Cooldown: allow another stall to fire if sync remains stuck after
    // the restart attempt, so we keep retrying instead of giving up silently.
    if (stallCooldownRef.current) clearTimeout(stallCooldownRef.current);
    stallCooldownRef.current = setTimeout(() => {
      stallTriggeredRef.current = false;
      stallCooldownRef.current = null;
    }, Math.max(stallDetectMs, Math.floor(stallTimeoutMs / 2)));
  }, [stallDetectMs, stallTimeoutMs]);

  const startTicking = useCallback(() => {
    if (!tickTimerRef.current) {
      lastTickAtRef.current = Date.now();
      tickTimerRef.current = setInterval(() => {
        if (!mountedRef.current || !startedAtRef.current) return;
        lastTickAtRef.current = Date.now();
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 500);
    }

    if (!watchdogTimerRef.current) {
      watchdogTimerRef.current = setInterval(() => {
        if (!mountedRef.current || !isSavingRef.current || !startedAtRef.current) return;
        const now = Date.now();
        const totalElapsed = now - startedAtRef.current;
        const sinceLastTick = lastTickAtRef.current ? now - lastTickAtRef.current : 0;
        // Tick interval frozen — the elapsed counter is no longer progressing.
        if (sinceLastTick > stallDetectMs) {
          triggerStall();
          return;
        }
        // Sync exceeded the hard ceiling — restart.
        if (totalElapsed > stallTimeoutMs) {
          triggerStall();
        }
      }, WATCHDOG_INTERVAL_MS);
    }
  }, [stallDetectMs, stallTimeoutMs, triggerStall]);

  const isActivelySaving = (status) => status === "saving";
  const isSaveComplete = (status) =>
    ["synced", "error", "offline", "unauthorized"].includes(status);

  useEffect(() => {
    const wasSaving = isSavingRef.current;
    const nowSaving = isActivelySaving(syncStatus);

    if (!wasSaving && nowSaving) {
      isSavingRef.current = true;

      // If we're still inside the post-save grace (indicator visible from a
      // previous save), keep it visible — don't restart the threshold wait.
      // Prevents saving→synced→saving flicker on 409-merge-retry cycles.
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
        startedAtRef.current = Date.now();
        lastTickAtRef.current = Date.now();
        stallTriggeredRef.current = false;
        if (mountedRef.current) setElapsedMs(0);
        startTicking();
        return;
      }

      startedAtRef.current = Date.now();
      lastTickAtRef.current = Date.now();
      stallTriggeredRef.current = false;
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
      lastTickAtRef.current = null;
      stallTriggeredRef.current = false;

      // Stop the threshold/tick/watchdog timers. The indicator-hide is
      // deferred via hideTimerRef so a follow-up save within HIDE_GRACE_MS
      // can keep the indicator continuously visible instead of flickering.
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      if (stallCooldownRef.current) {
        clearTimeout(stallCooldownRef.current);
        stallCooldownRef.current = null;
      }

      if (!mountedRef.current) return;

      if (shouldShowWarning) {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          if (!mountedRef.current || isSavingRef.current) return;
          setShouldShowWarning(false);
          setElapsedMs(0);
        }, HIDE_GRACE_MS);
      } else {
        setElapsedMs(0);
      }
    }
  }, [syncStatus, thresholdMs, clearTimers, startTicking, shouldShowWarning]);

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
      lastTickAtRef.current = Date.now();
      stallTriggeredRef.current = false;
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
