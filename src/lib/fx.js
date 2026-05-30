/**
 * Exchange rates — fetched from exchangerate.host (free, no key required)
 * and cached in localStorage for 12 hours. Returns a flat
 * { "USD_UAH": 41.2, "EUR_UAH": 44.5, … } map keyed by `${from}_${to}`.
 */

const CACHE_KEY = "koshyk:fx";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.fetchedAt || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, fetchedAt: Date.now() }));
  } catch {}
}

/**
 * Build the `${from}_${to}` rate map from a `{ base, rates }` object.
 * Generates pairs both `base→quote` and `quote→base` for every quote.
 */
function buildRateMap(base, rates) {
  const map = {};
  for (const [quote, rate] of Object.entries(rates || {})) {
    if (!Number.isFinite(rate) || rate === 0) continue;
    map[`${base}_${quote}`] = rate;
    map[`${quote}_${base}`] = 1 / rate;
  }
  return map;
}

/**
 * Fetch fresh rates against the given base currency. Cached for 12h.
 * Resolves to a {`${from}_${to}`: rate} map; resolves to {} if the API
 * is unreachable so callers can degrade gracefully.
 */
export async function getRates(base = "UAH") {
  const cached = readCache();
  if (cached?.base === base && cached?.rates) return { rates: cached.rates, stale: false };

  try {
    const res = await fetch(
      `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}`,
      { credentials: "omit" }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.rates) throw new Error("No rates in response");
    const rates = buildRateMap(base, data.rates);
    writeCache({ base, rates });
    return { rates, stale: false };
  } catch {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.rates) {
          const ageMs = Date.now() - (parsed.fetchedAt || 0);
          return { rates: parsed.rates, stale: true, ageMs };
        }
      }
    } catch {}
    return { rates: {}, stale: true, ageMs: Infinity };
  }
}
