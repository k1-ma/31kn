import { Router } from "express";
import { sign, parseCookies } from "../utils/cookies.js";

const router = Router();
const COOKIE_NAME = "tradecrm.sid";
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";

// GET /api/ping — lightweight connectivity probe (no DB, no auth)
router.get("/", (_req, res) => {
  res.status(200).json({ ok: true });
});

// GET /api/ping/session-debug — diagnostic endpoint (only when AUTH_DEBUG=true)
router.get("/session-debug", (req, res) => {
  if (!AUTH_DEBUG) {
    return res.status(404).json({ error: "Not found" });
  }

  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  let parsedSessionValidSignature = false;

  if (raw) {
    const [sid, sig] = String(raw).split(".");
    if (sid && sig) {
      parsedSessionValidSignature = sign(sid) === sig;
    }
  }

  return res.json({
    host: req.headers.host || null,
    "x-forwarded-host": req.headers["x-forwarded-host"] || null,
    "x-forwarded-proto": req.headers["x-forwarded-proto"] || null,
    hasCookieHeader: !!req.headers.cookie,
    hasSessionCookie: !!raw,
    parsedSessionValidSignature,
    sessionUserId: !!req.session?.userId,
    cookieDomainFromHost: req._cookieDomainFromHost || null,
  });
});

export default router;
