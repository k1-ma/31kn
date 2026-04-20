import { Router } from "express";
import { getPool, ensurePool, dbUnavailableResponse } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  ensureDailyUpdatesDigest,
  NOTIFICATION_TYPES,
} from "../services/notification.service.js";

const router = Router();

// GET /api/notifications - Get user's notifications
router.get("/", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { limit = 50, offset = 0, unreadOnly = false } = req.query;
    const userId = req.session.userId;

    // Ensure daily digest notification exists (on first bell open of the day)
    await ensureDailyUpdatesDigest(userId);

    const notifications = await getNotifications(userId, {
      limit: Math.min(parseInt(limit, 10) || 50, 100), // Max 100
      offset: parseInt(offset, 10) || 0,
      unreadOnly: unreadOnly === "true" || unreadOnly === true,
    });

    return res.json({
      notifications,
      count: notifications.length,
    });
  } catch (err) {
    console.error("[notifications] GET error:", err);
    return res.status(500).json({
      error: "Failed to fetch notifications",
      code: "FETCH_FAILED",
    });
  }
});

// GET /api/notifications/count - Get unread count
router.get("/count", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const userId = req.session.userId;

    // Ensure daily digest notification exists (on first bell open of the day)
    await ensureDailyUpdatesDigest(userId);

    const count = await getUnreadCount(userId);

    return res.json({ count });
  } catch (err) {
    console.error("[notifications] GET /count error:", err);
    return res.status(500).json({
      error: "Failed to get unread count",
      code: "COUNT_FAILED",
    });
  }
});

// POST /api/notifications - Create a notification (admin or system use)
router.post("/", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { type, data, targetUserId } = req.body;

    // Validate type
    const validTypes = Object.values(NOTIFICATION_TYPES);
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        error: "Invalid notification type",
        code: "INVALID_TYPE",
        validTypes,
      });
    }

    // If targetUserId is provided and user is admin, allow creating for other users
    // Otherwise, create for current user
    const userId = (targetUserId && req.session.role === "admin") 
      ? targetUserId 
      : req.session.userId;

    const notification = await createNotification(userId, type, data || {});

    return res.status(201).json({ notification });
  } catch (err) {
    console.error("[notifications] POST error:", err);
    return res.status(500).json({
      error: "Failed to create notification",
      code: "CREATE_FAILED",
    });
  }
});

// PATCH /api/notifications/markRead - Mark notifications as read
router.patch("/markRead", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { notificationIds, all } = req.body;
    const userId = req.session.userId;

    let count;
    if (all === true) {
      // Mark all as read
      count = await markAllAsRead(userId);
    } else {
      // Mark specific notifications as read
      if (!notificationIds || !Array.isArray(notificationIds)) {
        return res.status(400).json({
          error: "notificationIds must be an array or use all: true",
          code: "INVALID_REQUEST",
        });
      }
      count = await markAsRead(userId, notificationIds);
    }

    return res.json({
      success: true,
      marked: count,
    });
  } catch (err) {
    console.error("[notifications] PATCH /markRead error:", err);
    return res.status(500).json({
      error: "Failed to mark notifications as read",
      code: "MARK_READ_FAILED",
    });
  }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete("/:id", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { id } = req.params;
    const userId = req.session.userId;

    // Only allow users to delete their own notifications
    const result = await pool.query(
      "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
      [parseInt(id, 10), userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Notification not found",
        code: "NOT_FOUND",
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[notifications] DELETE error:", err);
    return res.status(500).json({
      error: "Failed to delete notification",
      code: "DELETE_FAILED",
    });
  }
});

export default router;
