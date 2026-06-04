import { Router } from "express";
import { getPool, getDbError, ensurePool, queryWithRecovery } from "../services/db.service.js";

const router = Router();

const startTime = Date.now();
const VERSION = process.env.npm_package_version || "1.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_DEV = NODE_ENV === "development";

/**
 * Check if required environment variables are set
 */
function checkEnvVars() {
  const required = {
    DATABASE_URL: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL),
    SESSION_SECRET: !!process.env.SESSION_SECRET,
  };
  const google = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URL: !!process.env.GOOGLE_REDIRECT_URL,
  };
  return { required, google, googleComplete: Object.values(google).every(Boolean) };
}

// GET /api/health
router.get("/", async (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const env = checkEnvVars();

  let pool = getPool();
  let dbStatus = "down";
  let dbLatencyMs = null;
  let dbError = null;

  // Try to get or create pool
  if (!pool) {
    try {
      pool = await ensurePool();
    } catch (err) {
      dbError = err?.message?.slice(0, 100);

      console.warn("[health] Pool init failed:", err?.message);
    }
  }

  // Check DB connectivity with a simple query
  if (pool) {
    try {
      const start = Date.now();
      await queryWithRecovery("SELECT 1", []);
      dbLatencyMs = Date.now() - start;
      dbStatus = "up";
    } catch (err) {
      dbStatus = "error";
      dbError = err?.message?.slice(0, 100);

      console.error("[health] DB query failed:", err?.message);
    }
  }

  const ok = dbStatus === "up";

  // Build response - limit details in production
  const response = {
    ok,
    db: dbStatus,
    ...(dbLatencyMs !== null && { dbLatencyMs }),
    uptime,
    version: VERSION,
    timestamp: new Date().toISOString(),
  };

  // Add more details in development or if there's an error
  if (!ok) {
    response.code = "DB_UNAVAILABLE";
    if (IS_DEV) {
      response.detail = dbError || getDbError()?.message || "DB not connected";
    }
  }

  // Add env info in dev mode only
  if (IS_DEV) {
    response.env = {
      dbConfigured: env.required.DATABASE_URL,
      sessionConfigured: env.required.SESSION_SECRET,
      googleOAuthConfigured: env.googleComplete,
    };
  }

  return res.status(ok ? 200 : 503).json(response);
});

export default router;
