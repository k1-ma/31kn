import { ensurePool, getUserById, dbUnavailableResponse } from "../services/db.service.js";
import { sign, makeCookie, appendSetCookie, getCookieDomain } from "../utils/cookies.js";

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const COOKIE_NAME = "tradecrm.sid";

/**
 * Clear the session cookie for both domain-scoped and host-only variants
 * so stale duplicates from different Domain scopes are removed.
 */
function clearAllSessionCookies(res, cookieDomain) {
  const opts = {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: IS_PROD,
    maxAge: 0,
  };
  if (cookieDomain) {
    appendSetCookie(res, makeCookie(COOKIE_NAME, "", { ...opts, domain: cookieDomain }));
  }
  appendSetCookie(res, makeCookie(COOKIE_NAME, "", opts));
}

export async function requireAuth(req, res, next) {
  // Rely on ensureDb middleware for pool initialization
  // If we reach here without a pool, return 503
  let pool;
  try {
    pool = await ensurePool();
  } catch {
    return res.status(503).json({
      code: "DB_UNAVAILABLE",
      messageKey: "common.dbUnavailable",
      retryAfterMs: 1000,
    });
  }
  
  if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });

  // Use host-based fallback for cookie domain
  const cookieDomain = getCookieDomain() || req._cookieDomainFromHost;

  const u = await getUserById(req.session.userId);
  if (!u || u.is_disabled) {
    // Check temporary ban
    if (u?.disabled_until && new Date(u.disabled_until) > new Date()) {
      try {
        if (req.session?.sid) await pool.query("UPDATE sessions SET revoked = true WHERE sid = $1", [req.session.sid]);
      } catch {}
      clearAllSessionCookies(res, cookieDomain);
      return res.status(403).json({ error: "Account suspended", until: u.disabled_until, reason: u.disabled_reason });
    }

    if (u?.is_disabled) {
      try {
        if (req.session?.sid) await pool.query("UPDATE sessions SET revoked = true WHERE sid = $1", [req.session.sid]);
      } catch {}
      clearAllSessionCookies(res, cookieDomain);
      return res.status(403).json({ error: "Account disabled", reason: u?.disabled_reason });
    }

    if (!u) {
      return res.status(401).json({ error: "User not found" });
    }
  }

  req.user = u;
  return next();
}

export { COOKIE_NAME };
