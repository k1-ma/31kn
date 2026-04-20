/**
 * ensureDb middleware - ensures database connection is ready before handling requests
 * 
 * Features:
 * - 3 attempts with exponential backoff (200ms, 500ms, 1000ms) + jitter
 * - Returns 503 with structured error response if DB is unavailable after retries
 * - Logs errors without exposing secrets
 */

import { ensurePool } from "../services/db.service.js";

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_DEV = NODE_ENV === "development";

// Retry configuration
const RETRY_DELAYS = [200, 500, 1000]; // ms
const MAX_ATTEMPTS = RETRY_DELAYS.length; // 3 attempts total

/**
 * Add jitter to delay (±25%)
 */
function addJitter(delay) {
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(50, Math.round(delay + jitter));
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Classify error type for logging (no secrets)
 */
function classifyError(err) {
  const msg = err?.message || String(err);
  
  if (msg.includes("ECONNRESET") || msg.includes("Connection terminated")) {
    return "CONNECTION_RESET";
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return "TIMEOUT";
  }
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return "DNS_ERROR";
  }
  if (msg.includes("authentication") || msg.includes("password")) {
    return "AUTH_ERROR";
  }
  if (msg.includes("SSL") || msg.includes("TLS")) {
    return "SSL_ERROR";
  }
  if (msg.includes("server closed")) {
    return "SERVER_CLOSED";
  }
  return "UNKNOWN";
}

/**
 * Middleware to ensure database pool is available before processing request.
 * Retries up to 3 times with exponential backoff before returning 503.
 */
export async function ensureDb(req, res, next) {
  let lastError = null;
  
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await ensurePool();
      return next();
    } catch (err) {
      lastError = err;
      
      // Log attempt (without secrets)
      const errorType = classifyError(err);
      const requestId = req.headers["x-request-id"] || req.headers["x-vercel-id"] || "";
      
      // eslint-disable-next-line no-console
      console.warn(
        `[db] ensurePool attempt ${attempt + 1}/${MAX_ATTEMPTS} failed`,
        JSON.stringify({
          type: errorType,
          message: err?.message?.slice(0, 100),
          code: err?.code,
          requestId: requestId || undefined,
          ...(IS_DEV && { stack: err?.stack?.slice(0, 500) }),
        })
      );
      
      // If we have retries left, wait with backoff + jitter
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = addJitter(RETRY_DELAYS[attempt]);
        await sleep(delay);
      }
    }
  }
  
  // All retries exhausted - return 503
  const errorType = classifyError(lastError);
  
  // eslint-disable-next-line no-console
  console.error(
    "[db] unavailable after all retries",
    JSON.stringify({
      type: errorType,
      message: lastError?.message?.slice(0, 100),
      path: req.path,
      method: req.method,
    })
  );
  
  return res.status(503).json({
    ok: false,
    code: "DB_UNAVAILABLE",
    message: "Database unavailable",
    messageKey: "common.dbUnavailable",
    retryAfterMs: 1000,
    ...(IS_DEV && { debug: { type: errorType, message: lastError?.message } }),
  });
}

export default ensureDb;
