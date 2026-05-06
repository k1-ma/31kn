import { useEffect, useState } from "react";
import { getRates } from "@/lib/fx.js";

/**
 * Returns a `${from}_${to}` rate map keyed against `base`. Returns null
 * while the first fetch is in flight (callers can fall back to a
 * single-currency view) and {} when the API is unreachable.
 */
export function useFxRates(base) {
  const [rates, setRates] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!base) return undefined;
    getRates(base).then((r) => {
      if (alive) setRates(r || {});
    });
    return () => {
      alive = false;
    };
  }, [base]);
  return rates;
}
