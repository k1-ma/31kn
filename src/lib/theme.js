import { useEffect } from "react";

const STORAGE_KEY = "koshyk:theme";

/**
 * Read the saved theme preference, defaulting to "system".
 * @returns {"light"|"dark"|"system"}
 */
export function getStoredTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {}
  return "system";
}

/**
 * Apply a theme to <html>, persist it, and resolve "system" against the
 * current matchMedia state.
 *
 * @param {"light"|"dark"|"system"} theme
 */
export function applyTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", !!dark);
}

/**
 * Mount-once hook that subscribes to `prefers-color-scheme` changes.
 * Whenever the theme preference is "system" (or unset), the hook
 * re-applies the resolved theme so the UI follows the OS in real time.
 */
export function useThemeListener() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const reapply = () => {
      const stored = getStoredTheme();
      if (stored === "system") applyTheme("system");
    };
    // First run to make sure the boot script's resolution is up-to-date.
    reapply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", reapply);
      return () => mq.removeEventListener("change", reapply);
    }
    // Safari < 14 fallback
    mq.addListener?.(reapply);
    return () => mq.removeListener?.(reapply);
  }, []);
}
