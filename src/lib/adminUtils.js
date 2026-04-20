/**
 * Shared utility functions for admin pages.
 * Consolidates duplicated helpers (formatBytes, fmtBytes, formatMs, etc.)
 */

/** Format byte count to human-readable string (B / KB / MB / GB). */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 0) return "-" + formatBytes(-bytes);
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/** Format byte count — alias used in some admin pages. */
export function fmtBytes(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Format milliseconds to human-readable string. */
export function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format date string as YYYY-MM-DD. */
export function formatDateString(date) {
  return date.toISOString().split("T")[0];
}
