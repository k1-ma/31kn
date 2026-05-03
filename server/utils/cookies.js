import crypto from "crypto";

const DEFAULT_DEV_SECRET = "dev-secret-change-me";
const MIN_SECRET_LENGTH = 32;
const isProd = process.env.NODE_ENV === "production";
const envSecret = process.env.SESSION_SECRET;

// Picking the session secret in production:
//   1. If SESSION_SECRET is the exact dev placeholder, refuse to start —
//      that almost certainly means a config file was committed by mistake
//      and is the one case where booting silently is dangerous.
//   2. If it is missing or shorter than MIN_SECRET_LENGTH, generate a
//      strong ephemeral secret for this process and log a loud warning.
//      Sessions won't survive a restart until the operator sets a real
//      SESSION_SECRET, which is annoying but lets the deploy come back up
//      instead of crash-looping (the previous behaviour broke production).
function pickSessionSecret() {
  if (!isProd) return envSecret || DEFAULT_DEV_SECRET;

  if (envSecret === DEFAULT_DEV_SECRET) {
    throw new Error(
      "[cookies] SESSION_SECRET is set to the development placeholder value in production. Refusing to start."
    );
  }

  if (!envSecret || envSecret.length < MIN_SECRET_LENGTH) {
    const ephemeral = crypto.randomBytes(48).toString("hex");
    // eslint-disable-next-line no-console
    console.error(
      "[cookies] WARNING: SESSION_SECRET is " +
        (!envSecret ? "not set" : `only ${envSecret.length} chars (min ${MIN_SECRET_LENGTH})`) +
        ". Falling back to a randomly-generated per-process secret. " +
        "All existing sessions are invalid and any restart will log every user out. " +
        "Set SESSION_SECRET to a >=" + MIN_SECRET_LENGTH + "-char random string in your deploy environment."
    );
    return ephemeral;
  }

  return envSecret;
}

const SESSION_SECRET = pickSessionSecret();

export function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function sign(value) {
  return b64url(crypto.createHmac("sha256", SESSION_SECRET).update(String(value)).digest());
}

/**
 * Return the cookie Domain attribute value from the COOKIE_DOMAIN env var.
 * When set (e.g. ".hauntedx.trade"), cookies are shared across apex and www,
 * which is required when the public site sits behind a CDN / reverse-proxy
 * that serves both hauntedx.trade and www.hauntedx.trade.
 *
 * Returns undefined when not configured (default: cookie is bound to the
 * exact hostname — fine for single-domain or local dev).
 */
export function getCookieDomain() {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
  return undefined;
}

/**
 * Derive the cookie domain from the incoming request Host header.
 * Used as a safe fallback when COOKIE_DOMAIN is not explicitly set in
 * production: for hosts matching *.hauntedx.trade (apex, www, origin)
 * we return ".hauntedx.trade" so the session cookie is shared across all
 * subdomains. For localhost or unknown hosts we return undefined (no Domain
 * attribute — cookie bound to exact hostname).
 */
export function getCookieDomainFromHost(host) {
  // Explicit env takes precedence
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;

  if (!host) return undefined;

  // Strip port if present
  const hostname = host.split(":")[0];

  // Never set domain for localhost
  if (hostname === "localhost" || hostname === "127.0.0.1") return undefined;

  // Production fallback: share cookie across *.hauntedx.trade
  if (
    hostname === "hauntedx.trade" ||
    hostname.endsWith(".hauntedx.trade")
  ) {
    return ".hauntedx.trade";
  }

  return undefined;
}

export function makeCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function appendSetCookie(res, cookieStr) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", cookieStr);
    return;
  }
  if (Array.isArray(prev)) {
    res.setHeader("Set-Cookie", [...prev, cookieStr]);
    return;
  }
  res.setHeader("Set-Cookie", [prev, cookieStr]);
}

export function parseCookies(req) {
  const header = req.headers?.cookie;
  const out = {};
  if (!header) return out;
  const items = String(header).split(";");
  for (const it of items) {
    const idx = it.indexOf("=");
    if (idx === -1) continue;
    const k = it.slice(0, idx).trim();
    const v = it.slice(idx + 1).trim();
    // First occurrence wins (standard behaviour)
    if (!(k in out)) out[k] = decodeURIComponent(v);
  }
  return out;
}

/**
 * Parse ALL values for every cookie name.
 * Returns { name: [val1, val2, …] }.
 * Useful when the browser sends duplicate cookies from different
 * Domain scopes (e.g. host-only vs .hauntedx.trade).
 */
export function parseCookiesAll(req) {
  const header = req.headers?.cookie;
  const out = {};
  if (!header) return out;
  const items = String(header).split(";");
  for (const it of items) {
    const idx = it.indexOf("=");
    if (idx === -1) continue;
    const k = it.slice(0, idx).trim();
    const v = it.slice(idx + 1).trim();
    if (!out[k]) out[k] = [];
    out[k].push(decodeURIComponent(v));
  }
  return out;
}
