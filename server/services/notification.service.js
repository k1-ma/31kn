import { getPool } from "./db.service.js";

/**
 * Notification types supported by the system
 */
export const NOTIFICATION_TYPES = {
  // Risk-related notifications
  RISK_MAX_LOSS_WARNING: "risk_max_loss_warning",
  RISK_MAX_LOSS_EXCEEDED: "risk_max_loss_exceeded",
  RISK_DAILY_LOSS_WARNING: "risk_daily_loss_warning",
  RISK_DAILY_LOSS_EXCEEDED: "risk_daily_loss_exceeded",
  RISK_MAX_DRAWDOWN_WARNING: "risk_max_drawdown_warning",
  
  // Admin/user interaction notifications
  SUGGESTION_REPLY: "suggestion_reply",
  SUGGESTION_STATUS_CHANGED: "suggestion_status_changed",
  FEEDBACK_REPLY: "feedback_reply",
  FEEDBACK_STATUS_CHANGED: "feedback_status_changed",
  FEEDBACK_MESSAGE: "feedback_message",
  
  // Daily digest notifications
  UPDATES_DAILY_DIGEST: "updates_daily_digest",
  
  // Service notifications
  ACHIEVEMENT_UNLOCKED: "achievement_unlocked",
  CHALLENGE_COMPLETED: "challenge_completed",
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

  const result = await pool.query(
    `DELETE FROM notifications 
     WHERE created_at < NOW() - INTERVAL '${parseInt(daysOld, 10)} days'
     RETURNING id`
  );

  return result.rowCount;
}

/**
 * Ensure daily updates digest notification exists for user.
 * Creates a notification if there were updates published yesterday
 * and no digest notification exists for today.
 * 
 * @param {number} userId - User ID
 * @returns {Promise<object|null>} Created notification or null
 */
export async function ensureDailyUpdatesDigest(userId) {
  const pool = getPool();
  if (!pool) {
    return null;
  }

  try {
    // Get today and yesterday dates (server time)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().substring(0, 10); // YYYY-MM-DD (more robust)

    // Check if digest already exists for today (checking data.date = yesterday)
    const existingCheck = await pool.query(
      `SELECT id, data FROM notifications 
       WHERE user_id = $1 
         AND type = $2 
         AND created_at >= $3
         AND data->>'date' = $4
       LIMIT 1`,
      [userId, NOTIFICATION_TYPES.UPDATES_DAILY_DIGEST, today, yesterdayStr]
    );

    if (existingCheck.rows.length > 0) {
      // Digest already exists, no need to create
      return null;
    }

    // Count updates published yesterday
    const countResult = await pool.query(
      `SELECT COUNT(*) as count, MAX(id) as latest_id
       FROM project_updates
       WHERE is_published = true
         AND published_at >= $1
         AND published_at < $2`,
      [yesterday, today]
    );

    const count = parseInt(countResult.rows[0]?.count || 0, 10);
    const latestUpdateId = countResult.rows[0]?.latest_id || null;

    if (count === 0) {
      // No updates yesterday, no notification needed
      return null;
    }

    // Create the digest notification
    const notification = await createNotification(userId, NOTIFICATION_TYPES.UPDATES_DAILY_DIGEST, {
      count,
      date: yesterdayStr,
      latestUpdateId,
    });

    return notification;
  } catch (err) {
    console.error("[notification] ensureDailyUpdatesDigest error:", err);
    return null;
  }
}
