import crypto from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { getPool, queryWithRecovery, getUserById } from "./db.service.js";

const APP_NAME = "Koshyk";
const IS_PROD = (process.env.NODE_ENV || "development") === "production";

// Get encryption key from environment (base64-encoded 32 bytes for AES-256)
function getEncryptionKey() {
  const keyBase64 = process.env.TOTP_ENCRYPTION_KEY;
  if (!keyBase64) {
    if (IS_PROD) {
      throw new Error("TOTP_ENCRYPTION_KEY env var is required in production");
    }
    return null;
  }
  try {
    const key = Buffer.from(keyBase64, "base64");
    if (key.length !== 32) {
      if (IS_PROD) {
        throw new Error("TOTP_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
      }
      console.warn("[totp] TOTP_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
      return null;
    }
    return key;
  } catch (e) {
    if (IS_PROD) throw e;
    console.warn("[totp] Invalid TOTP_ENCRYPTION_KEY format");
    return null;
  }
}

/**
 * Encrypt a secret using AES-256-GCM
 * Returns format: iv:authTag:ciphertext (all hex-encoded)
 */
function encryptSecret(secret) {
  const key = getEncryptionKey();
  if (!key) {
    // Fallback to plaintext if no encryption key
    return secret;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a secret using AES-256-GCM
 * Expects format: iv:authTag:ciphertext (all hex-encoded)
 * Falls back to returning the value as-is if not encrypted
 */
function decryptSecret(encryptedSecret) {
  if (!encryptedSecret) return null;

  const key = getEncryptionKey();
  if (!key) {
    // Fallback: assume plaintext if no encryption key
    return encryptedSecret;
  }

  const parts = encryptedSecret.split(":");
  if (parts.length !== 3) {
    // Not encrypted format, return as-is (plaintext fallback)
    return encryptedSecret;
  }

  try {
    const [ivHex, authTagHex, ciphertext] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (e) {
    console.error("[totp] Decryption failed:", e?.message);
    return null;
  }
}

/**
 * Generate a new TOTP secret
 */
export function generateSecret() {
  return authenticator.generateSecret();
}

/**
 * Generate otpauth URL for authenticator apps
 */
export function generateOtpauthUrl(secret, userIdentifier) {
  return authenticator.keyuri(userIdentifier, APP_NAME, secret);
}

/**
 * Generate QR code data URL
 */
export async function generateQRCode(otpauthUrl) {
  return QRCode.toDataURL(otpauthUrl, {
    type: "image/png",
    width: 256,
    margin: 2,
  });
}

/**
 * Verify a TOTP code against a secret
 */
export function verifyTotp(secret, token) {
  if (!secret || !token) return false;
  try {
    return authenticator.verify({ token: String(token), secret });
  } catch {
    return false;
  }
}

/**
 * Generate backup codes (10 codes, each 8 characters)
 */
export function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code (uppercase)
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Hash a backup code using bcrypt
 */
export async function hashBackupCode(code) {
  return bcrypt.hash(String(code).toUpperCase(), 12);
}

/**
 * Compare a backup code with a hash
 */
export async function compareBackupCode(code, hash) {
  return bcrypt.compare(String(code).toUpperCase(), hash);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a login challenge ticket for 2FA flow
 * @returns {Promise<{id: string, expires_at: Date} | null>}
 */
export async function createLoginChallenge(userId, remember = false) {
  const pool = getPool();
  if (!pool) return null;

  const ticket = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    await queryWithRecovery(
      `INSERT INTO login_challenges (ticket, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [ticket, userId, expiresAt.toISOString()]
    );
    return { id: ticket, expires_at: expiresAt, remember };
  } catch (e) {
    console.error("[totp] createLoginChallenge error:", e?.message);
    return null;
  }
}

/**
 * Verify and consume a login challenge ticket
 * @returns {Promise<{user_id: number, remember: boolean} | null>}
 */
export async function verifyLoginChallenge(ticketId) {
  const pool = getPool();
  if (!pool) return null;

  try {
    const r = await queryWithRecovery(
      `UPDATE login_challenges
       SET consumed = true
       WHERE ticket = $1 AND expires_at > now() AND consumed = false
       RETURNING user_id`,
      [ticketId]
    );
    const row = r.rows?.[0];
    if (!row) return null;
    return { user_id: row.user_id };
  } catch (e) {
    console.error("[totp] verifyLoginChallenge error:", e?.message);
    return null;
  }
}

/**
 * Clean up expired login challenges
 */
export async function cleanupExpiredChallenges() {
  const pool = getPool();
  if (!pool) return;

  try {
    await queryWithRecovery(`DELETE FROM login_challenges WHERE expires_at < now()`);
  } catch {}
}

/**
 * Setup 2FA - generate pending secret and return QR code
 */
export async function setupTotp(userId) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const user = await getUserById(userId);
  if (!user) return { error: "User not found" };

  if (user.totp_enabled) {
    return { error: "2FA is already enabled. Disable it first." };
  }

  const secret = generateSecret();
  const encryptedSecret = encryptSecret(secret);
  const userIdentifier = user.email || user.username;
  const otpauthUrl = generateOtpauthUrl(secret, userIdentifier);
  const qrDataUrl = await generateQRCode(otpauthUrl);

  try {
    await queryWithRecovery(
      `UPDATE users SET totp_secret_pending = $1, updated_at = now() WHERE id = $2`,
      [encryptedSecret, userId]
    );
    return { otpauth_url: otpauthUrl, qr_data_url: qrDataUrl };
  } catch (e) {
    console.error("[totp] setupTotp error:", e?.message);
    return { error: "Failed to setup 2FA" };
  }
}

/**
 * Enable 2FA after verifying code against pending secret
 */
export async function enableTotp(userId, code) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  try {
    const r = await queryWithRecovery(
      `SELECT totp_enabled, totp_secret_pending FROM users WHERE id = $1`,
      [userId]
    );
    const user = r.rows?.[0];
    if (!user) return { error: "User not found" };
    if (user.totp_enabled) return { error: "2FA is already enabled" };
    if (!user.totp_secret_pending) return { error: "No pending 2FA setup. Call /api/auth/2fa/setup first." };

    const secret = decryptSecret(user.totp_secret_pending);
    if (!secret) return { error: "Failed to decrypt pending secret" };

    const valid = verifyTotp(secret, code);
    if (!valid) return { error: "Invalid verification code" };

    // Generate backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedCodes = await Promise.all(backupCodes.map(hashBackupCode));

    // Begin transaction: update user + insert backup codes
    await queryWithRecovery("BEGIN");
    try {
      // Enable 2FA
      await queryWithRecovery(
        `UPDATE users SET 
          totp_enabled = true, 
          totp_secret = totp_secret_pending,
          totp_secret_pending = NULL,
          totp_confirmed_at = now(),
          updated_at = now() 
         WHERE id = $1`,
        [userId]
      );

      // Delete any existing backup codes
      await queryWithRecovery(
        `DELETE FROM backup_codes WHERE user_id = $1`,
        [userId]
      );

      // Insert new backup codes
      for (const hash of hashedCodes) {
        await queryWithRecovery(
          `INSERT INTO backup_codes (user_id, code_hash) VALUES ($1, $2)`,
          [userId, hash]
        );
      }

      await queryWithRecovery("COMMIT");
    } catch (e) {
      await queryWithRecovery("ROLLBACK");
      throw e;
    }

    return { ok: true, backup_codes: backupCodes };
  } catch (e) {
    console.error("[totp] enableTotp error:", e?.message);
    return { error: "Failed to enable 2FA" };
  }
}

/**
 * Hash a TOTP code for replay-protection storage (deterministic).
 */
function hashTotpCodeForReplay(userId, code) {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${String(code)}`)
    .digest("hex");
}

/**
 * Atomically claim a TOTP code as "used" for this user.
 * Returns true if the code was not previously used (claim succeeded),
 * false if it was already consumed (replay attempt).
 */
async function claimTotpCode(userId, code) {
  const codeHash = hashTotpCodeForReplay(userId, code);
  try {
    const r = await queryWithRecovery(
      `INSERT INTO totp_used_codes (user_id, code_hash)
       VALUES ($1, $2)
       ON CONFLICT (user_id, code_hash) DO NOTHING
       RETURNING user_id`,
      [userId, codeHash]
    );
    return (r.rowCount || 0) > 0;
  } catch (e) {
    console.error("[totp] claimTotpCode error:", e?.message);
    return false;
  }
}

/**
 * Verify TOTP or backup code for a user
 */
export async function verifyUserTotp(userId, code) {
  const pool = getPool();
  if (!pool) return { valid: false };

  try {
    const r = await queryWithRecovery(
      `SELECT totp_enabled, totp_secret FROM users WHERE id = $1`,
      [userId]
    );
    const user = r.rows?.[0];
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return { valid: false };
    }

    const secret = decryptSecret(user.totp_secret);
    if (!secret) return { valid: false };

    // First, try TOTP code with replay protection
    if (verifyTotp(secret, code)) {
      const claimed = await claimTotpCode(userId, code);
      if (!claimed) {
        // Replay attempt — code was already used in its 30s window
        return { valid: false, reason: "replay" };
      }
      return { valid: true, method: "totp" };
    }

    // Then, try backup code
    const backupResult = await useBackupCode(userId, code);
    if (backupResult.valid) {
      return { valid: true, method: "backup" };
    }

    return { valid: false };
  } catch (e) {
    console.error("[totp] verifyUserTotp error:", e?.message);
    return { valid: false };
  }
}

/**
 * Use a backup code (if valid, marks it as used).
 * Atomic: uses UPDATE ... RETURNING to guarantee single-claim under concurrent requests.
 */
export async function useBackupCode(userId, code) {
  const pool = getPool();
  if (!pool) return { valid: false };

  try {
    const r = await queryWithRecovery(
      `SELECT id, code_hash FROM backup_codes WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
    const codes = r.rows || [];

    for (const row of codes) {
      const match = await compareBackupCode(code, row.code_hash);
      if (match) {
        // Atomic claim: only succeeds if used_at is still NULL.
        // Concurrent requests with the same code will lose the race here.
        const claim = await queryWithRecovery(
          `UPDATE backup_codes SET used_at = now()
           WHERE id = $1 AND used_at IS NULL
           RETURNING id`,
          [row.id]
        );
        if ((claim.rowCount || 0) > 0) {
          return { valid: true };
        }
        // Lost the race — keep checking other codes (shouldn't normally happen)
      }
    }

    return { valid: false };
  } catch (e) {
    console.error("[totp] useBackupCode error:", e?.message);
    return { valid: false };
  }
}

/**
 * Cleanup old TOTP used codes (older than 5 minutes — well past TOTP window).
 * Called periodically.
 */
export async function cleanupExpiredTotpCodes() {
  const pool = getPool();
  if (!pool) return;
  try {
    await queryWithRecovery(
      `DELETE FROM totp_used_codes WHERE used_at < now() - INTERVAL '5 minutes'`
    );
  } catch {}
}

/**
 * Disable 2FA for a user (requires password verification + TOTP or backup code)
 */
export async function disableTotp(userId, password, code) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  try {
    // Get user
    const r = await queryWithRecovery(
      `SELECT id, totp_enabled, totp_secret, password_hash FROM users WHERE id = $1`,
      [userId]
    );
    const user = r.rows?.[0];
    if (!user) return { error: "User not found" };
    if (!user.totp_enabled) return { error: "2FA is not enabled" };

    // Verify password
    const pwMatch = await bcrypt.compare(String(password), user.password_hash);
    if (!pwMatch) return { error: "Invalid password" };

    // Verify TOTP or backup code
    const codeResult = await verifyUserTotp(userId, code);
    if (!codeResult.valid) {
      return { error: "Invalid 2FA code or backup code" };
    }

    // Disable 2FA
    await queryWithRecovery("BEGIN");
    try {
      await queryWithRecovery(
        `UPDATE users SET 
          totp_enabled = false, 
          totp_secret = NULL,
          totp_secret_pending = NULL,
          totp_confirmed_at = NULL,
          updated_at = now() 
         WHERE id = $1`,
        [userId]
      );

      // Delete backup codes
      await queryWithRecovery(
        `DELETE FROM backup_codes WHERE user_id = $1`,
        [userId]
      );

      await queryWithRecovery("COMMIT");
    } catch (e) {
      await queryWithRecovery("ROLLBACK");
      throw e;
    }

    return { ok: true };
  } catch (e) {
    console.error("[totp] disableTotp error:", e?.message);
    return { error: "Failed to disable 2FA" };
  }
}

/**
 * Check if a user has 2FA enabled
 */
export async function hasTotpEnabled(userId) {
  const pool = getPool();
  if (!pool) return false;

  try {
    const r = await queryWithRecovery(
      `SELECT totp_enabled FROM users WHERE id = $1`,
      [userId]
    );
    return r.rows?.[0]?.totp_enabled === true;
  } catch {
    return false;
  }
}
