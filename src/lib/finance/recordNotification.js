import { apiJson } from "@/lib/api.js";

/**
 * Best-effort sender for /api/notifications. Per-session dedupe keeps a
 * client from posting the same alert key twice in one tab. Errors are
 * swallowed: the in-app toast is the primary surface, the server-side
 * record is just a nice-to-have for the bell inbox.
 */
const sentInSession = new Set();

/**
 * @param {string} key   stable dedupe key, e.g. `budget:b1:warn:2026-03-01`
 * @param {string} type  one of NOTIFICATION_TYPES values
 * @param {object} [data]
 * @returns {Promise<boolean>} true if posted, false if deduped or failed
 */
export async function recordNotification(key, type, data = {}) {
  if (sentInSession.has(key)) return false;
  sentInSession.add(key);
  try {
    await apiJson("/api/notifications", {
      method: "POST",
      body: { type, data, dedupeKey: key },
    });
    return true;
  } catch {
    // Server unreachable, anonymous user, etc. — silent fail.
    return false;
  }
}

/** Test helper: forget what's been sent. */
export function _resetSentInSession() {
  sentInSession.clear();
}
