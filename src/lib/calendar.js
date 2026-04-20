// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR UTILITIES
// Shared helpers for calendar views (Analytics, Account Detail)
// ─────────────────────────────────────────────────────────────────────────────

export function localeFromLang(lang) {
  if (lang === "ru") return "ru-RU";
  if (lang === "uk") return "uk-UA";
  return "en-US";
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function normalizeDateKey(d) {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (!Number.isFinite(dt.getTime())) return null;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function startOfMonth(d) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), 1);
}

export function addMonths(d, delta) {
  const dt = startOfMonth(d);
  return new Date(dt.getFullYear(), dt.getMonth() + delta, 1);
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Build a grid of weeks for a calendar month view
 * Returns an array of weeks, where each week is an array of 7 Date objects
 */
export function buildMonthGrid(viewMonth) {
  const first = startOfMonth(viewMonth);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const weeks = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    // Normalize dates to midnight
    weeks.push(week.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())));
  }

  // Trim trailing weeks that don't contain any days from the view month
  const m = viewMonth.getMonth();
  while (weeks.length > 4) {
    const last = weeks[weeks.length - 1];
    const hasMonthDay = last.some((d) => d.getMonth() === m);
    if (hasMonthDay) break;
    weeks.pop();
  }

  return weeks;
}

export function formatRange(start, end, locale) {
  const fmt = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

/**
 * Get weekday labels (Sun, Mon, Tue, etc.) for the current locale
 * Uses a reference date that is known to be a Sunday (Jan 5, 2025)
 */
export function getWeekdayLabels(locale) {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // Jan 5, 2025 is a Sunday - using a fixed date to get consistent weekday ordering
  const base = new Date(2025, 0, 5);
  return Array.from({ length: 7 }).map((_, i) => 
    fmt.format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i))
  );
}
