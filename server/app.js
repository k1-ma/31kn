import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import { ensurePool, getPool, dbUnavailableResponse, queryWithRecovery } from "./services/db.service.js";
import { sign, parseCookiesAll, getCookieDomainFromHost } from "./utils/cookies.js";
import { banGuard } from "./middleware/banGuard.js";
import { metricsMiddleware } from "./middleware/metrics.js";
import { rateLimitDbMiddleware } from "./middleware/rateLimitDb.js";
import { ensureDb } from "./middleware/ensureDb.js";

// Routes
import authRoutes from "./routes/auth.routes.js";
import financeRoutes from "./routes/finance.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import healthRoutes from "./routes/health.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import pingRoutes from "./routes/ping.routes.js";

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const COOKIE_NAME = "koshyk.sid";
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";

// CORS whitelist configuration
const CORS_WHITELIST = process.env.CORS_WHITELIST
  ? process.env.CORS_WHITELIST.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

function corsOptions(req, callback) {
  const origin = req.header("Origin");
  // Allow requests with no origin (mobile apps, curl, server-to-server, etc.)
  if (!origin) {
    return callback(null, { origin: true, credentials: true });
  }
  // In development, allow all origins
  if (!IS_PROD) {
    return callback(null, { origin: true, credentials: true });
  }
  // Same-origin requests are always safe — Chrome/Firefox/Safari attach an
  // Origin header on POST/PUT/DELETE even when the request goes to the same
  // host the page was loaded from, so we cannot treat the mere presence of
  // an Origin header as proof that the request is cross-origin. Compare the
  // origin's host against the incoming Host header and allow when they
  // match. Without this check, any same-origin POST (e.g. /api/auth/login)
  // returns 500 in production unless CORS_WHITELIST is set.
  try {
    const originHost = new URL(origin).host;
    const reqHost = req.header("X-Forwarded-Host") || req.header("Host");
    if (reqHost && originHost === reqHost) {
      return callback(null, { origin: true, credentials: true });
    }
  } catch {
    // Malformed Origin — fall through to whitelist check
  }
  // Cross-origin in production: require an explicit whitelist
  if (CORS_WHITELIST.length === 0) {
    return callback(new Error("CORS_WHITELIST is empty in production; refusing cross-origin request"), { origin: false });
  }
  // Precise domain matching to prevent subdomain spoofing
  // e.g., whitelist "example.com" should not allow "malicious-example.com"
  const allowed = CORS_WHITELIST.some((w) => {
    // Exact match
    if (origin === w) return true;
    // Match with https:// prefix
    if (origin === `https://${w}`) return true;
    // Match subdomain (whitelist entry must start with '.')
    if (w.startsWith(".") && origin.endsWith(w)) return true;
    return false;
  });
  if (!allowed) {
    return callback(new Error(`CORS not allowed for origin: ${origin}`), { origin: false });
  }
  return callback(null, { origin: true, credentials: true });
}

export async function createApp() {
  // Try to connect once on boot, but don't fail hard.
  try {
    await ensurePool();
  } catch (err) {

    console.warn("[db] init skipped:", err?.message || err);
  }

  const app = express();
  app.set("trust proxy", 1);

  // Security headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: IS_PROD ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "https://api.exchangerate.host"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          workerSrc: ["'self'"],
        },
      } : false,
      crossOriginEmbedderPolicy: false, // Disable COEP for compatibility
    })
  );

  // CORS configuration
  app.use(cors(corsOptions));

  // Body parser. Limit raised from 50MB to 100MB after a real user hit the
  // Express 50MB ceiling on a single-blob save (their full state_json was
  // 53.85MB). The long-term answer is per-entity tables, but until then
  // raising the cap here gives heavy users headroom while the chunked sync
  // path picks up everything ≥ ~45MB anyway.
  // Configurable via STATE_BODY_LIMIT env var (e.g. "150mb") for ops
  // tuning without a redeploy.
  const STATE_BODY_LIMIT = process.env.STATE_BODY_LIMIT || "100mb";
  app.use(express.json({ limit: STATE_BODY_LIMIT }));

  // Session middleware - attach minimal session-like object
  // Handles duplicate cookies: when the browser sends several koshyk.sid
  // values (from different Domain scopes) we try each one until we find
  // a valid, non-revoked, non-expired session.
  app.use(async (req, res, next) => {
    // Store host info for cookie domain fallback
    req._cookieDomainFromHost = getCookieDomainFromHost(
      req.headers["x-forwarded-host"] || req.headers.host
    );

    const debugCtx = AUTH_DEBUG
      ? {
          host: req.headers.host,
          xForwardedHost: req.headers["x-forwarded-host"],
          xForwardedProto: req.headers["x-forwarded-proto"],
          origin: req.headers.origin,
          hasCookieHeader: !!req.headers.cookie,
        }
      : null;

    try {
      // On Vercel cold starts the boot-time ensurePool() in createApp() may
      // still be in flight (or have failed its first attempt) when the very
      // first request arrives. If we silently skip session resolution here,
      // requireAuth downstream sees req.session === undefined and returns
      // 401 even though the user has a valid cookie and the pool is about
      // to come up via ensureDb's retry loop. So before giving up, try to
      // bring the pool online ourselves; if it still fails, fall through —
      // ensureDb (with backoff) will return 503 for routes that need the DB.
      let pool = getPool();
      if (!pool) {
        try {
          pool = await ensurePool();
        } catch {
          // Pool truly unavailable — let downstream middleware decide.
        }
      }
      if (!pool) {
        if (AUTH_DEBUG) console.log("[auth-debug] session skip: no_db_pool", debugCtx);
        return next();
      }

      // Collect ALL values of the session cookie (handles duplicate cookies
      // from different Domain scopes, e.g. host-only vs apex.example).
      const allCookies = parseCookiesAll(req);
      const rawValues = allCookies[COOKIE_NAME];
      if (!rawValues || rawValues.length === 0) {
        if (AUTH_DEBUG) console.log("[auth-debug] session skip: no_cookie", { ...debugCtx, hasSessionCookie: false });
        return next();
      }

      if (AUTH_DEBUG) {
        debugCtx.hasSessionCookie = true;
        debugCtx.cookieCount = rawValues.length;
      }

      const now = new Date();
      let lastReason = "no_valid_cookie";

      // Try each cookie value — first valid session wins
      for (let i = 0; i < rawValues.length; i++) {
        const raw = rawValues[i];
        const [sid, sig] = String(raw).split(".");
        if (!sid || !sig) {
          if (AUTH_DEBUG) console.log("[auth-debug] cookie skip: malformed_cookie", { ...debugCtx, cookieIdx: i });
          lastReason = "malformed_cookie";
          continue;
        }
        if (sign(sid) !== sig) {
          if (AUTH_DEBUG) console.log("[auth-debug] cookie skip: invalid_signature", { ...debugCtx, cookieIdx: i });
          lastReason = "invalid_signature";
          continue;
        }

        const q = await queryWithRecovery(
          "SELECT sid, user_id, created_at, last_seen_at, ip, ua, expires_at, revoked FROM sessions WHERE sid = $1",
          [sid]
        );
        const row = q.rows?.[0];
        if (!row) {
          if (AUTH_DEBUG) console.log("[auth-debug] cookie skip: session_not_found", { ...debugCtx, cookieIdx: i });
          lastReason = "session_not_found";
          continue;
        }
        if (row.revoked) {
          if (AUTH_DEBUG) console.log("[auth-debug] cookie skip: session_revoked", { ...debugCtx, cookieIdx: i });
          lastReason = "session_revoked";
          continue;
        }
        if (row.expires_at && new Date(row.expires_at) <= now) {
          if (AUTH_DEBUG) console.log("[auth-debug] cookie skip: session_expired", { ...debugCtx, cookieIdx: i });
          lastReason = "session_expired";
          continue;
        }

        // Valid session found
        req.session = {
          sid: row.sid,
          userId: row.user_id,
          createdAt: row.created_at,
          lastSeenAt: row.last_seen_at,
          ip: row.ip,
          ua: row.ua,
          expiresAt: row.expires_at,
        };
        req.sessionID = row.sid;

        if (AUTH_DEBUG) console.log("[auth-debug] session ok: user_id=", row.user_id, debugCtx);

        // Throttle last_seen updates (2 min)
        const prev = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
        const nowTs = Date.now();
        if (!prev || nowTs - prev > 2 * 60 * 1000) {
          try {
            await queryWithRecovery("UPDATE sessions SET last_seen_at = now() WHERE sid = $1", [sid]);
          } catch {
            // Non-critical - ignore
          }
        }

        return next();
      }

      // None of the cookie values resolved to a valid session
      if (AUTH_DEBUG) console.log("[auth-debug] session skip:", lastReason, debugCtx);
      return next();
    } catch {
      return next();
    }
  });

  // Apply global middleware
  app.use(banGuard);
  app.use(metricsMiddleware);

  // Apply rate limiting to API routes
  app.use("/api", rateLimitDbMiddleware);

  // Add Cache-Control header to prevent caching issues (especially with Cloudflare)
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Vary", "Cookie, Authorization");
    next();
  });

  // Apply ensureDb middleware to all API routes EXCEPT specific endpoints
  // This ensures DB is available with retry before processing requests
  app.use("/api", (req, res, next) => {
    // Skip ensureDb for endpoints that handle DB unavailability gracefully:
    // - /api/health: has its own DB check logic
    // - /api/auth/me: returns { user: null } when DB is down (allows frontend to load)
    // - /api/auth/logout: works without DB
    const skipPaths = [
      "/health",
      "/ping",
      "/auth/me",
      "/auth/logout",
      "/auth/registration-status",
      "/auth/google/status",
    ];

    if (skipPaths.some((p) => req.path === p || req.path.startsWith(p + "/"))) {
      return next();
    }
    return ensureDb(req, res, next);
  });

  // Mount routes
  app.use("/api/ping", pingRoutes);
  app.use("/api/auth", authRoutes);
  // v2 finance domain: normalized per-entity REST (wallets, transactions, …),
  // preferences and bulk import. Replaces the old /api/state + /api/sync blob.
  app.use("/api", financeRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/health", healthRoutes);
  app.use("/api/notifications", notificationsRoutes);

  // ─────────────────────────────────────────────────────────────────────────────
  // 404 HANDLER for API routes - Return JSON instead of HTML
  // ─────────────────────────────────────────────────────────────────────────────
  app.use("/api", (req, res) => {
    return res.status(404).json({
      error: `Cannot ${req.method} ${req.originalUrl}`,
      code: "NOT_FOUND",
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR HANDLERS - Must be at the end of middleware stack
  // ─────────────────────────────────────────────────────────────────────────────

  // Handle payload too large errors (413) with JSON response
  // This catches errors from express.json body parser
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") {
      return res.status(413).json({
        error: "Payload too large. Try reducing data size or removing images.",
        code: "PAYLOAD_TOO_LARGE",
        limit: STATE_BODY_LIMIT,
        // Hint to the client: switch to chunked sync if available.
        useChunkedSync: true,
      });
    }

    // Handle JSON parsing errors
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({
        error: "Invalid JSON in request body",
        code: "INVALID_JSON",
      });
    }

    // Log unexpected errors in development
    if (!IS_PROD) {
      console.error("[app] Unhandled error:", err?.message || err);
    }

    // Generic error response
    return res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });

  return app;
}
