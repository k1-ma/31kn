import { Router } from "express";
import crypto from "crypto";
import {
  ensurePool, getPool, getUserById, safeUser, dbUnavailableResponse, DB_UNAVAILABLE_MSG
} from "../services/db.service.js";
import {
  loginUser, registerUser, createSession, revokeSession,
  changePassword, changePasswordWithNotification, isRegistrationEnabled, findOrCreateGoogleUser,
  verifyEmail, resendVerificationEmail,
  requestPasswordReset, validatePasswordResetToken, resetPasswordWithToken,
  requestEmailChange, confirmEmailChange
} from "../services/auth.service.js";
import { isEmailServiceEnabled, isEmailVerificationRequired } from "../services/email.service.js";
import {
  createLoginChallenge, verifyLoginChallenge, verifyUserTotp,
  setupTotp, enableTotp, disableTotp, hasTotpEnabled
} from "../services/totp.service.js";
import { requireAuth, COOKIE_NAME } from "../middleware/requireAuth.js";
import { loginRateLimit, registerRateLimit, twoFactorRateLimit } from "../middleware/rateLimitDb.js";
import { sign, makeCookie, appendSetCookie, parseCookies, getCookieDomain, getCookieDomainFromHost } from "../utils/cookies.js";

const router = Router();

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";

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
};

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URL = process.env.GOOGLE_REDIRECT_URL;

// Display name cooldown (in days)
const DISPLAY_NAME_COOLDOWN_DAYS = 7;
const USERNAME_COOLDOWN_DAYS = 30;

/**
 * Check if Google OAuth is properly configured
 * @returns {{ available: boolean, missing: string[] }}
 */
function checkGoogleOAuthConfig() {
  const missing = [];
  if (!GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_REDIRECT_URL) missing.push("GOOGLE_REDIRECT_URL");
  return { available: missing.length === 0, missing };
}

// Helper to set session cookie
function setSessionCookie(res, sid, remember = false, req = null) {
  const ttlMs = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
  const maxAgeSec = Math.floor(ttlMs / 1000);
  const domain = getCookieDomain() || (req ? req._cookieDomainFromHost : undefined);
  const cookieValue = encodeURIComponent(`${sid}.${sign(sid)}`);

  if (AUTH_DEBUG) {
    console.log("[auth-debug] setSessionCookie:", {
      sid: sid.slice(0, 8) + "…",
      remember,
      maxAgeSec,
      domain: domain || "(host-only)",
      secure: IS_PROD,
    });
  }

  // Clear any stale host-only cookie (no Domain attribute) left over from
  // before the COOKIE_DOMAIN migration.  This prevents the browser from
  // sending two cookies with the same name.
  if (domain) {
    appendSetCookie(res, makeCookie(COOKIE_NAME, "", {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: IS_PROD,
      maxAge: 0,
    }));
  }

  const set = makeCookie(COOKIE_NAME, cookieValue, {
    path: "/",
    domain,
    httpOnly: true,
    sameSite: "Lax",
    secure: IS_PROD,
    maxAge: maxAgeSec,
  });
  appendSetCookie(res, set);

  if (AUTH_DEBUG) {
    const setCookieHeader = res.getHeader("Set-Cookie");
    console.log("[auth-debug] Set-Cookie header after set:", {
      headerPresent: !!setCookieHeader,
      headerCount: Array.isArray(setCookieHeader) ? setCookieHeader.length : (setCookieHeader ? 1 : 0),
    });
  }
}

function clearSessionCookie(res, req = null) {
  const domain = getCookieDomain() || (req ? req._cookieDomainFromHost : undefined);
  const opts = {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: IS_PROD,
    maxAge: 0,
  };
  // Clear the domain-scoped cookie
  if (domain) {
    appendSetCookie(res, makeCookie(COOKIE_NAME, "", { ...opts, domain }));
  }
  // Always also clear a host-only cookie (no Domain attribute) to remove
  // stale duplicates left over from before the COOKIE_DOMAIN migration.
  appendSetCookie(res, makeCookie(COOKIE_NAME, "", opts));
}

// GET /api/auth/me
router.get("/me", async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* ignore */ }
  }
  const debugMeta = AUTH_DEBUG
    ? {
        host: req.headers.host,
        xForwardedHost: req.headers["x-forwarded-host"],
        xForwardedProto: req.headers["x-forwarded-proto"],
        hasCookieHeader: !!req.headers.cookie,
        hasSessionCookie: !!parseCookies(req)[COOKIE_NAME],
        hasSession: !!req.session?.userId,
        cookieDomain: getCookieDomain() || req._cookieDomainFromHost || "(none)",
      }
    : undefined;

  if (!pool) {
    return res.json({ user: null, db: "down", ...(debugMeta ? { _debug: debugMeta } : {}) });
  }
  if (!req.session?.userId) return res.json({ user: null, ...(debugMeta ? { _debug: debugMeta } : {}) });
  const u = await getUserById(req.session.userId);
  if (!u || u.is_disabled) return res.json({ user: null, ...(debugMeta ? { _debug: debugMeta } : {}) });
  return res.json({ user: safeUser(u), ...(debugMeta ? { _debug: debugMeta } : {}) });
});

// POST /api/auth/login
//
// Note: an earlier version branched into a stricter `adminLoginRateLimit`
// when `username === admin.username`. That leaked the admin login
// (different Retry-After / 429 timing for the admin username vs random
// ones), so the differential check was removed. Brute-force protection
// is provided by:
//   - loginRateLimit: 10 attempts per 5 min per IP
//   - bcrypt verification (cost 12)
//   - mandatory 2FA on the admin account (single-use ticket + TOTP)
router.post(
  "/login",
  loginRateLimit,
  async (req, res) => {
    let pool = getPool();
    if (!pool) {
      try { pool = await ensurePool(); } catch { /* retry failed */ }
    }
    if (!pool) {
      return res.status(503).json(dbUnavailableResponse());
    }

    // Accept "username" field as identifier (can be username OR email)
    const { username, password, remember } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Login/email and password required" });

    const result = await loginUser({ username, password });
    if (result.error) {
      // Handle email not verified
      if (result.errorCode === "EMAIL_NOT_VERIFIED") {
        return res.status(403).json({
          error: result.error,
          errorCode: "EMAIL_NOT_VERIFIED",
          email: result.email,
          userId: result.userId
        });
      }
      return res.status(result.status || 401).json({ error: result.error });
    }

    // Check if 2FA is enabled for this user
    if (result.user.totp_enabled) {
      // Create a login challenge ticket instead of a session
      const challenge = await createLoginChallenge(result.user.id, !!remember);
      if (!challenge) {
        return res.status(500).json({ error: "Failed to create 2FA challenge" });
      }
      return res.json({
        requires2fa: true,
        ticket: challenge.id,
        expires_at: challenge.expires_at.toISOString(),
      });
    }

    const session = await createSession(result.user.id, req.ip, req.get("user-agent"), !!remember);
    if (!session) {
      if (AUTH_DEBUG) console.log("[auth-debug] login: session creation failed", { userId: result.user.id });
      return res.status(500).json({ error: "Failed to create session" });
    }

    if (AUTH_DEBUG) console.log("[auth-debug] login: session created", { sid: session.sid.slice(0, 8) + "…", userId: result.user.id });

    setSessionCookie(res, session.sid, !!remember, req);

    // Fetch fresh user data; use login result as fallback if DB hiccups
    let fresh;
    try {
      fresh = await getUserById(result.user.id);
    } catch (err) {
      if (AUTH_DEBUG) console.log("[auth-debug] login: getUserById failed after cookie set, using login result", err.message);
      fresh = result.user;
    }

    if (AUTH_DEBUG) {
      const setCookieHeader = res.getHeader("Set-Cookie");
      console.log("[auth-debug] login: responding 200", {
        userId: result.user.id,
        setCookiePresent: !!setCookieHeader,
        setCookieCount: Array.isArray(setCookieHeader) ? setCookieHeader.length : (setCookieHeader ? 1 : 0),
      });
    }
    return res.json({ user: safeUser(fresh) });
  }
);

// POST /api/auth/register
router.post("/register", registerRateLimit, async (req, res) => {
  if (!isRegistrationEnabled()) {
    return res.status(403).json({ error: "Registration is currently disabled", errorCode: "REGISTRATION_DISABLED" });
  }

  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  // Get client IP correctly
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;

  const { username, password, nickname, email } = req.body || {};
  const result = await registerUser({ username, password, nickname, email, ip });

  if (result.error) {
    return res.status(400).json({ error: result.error, errorCode: result.errorCode });
  }

  // If email verification is required, don't create session
  // User needs to verify email before logging in
  if (result.emailVerificationRequired && isEmailVerificationRequired()) {
    return res.json({
      user: result.user,
      emailVerificationRequired: true,
      message: "Please check your email to verify your account"
    });
  }

  // Auto-login after registration (only if email service not configured)
  const session = await createSession(result.user.id, ip, req.get("user-agent"), true);
  if (session) {
    setSessionCookie(res, session.sid, true, req);
  }

  return res.json({ user: result.user });
});

// GET /api/auth/registration-status
router.get("/registration-status", (req, res) => {
  return res.json({ enabled: isRegistrationEnabled() });
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL VERIFICATION ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/email-service-status
router.get("/email-service-status", (req, res) => {
  return res.json({ enabled: isEmailServiceEnabled() });
});

// POST /api/auth/verify-email - Verify email with token
router.post("/verify-email", loginRateLimit, async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "Token required" });

  const result = await verifyEmail(token);
  if (result.error) {
    return res.status(400).json({ error: result.error, errorCode: result.errorCode });
  }

  return res.json({ ok: true, alreadyVerified: result.alreadyVerified });
});

// POST /api/auth/resend-verification - Resend verification email
router.post("/resend-verification", loginRateLimit, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "User ID required" });

  const result = await resendVerificationEmail(userId);
  if (result.error) {
    return res.status(400).json({ error: result.error, errorCode: result.errorCode });
  }

  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD RESET ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/forgot-password - Request password reset
router.post("/forgot-password", loginRateLimit, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
  const ua = req.get("user-agent") || null;

  const result = await requestPasswordReset(email, ip, ua);

  // Always return success to prevent email enumeration
  return res.json({ ok: true, message: "If this email exists, a reset link has been sent" });
});

// POST /api/auth/validate-reset-token - Check if reset token is valid
router.post("/validate-reset-token", loginRateLimit, async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "Token required" });

  const result = await validatePasswordResetToken(token);
  if (!result.valid) {
    return res.status(400).json({ error: result.error, errorCode: result.errorCode });
  }

  return res.json({ valid: true, username: result.username });
});

// POST /api/auth/reset-password - Reset password with token
router.post("/reset-password", loginRateLimit, async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: "Token and new password required" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
  const ua = req.get("user-agent") || null;

  const result = await resetPasswordWithToken(token, newPassword, ip, ua);
  if (result.error) {
    return res.status(400).json({ error: result.error, errorCode: result.errorCode });
  }

  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CHANGE ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/request-email-change - Request email change (authenticated)
router.post("/request-email-change", requireAuth, loginRateLimit, async (req, res) => {
  const { newEmail, password } = req.body || {};
  if (!newEmail || !password) return res.status(400).json({ error: "New email and password required" });

  const result = await requestEmailChange(req.session.userId, newEmail, password);
  if (result.error) {
    return res.status(400).json({ error: result.error, errorCode: result.errorCode });
  }

  return res.json({ ok: true, message: "Confirmation email sent to new address" });
});

// POST /api/auth/confirm-email-change - Confirm email change with token
router.post("/confirm-email-change", loginRateLimit, async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "Token required" });

  const result = await confirmEmailChange(token);
  if (result.error) {
    return res.status(400).json({ error: result.error, errorCode: result.errorCode });
  }

  return res.json({ ok: true, newEmail: result.newEmail });
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  const userId = req.session?.userId;
  try {
    if (req.session?.sid) {
      await revokeSession(req.session.sid);
    }
  } catch {}
  // Best-effort: drop any in-flight chunked sync sessions so the user's
  // sync_state_sessions/sync_state_chunks rows don't linger until the
  // 30-min TTL kicks in. Fire-and-forget to keep logout latency low.
  if (userId) {
    const pool = getPool();
    if (pool) {
      pool.query("DELETE FROM sync_state_chunks WHERE user_id = $1", [userId]).catch(() => {});
      pool.query("DELETE FROM sync_state_sessions WHERE user_id = $1", [userId]).catch(() => {});
    }
  }
  clearSessionCookie(res, req);
  return res.json({ ok: true });
});

// POST /api/auth/change-password
router.post("/change-password", requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: "Old and new passwords required" });

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
  const ua = req.get("user-agent") || null;

  const result = await changePasswordWithNotification(req.session.userId, oldPassword, newPassword, {
    ip,
    ua,
    currentSid: req.session?.sid || null,
  });
  if (result.error) {
    return res.status(result.error === "Current password is wrong" ? 401 : 400).json({ error: result.error });
  }

  return res.json({ ok: true });
});

// POST /api/auth/verify-password
router.post("/verify-password", requireAuth, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Password required" });

  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  const q = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.session.userId]);
  const u = q.rows?.[0];
  if (!u) return res.status(404).json({ error: "User not found" });

  const bcrypt = await import("bcryptjs");
  const ok = await bcrypt.compare(String(password), u.password_hash);
  if (!ok) return res.status(401).json({ error: "Password is wrong" });
  return res.json({ ok: true });
});

// PATCH /api/auth/display-name - Update display name with cooldown check
router.patch("/display-name", requireAuth, loginRateLimit, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  const { displayName } = req.body || {};

  // Validation
  if (displayName === undefined || displayName === null) {
    return res.status(400).json({ error: "Display name is required" });
  }

  const trimmed = String(displayName).trim();

  // Allow empty string to clear display name
  if (trimmed !== "") {
    // Length validation
    if (trimmed.length < 2) {
      return res.status(400).json({ error: "Display name must be at least 2 characters" });
    }
    if (trimmed.length > 30) {
      return res.status(400).json({ error: "Display name must be at most 30 characters" });
    }

    // Character validation - allow letters, numbers, spaces, hyphen, underscore
    // Allow any Unicode letters (Cyrillic, Latin, etc.)
    const validPattern = /^[\p{L}\p{N}\s\-_]+$/u;
    if (!validPattern.test(trimmed)) {
      return res.status(400).json({ error: "Display name can only contain letters, numbers, spaces, hyphens, and underscores" });
    }
  }

  try {
    // Get current user data
    const userQuery = await pool.query(
      "SELECT display_name_changed_at FROM users WHERE id = $1",
      [req.session.userId]
    );
    const user = userQuery.rows?.[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check cooldown (7 days)
    if (user.display_name_changed_at) {
      const lastChange = new Date(user.display_name_changed_at);
      const now = new Date();
      const daysSinceChange = (now - lastChange) / (1000 * 60 * 60 * 24);

      if (daysSinceChange < DISPLAY_NAME_COOLDOWN_DAYS) {
        const daysRemaining = Math.ceil(DISPLAY_NAME_COOLDOWN_DAYS - daysSinceChange);
        return res.status(429).json({
          error: "Display name can only be changed once every 7 days",
          days_remaining: daysRemaining,
        });
      }
    }

    // Update display name
    const updateResult = await pool.query(
      `UPDATE users
       SET display_name = $1, display_name_changed_at = now(), updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [trimmed || null, req.session.userId]
    );

    const updatedUser = updateResult.rows?.[0];
    if (!updatedUser) {
      return res.status(500).json({ error: "Failed to update display name" });
    }

    return res.json({
      ok: true,
      user: safeUser(updatedUser),
    });
  } catch (error) {

    console.error("[auth] display-name update error:", error?.message || error);
    return res.status(500).json({ error: "Failed to update display name" });
  }
});

// PATCH /api/auth/username - Update username with cooldown check
router.patch("/username", requireAuth, loginRateLimit, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  const { username } = req.body || {};

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const trimmed = String(username).trim().toLowerCase();

  if (trimmed.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (trimmed.length > 20) {
    return res.status(400).json({ error: "Username must be at most 20 characters" });
  }
  if (!/^[a-z0-9_]+$/.test(trimmed)) {
    return res.status(400).json({ error: "Username can only contain lowercase letters, numbers, and underscores" });
  }

  try {
    // Check if username already exists (case-insensitive)
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE username = $1 AND id != $2",
      [trimmed, req.session.userId]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }

    // Get current user data for cooldown check
    const userQuery = await pool.query(
      "SELECT username_changed_at FROM users WHERE id = $1",
      [req.session.userId]
    );
    const user = userQuery.rows?.[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check cooldown (30 days)
    if (user.username_changed_at) {
      const lastChange = new Date(user.username_changed_at);
      const now = new Date();
      const daysSinceChange = (now - lastChange) / (1000 * 60 * 60 * 24);

      if (daysSinceChange < USERNAME_COOLDOWN_DAYS) {
        const daysRemaining = Math.ceil(USERNAME_COOLDOWN_DAYS - daysSinceChange);
        return res.status(429).json({
          error: "Username can only be changed once every 30 days",
          days_remaining: daysRemaining,
        });
      }
    }

    // Update username
    const updateResult = await pool.query(
      `UPDATE users
       SET username = $1, username_changed_at = now(), updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [trimmed, req.session.userId]
    );

    const updatedUser = updateResult.rows?.[0];
    if (!updatedUser) {
      return res.status(500).json({ error: "Failed to update username" });
    }

    return res.json({
      ok: true,
      user: safeUser(updatedUser),
    });
  } catch (error) {

    console.error("[auth] username update error:", error?.message || error);
    return res.status(500).json({ error: "Failed to update username" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2FA ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/2fa/verify-login - Verify 2FA code and complete login
router.post("/2fa/verify-login", twoFactorRateLimit, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  const { ticket, code } = req.body || {};
  if (!ticket || !code) {
    return res.status(400).json({ error: "Ticket and code required" });
  }

  // Verify and consume the login challenge
  const challenge = await verifyLoginChallenge(ticket);
  if (!challenge) {
    return res.status(401).json({ error: "Invalid or expired ticket" });
  }

  // Verify TOTP or backup code
  const result = await verifyUserTotp(challenge.user_id, code);
  if (!result.valid) {
    return res.status(401).json({ error: "Invalid 2FA code" });
  }

  // Create session
  const session = await createSession(challenge.user_id, req.ip, req.get("user-agent"), challenge.remember);
  if (!session) {
    if (AUTH_DEBUG) console.log("[auth-debug] 2fa-login: session creation failed", { userId: challenge.user_id });
    return res.status(500).json({ error: "Failed to create session" });
  }

  if (AUTH_DEBUG) console.log("[auth-debug] 2fa-login: session created", { sid: session.sid.slice(0, 8) + "…", userId: challenge.user_id });

  setSessionCookie(res, session.sid, challenge.remember, req);

  let fresh;
  try {
    fresh = await getUserById(challenge.user_id);
  } catch (err) {
    if (AUTH_DEBUG) console.log("[auth-debug] 2fa-login: getUserById failed after cookie set", err.message);
    // No user object available as fallback (unlike regular login);
    // cookie is already set so frontend refresh() will resolve the user.
    fresh = null;
  }

  if (AUTH_DEBUG) {
    const setCookieHeader = res.getHeader("Set-Cookie");
    console.log("[auth-debug] 2fa-login: responding 200", {
      userId: challenge.user_id,
      setCookiePresent: !!setCookieHeader,
      setCookieCount: Array.isArray(setCookieHeader) ? setCookieHeader.length : (setCookieHeader ? 1 : 0),
    });
  }
  return res.json({ user: fresh ? safeUser(fresh) : null });
});

// POST /api/auth/2fa/setup - Generate pending secret and return QR code
router.post("/2fa/setup", requireAuth, loginRateLimit, async (req, res) => {
  const result = await setupTotp(req.session.userId);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

// POST /api/auth/2fa/enable - Verify code and enable 2FA
router.post("/2fa/enable", requireAuth, loginRateLimit, async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: "Verification code required" });
  }

  const result = await enableTotp(req.session.userId, code);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ ok: true, backup_codes: result.backup_codes });
});

// POST /api/auth/2fa/disable - Disable 2FA (requires password + code)
router.post("/2fa/disable", requireAuth, twoFactorRateLimit, async (req, res) => {
  const { password, code } = req.body || {};
  if (!password || !code) {
    return res.status(400).json({ error: "Password and 2FA code required" });
  }

  const result = await disableTotp(req.session.userId, password, code);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ ok: true });
});

// Sessions management
router.get("/sessions", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  try {
    // Get unique sessions - use DISTINCT ON to keep only the most recent session per (ip, ua) combo
    const r = await pool.query(
      `SELECT DISTINCT ON (COALESCE(ip, ''), COALESCE(ua, ''))
         sid, created_at, last_seen_at, ip, ua, expires_at
       FROM sessions
       WHERE user_id = $1 AND revoked = false
       ORDER BY COALESCE(ip, ''), COALESCE(ua, ''), last_seen_at DESC NULLS LAST`,
      [req.session.userId]
    );
    const sessions = (r.rows || []).map((s) => ({
      sid: s.sid,
      is_current: s.sid === req.sessionID,
      created_at: s.created_at ? new Date(s.created_at).toISOString() : null,
      last_seen_at: s.last_seen_at ? new Date(s.last_seen_at).toISOString() : null,
      ip: s.ip,
      ua: s.ua,
      expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : null,
    }));
    // Sort by last_seen_at descending for display
    sessions.sort((a, b) => {
      const aTime = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const bTime = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return bTime - aTime;
    });
    return res.json({ sessions });
  } catch (error) {
    console.error("[auth] sessions list error:", error?.message || error);
    return res.status(500).json({ error: "Failed to load sessions" });
  }
});

router.delete("/sessions/:sid", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  const sid = String(req.params.sid || "");
  if (!sid || sid.length < 8 || sid.length > 200) return res.status(400).json({ error: "Bad sid" });

  try {
    const own = await pool.query(
      "SELECT sid FROM sessions WHERE sid = $1 AND user_id = $2 AND revoked = false",
      [sid, req.session.userId]
    );
    if ((own.rows || []).length === 0) return res.status(404).json({ error: "Not found" });

    await revokeSession(sid);

    if (sid === req.sessionID) {
      clearSessionCookie(res, req);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("[auth] session delete error:", error?.message || error);
    return res.status(500).json({ error: "Failed to revoke session" });
  }
});

router.post("/sessions/logout-others", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  try {
    const r = await pool.query(
      "UPDATE sessions SET revoked = true WHERE user_id = $1 AND sid <> $2 AND revoked = false",
      [req.session.userId, req.sessionID]
    );
    return res.json({ ok: true, removed: r.rowCount || 0 });
  } catch (error) {
    console.error("[auth] logout-others error:", error?.message || error);
    return res.status(500).json({ error: "Failed to logout other devices" });
  }
});

router.post("/sessions/logout-all", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  try {
    const r = await pool.query(
      "UPDATE sessions SET revoked = true WHERE user_id = $1 AND revoked = false",
      [req.session.userId]
    );
    clearSessionCookie(res, req);
    return res.json({ ok: true, removed: r.rowCount || 0 });
  } catch (error) {
    console.error("[auth] logout-all error:", error?.message || error);
    return res.status(500).json({ error: "Failed to logout all devices" });
  }
});

// Google OAuth
router.get("/google/start", loginRateLimit, (req, res) => {
  const config = checkGoogleOAuthConfig();
  if (!config.available) {

    console.warn("[google/start] OAuth not configured - missing:", config.missing.join(", "));
    return res.status(501).json({
      ok: false,
      error: "GOOGLE_OAUTH_ENV_MISSING",
      details: `Missing env vars: ${config.missing.join(", ")}`
    });
  }

  // Generate CSRF state
  const state = crypto.randomBytes(16).toString("hex");
  const stateCookie = makeCookie("oauth_state", state, {
    path: "/",
    domain: getCookieDomain(),
    httpOnly: true,
    sameSite: "Lax",
    secure: IS_PROD,
    maxAge: 600, // 10 minutes
  });
  appendSetCookie(res, stateCookie);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URL,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/google/callback", loginRateLimit, async (req, res) => {
  const { code, state, error: googleError, error_description } = req.query;

  // Handle Google OAuth errors (e.g., user denied access)
  if (googleError) {

    console.warn("[google/callback] Google returned error:", googleError, error_description);
    return res.redirect(`/login?error=google_denied&reason=${encodeURIComponent(error_description || googleError)}`);
  }

  const config = checkGoogleOAuthConfig();
  if (!config.available) {

    console.warn("[google/callback] OAuth not configured - missing:", config.missing.join(", "));
    return res.redirect("/login?error=oauth_not_configured");
  }

  // Verify CSRF state
  const cookies = parseCookies(req);
  const savedState = cookies.oauth_state;
  if (!savedState || savedState !== state) {

    console.warn("[google/callback] Invalid state - saved:", !!savedState, "matches:", savedState === state);
    return res.redirect("/login?error=invalid_state");
  }

  // Clear state cookie
  const clearState = makeCookie("oauth_state", "", {
    path: "/",
    domain: getCookieDomain(),
    httpOnly: true,
    sameSite: "Lax",
    secure: IS_PROD,
    maxAge: 0,
  });
  appendSetCookie(res, clearState);

  if (!code) {

    console.warn("[google/callback] No authorization code received");
    return res.redirect("/login?error=no_code");
  }

  try {
    // Ensure DB is available before proceeding
    let pool = getPool();
    if (!pool) {
      try { pool = await ensurePool(); } catch { /* retry failed */ }
    }
    if (!pool) {

      console.error("[google/callback] DB unavailable");
      return res.redirect("/login?error=db_unavailable");
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URL,
        grant_type: "authorization_code",
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {

      console.error("[google/callback] Token exchange failed:", tokenRes.status, tokenData);

      // Check for redirect_uri_mismatch specifically
      if (tokenData.error === "redirect_uri_mismatch") {
        return res.redirect("/login?error=redirect_uri_mismatch");
      }
      if (tokenData.error === "invalid_grant") {
        return res.redirect("/login?error=invalid_grant");
      }
      return res.redirect("/login?error=token_exchange_failed");
    }

    // Get user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {

      console.error("[google/callback] User info fetch failed:", userInfoRes.status);
      return res.redirect("/login?error=userinfo_failed");
    }

    const userInfo = await userInfoRes.json();

    // Find or create user
    const result = await findOrCreateGoogleUser({
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
    });

    if (result.error) {

      console.error("[google/callback] findOrCreateGoogleUser error:", result.error);
      if (result.error === DB_UNAVAILABLE_MSG) {
        return res.redirect("/login?error=db_unavailable");
      }
      return res.redirect(`/login?error=${encodeURIComponent(result.error)}`);
    }

    // Check if user has 2FA enabled
    const has2fa = await hasTotpEnabled(result.user.id);
    if (has2fa) {
      // Create a login challenge ticket for 2FA
      const challenge = await createLoginChallenge(result.user.id, true);
      if (!challenge) {

        console.error("[google/callback] Failed to create 2FA challenge for user:", result.user.id);
        return res.redirect("/login?error=2fa_challenge_failed");
      }
      // Redirect to login page with 2FA ticket
      return res.redirect(`/login?twofa=1&ticket=${encodeURIComponent(challenge.id)}`);
    }

    // Create session
    const session = await createSession(result.user.id, req.ip, req.get("user-agent"), true);
    if (!session) {

      console.error("[google/callback] Session creation failed for user:", result.user.id);
      return res.redirect("/login?error=session_failed");
    }

    setSessionCookie(res, session.sid, true, req);

    console.info("[google/callback] Success - user:", result.user.id, "email:", userInfo.email);
    return res.redirect("/?login=google");

  } catch (e) {

    console.error("[google/callback] Unexpected error:", e?.message || e);
    return res.redirect("/login?error=oauth_error");
  }
});

// Check if Google OAuth is available
router.get("/google/status", loginRateLimit, async (req, res) => {
  const config = checkGoogleOAuthConfig();
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }

  // Log configuration status for debugging (only if unavailable)
  if (!config.available) {

    console.info(`[auth] Google OAuth disabled - missing env vars: ${config.missing.join(", ")}`);
  }

  return res.json({
    available: config.available,
    dbReady: !!pool,
  });
});

// DELETE /api/auth/me — permanently delete the caller's account.
// Cascades through users → states / sessions / wallets / categories / etc.
// thanks to ON DELETE CASCADE on every user_id FK in db.js.
router.delete("/me", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const userId = req.session.userId;
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    // Belt & braces: explicitly clear the cookie so the browser stops
    // sending a SID that no longer exists in sessions.
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${IS_PROD ? "; Secure" : ""}`
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error("[auth] account delete error:", error?.message || error);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
