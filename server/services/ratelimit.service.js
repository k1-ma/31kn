import { getPool } from "./db.service.js";

// Rate limit configurations
const RATE_LIMITS = {
  transactions: { maxCount: 60, windowMinutes: 10 },
};

// Cleanup interval for old rate limit entries (in minutes)
const CLEANUP_INTERVAL_MINUTES = 60;

/**
 * Check and increment rate limit for an action
 * @param {string} key - User ID (u:123) or IP (ip:1.2.3.4)
 * @param {string} action - Action type: "transactions"
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date}>}
 */
export async function checkRateLimit(key, action) {
  const pool = getPool();
  if (!pool) {
    // If DB unavailable, allow the action (fail open for usability)
    return { allowed: true, remaining: 999, resetAt: new Date() };
  }

  const config = RATE_LIMITS[action];
  if (!config) {
    return { allowed: true, remaining: 999, resetAt: new Date() };
  }

  const windowMs = config.windowMinutes * 60 * 1000;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  try {
    // Upsert and get current count
    const result = await pool.query(
      `INSERT INTO rate_limits (key, action, window_start, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (key, action, window_start) DO UPDATE
       SET count = rate_limits.count + 1
       RETURNING count`,
      [key, action, windowStart.toISOString()]
    );

    const count = result.rows?.[0]?.count || 1;
    const allowed = count <= config.maxCount;
    const remaining = Math.max(0, config.maxCount - count);
    const resetAt = new Date(windowStart.getTime() + windowMs);

    return { allowed, remaining, resetAt, count, limit: config.maxCount };
  } catch (e) {
    // On error, allow the action
    console.warn("[ratelimit] error:", e?.message);
    return { allowed: true, remaining: 999, resetAt: new Date() };
  }
}

/**
 * Get rate limit key for a user or IP
 */
export function getRateLimitKey(userId, ip) {
  if (userId) return `u:${userId}`;
  if (ip) return `ip:${ip}`;
  return null;
}

/**
 * Cleanup old rate limit entries (call periodically)
 */
export async function cleanupRateLimits() {
  const pool = getPool();
  if (!pool) return;

  try {
    // Delete entries older than the configured interval
    await pool.query(
      `DELETE FROM rate_limits WHERE window_start < now() - interval '${CLEANUP_INTERVAL_MINUTES} minutes'`
    );
  } catch (e) {
    console.warn("[ratelimit] cleanup error:", e?.message);
  }
}
