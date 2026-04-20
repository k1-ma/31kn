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
    return { valid: false, error: "Username must be at least 3 characters" };
  }
  if (normalized.length > 32) {
    return { valid: false, error: "Username must be at most 32 characters" };
  }
  if (!/^[a-z0-9_.-]+$/.test(normalized)) {
    return { valid: false, error: "Username can only contain letters, numbers, dots, underscores and hyphens" };
  }
  if (isReservedUsername(normalized)) {
    return { valid: false, error: "This username is reserved" };
  }
  return { valid: true, normalized };
}

export function validatePassword(password) {
  if (!password || String(password).length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
  }
  if (String(password).length > 128) {
    return { valid: false, error: "Password is too long" };
  }
  return { valid: true };
}

export function validateEmail(email, { required = false } = {}) {
  if (!email || !String(email).trim()) {
    if (required) {
      return { valid: false, error: "Email is required", errorCode: "EMAIL_REQUIRED" };
    }
    return { valid: true, normalized: null }; // Email is optional
  }
  const normalized = String(email).trim().toLowerCase();
  if (normalized.length > 255) {
    return { valid: false, error: "Email is too long", errorCode: "EMAIL_INVALID" };
  }
  // Simple email regex
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
