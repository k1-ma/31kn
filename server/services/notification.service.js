import { getPool } from "./db.service.js";

/**
 * Notification types supported by the system
 */
export const NOTIFICATION_TYPES = {
  // Budget alerts
  BUDGET_WARN: "budget_warn",
  BUDGET_EXCEEDED: "budget_exceeded",

  // Recurring payments
  RECURRING_DUE: "recurring_due",

  // Goals
  GOAL_REACHED: "goal_reached",

  // Generic
  REMINDER: "reminder",
  SYSTEM_MESSAGE: "system_message",
};

/**
 * Create a notification for a user
 * @param {number} userId - User ID to create notification for
 * @param {string} type - Notification type (from NOTIFICATION_TYPES)
 * @param {object} data - Notification data (flexible JSON payload)
 * @returns {Promise<object>} Created notification
 */
export async function createNotification(userId, type, data = {}) {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not available");
  }

  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, data, read, created_at)
     VALUES ($1, $2, $3, false, now())
     RETURNING *`,
    [userId, type, JSON.stringify(data)]
  );

  return result.rows[0];
}

/**
 * Create multiple notifications (bulk insert)
 * @param {Array<{userId: number, type: string, data: object}>} notifications
 * @returns {Promise<Array<object>>} Created notifications
 */
export async function createNotifications(notifications) {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not available");
  }

  if (!notifications || notifications.length === 0) {
    return [];
  }

  // Build bulk insert query
  const values = [];
  const params = [];
  let paramIdx = 1;

  for (const notif of notifications) {
    values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, false, now())`);
    params.push(notif.userId, notif.type, JSON.stringify(notif.data || {}));
    paramIdx += 3;
  }

  const query = `
    INSERT INTO notifications (user_id, type, data, read, created_at)
    VALUES ${values.join(", ")}
    RETURNING *
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get notifications for a user
 * @param {number} userId - User ID
 * @param {object} options - Query options (limit, offset, unreadOnly)
 * @returns {Promise<Array<object>>} Notifications
 */
export async function getNotifications(userId, options = {}) {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not available");
  }

  const { limit = 50, offset = 0, unreadOnly = false } = options;

  let query = "SELECT * FROM notifications WHERE user_id = $1";
  const params = [userId];
  let paramIdx = 2;

  if (unreadOnly) {
    query += ` AND read = false`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get unread notification count for a user
 * @param {number} userId - User ID
 * @returns {Promise<number>} Unread count
 */
export async function getUnreadCount(userId) {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not available");
  }

  const result = await pool.query(
    "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false",
    [userId]
  );

  return parseInt(result.rows[0]?.count || 0, 10);
}

/**
 * Mark notification(s) as read
 * @param {number} userId - User ID
 * @param {number|Array<number>} notificationIds - Notification ID or array of IDs
 * @returns {Promise<number>} Number of notifications marked as read
 */
export async function markAsRead(userId, notificationIds) {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not available");
  }

  const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];
  
  if (ids.length === 0) {
    return 0;
  }

  const result = await pool.query(
    `UPDATE notifications 
     SET read = true 
     WHERE user_id = $1 AND id = ANY($2) AND read = false
     RETURNING id`,
    [userId, ids]
  );

  return result.rowCount;
}

/**
 * Mark all notifications as read for a user
 * @param {number} userId - User ID
 * @returns {Promise<number>} Number of notifications marked as read
 */
export async function markAllAsRead(userId) {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not available");
  }

  const result = await pool.query(
    `UPDATE notifications 
     SET read = true 
     WHERE user_id = $1 AND read = false
     RETURNING id`,
    [userId]
  );

  return result.rowCount;
}

/**
 * Delete old notifications (cleanup utility)
 * @param {number} daysOld - Delete notifications older than X days
 * @returns {Promise<number>} Number of notifications deleted
 */
export async function deleteOldNotifications(daysOld = 90) {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not available");
  }

  const days = parseInt(daysOld, 10);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("daysOld must be a positive integer");
  }

  const result = await pool.query(
    `DELETE FROM notifications
     WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
     RETURNING id`,
    [days]
  );

  return result.rowCount;
}

/**
 * Legacy hook kept as a no-op so existing route handlers don't break.
 * The trader-domain "updates digest" feature is no longer part of Koshyk.
 *
 * @returns {Promise<null>}
 */
export async function ensureDailyUpdatesDigest() {
  return null;
}

