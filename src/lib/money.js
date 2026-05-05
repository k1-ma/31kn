/**
 * Money helpers. All amounts are stored as integer cents (BIGINT-safe Number)
 * to avoid float drift on sums. UI converts to/from cents at the boundary.
 */

const SUPPORTED_CURRENCIES = [
  "UAH", "USD", "EUR", "GBP", "PLN", "CZK", "CHF", "JPY", "CAD", "AUD",
];

/** Convert a user-entered string ("12,50" / "12.5" / "  -3 ") to integer cents. */
export function toCents(input) {
  if (input == null) return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = String(input).replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Convert integer cents to a JS number with two decimals. */
export function fromCents(cents) {
  return (Number(cents) || 0) / 100;
}

/** Format cents as a localized currency string. */
export function formatMoney(cents, currency = "UAH", lang = "uk") {
  const value = fromCents(cents);
  try {
    return new Intl.NumberFormat(lang === "uk" ? "uk-UA" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Format cents as a plain number with the active locale (no currency symbol). */
export function formatNumber(cents, lang = "uk") {
  return new Intl.NumberFormat(lang === "uk" ? "uk-UA" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromCents(cents));
}

/** Sum a list of {amount_cents, currency} entries, grouped by currency. */
export function sumByCurrency(items, getCents = (x) => x.amount_cents, getCurrency = (x) => x.currency) {
  const totals = {};
  for (const item of items || []) {
    const c = getCurrency(item) || "UAH";
    totals[c] = (totals[c] || 0) + (Number(getCents(item)) || 0);
  }
  return totals;
}

/** Convert an amount from one currency to another using a rates map. */
export function convert(cents, fromCurrency, toCurrency, rates) {
  if (fromCurrency === toCurrency) return cents;
  const rate = rates?.[`${fromCurrency}_${toCurrency}`];
  if (!rate || !Number.isFinite(rate)) return null;
  return Math.round(cents * rate);
}

/** Convert all currency totals to a single base currency. */
export function totalInBase(totalsByCurrency, base = "UAH", rates = {}) {
  let sum = 0;
  for (const [currency, cents] of Object.entries(totalsByCurrency || {})) {
    if (currency === base) {
      sum += cents;
    } else {
      const converted = convert(cents, currency, base, rates);
      if (converted != null) sum += converted;
    }
  }
  return sum;
}

export { SUPPORTED_CURRENCIES };
