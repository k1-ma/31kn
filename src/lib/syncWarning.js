import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Default threshold in milliseconds before showing sync warning
 */
export const DEFAULT_SYNC_WARNING_THRESHOLD_MS = 10000;

/**
 * Hook for managing delayed sync warning display based on sync status.
 * 
 * The warning is shown ONLY if a save operation takes longer than thresholdMs.
 * Tracks sync status changes to determine when saves start/end:
 * - "saving" status indicates a save is in progress
 * - "synced", "error", "offline", "unauthorized" indicate save completed
 * - "pending" means changes exist but no active save (local only)
 * 
 * Handles concurrent/parallel saves properly:
 * - Timer starts when entering "saving" state
 * - Warning is shown only after thresholdMs if still saving
 * - Warning is hidden when save completes (any terminal state)
 * - No flickering during rapid saves
 * 
 * @param {Object} options
 * @param {string} options.syncStatus - Current sync status from useSyncedDb
 * @param {number} [options.thresholdMs=5000] - Time in ms before showing warning
 * @returns {Object} { shouldShowWarning, resetWarning }
 */
export function useSyncWarning(options = {}) {
  const { 
    syncStatus, 
    thresholdMs = DEFAULT_SYNC_WARNING_THRESHOLD_MS 
  } = options;
  
  // Timer for delayed warning
  const warningTimerRef = useRef(null);
  // Whether the warning should be shown
  const [shouldShowWarning, setShouldShowWarning] = useState(false);
  // Track if we are currently in a "saving" state
  const isSavingRef = useRef(false);
  // Mounted flag for cleanup safety
  const mountedRef = useRef(true);

  /**
   * Clear the warning timer
   */
  const clearWarningTimer = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  /**
   * Determine if the current status indicates active saving
   */
  const isActivelySaving = (status) => {
    return status === "saving";
  };

  /**
   * Determine if the current status indicates save completed (success or failure)
   */
  const isSaveComplete = (status) => {
    return ["synced", "error", "offline", "unauthorized"].includes(status);
  };

  // Track sync status changes
  useEffect(() => {
    const wasSaving = isSavingRef.current;
    const nowSaving = isActivelySaving(syncStatus);

    // Transition: not saving -> saving (start of save)
    if (!wasSaving && nowSaving) {
      isSavingRef.current = true;
      clearWarningTimer();
      
      // Start timer - show warning only if save takes longer than threshold
      warningTimerRef.current = setTimeout(() => {
        if (mountedRef.current && isSavingRef.current) {
          setShouldShowWarning(true);
        }
      }, thresholdMs);
    }
    
    // Transition: saving -> any terminal state (end of save)
    // Terminal states: synced, error, offline, unauthorized
    if (wasSaving && isSaveComplete(syncStatus)) {
      isSavingRef.current = false;
      clearWarningTimer();
      
      if (mountedRef.current) {
        setShouldShowWarning(false);
      }
    }
  }, [syncStatus, thresholdMs, clearWarningTimer]);

  /**
   * Manually reset the warning state (e.g., after user clicks "retry sync").
   * Clears the warning but keeps tracking state.
   * Warning will reappear after thresholdMs if still saving.
   */
  const resetWarning = useCallback(() => {
    clearWarningTimer();
    if (mountedRef.current) {
      setShouldShowWarning(false);
    }
    // If still saving, restart the timer
    if (isSavingRef.current) {
      warningTimerRef.current = setTimeout(() => {
        if (mountedRef.current && isSavingRef.current) {
          setShouldShowWarning(true);
        }
      }, thresholdMs);
    }
  }, [thresholdMs, clearWarningTimer]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearWarningTimer();
    };
  }, [clearWarningTimer]);

  return {
    shouldShowWarning,
    resetWarning,
  };
}
