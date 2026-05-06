// Reserved usernames that cannot be registered
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "system",
  "support",
  "help",
  "info",
  "api",
  "www",
  "mail",
  "ftp",
  "null",
  "undefined",
  "test",
  "demo",
]);

export function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function isReservedUsername(username) {
  return RESERVED_USERNAMES.has(normalizeUsername(username));
}

export function validateUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized || normalized.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters", errorCode: "USERNAME_TOO_SHORT" };
  }
  if (normalized.length > 32) {
    return { valid: false, error: "Username must be at most 32 characters", errorCode: "USERNAME_TOO_LONG" };
  }
  if (!/^[a-z0-9_.-]+$/.test(normalized)) {
    return {
      valid: false,
      error: "Username can only contain letters, numbers, dots, underscores and hyphens",
      errorCode: "USERNAME_INVALID_CHARS",
    };
  }
  if (isReservedUsername(normalized)) {
    return { valid: false, error: "This username is reserved", errorCode: "USERNAME_RESERVED" };
  }
  return { valid: true, normalized };
}

// Common weak passwords blocklist (subset).
const COMMON_WEAK_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd",
  "12345678", "123456789", "1234567890", "qwerty123", "qwertyui",
  "11111111", "abcdefgh", "iloveyou", "letmein1", "welcome1",
  "admin123", "trustno1", "monkey123", "dragon123", "sunshine",
  "princess1", "football", "baseball", "superman", "batman123",
]);

export function validatePassword(password) {
  const s = String(password || "");
  if (!s || s.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters", errorCode: "PASSWORD_TOO_SHORT" };
  }
  if (s.length > 128) {
    return { valid: false, error: "Password is too long", errorCode: "PASSWORD_TOO_LONG" };
  }

  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  const hasDigit = /[0-9]/.test(s);
  const hasSymbol = /[^A-Za-z0-9]/.test(s);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes < 3) {
    return {
      valid: false,
      error: "Password must include at least three of: lowercase, uppercase, digit, symbol",
      errorCode: "PASSWORD_WEAK_CLASSES",
    };
  }

  if (/^(.)\1+$/.test(s)) {
    return { valid: false, error: "Password is too simple", errorCode: "PASSWORD_REPEATED" };
  }

  if (COMMON_WEAK_PASSWORDS.has(s.toLowerCase())) {
    return {
      valid: false,
      error: "This password is too common, choose another",
      errorCode: "PASSWORD_COMMON",
    };
  }

  return { valid: true };
}

export function validateEmail(email, { required = false } = {}) {
  if (!email || !String(email).trim()) {
    if (required) {
      return { valid: false, error: "Email is required", errorCode: "EMAIL_REQUIRED" };
    }
    return { valid: true, normalized: null };
  }
  const normalized = String(email).trim().toLowerCase();
  if (normalized.length > 255) {
    return { valid: false, error: "Email is too long", errorCode: "EMAIL_TOO_LONG" };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    return { valid: false, error: "Invalid email format", errorCode: "EMAIL_INVALID" };
  }
  return { valid: true, normalized };
}

export function normalizeHexColor(input) {
  if (input === null) return null;
  const s = String(input ?? "").trim();
  if (!s) return null;
  const re = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  if (!re.test(s)) throw new Error("Bad role_color (use hex like #RRGGBB)");
  if (s.length === 4) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return "#" + r + r + g + g + b + b;
  }
  return s;
}
