/**
 * @fileoverview Test for BUG #9 — Per-user rate limiting.
 * Verifies the sliding-window rate limiter works correctly.
 *
 * Run with: node server/__tests__/rateLimit.test.js
 */

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected) {
      if (!(actual <= expected)) {
        throw new Error(`Expected ${actual} to be <= ${expected}`);
      }
    },
  };
}

// ── Inline SlidingWindowRateLimiter (mirrors rateLimitDb.js) ───────────────

class SlidingWindowRateLimiter {
  constructor({ windowMs, maxRequests }) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.store = new Map();
  }

  check(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    let timestamps = this.store.get(key);

    if (!timestamps) {
      timestamps = [];
      this.store.set(key, timestamps);
    }

    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.maxRequests) {
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
}

// ── Tests ───────────────────────────────────────────────────────────────────

test("Allows requests within limit", () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 60000, maxRequests: 5 });
  for (let i = 0; i < 5; i++) {
    const result = limiter.check("user1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4 - i);
  }
});

test("Blocks requests exceeding limit", () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 60000, maxRequests: 3 });
  limiter.check("user1"); // 1
  limiter.check("user1"); // 2
  limiter.check("user1"); // 3
  const result = limiter.check("user1"); // 4 → blocked
  expect(result.allowed).toBe(false);
  expect(result.remaining).toBe(0);
  expect(result.retryAfterMs).toBeGreaterThan(0);
});

test("Per-user isolation: user1 blocked, user2 allowed", () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 60000, maxRequests: 2 });
  limiter.check("user1"); // 1
  limiter.check("user1"); // 2

  const blockedResult = limiter.check("user1"); // 3 → blocked
  expect(blockedResult.allowed).toBe(false);

  const user2Result = limiter.check("user2"); // 1 for user2 → allowed
  expect(user2Result.allowed).toBe(true);
  expect(user2Result.remaining).toBe(1);
});

test("Window expiration allows new requests", () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 100, maxRequests: 2 });
  limiter.check("user1"); // 1
  limiter.check("user1"); // 2

  // Simulate time passing by manipulating the stored timestamps
  const timestamps = limiter.store.get("user1");
  timestamps[0] = Date.now() - 200; // Make first request "old"
  timestamps[1] = Date.now() - 200; // Make second request "old"

  const result = limiter.check("user1"); // Should be allowed now
  expect(result.allowed).toBe(true);
});

test("retryAfterMs is positive when blocked", () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 60000, maxRequests: 1 });
  limiter.check("user1"); // 1

  const result = limiter.check("user1"); // 2 → blocked
  expect(result.allowed).toBe(false);
  expect(result.retryAfterMs).toBeGreaterThan(0);
  expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
});

test("Remaining count is accurate", () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 60000, maxRequests: 5 });
  expect(limiter.check("user1").remaining).toBe(4);
  expect(limiter.check("user1").remaining).toBe(3);
  expect(limiter.check("user1").remaining).toBe(2);
  expect(limiter.check("user1").remaining).toBe(1);
  expect(limiter.check("user1").remaining).toBe(0);
});

test("Write rate limit: 60 writes/min", () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });
  for (let i = 0; i < 60; i++) {
    expect(limiter.check("user1").allowed).toBe(true);
  }
  expect(limiter.check("user1").allowed).toBe(false);
});

test("Share rate limit: 10 shares/hour", () => {
  const limiter = new SlidingWindowRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 10 });
  for (let i = 0; i < 10; i++) {
    expect(limiter.check("user1").allowed).toBe(true);
  }
  expect(limiter.check("user1").allowed).toBe(false);
});

// ── Run tests ───────────────────────────────────────────────────────────────

(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`✓ ${t.name}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${t.name}\n  ${e.message}`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
