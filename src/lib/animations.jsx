import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "haunted_disable_animations";

/**
 * Check if user's system prefers reduced motion
 */
function getSystemPrefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

/**
 * Get the stored preference from localStorage
 * Returns null if no preference stored (will use system default)
 */
function getStoredPreference() {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "true") return true;
    if (val === "false") return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Save preference to localStorage
 */
function savePreference(disabled) {
  try {
    localStorage.setItem(STORAGE_KEY, String(disabled));
  } catch {}
}

const AnimationsContext = createContext({
  animationsEnabled: true,
  disableAnimations: false,
  setDisableAnimations: () => {},
  systemPrefersReducedMotion: false,
});

/**
 * Provider for animation settings.
 * Manages the disable animations preference with localStorage persistence
 * and system preference support.
 */
export function AnimationsProvider({ children }) {
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState(getSystemPrefersReducedMotion);
  const [storedPreference, setStoredPreference] = useState(() => getStoredPreference());

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    
    const handler = (e) => setSystemPrefersReducedMotion(e.matches);
    
    // Use addEventListener if available, otherwise fall back to deprecated addListener
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else if (mq.addListener) {
      // Fallback for older browsers
      mq.addListener(handler);
      return () => mq.removeListener(handler);
    }
  }, []);

  // Determine if animations should be disabled:
  // - If user has set a preference, use that
  // - Otherwise, use system preference
  const disableAnimations = useMemo(() => {
    if (storedPreference !== null) return storedPreference;
    return systemPrefersReducedMotion;
  }, [storedPreference, systemPrefersReducedMotion]);

  const animationsEnabled = !disableAnimations;

  // Apply/remove data-reduce-motion attribute on html element
  useEffect(() => {
    const html = document.documentElement;
    if (disableAnimations) {
      html.setAttribute("data-reduce-motion", "true");
    } else {
      html.removeAttribute("data-reduce-motion");
    }
  }, [disableAnimations]);

  const setDisableAnimations = (disabled) => {
    setStoredPreference(disabled);
    savePreference(disabled);
  };

  const value = useMemo(() => ({
    animationsEnabled,
    disableAnimations,
    setDisableAnimations,
    systemPrefersReducedMotion,
  }), [animationsEnabled, disableAnimations, systemPrefersReducedMotion]);

  return (
    <AnimationsContext.Provider value={value}>
      {children}
    </AnimationsContext.Provider>
  );
}

/**
 * Hook to get animation settings.
 * Returns:
 * - animationsEnabled: boolean - true if animations should play
 * - disableAnimations: boolean - true if animations are disabled
 * - setDisableAnimations: (disabled: boolean) => void - set the preference
 * - systemPrefersReducedMotion: boolean - true if system prefers reduced motion
 */
export function useAnimations() {
  return useContext(AnimationsContext);
}

/**
 * Convenience hook that returns just animationsEnabled boolean.
 * Use this when you only need to check if animations are enabled.
 */
export function useAnimationsEnabled() {
  const { animationsEnabled } = useContext(AnimationsContext);
  return animationsEnabled;
}

/**
 * Helper for framer-motion: returns motion props that disable animations
 * when animations are disabled.
 * 
 * Note: This hook is provided for simple cases where you want to spread
 * props to disable all motion. For more complex animations with custom
 * initial/animate/exit states, use useAnimationsEnabled() directly and
 * conditionally set your motion props (see Modal.jsx, ToastViewport.jsx
 * for examples).
 * 
 * @example
 * const motionProps = useMotionProps();
 * <motion.div {...motionProps} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
 *   Content
 * </motion.div>
 */
export function useMotionProps() {
  const animationsEnabled = useAnimationsEnabled();
  
  if (animationsEnabled) {
    return {};
  }
  
  return {
    initial: false,
    animate: false,
    exit: false,
    transition: { duration: 0 },
  };
}
