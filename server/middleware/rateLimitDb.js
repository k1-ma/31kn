// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING (BUG #9)
// In-memory per-user write rate limiter. Production environments should
// consider Redis/PG-backed stores for multi-instance deployments.
// Limits: 60 writes/min per user on state/sync, 10 shares/hour per user.
// ─────────────────────────────────────────────────────────────────────────────

// Interval for pruning expired rate limit entries (5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Simple sliding-window rate limiter using in-memory Map.
 * Each key (userId or IP) gets a list of request timestamps.
 * Old timestamps beyond the window are pruned on each check.
 */
class SlidingWindowRateLimiter {
  constructor({ windowMs, maxRequests }) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.store = new Map();
    // Periodically clean up expired entries (every 5 minutes)
    this._cleanupInterval = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  /**
   * Check if a request is allowed and record it.
   * @param {string} key - User ID or IP address
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  check(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    let timestamps = this.store.get(key);

    if (!timestamps) {
      timestamps = [];
      this.store.set(key, timestamps);
    }

    // Prune old timestamps
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.maxRequests) {
      // Calculate when the oldest request in the window expires
      const retryAfterMs = timestamps[0] + this.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1000, retryAfterMs),
      };
    }

    timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      retryAfterMs: 0,
    };
  }

  _cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.store) {
      while (timestamps.length > 0 && timestamps[0] <= cutoff) {
        timestamps.shift();
      }
      if (timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}

// Per-user write rate limiter: 60 writes per minute
const writeRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
});

// Per-user share rate limiter: 10 shares per hour
const shareRateLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
});

// Per-IP public vote rate limiter (short window): 10 votes per minute
const voteRateLimiterMinute = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
});

// Per-IP public vote rate limiter (long window): 100 votes per hour
const voteRateLimiterHour = new SlidingWindowRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 100,
});

/**
 * Get rate limit key — prefer userId (authenticated), fall back to IP.
 */
function getRateLimitKey(req) {
  return req.session?.userId || req.ip || req.connection?.remoteAddress || "unknown";
}

/**
 * Middleware: rate limit writes on /api/state, /api/sync/*
 * 60 writes/min per user.
 */
export function writeRateLimit(req, res, next) {
  const key = getRateLimitKey(req);
  const result = writeRateLimiter.check(key);

  res.set("X-RateLimit-Limit", "60");
  res.set("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: "Too many requests",
      code: "RATE_LIMITED",
      retryAfterMs: result.retryAfterMs,
    });
  }
  return next();
}

/**
 * Middleware: rate limit shares on /api/public-share
 * 10 shares/hour per user.
 */
export function shareRateLimit(req, res, next) {
  const key = getRateLimitKey(req);
  const result = shareRateLimiter.check(key);

  res.set("X-RateLimit-Limit", "10");
  res.set("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: "Too many share requests",
      code: "RATE_LIMITED",
      retryAfterMs: result.retryAfterMs,
    });
  }
  return next();
}

/**
 * Get rate limit key for public (unauthenticated) endpoints — IP only.
 * Honors X-Forwarded-For (first hop) when present, then falls back to req.ip.
 */
function getPublicIpKey(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.connection?.remoteAddress || "unknown";
}

/**
 * Middleware: rate limit public vote endpoints by IP.
 * 10 votes/min per IP, 100 votes/hour per IP. No session is required.
 */
export function voteRateLimit(req, res, next) {
  const key = getPublicIpKey(req);

  const minuteResult = voteRateLimiterMinute.check(key);
  const hourResult = voteRateLimiterHour.check(key);

  res.set("X-RateLimit-Limit", "10");
  res.set("X-RateLimit-Remaining", String(Math.min(minuteResult.remaining, hourResult.remaining)));

  if (!minuteResult.allowed || !hourResult.allowed) {
    const retryAfterMs = Math.max(
      minuteResult.allowed ? 0 : minuteResult.retryAfterMs,
      hourResult.allowed ? 0 : hourResult.retryAfterMs,
    );
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: "Too many vote requests",
      code: "RATE_LIMITED",
      retryAfterMs,
    });
  }
  return next();
}

// Passthrough middleware - global DB rate limiting (using Cloudflare instead)
export async function rateLimitDbMiddleware(req, res, next) {
  return next();
}

// Per-IP public-read rate limiter: 120 req/min. Generous enough for legitimate
// users browsing public tournaments / leaderboards but blocks scraping/DoS.
const publicReadLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
});

export function publicReadRateLimit(req, res, next) {
  const key = getPublicIpKey(req);
  const result = publicReadLimiter.check(key);

  res.set("X-RateLimit-Limit", "120");
  res.set("X-RateLimit-Remaining", String(result.remaining));

  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: "Too many requests",
      code: "RATE_LIMITED",
      retryAfterMs: result.retryAfterMs,
    });
  }
  return next();
}

const loginLimiter = new SlidingWindowRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
});

const adminLoginLimiter = new SlidingWindowRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
});

const registerLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
});

function makeIpRateLimit(limiter, label) {
  return function rateLimitMiddleware(req, res, next) {
    const key = getPublicIpKey(req);
    const result = limiter.check(key);

    res.set("X-RateLimit-Limit", String(limiter.maxRequests));
    res.set("X-RateLimit-Remaining", String(result.remaining));

    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: `Too many ${label} attempts`,
        code: "RATE_LIMITED",
        retryAfterMs: result.retryAfterMs,
      });
    }
    return next();
  };
}

export const loginRateLimit = makeIpRateLimit(loginLimiter, "login");
export const adminLoginRateLimit = makeIpRateLimit(adminLoginLimiter, "admin login");
export const registerRateLimit = makeIpRateLimit(registerLimiter, "registration");
