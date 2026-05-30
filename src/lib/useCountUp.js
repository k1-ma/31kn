import { useEffect, useRef, useState } from "react";

/**
 * Counts up to `end` over `duration` ms once the element scrolls into view.
 * Borrowed from the HauntedX landing trust-stats pattern. Returns
 * { ref, value } — attach ref to the element, render value.
 * Respects prefers-reduced-motion (jumps straight to end).
 */
export function useCountUp(end, { duration = 1400, decimals = 0 } = {}) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setValue(end);
      return undefined;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            const start = performance.now();
            const tick = (now) => {
              const t = Math.min(1, (now - start) / duration);
              // easeOutCubic
              const eased = 1 - Math.pow(1 - t, 3);
              setValue(Number((end * eased).toFixed(decimals)));
              if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, duration, decimals]);

  return { ref, value };
}
