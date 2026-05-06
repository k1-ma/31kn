/**
 * Date-range presets used by Transactions filters and Analytics.
 * Returns { start, end } as ISO strings; `end` is exclusive.
 */

export const RANGE_PRESETS = ["today", "week", "month", "quarter", "year", "all"];

/** Build a {start, end} range from inclusive YYYY-MM-DD strings (end exclusive of next day). */
export function customRange(startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function rangeFromPreset(preset, anchor = new Date()) {
  const a = new Date(anchor);
  if (preset === "today") {
    const start = new Date(a);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === "week") {
    const start = new Date(a);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === "month") {
    const start = new Date(a.getFullYear(), a.getMonth(), 1);
    const end = new Date(a.getFullYear(), a.getMonth() + 1, 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === "quarter") {
    const q = Math.floor(a.getMonth() / 3);
    const start = new Date(a.getFullYear(), q * 3, 1);
    const end = new Date(a.getFullYear(), q * 3 + 3, 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === "year") {
    const start = new Date(a.getFullYear(), 0, 1);
    const end = new Date(a.getFullYear() + 1, 0, 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  // all
  return { start: "0001-01-01T00:00:00.000Z", end: "9999-01-01T00:00:00.000Z" };
}
