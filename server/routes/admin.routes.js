import { Router } from "express";
import { getPool, ensurePool, dbUnavailableResponse } from "../services/db.service.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { 
  getAllUsers, createUser, updateUser, deleteUser, fullDeleteUser, logoutAllUserSessions,
  banUser, unbanUser, getIpBans, createIpBan, deleteIpBan,
  getUsageStats, getDashboardStats, getDashboardSummary, getTopUsers, refreshUserStatsCache
} from "../services/admin.service.js";
import { getAdminLogs, logAdmin } from "../services/audit.service.js";
import { isRegistrationEnabled, setRegistrationEnabled } from "../services/auth.service.js";
import {
  generateBackupPayload,
  gzipJson,
  createBackupInDb,
  listBackups,
  getBackupContent,
  generateBackupName,
} from "../services/backup.service.js";
import { createNotification, NOTIFICATION_TYPES } from "../services/notification.service.js";

const router = Router();

// Dashboard
router.get("/dashboard", requireAdmin, async (req, res) => {
  const stats = await getDashboardStats();
  if (!stats) {
    return res.status(503).json(dbUnavailableResponse());
  }
  return res.json(stats);
});

// Dashboard Summary - metrics by date range
router.get("/dashboard/summary", requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  
  // Parse and validate dates
  const today = new Date().toISOString().split("T")[0];
  const fromDate = from || today;
  const toDate = to || today;
  
  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
    return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
  }
  
  // Validate from <= to
  if (fromDate > toDate) {
    return res.status(400).json({ error: "From date must be less than or equal to To date" });
  }
  
  // Validate range does not exceed 180 days to prevent heavy DB queries
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const fromTs = new Date(fromDate).getTime();
  const toTs = new Date(toDate).getTime();
  const maxRangeDays = 180;
  const rangeDays = Math.ceil((toTs - fromTs) / MS_PER_DAY);
  if (rangeDays > maxRangeDays) {
    return res.status(400).json({ error: `Date range cannot exceed ${maxRangeDays} days` });
  }
  
  try {
    const summary = await getDashboardSummary(fromDate, toDate);
    if (!summary) {
      return res.status(503).json(dbUnavailableResponse());
    }
    return res.json(summary);
  } catch (err) {
    console.error("[admin] /dashboard/summary error:", err?.message || err);
    return res.status(500).json({ error: "Unexpected error loading metrics" });
  }
});

// Dashboard Top Users - users ranked by activity
router.get("/dashboard/top-users", requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const users = await getTopUsers(limit);
  if (!users) {
    return res.status(503).json(dbUnavailableResponse());
  }
  return res.json({ users });
});

// Refresh user stats cache manually (triggers the expensive JSONB scan once)
router.post("/dashboard/refresh-stats-cache", requireAdmin, async (req, res) => {
  try {
    const result = await refreshUserStatsCache();
    if (result.error) {
      return res.status(503).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[admin] /dashboard/refresh-stats-cache error:", err?.message || err);
    return res.status(500).json({ error: "Failed to refresh stats cache" });
  }
});

// Feedback counts for admin badge
router.get("/feedback-counts", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());
  try {
    const r = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'new') AS new_count,
         COUNT(*) FILTER (WHERE admin_read_at IS NULL AND status NOT IN ('closed','resolved','wontfix')) AS unread_count,
         COUNT(*) FILTER (WHERE status NOT IN ('closed','resolved','wontfix')) AS open_count
       FROM user_feedback`
    );
    const row = r.rows?.[0] || {};
    return res.json({
      newCount: parseInt(row.new_count || 0),
      unreadCount: parseInt(row.unread_count || 0),
      openCount: parseInt(row.open_count || 0),
    });
  } catch (err) {
    if (err?.code === "42P01") return res.json({ newCount: 0, unreadCount: 0, openCount: 0 });
    console.error("[admin] feedback-counts error:", err);
    return res.status(500).json({ error: "Failed to get feedback counts" });
  }
});

// Users
router.get("/users", requireAdmin, async (req, res) => {
  const users = await getAllUsers();
  return res.json({ users });
});

router.post("/users", requireAdmin, async (req, res) => {
  const { username, nickname, password, role, role_color } = req.body || {};
  const result = await createUser({
    username,
    nickname,
    password,
    role,
    role_color,
    adminId: req.adminUser?.id,
  });

  if (result.error) {
    const status = result.error === "Login already exists" ? 409 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.json({ user: result.user });
});

router.put("/users/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

  const { nickname, newPassword, role, role_color, is_disabled, email } = req.body || {};
  const result = await updateUser(id, {
    nickname,
    newPassword,
    role,
    role_color,
    is_disabled,
    email,
    adminId: req.adminUser?.id,
  });

  if (result.error) {
    const status = result.error === "User not found" ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.json({ ok: true });
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

  const result = await deleteUser(id, req.adminUser?.id);
  if (result.error) {
    const status = result.error === "User not found" ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.json({ ok: true });
});

router.post("/users/:id/full-delete", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

  const { guardKey } = req.body || {};
  const result = await fullDeleteUser(id, req.adminUser?.id, guardKey);
  if (result.error) {
    const status = result.error === "User not found" ? 404 : result.error === "Invalid guard key" ? 403 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.json({ ok: true });
});

router.post("/users/:id/logout-all", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

  const result = await logoutAllUserSessions(id, req.adminUser?.id);
  if (result.error) {
    const status = result.error === "User not found" ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.json({ ok: true, removed: result.removed });
});

// User bans
router.put("/users/:id/ban", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

  const { reason, disabled_until } = req.body || {};
  const result = await banUser(id, {
    reason,
    disabled_until,
    adminId: req.adminUser?.id,
  });

  if (result.error) {
    const status = result.error === "User not found" ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.json({ ok: true });
});

router.put("/users/:id/unban", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

  const result = await unbanUser(id, req.adminUser?.id);
  if (result.error) {
    const status = result.error === "User not found" ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.json({ ok: true });
});

// IP Bans
router.get("/bans/ip", requireAdmin, async (req, res) => {
  const bans = await getIpBans();
  return res.json({ bans });
});

router.post("/bans/ip", requireAdmin, async (req, res) => {
  const { ip, reason, expires_at } = req.body || {};
  const result = await createIpBan({
    ip,
    reason,
    expires_at,
    adminId: req.adminUser?.id,
  });

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ ban: result.ban });
});

router.delete("/bans/ip/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

  const result = await deleteIpBan(id, req.adminUser?.id);
  if (result.error) {
    const status = result.error === "Ban not found" ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  return res.json({ ok: true });
});

// Logs
const ADMIN_LOGS_MAX_LIMIT = 500;
router.get("/logs", requireAdmin, async (req, res) => {
  const rawLimit = Number(req.query.limit || 50);
  const rawOffset = Number(req.query.offset || 0);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), ADMIN_LOGS_MAX_LIMIT);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
  const action = req.query.action || null;
  const adminUsername = req.query.admin || null;

  const result = await getAdminLogs(limit, offset, { action, adminUsername });
  return res.json(result);
});

// Usage stats
router.get("/usage", requireAdmin, async (req, res) => {
  const { dayFrom, dayTo, userId } = req.query;
  const result = await getUsageStats({
    dayFrom: dayFrom || null,
    dayTo: dayTo || null,
    userId: userId ? Number(userId) : null,
  });
  return res.json(result);
});

// Backups - stored in Postgres
router.get("/backups", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  try {
    const backups = await listBackups(pool);
    return res.json({ backups });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[admin] list backups error:", err?.message || err);
    return res.status(500).json({ error: "Failed to list backups" });
  }
});

router.post("/backups", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  try {
    const payload = await generateBackupPayload(pool);
    const gzBuffer = gzipJson(payload);
    const name = generateBackupName();
    await createBackupInDb({ pool, name, gzBuffer });

    await logAdmin(req.adminUser?.id, "backup.create", null, { name, size_bytes: gzBuffer.length });

    return res.json({ ok: true, name, size_bytes: gzBuffer.length });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[admin] create backup error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create backup" });
  }
});

router.get("/backups/:name", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  const { name } = req.params;
  // Reject anything outside the canonical backup name format produced by
  // generateBackupName(). This blocks header injection (CR/LF, quotes) into
  // Content-Disposition and rejects bogus DB lookups in one check.
  if (!name || !/^koshyk_backup_[\w\-]+\.json\.gz$/.test(name) || name.length > 128) {
    return res.status(400).json({ error: "Invalid backup name" });
  }

  try {
    const backup = await getBackupContent(pool, name);
    if (!backup) {
      return res.status(404).json({ error: "Backup not found" });
    }

    await logAdmin(req.adminUser?.id, "backup.download", null, { name });

    res.set("Content-Type", "application/gzip");
    res.set("Content-Disposition", `attachment; filename="${name}"`);
    res.set("Cache-Control", "no-store");
    return res.send(backup.content);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[admin] download backup error:", err?.message || err);
    return res.status(500).json({ error: "Failed to download backup" });
  }
});

// Download fresh backup without saving to database
router.get("/backup", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) {
    return res.status(503).json(dbUnavailableResponse());
  }

  try {
    const payload = await generateBackupPayload(pool);
    const gzBuffer = gzipJson(payload);
    const name = generateBackupName();

    await logAdmin(req.adminUser?.id, "backup.download_fresh", null, { size_bytes: gzBuffer.length });

    res.set("Content-Type", "application/gzip");
    res.set("Content-Disposition", `attachment; filename="${name}"`);
    res.set("Cache-Control", "no-store");
    return res.send(gzBuffer);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[admin] fresh backup error:", err?.message || err);
    return res.status(500).json({ error: "Failed to generate backup" });
  }
});

// Settings
router.get("/settings", requireAdmin, async (req, res) => {
  return res.json({
    registrationEnabled: isRegistrationEnabled(),
  });
});

router.put("/settings", requireAdmin, async (req, res) => {
  const { registrationEnabled } = req.body || {};
  
  if (registrationEnabled !== undefined) {
    setRegistrationEnabled(registrationEnabled);
    await logAdmin(req.adminUser?.id, "settings.registration", null, { enabled: registrationEnabled });
  }
  
  return res.json({
    ok: true,
    registrationEnabled: isRegistrationEnabled(),
  });
});

// NOTE: the legacy `PUT /users/:id/state` admin route was removed in the v2
// migration. It wrote the deprecated single-blob `states` table, which no
// longer backs the app. Per-user data now lives in the normalized per-entity
// tables; bulk restore goes through finance.routes.js → POST /api/import.

// Log client-side errors (for error boundary)
router.post("/log-client-error", requireAdmin, async (req, res) => {
  try {
    const { action, meta } = req.body || {};
    const adminId = req.adminUser?.id || null;
    
    // Log to console for debugging
    console.error("[client-error]", {
      adminId,
      action: action || "client_error",
      meta: meta || {},
    });
    
    // Log to admin_logs table
    await logAdmin(adminId, action || "client_error", null, meta || {});
    
    return res.json({ ok: true });
  } catch (err) {
    // Don't fail the request even if logging fails
    console.error("[admin] log-client-error error:", err?.message || err);
    return res.json({ ok: false });
  }
});

export default router;
