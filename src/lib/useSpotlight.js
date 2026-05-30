import { useCallback } from "react";

/**
 * Returns an onMouseMove handler that writes the cursor position into the
 * element's --mx / --my CSS vars, driving the `.spotlight` radial highlight.
 * Pair with the `spotlight` class. No-op cost when the pointer is idle.
 */
export function useSpotlight() {
  return useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }, []);
}
