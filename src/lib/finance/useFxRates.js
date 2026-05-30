import { useEffect, useState } from "react";
import { getRates } from "@/lib/fx.js";

/**
 * Returns { rates, stale, ageMs } where rates is a `${from}_${to}` map.
 * `rates` is null while the first fetch is in flight.
 * `stale` is true when using expired cached rates (offline/API down).
 */
export function useFxRates(base) {
  const [data, setData] = useState({ rates: null, stale: false, ageMs: 0 });
  useEffect(() => {
    let alive = true;
    if (!base) return undefined;
    getRates(base).then((result) => {
      if (alive) setData({ rates: result.rates || {}, stale: result.stale, ageMs: result.ageMs || 0 });
    });
    return () => {
      alive = false;
    };
  }, [base]);
  return data;
}
