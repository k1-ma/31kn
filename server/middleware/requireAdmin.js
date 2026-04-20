import { ensurePool, getUserById, dbUnavailableResponse } from "../services/db.service.js";

export async function requireAdmin(req, res, next) {
  // Rely on ensureDb middleware for pool initialization
  // If we reach here without a pool, return 503
  try {
    await ensurePool();
  } catch {
    return res.status(503).json({
      code: "DB_UNAVAILABLE",
      messageKey: "common.dbUnavailable",
      retryAfterMs: 1000,
    });
  }
  
  if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });
  
  const u = await getUserById(req.session.userId);
  if (!u || u.role !== "admin") return res.status(403).json({ error: "Admin only" });
  if (u.is_disabled) return res.status(403).json({ error: "Account disabled" });
  
  req.adminUser = u;
  return next();
}
