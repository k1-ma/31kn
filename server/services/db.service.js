import { initDb, createPoolOnly } from "../db.js";

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_DEV = NODE_ENV === "development";
const IS_PROD = NODE_ENV === "production";

// Run migrations only if explicitly enabled (default: false)
const RUN_MIGRATIONS_ON_BOOT = process.env.RUN_MIGRATIONS_ON_BOOT === "1";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (IS_PROD) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD env vars are required in production");
  }
  if (ADMIN_PASSWORD === "change-me" || ADMIN_USERNAME === "admin") {
    throw new Error("ADMIN_USERNAME/ADMIN_PASSWORD must not use insecure defaults in production");
  }
}
const admin = {
  username: ADMIN_USERNAME || "admin",
  password: ADMIN_PASSWORD || "change-me",
  nickname: process.env.ADMIN_NICKNAME || "Administrator",
};

// Connection error patterns that should trigger pool reset
const RESET_ERROR_PATTERNS = [
  "ECONNRESET",
  "ETIMEDOUT",
  "Connection terminated",
  "server closed the connection unexpectedly",
  "connection lost",
  "Client has encountered a connection error",
];

/**
 * Check if an error is a transient connection error that warrants pool reset
 */
function isConnectionError(err) {
  const msg = err?.message || String(err);
  return RESET_ERROR_PATTERNS.some((pattern) => msg.includes(pattern));
}

/**
 * Reset the database pool (e.g., after connection errors)
 * Ends the current pool gracefully and clears global references.
 */
export async function resetPool() {
  const currentPool = globalThis.__koshyk_pool;
  
  // Clear references first to prevent new requests from using the old pool
  globalThis.__koshyk_pool = null;
  globalThis.__koshyk_db_init_promise = null;
  
  if (currentPool) {
    try {
      await currentPool.end();
      // eslint-disable-next-line no-console
      console.log("[db] pool reset complete");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[db] pool.end() error (ignored):", err?.message);
    }
  }
}

/**
 * Ensure database pool is available and healthy.
 * Creates pool on first call, reuses existing pool on subsequent calls.
 * Does NOT run migrations by default (use migrate.js for that).
 */
export async function ensurePool() {
  // Return existing pool if available
  if (globalThis.__koshyk_pool) {
    return globalThis.__koshyk_pool;
  }
  
  // Wait for in-progress initialization
  if (globalThis.__koshyk_db_init_promise) {
    return globalThis.__koshyk_db_init_promise;
  }
  
  // Start new initialization
  globalThis.__koshyk_db_init_promise = (async () => {
    try {
      globalThis.__koshyk_db_error = null; // Clear previous error before retry
      let pool;
      
      if (RUN_MIGRATIONS_ON_BOOT) {
        // Full init with schema creation (dev/local only)
        // eslint-disable-next-line no-console
        console.log("[db] running initDb with migrations (RUN_MIGRATIONS_ON_BOOT=1)");
        pool = await initDb({ admin });
      } else {
        // Production: create pool only, no migrations
        pool = await createPoolOnly();
        // eslint-disable-next-line no-console
        console.log("[db] pool created (no migrations)");
      }
      
      globalThis.__koshyk_pool = pool;
      globalThis.__koshyk_db_error = null;
      return pool;
    } catch (err) {
      globalThis.__koshyk_db_error = err;
      globalThis.__koshyk_db_init_promise = null;
      throw err;
    }
  })();
  
  return globalThis.__koshyk_db_init_promise;
}

/**
 * Execute a query with automatic pool recovery on transient connection errors.
 * If a connection error is detected, resets the pool and retries once.
 */
export async function queryWithRecovery(sql, params) {
  let pool = await ensurePool();
  
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (isConnectionError(err)) {
      // eslint-disable-next-line no-console
      console.warn("[db] connection error detected, resetting pool:", err?.message?.slice(0, 80));
      
      await resetPool();
      pool = await ensurePool();
      
      // Retry once after reset
      return await pool.query(sql, params);
    }
    throw err;
  }
}

export function getPool() {
  return globalThis.__koshyk_pool || null;
}

export function getDbError() {
  return globalThis.__koshyk_db_error || null;
}

// Error codes for consistency
const DB_UNAVAILABLE_ERROR = "DB_UNAVAILABLE";
const DB_UNAVAILABLE_MSG = "Database unavailable";

/**
 * Returns a structured error response for DB unavailability.
 * @returns {{ ok: boolean, code: string, messageKey: string, details: string }}
 */
export function dbUnavailableResponse() {
  const dbError = getDbError();
  const errorMsg = dbError?.message || "DB connection is not established";
  
  // Classify error type for better diagnostics
  let details = errorMsg;
  if (errorMsg.includes("timeout") || errorMsg.includes("ETIMEDOUT")) {
    details = "Connection timeout - database may be unreachable or slow";
  } else if (errorMsg.includes("authentication") || errorMsg.includes("password")) {
    details = "Authentication failed - check DATABASE_URL credentials";
  } else if (errorMsg.includes("ENOTFOUND") || errorMsg.includes("getaddrinfo")) {
    details = "Database host not found - check DATABASE_URL hostname";
  } else if (errorMsg.includes("SSL") || errorMsg.includes("TLS")) {
    details = "SSL/TLS error - check database SSL configuration";
  } else if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    details = "DATABASE_URL environment variable is not set";
  }
  
  return {
    ok: false,
    code: DB_UNAVAILABLE_ERROR,
    messageKey: "common.dbUnavailable",
    retryAfterMs: 1000,
    details,
    hint: "Check DATABASE_URL/POSTGRES_URL in Vercel Environment Variables and ensure the database allows external connections. Then redeploy.",
  };
}

// Export for use in other modules
export { DB_UNAVAILABLE_ERROR, DB_UNAVAILABLE_MSG };

export async function getUserById(id) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const r = await queryWithRecovery(
      `SELECT id, username, nickname, role, role_color, is_disabled, email, 
              disabled_reason, disabled_until, totp_enabled, email_verified,
              display_name, display_name_changed_at, google_id,
              username_changed_at
       FROM users WHERE id = $1`,
      [id]
    );
    return r.rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function getUserByUsername(username) {
  const pool = getPool();
  if (!pool) return null;
  try {
    const r = await queryWithRecovery(
      "SELECT * FROM users WHERE username = $1",
      [String(username)]
    );
    return r.rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function getUserByEmail(email) {
  const pool = getPool();
  if (!pool) return null;
  if (!email) return null;
  try {
    const r = await queryWithRecovery(
      "SELECT * FROM users WHERE email = $1",
      [String(email).toLowerCase()]
    );
    return r.rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function getUserByGoogleId(googleId) {
  const pool = getPool();
  if (!pool) return null;
  if (!googleId) return null;
  try {
    const r = await queryWithRecovery(
      "SELECT * FROM users WHERE google_id = $1",
      [String(googleId)]
    );
    return r.rows?.[0] || null;
  } catch {
    return null;
  }
}

export function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    role: u.role,
    role_color: u.role_color ?? null,
    is_disabled: !!u.is_disabled,
    email: u.email ?? null,
    email_verified: u.email_verified ?? false,
    twofa_enabled: !!u.totp_enabled,
    display_name: u.display_name ?? null,
    display_name_changed_at: u.display_name_changed_at ?? null,
    google_id: u.google_id ?? null,
    username_changed_at: u.username_changed_at ?? null,
  };
}

// Initialize pool on module load (don't fail hard)
ensurePool().catch((err) => {
  // eslint-disable-next-line no-console
  console.warn("[db.service] init skipped:", err?.message || err);
});
