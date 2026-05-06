import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getPool, getUserByUsername, getUserByEmail, getUserByGoogleId, safeUser, DB_UNAVAILABLE_MSG } from "./db.service.js";
import { validateUsername, validatePassword, validateEmail } from "../utils/validators.js";
import { logAdmin } from "./audit.service.js";
import { 
  sendVerificationEmail, 
  sendPasswordResetEmail, 
  sendPasswordChangedEmail,
  sendEmailChangeConfirmation,
  sendEmailChangeNotification,
  sendEmailChangedNotification,
  isEmailServiceEnabled 
} from "./email.service.js";

// Token expiration times
const EMAIL_VERIFY_TOKEN_EXPIRY_HOURS = 24;
const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;

// Cost factor for newly-created bcrypt hashes. Existing hashes (cost 12)
// keep working; loginUser opportunistically rehashes them on the next
// successful login so the migration is invisible to users.
const BCRYPT_COST = 14;
const LEGACY_BCRYPT_COSTS = new Set([10, 11, 12, 13]);

// Detect the cost embedded in a bcrypt hash. Returns null if not a bcrypt hash.
function bcryptCostOf(hash) {
  if (typeof hash !== "string") return null;
  const m = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  if (!m) return null;
  return parseInt(m[1], 10);
}

// Dummy bcrypt hash used to equalize login timing for non-existent users.
// Generated once at module load with the same cost factor used by the real
// password hashing path.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(
  "dummy-password-for-timing-equalization",
  BCRYPT_COST
);

// Registration is ENABLED by default (set to "0" to disable)
const PUBLIC_REGISTRATION_ENV = process.env.PUBLIC_REGISTRATION !== "0";

// Runtime override for registration setting (null = use env value)
let registrationOverride = null;

export function setRegistrationEnabled(enabled) {
  registrationOverride = enabled === null ? null : !!enabled;
}

export function isRegistrationEnabled() {
  return registrationOverride !== null ? registrationOverride : PUBLIC_REGISTRATION_ENV;
}

export async function registerUser({ username, password, nickname, email, ip }) {
  if (!isRegistrationEnabled()) {
    return { error: "REGISTRATION_DISABLED", errorCode: "REGISTRATION_DISABLED" };
  }

  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  // Validate username
  const usernameCheck = validateUsername(username);
  if (!usernameCheck.valid) {
    return { error: usernameCheck.error, errorCode: usernameCheck.errorCode, field: "username" };
  }

  // Validate password
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) {
    return { error: passwordCheck.error, errorCode: passwordCheck.errorCode, field: "password" };
  }

  // Validate email (required for registration)
  const emailCheck = validateEmail(email, { required: true });
  if (!emailCheck.valid) {
    return { error: emailCheck.error, errorCode: emailCheck.errorCode, field: "email" };
  }

  // Check if username exists
  const existingUser = await getUserByUsername(usernameCheck.normalized);
  if (existingUser) {
    return { error: "Username already exists", errorCode: "USERNAME_EXISTS", field: "username" };
  }

  // Check if email exists
  if (emailCheck.normalized) {
    const existingEmail = await getUserByEmail(emailCheck.normalized);
    if (existingEmail) {
      return { error: "Email already registered", errorCode: "EMAIL_EXISTS", field: "email" };
    }
  }

  // Generate email verification token
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyTokenExpiresAt = new Date(Date.now() + EMAIL_VERIFY_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Create user with created_ip and email verification token
  const hash = await bcrypt.hash(String(password), BCRYPT_COST);
  const r = await pool.query(
    `INSERT INTO users (
      username, nickname, password_hash, role, email, is_disabled, created_ip, 
      email_verified, email_verify_token, email_verify_token_expires_at,
      created_at, updated_at
    )
     VALUES ($1, $2, $3, 'user', $4, false, $5, false, $6, $7, now(), now())
     RETURNING id, username, nickname, role, role_color, is_disabled, email, email_verified`,
    [usernameCheck.normalized, nickname || null, hash, emailCheck.normalized, ip || null, verifyToken, verifyTokenExpiresAt.toISOString()]
  );

  const user = r.rows?.[0];
  
  // Send verification email (don't fail registration if email fails)
  try {
    await sendVerificationEmail(emailCheck.normalized, verifyToken, user?.nickname || user?.username);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[auth] Failed to send verification email:", e?.message || e);
  }
  
  // Log registration
  try {
    await logAdmin(null, "auth.register", user?.id, { ip, username: usernameCheck.normalized });
  } catch {}
  
  return { user: safeUser(user), emailVerificationRequired: true };
}

export async function loginUser({ username, password }) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable", status: 503 };

  // Support login by username OR email
  // If identifier contains "@", treat as email, otherwise as username
  const identifier = String(username || "").trim().toLowerCase();
  if (!identifier) {
    return { error: "Invalid credentials", status: 401 };
  }
  
  let u;
  if (identifier.includes("@")) {
    // Login by email
    u = await getUserByEmail(identifier);
  } else {
    // Login by username
    u = await getUserByUsername(identifier);
  }
  
  if (!u) {
    await bcrypt.compare(String(password), DUMMY_BCRYPT_HASH);
    return { error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS", status: 401 };
  }

  if (u.is_disabled) {
    return { error: "Account disabled", errorCode: "ACCOUNT_DISABLED", status: 403, reason: u.disabled_reason };
  }

  if (u.disabled_until && new Date(u.disabled_until) > new Date()) {
    return {
      error: "Account temporarily suspended",
      errorCode: "ACCOUNT_SUSPENDED",
      status: 403,
      until: u.disabled_until,
    };
  }

  const ok = await bcrypt.compare(String(password), u.password_hash);
  if (!ok) {
    return { error: "Invalid credentials", errorCode: "INVALID_CREDENTIALS", status: 401 };
  }

  // Opportunistic rehash: if the stored hash uses a legacy (lower) cost,
  // upgrade it to BCRYPT_COST while we have the plaintext password.
  // Fire-and-forget so a slow rehash doesn't delay the login response.
  const storedCost = bcryptCostOf(u.password_hash);
  if (storedCost !== null && storedCost < BCRYPT_COST && LEGACY_BCRYPT_COSTS.has(storedCost)) {
    bcrypt.hash(String(password), BCRYPT_COST)
      .then((newHash) =>
        pool.query(
          `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 AND password_hash = $3`,
          [newHash, u.id, u.password_hash]
        )
      )
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.warn("[auth] opportunistic rehash failed:", e?.message || e);
      });
  }

  // Check if email is verified (only if email service is enabled)
  // Users created before email verification feature are grandfathered in
  if (isEmailServiceEnabled() && u.email && u.email_verified === false) {
    return { 
      error: "Email not verified", 
      status: 403, 
      errorCode: "EMAIL_NOT_VERIFIED",
      email: u.email,
      userId: u.id
    };
  }

  return { user: u };
}

export async function createSession(userId, ip, ua, remember = false) {
  const pool = getPool();
  if (!pool) return null;

  const sid = crypto.randomUUID();
  const now = new Date();
  const ttlMs = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24; // 30d or 1d
  const expiresAt = new Date(now.getTime() + ttlMs);

  await pool.query(
    "INSERT INTO sessions (sid, user_id, ip, ua, expires_at) VALUES ($1,$2,$3,$4,$5)",
    [sid, userId, ip || null, ua || null, expiresAt.toISOString()]
  );

  return { sid, expiresAt, ttlMs };
}

export async function revokeSession(sid) {
  const pool = getPool();
  if (!pool) return false;
  await pool.query("UPDATE sessions SET revoked = true WHERE sid = $1", [sid]);
  return true;
}

export async function changePassword(userId, oldPassword, newPassword) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const passwordCheck = validatePassword(newPassword);
  if (!passwordCheck.valid) {
    return { error: passwordCheck.error };
  }

  const q = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  const u = q.rows?.[0];
  if (!u) return { error: "User not found" };

  const ok = await bcrypt.compare(String(oldPassword), u.password_hash);
  if (!ok) return { error: "Current password is wrong" };

  const hash = await bcrypt.hash(String(newPassword), BCRYPT_COST);
  await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, userId]);
  return { ok: true };
}

// Google OAuth helpers
export async function findOrCreateGoogleUser({ googleId, email, name }) {
  const pool = getPool();
  if (!pool) return { error: DB_UNAVAILABLE_MSG };

  // First, try to find by google_id
  let user = await getUserByGoogleId(googleId);
  if (user) {
    return { user: safeUser(user) };
  }

  // Then try to find by email and link google account
  if (email) {
    user = await getUserByEmail(email);
    if (user) {
      // Link google account to existing user
      await pool.query(
        "UPDATE users SET google_id = $1, updated_at = now() WHERE id = $2",
        [googleId, user.id]
      );
      return { user: safeUser(user) };
    }
  }

  // Create new user
  const username = await generateUniqueUsername(email || name || "user");
  const randomPassword = crypto.randomBytes(32).toString("hex");
  const hash = await bcrypt.hash(randomPassword, BCRYPT_COST);

  const r = await pool.query(
    `INSERT INTO users (username, nickname, password_hash, role, email, google_id, is_disabled, created_at, updated_at)
     VALUES ($1, $2, $3, 'user', $4, $5, false, now(), now())
     RETURNING id, username, nickname, role, role_color, is_disabled, email`,
    [username, name || null, hash, email || null, googleId]
  );

  return { user: safeUser(r.rows?.[0]) };
}

async function generateUniqueUsername(base) {
  const pool = getPool();
  const sanitized = String(base)
    .toLowerCase()
    .split("@")[0]
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 20) || "user";

  let username = sanitized;
  let counter = 0;
  
  while (true) {
    const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (!existing.rows?.length) break;
    counter++;
    username = `${sanitized}${counter}`;
    if (counter > 9999) {
      username = `${sanitized}_${crypto.randomBytes(4).toString("hex")}`;
      break;
    }
  }
  
  return username;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify email with token
 * @param {string} token - Verification token
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function verifyEmail(token) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  if (!token || typeof token !== "string" || token.length < 16) {
    return { error: "Invalid token", errorCode: "INVALID_TOKEN" };
  }

  // Find user with this token
  const q = await pool.query(
    `SELECT id, email, email_verified, email_verify_token_expires_at 
     FROM users WHERE email_verify_token = $1`,
    [token]
  );
  
  const user = q.rows?.[0];
  if (!user) {
    return { error: "Invalid or expired token", errorCode: "TOKEN_INVALID" };
  }

  // Check if already verified
  if (user.email_verified) {
    return { ok: true, alreadyVerified: true };
  }

  // Check expiration
  if (user.email_verify_token_expires_at && new Date(user.email_verify_token_expires_at) < new Date()) {
    return { error: "Token expired", errorCode: "TOKEN_EXPIRED" };
  }

  // Mark email as verified
  await pool.query(
    `UPDATE users SET 
       email_verified = true, 
       email_verified_at = now(),
       email_verify_token = NULL,
       email_verify_token_expires_at = NULL,
       updated_at = now()
     WHERE id = $1`,
    [user.id]
  );

  // Log verification
  try {
    await logAdmin(null, "auth.email_verified", user.id, { email: user.email });
  } catch {}

  return { ok: true };
}

/**
 * Resend verification email
 * @param {number} userId - User ID
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
// Minimum interval between resend-verification emails for the same userId.
// Without this, /resend-verification accepts a sequential userId in the body
// and can be used to spam any user's inbox at the per-IP login rate limit.
const RESEND_VERIFICATION_COOLDOWN_MS = 60 * 1000;

export async function resendVerificationEmail(userId) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const q = await pool.query(
    `SELECT id, email, email_verified, username, nickname,
            email_verify_token_expires_at
     FROM users WHERE id = $1`,
    [userId]
  );

  const user = q.rows?.[0];
  if (!user) {
    return { error: "User not found" };
  }

  if (user.email_verified) {
    return { error: "Email already verified", errorCode: "ALREADY_VERIFIED" };
  }

  if (!user.email) {
    return { error: "No email address", errorCode: "NO_EMAIL" };
  }

  // Per-user cooldown. The token expiry is EMAIL_VERIFY_TOKEN_EXPIRY_HOURS
  // hours; if the existing token was issued less than the cooldown ago, we
  // refuse to re-issue/re-send.
  if (user.email_verify_token_expires_at) {
    const issuedAtMs =
      new Date(user.email_verify_token_expires_at).getTime() -
      EMAIL_VERIFY_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
    const sinceLastMs = Date.now() - issuedAtMs;
    if (sinceLastMs >= 0 && sinceLastMs < RESEND_VERIFICATION_COOLDOWN_MS) {
      return {
        error: "Please wait a moment before requesting another email.",
        errorCode: "RESEND_COOLDOWN",
      };
    }
  }

  // Generate new token
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyTokenExpiresAt = new Date(Date.now() + EMAIL_VERIFY_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await pool.query(
    `UPDATE users SET
       email_verify_token = $1,
       email_verify_token_expires_at = $2,
       updated_at = now()
     WHERE id = $3`,
    [verifyToken, verifyTokenExpiresAt.toISOString(), userId]
  );

  // Send email
  const result = await sendVerificationEmail(user.email, verifyToken, user.nickname || user.username);
  
  if (result?.error) {
    return { error: "Failed to send email", errorCode: "EMAIL_SEND_FAILED" };
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD RESET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request password reset (send email with token)
 * @param {string} email - User's email
 * @param {string} ip - Client IP
 * @param {string} ua - User agent
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function requestPasswordReset(email, ip, ua) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const emailCheck = validateEmail(email, { required: true });
  if (!emailCheck.valid) {
    // Don't reveal if email exists - always return success
    return { ok: true };
  }

  const user = await getUserByEmail(emailCheck.normalized);
  
  // Don't reveal if email exists
  if (!user) {
    return { ok: true };
  }

  // Check if user is disabled
  if (user.is_disabled) {
    return { ok: true }; // Don't reveal
  }

  // Generate reset token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Store reset token
  await pool.query(
    `INSERT INTO password_resets (user_id, token, expires_at, ip, ua)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, token, expiresAt.toISOString(), ip || null, ua || null]
  );

  // Send email
  try {
    await sendPasswordResetEmail(user.email, token, user.nickname || user.username);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[auth] Failed to send password reset email:", e?.message || e);
  }

  // Log request
  try {
    await logAdmin(null, "auth.password_reset_requested", user.id, { ip, email: user.email });
  } catch {}

  return { ok: true };
}

/**
 * Validate password reset token
 * @param {string} token - Reset token
 * @returns {Promise<{ valid: boolean, userId?: number, error?: string }>}
 */
export async function validatePasswordResetToken(token) {
  const pool = getPool();
  if (!pool) return { valid: false, error: "Database unavailable" };

  if (!token || typeof token !== "string" || token.length < 16) {
    return { valid: false, error: "Invalid token" };
  }

  const q = await pool.query(
    `SELECT pr.id, pr.user_id, pr.expires_at, pr.used_at, u.username
     FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.token = $1`,
    [token]
  );

  const reset = q.rows?.[0];
  if (!reset) {
    return { valid: false, error: "Invalid token", errorCode: "TOKEN_INVALID" };
  }

  if (reset.used_at) {
    return { valid: false, error: "Token already used", errorCode: "TOKEN_USED" };
  }

  if (new Date(reset.expires_at) < new Date()) {
    return { valid: false, error: "Token expired", errorCode: "TOKEN_EXPIRED" };
  }

  return { valid: true, userId: reset.user_id, username: reset.username };
}

/**
 * Reset password with token
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 * @param {string} ip - Client IP
 * @param {string} ua - User agent
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function resetPasswordWithToken(token, newPassword, ip, ua) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  if (!token || typeof token !== "string" || token.length < 16) {
    return { error: "Invalid token", errorCode: "TOKEN_INVALID" };
  }

  // Validate new password before consuming token
  const passwordCheck = validatePassword(newPassword);
  if (!passwordCheck.valid) {
    return { error: passwordCheck.error };
  }

  // Hash new password
  const hash = await bcrypt.hash(String(newPassword), BCRYPT_COST);

  // Atomically claim the token: only consume if unused and not expired.
  // Prevents race where a stolen token is reused between validate + update.
  const claim = await pool.query(
    `UPDATE password_resets
       SET used_at = now()
     WHERE token = $1
       AND used_at IS NULL
       AND expires_at > now()
     RETURNING id, user_id, expires_at`,
    [token]
  );
  const reset = claim.rows?.[0];
  if (!reset) {
    // Distinguish error reason for UX
    const probe = await pool.query(
      `SELECT used_at, expires_at FROM password_resets WHERE token = $1`,
      [token]
    );
    const row = probe.rows?.[0];
    if (!row) return { error: "Invalid token", errorCode: "TOKEN_INVALID" };
    if (row.used_at) return { error: "Token already used", errorCode: "TOKEN_USED" };
    return { error: "Token expired", errorCode: "TOKEN_EXPIRED" };
  }
  const userId = reset.user_id;

  // Get user info for email
  const userQ = await pool.query(
    "SELECT id, email, username, nickname FROM users WHERE id = $1",
    [userId]
  );
  const user = userQ.rows?.[0];

  // Update password
  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
    [hash, userId]
  );

  // Invalidate ALL sessions for this user (security measure)
  await pool.query(
    `UPDATE sessions SET revoked = true WHERE user_id = $1`,
    [userId]
  );

  // Send security notification
  if (user?.email) {
    try {
      await sendPasswordChangedEmail(user.email, user.nickname || user.username, { ip, ua, isReset: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[auth] Failed to send password changed notification:", e?.message || e);
    }
  }

  // Log password reset
  try {
    await logAdmin(null, "auth.password_reset_completed", userId, { ip });
  } catch {}

  return { ok: true };
}

/**
 * Change password (authenticated) - with security notification
 * Extended version that sends email notification
 * @param {number} userId - User ID
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @param {object} options - { ip, ua }
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function changePasswordWithNotification(userId, oldPassword, newPassword, options = {}) {
  const result = await changePassword(userId, oldPassword, newPassword);

  if (result.ok) {
    const pool = getPool();
    if (pool) {
      // Invalidate all OTHER active sessions for this user. The current
      // session (options.currentSid) is preserved so the caller stays
      // logged in. Without this, an attacker who briefly captured a
      // session would keep access after the legitimate user changes
      // their password.
      try {
        if (options.currentSid) {
          await pool.query(
            "UPDATE sessions SET revoked = true WHERE user_id = $1 AND sid <> $2 AND revoked = false",
            [userId, options.currentSid]
          );
        } else {
          await pool.query(
            "UPDATE sessions SET revoked = true WHERE user_id = $1 AND revoked = false",
            [userId]
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[auth] Failed to revoke other sessions after password change:", e?.message || e);
      }

      // Get user info for email
      const userQ = await pool.query(
        "SELECT email, username, nickname FROM users WHERE id = $1",
        [userId]
      );
      const user = userQ.rows?.[0];

      // Send security notification
      if (user?.email) {
        try {
          await sendPasswordChangedEmail(user.email, user.nickname || user.username, {
            ip: options.ip,
            ua: options.ua,
            isReset: false
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[auth] Failed to send password changed notification:", e?.message || e);
        }
      }

      // Log password change
      try {
        await logAdmin(userId, "auth.password_changed", userId, { ip: options.ip });
      } catch {}
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CHANGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request email change (sends confirmation to new email, notification to old)
 * @param {number} userId - User ID
 * @param {string} newEmail - New email address
 * @param {string} password - Current password for verification
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function requestEmailChange(userId, newEmail, password) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  // Validate new email
  const emailCheck = validateEmail(newEmail, { required: true });
  if (!emailCheck.valid) {
    return { error: emailCheck.error, errorCode: emailCheck.errorCode };
  }

  // Get current user
  const userQ = await pool.query(
    "SELECT id, email, password_hash, username, nickname FROM users WHERE id = $1",
    [userId]
  );
  const user = userQ.rows?.[0];
  if (!user) return { error: "User not found" };

  // Verify password
  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) return { error: "Invalid password", errorCode: "INVALID_PASSWORD" };

  // Check if new email is same as current
  if (user.email && user.email.toLowerCase() === emailCheck.normalized) {
    return { error: "Same as current email", errorCode: "SAME_EMAIL" };
  }

  // Check if new email is already in use
  const existingUser = await getUserByEmail(emailCheck.normalized);
  if (existingUser && existingUser.id !== userId) {
    return { error: "Email already in use", errorCode: "EMAIL_EXISTS" };
  }

  // Generate confirmation token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Store pending email
  await pool.query(
    `UPDATE users SET 
       pending_email = $1,
       pending_email_token = $2,
       pending_email_token_expires_at = $3,
       updated_at = now()
     WHERE id = $4`,
    [emailCheck.normalized, token, expiresAt.toISOString(), userId]
  );

  // Send confirmation to new email
  try {
    await sendEmailChangeConfirmation(emailCheck.normalized, token, user.nickname || user.username);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[auth] Failed to send email change confirmation:", e?.message || e);
  }

  // Send notification to old email
  if (user.email) {
    try {
      await sendEmailChangeNotification(user.email, emailCheck.normalized, user.nickname || user.username);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[auth] Failed to send email change notification:", e?.message || e);
    }
  }

  // Log request
  try {
    await logAdmin(userId, "auth.email_change_requested", userId, { 
      oldEmail: user.email, 
      newEmail: emailCheck.normalized 
    });
  } catch {}

  return { ok: true };
}

/**
 * Confirm email change with token
 * @param {string} token - Confirmation token
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function confirmEmailChange(token) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  if (!token || typeof token !== "string" || token.length < 16) {
    return { error: "Invalid token", errorCode: "INVALID_TOKEN" };
  }

  // Find user with this pending token
  const q = await pool.query(
    `SELECT id, email, pending_email, pending_email_token_expires_at, username, nickname 
     FROM users WHERE pending_email_token = $1`,
    [token]
  );
  
  const user = q.rows?.[0];
  if (!user) {
    return { error: "Invalid or expired token", errorCode: "TOKEN_INVALID" };
  }

  // Check expiration
  if (user.pending_email_token_expires_at && new Date(user.pending_email_token_expires_at) < new Date()) {
    return { error: "Token expired", errorCode: "TOKEN_EXPIRED" };
  }

  if (!user.pending_email) {
    return { error: "No pending email", errorCode: "NO_PENDING_EMAIL" };
  }

  const oldEmail = user.email;
  const newEmail = user.pending_email;

  // Update email
  await pool.query(
    `UPDATE users SET 
       email = pending_email,
       email_verified = true,
       email_verified_at = now(),
       pending_email = NULL,
       pending_email_token = NULL,
       pending_email_token_expires_at = NULL,
       updated_at = now()
     WHERE id = $1`,
    [user.id]
  );

  // Send notification to old email that change was completed
  if (oldEmail) {
    try {
      await sendEmailChangedNotification(oldEmail, newEmail, user.nickname || user.username);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[auth] Failed to send email changed notification:", e?.message || e);
    }
  }

  // Log change
  try {
    await logAdmin(user.id, "auth.email_changed", user.id, { oldEmail, newEmail });
  } catch {}

  return { ok: true, newEmail };
}
