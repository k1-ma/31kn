import { Router } from "express";
import { getPool, ensurePool, dbUnavailableResponse } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { logAdmin } from "../services/audit.service.js";
import { createNotification, NOTIFICATION_TYPES } from "../services/notification.service.js";

const router = Router();

// Valid categories for project updates
const UPDATE_CATEGORIES = ["Feature", "Bugfix", "Improvement", "Security", "Performance", "UI", "Other"];
const FEEDBACK_TYPES = ["bug", "suggestion", "question", "other"];
const FEEDBACK_STATUSES = ["new", "in_progress", "resolved", "closed", "wontfix"];

/**
 * Parse and validate a date string for published_at field.
 * Returns a valid Date object or null if invalid.
 * @param {string|null|undefined} dateStr - The date string to parse
 * @returns {Date|null} - Validated Date object or null
 */
function parsePublishedDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS (for all authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/updates - List published project updates (public)
router.get("/", async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const result = await pool.query(
      `SELECT id, title, description, category, version, published_at, created_at
       FROM project_updates 
       WHERE is_published = true 
       ORDER BY published_at DESC NULLS LAST, created_at DESC`
    );
    return res.json({ updates: result.rows });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return empty array
    if (error?.code === "42P01") {
      console.warn("[updates] project_updates table does not exist, returning empty array");
      return res.json({ updates: [] });
    }
    console.error("[updates] list error:", error);
    return res.status(500).json({ error: "Failed to fetch updates" });
  }
});

// POST /api/updates/feedback - Submit user feedback (bug report or suggestion)
router.post("/feedback", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { type, title, description, images } = req.body || {};
    
    // Validation
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ error: "Title is required (min 3 characters)" });
    }
    
    const sanitizedType = FEEDBACK_TYPES.includes(type) ? type : "bug";
    const sanitizedTitle = String(title).trim().slice(0, 200);
    const sanitizedDescription = description ? String(description).slice(0, 5000) : null;
    const sanitizedImages = Array.isArray(images) ? images.slice(0, 5) : [];
    
    // Get user nickname
    const userResult = await pool.query(
      "SELECT nickname, username FROM users WHERE id = $1",
      [req.session.userId]
    );
    const userNickname = userResult.rows[0]?.nickname || userResult.rows[0]?.username || "Unknown";
    
    const result = await pool.query(
      `INSERT INTO user_feedback (user_id, user_nickname, type, title, description, images)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, type, title, created_at`,
      [
        req.session.userId,
        userNickname,
        sanitizedType,
        sanitizedTitle,
        sanitizedDescription,
        JSON.stringify(sanitizedImages),
      ]
    );

    // Notify all admins about new feedback
    try {
      const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
      await Promise.all(admins.rows.map(admin =>
        createNotification(admin.id, NOTIFICATION_TYPES.FEEDBACK_MESSAGE, {
          feedbackId: result.rows[0].id,
          title: sanitizedTitle,
          messagePreview: `New ${sanitizedType}: ${sanitizedTitle}`,
          fromUser: userNickname,
          isNewTicket: true,
        })
      ));
    } catch (notifErr) {
      console.error("[feedback] Failed to notify admins:", notifErr);
    }
    
    return res.json({ 
      ok: true, 
      feedback: result.rows[0],
      message: "Thank you for your feedback!" 
    });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return a helpful error
    if (error?.code === "42P01") {
      console.warn("[feedback] user_feedback table does not exist");
      return res.status(503).json({ 
        error: "Feedback feature not available. Database migration required.", 
        code: "TABLE_NOT_EXISTS" 
      });
    }
    console.error("[feedback] submit error:", error);
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER FEEDBACK TICKET ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/updates/feedback/my - List user's own feedback tickets
router.get("/feedback/my", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const result = await pool.query(
      `SELECT id, type, title, description, status, admin_notes, 
              closed_by_role, closed_at, last_message_at, last_message_preview, last_message_by,
              created_at, updated_at
       FROM user_feedback
       WHERE user_id = $1
       ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC`,
      [req.session.userId]
    );
    return res.json({ feedback: result.rows });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({ feedback: [] });
    }
    console.error("[feedback] my list error:", error);
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// GET /api/updates/feedback/:id/messages - Get messages for a feedback ticket
router.get("/feedback/:id/messages", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    // Check ownership
    const ownerCheck = await pool.query(
      "SELECT id, user_id, admin_notes FROM user_feedback WHERE id = $1",
      [feedbackId]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    if (ownerCheck.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get messages
    const result = await pool.query(
      `SELECT fm.id, fm.sender_role, fm.message, fm.created_at,
              u.nickname as sender_nickname
       FROM feedback_messages fm
       LEFT JOIN users u ON u.id = fm.sender_user_id
       WHERE fm.feedback_id = $1
       ORDER BY fm.created_at ASC`,
      [feedbackId]
    );

    // If no messages but has admin_notes, create a synthetic message
    let messages = result.rows;
    const adminNotes = ownerCheck.rows[0].admin_notes;
    if (messages.length === 0 && adminNotes) {
      messages = [{
        id: 0,
        sender_role: "admin",
        message: adminNotes,
        created_at: null,
        sender_nickname: "Admin",
        is_legacy: true,
      }];
    }

    return res.json({ messages });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({ messages: [] });
    }
    console.error("[feedback] messages error:", error);
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// POST /api/updates/feedback/:id/messages - Send a message to a feedback ticket (user)
router.post("/feedback/:id/messages", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    const { message } = req.body || {};
    if (!message || String(message).trim().length < 1) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Check ownership and status
    const feedbackCheck = await pool.query(
      "SELECT id, user_id, status, title FROM user_feedback WHERE id = $1",
      [feedbackId]
    );
    if (feedbackCheck.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    const feedback = feedbackCheck.rows[0];
    if (feedback.user_id !== req.session.userId) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (feedback.status === "closed") {
      return res.status(400).json({ error: "Cannot send message to closed ticket" });
    }

    const sanitizedMessage = String(message).trim().slice(0, 5000);
    const preview = sanitizedMessage.slice(0, 200);

    // Insert message
    const msgResult = await pool.query(
      `INSERT INTO feedback_messages (feedback_id, sender_role, sender_user_id, message)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [feedbackId, req.session.userId, sanitizedMessage]
    );

    // Update feedback last_message fields and reset admin_read_at so it appears as unread
    await pool.query(
      `UPDATE user_feedback 
       SET last_message_at = now(), last_message_preview = $1, last_message_by = 'user', admin_read_at = NULL, updated_at = now()
       WHERE id = $2`,
      [preview, feedbackId]
    );

    // Notify all admins about new user message
    try {
      const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
      await Promise.all(admins.rows.map(admin =>
        createNotification(admin.id, NOTIFICATION_TYPES.FEEDBACK_MESSAGE, {
          feedbackId,
          title: feedback.title,
          messagePreview: preview,
          fromUser: req.session.userId,
          isNewTicket: false,
        })
      ));
    } catch (notifErr) {
      console.error("[feedback] Failed to notify admins:", notifErr);
    }

    return res.json({ ok: true, message: msgResult.rows[0] });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(503).json({ error: "Feature not available" });
    }
    console.error("[feedback] send message error:", error);
    return res.status(500).json({ error: "Failed to send message" });
  }
});

// POST /api/updates/feedback/:id/close - Close a feedback ticket (user)
router.post("/feedback/:id/close", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    // Check ownership
    const feedbackCheck = await pool.query(
      "SELECT id, user_id, status FROM user_feedback WHERE id = $1",
      [feedbackId]
    );
    if (feedbackCheck.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    if (feedbackCheck.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Close the ticket
    await pool.query(
      `UPDATE user_feedback 
       SET status = 'closed', closed_by_role = 'user', closed_at = now(), updated_at = now()
       WHERE id = $1`,
      [feedbackId]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error("[feedback] close error:", error);
    return res.status(500).json({ error: "Failed to close ticket" });
  }
});

// POST /api/updates/feedback/:id/reopen - Reopen a feedback ticket (user)
router.post("/feedback/:id/reopen", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    // Check ownership
    const feedbackCheck = await pool.query(
      "SELECT id, user_id, status FROM user_feedback WHERE id = $1",
      [feedbackId]
    );
    if (feedbackCheck.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    if (feedbackCheck.rows[0].user_id !== req.session.userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Reopen the ticket
    await pool.query(
      `UPDATE user_feedback 
       SET status = 'in_progress', closed_by_role = NULL, closed_at = NULL, updated_at = now()
       WHERE id = $1`,
      [feedbackId]
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error("[feedback] reopen error:", error);
    return res.status(500).json({ error: "Failed to reopen ticket" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/updates/admin/list - List all project updates (admin)
router.get("/admin/list", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const result = await pool.query(
      `SELECT pu.*, u.nickname as admin_nickname
       FROM project_updates pu
       LEFT JOIN users u ON u.id = pu.created_by_admin_id
       ORDER BY pu.created_at DESC`
    );
    return res.json({ updates: result.rows });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return empty array
    if (error?.code === "42P01") {
      console.warn("[updates] project_updates table does not exist, returning empty array");
      return res.json({ updates: [] });
    }
    console.error("[updates] admin list error:", error);
    return res.status(500).json({ error: "Failed to fetch updates" });
  }
});

// POST /api/updates/admin - Create new project update (admin)
router.post("/admin", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { title, description, category, version, is_published, published_at } = req.body || {};
    
    if (!title || String(title).trim().length < 1) {
      return res.status(400).json({ error: "Title is required" });
    }
    
    const sanitizedCategory = UPDATE_CATEGORIES.includes(category) ? category : "Other";
    const shouldPublish = !!is_published;
    
    // Allow custom published_at date for backdating updates
    const customPublishDate = parsePublishedDate(published_at);
    const publishDate = shouldPublish ? (customPublishDate || new Date()) : null;
    
    const result = await pool.query(
      `INSERT INTO project_updates (title, description, category, version, is_published, published_at, created_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(title).trim().slice(0, 200),
        description ? String(description).slice(0, 5000) : null,
        sanitizedCategory,
        version ? String(version).trim().slice(0, 50) : null,
        shouldPublish,
        publishDate,
        req.adminUser?.id,
      ]
    );
    
    await logAdmin(req.adminUser?.id, "update.create", null, { 
      updateId: result.rows[0].id, 
      title: result.rows[0].title 
    });
    
    return res.json({ update: result.rows[0] });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return a helpful error
    if (error?.code === "42P01") {
      console.warn("[updates] project_updates table does not exist");
      return res.status(503).json({ 
        error: "Updates feature not available. Database migration required.", 
        code: "TABLE_NOT_EXISTS" 
      });
    }
    console.error("[updates] create error:", error);
    return res.status(500).json({ error: "Failed to create update" });
  }
});

// PATCH /api/updates/admin/:id - Update project update (admin)
router.patch("/admin/:id", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const updateId = parseInt(req.params.id, 10);
    if (!Number.isFinite(updateId)) {
      return res.status(400).json({ error: "Invalid update ID" });
    }
    
    const { title, description, category, version, is_published, published_at } = req.body || {};
    
    // Check if update exists
    const existing = await pool.query("SELECT * FROM project_updates WHERE id = $1", [updateId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Update not found" });
    }
    
    const current = existing.rows[0];
    const sanitizedCategory = UPDATE_CATEGORIES.includes(category) ? category : current.category;
    const shouldPublish = is_published !== undefined ? !!is_published : current.is_published;
    
    // Allow custom published_at date, or set when first publishing
    let publishedAt = current.published_at;
    if (published_at !== undefined) {
      const customDate = parsePublishedDate(published_at);
      publishedAt = customDate !== null ? customDate : publishedAt;
    } else if (shouldPublish && !current.published_at) {
      publishedAt = new Date();
    }
    
    const result = await pool.query(
      `UPDATE project_updates 
       SET title = $1, description = $2, category = $3, version = $4, is_published = $5, published_at = $6
       WHERE id = $7
       RETURNING *`,
      [
        title !== undefined ? String(title).trim().slice(0, 200) : current.title,
        description !== undefined ? (description ? String(description).slice(0, 5000) : null) : current.description,
        sanitizedCategory,
        version !== undefined ? (version ? String(version).trim().slice(0, 50) : null) : current.version,
        shouldPublish,
        publishedAt,
        updateId,
      ]
    );
    
    await logAdmin(req.adminUser?.id, "update.edit", null, { updateId, title: result.rows[0].title });
    
    return res.json({ update: result.rows[0] });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return a helpful error
    if (error?.code === "42P01") {
      console.warn("[updates] project_updates table does not exist");
      return res.status(503).json({ 
        error: "Updates feature not available. Database migration required.", 
        code: "TABLE_NOT_EXISTS" 
      });
    }
    console.error("[updates] update error:", error);
    return res.status(500).json({ error: "Failed to update" });
  }
});

// DELETE /api/updates/admin/:id - Delete project update (admin)
router.delete("/admin/:id", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const updateId = parseInt(req.params.id, 10);
    if (!Number.isFinite(updateId)) {
      return res.status(400).json({ error: "Invalid update ID" });
    }
    
    const result = await pool.query(
      "DELETE FROM project_updates WHERE id = $1 RETURNING id, title",
      [updateId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Update not found" });
    }
    
    await logAdmin(req.adminUser?.id, "update.delete", null, { 
      updateId, 
      title: result.rows[0].title 
    });
    
    return res.json({ ok: true });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return a helpful error
    if (error?.code === "42P01") {
      console.warn("[updates] project_updates table does not exist");
      return res.status(503).json({ 
        error: "Updates feature not available. Database migration required.", 
        code: "TABLE_NOT_EXISTS" 
      });
    }
    console.error("[updates] delete error:", error);
    return res.status(500).json({ error: "Failed to delete update" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/updates/admin/feedback - List all feedback (admin)
router.get("/admin/feedback", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { status } = req.query;
    
    let query = `SELECT uf.*, u.email AS user_email FROM user_feedback uf LEFT JOIN users u ON uf.user_id = u.id`;
    const params = [];
    
    if (status && FEEDBACK_STATUSES.includes(status)) {
      query += ` WHERE uf.status = $1`;
      params.push(status);
    }
    
    query += ` ORDER BY uf.created_at DESC`;
    
    const result = await pool.query(query, params);
    return res.json({ feedback: result.rows });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return empty array
    if (error?.code === "42P01") {
      console.warn("[feedback] user_feedback table does not exist, returning empty array");
      return res.json({ feedback: [] });
    }
    console.error("[feedback] admin list error:", error);
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

// POST /api/updates/admin/feedback/mark-all-read - Mark all feedback as read (admin)
// NOTE: Must be registered BEFORE /:id routes to avoid path conflict
router.post("/admin/feedback/mark-all-read", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const result = await pool.query(
      `UPDATE user_feedback 
       SET admin_read_at = now()
       WHERE admin_read_at IS NULL
       RETURNING id`
    );

    return res.json({ ok: true, marked: result.rowCount });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(503).json({ error: "Feature not available" });
    }
    console.error("[feedback] mark-all-read error:", error);
    return res.status(500).json({ error: "Failed to mark all as read" });
  }
});

// PATCH /api/updates/admin/feedback/:id - Update feedback status (admin)
router.patch("/admin/feedback/:id", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }
    
    const { status, admin_notes } = req.body || {};
    
    // Check if feedback exists
    const existing = await pool.query("SELECT * FROM user_feedback WHERE id = $1", [feedbackId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    
    const current = existing.rows[0];
    const sanitizedStatus = FEEDBACK_STATUSES.includes(status) ? status : current.status;
    
    const result = await pool.query(
      `UPDATE user_feedback 
       SET status = $1, admin_notes = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [
        sanitizedStatus,
        admin_notes !== undefined ? (admin_notes ? String(admin_notes).slice(0, 2000) : null) : current.admin_notes,
        feedbackId,
      ]
    );
    
    await logAdmin(req.adminUser?.id, "feedback.update", null, { feedbackId, status: sanitizedStatus });
    
    // Create notification for user if status changed or admin notes added
    if (current.user_id) {
      const statusChanged = sanitizedStatus !== current.status;
      const notesAdded = admin_notes && admin_notes !== current.admin_notes;
      
      if (statusChanged || notesAdded) {
        try {
          const notificationType = notesAdded 
            ? NOTIFICATION_TYPES.FEEDBACK_REPLY 
            : NOTIFICATION_TYPES.FEEDBACK_STATUS_CHANGED;
          
          await createNotification(current.user_id, notificationType, {
            feedbackId: feedbackId,
            title: current.title,
            status: sanitizedStatus,
            adminReply: notesAdded ? admin_notes.slice(0, 200) : null,
          });
        } catch (notifErr) {
          // Don't fail the request if notification creation fails
          console.error("[feedback] Failed to create notification:", notifErr);
        }
      }
    }
    
    return res.json({ feedback: result.rows[0] });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return a helpful error
    if (error?.code === "42P01") {
      console.warn("[feedback] user_feedback table does not exist");
      return res.status(503).json({ 
        error: "Feedback feature not available. Database migration required.", 
        code: "TABLE_NOT_EXISTS" 
      });
    }
    console.error("[feedback] update error:", error);
    return res.status(500).json({ error: "Failed to update feedback" });
  }
});

// GET /api/updates/admin/feedback/:id/messages - Get messages for a feedback ticket (admin)
router.get("/admin/feedback/:id/messages", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    // Check feedback exists
    const feedbackCheck = await pool.query(
      "SELECT id, admin_notes FROM user_feedback WHERE id = $1",
      [feedbackId]
    );
    if (feedbackCheck.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    // Get messages
    const result = await pool.query(
      `SELECT fm.id, fm.sender_role, fm.message, fm.created_at,
              u.nickname as sender_nickname
       FROM feedback_messages fm
       LEFT JOIN users u ON u.id = fm.sender_user_id
       WHERE fm.feedback_id = $1
       ORDER BY fm.created_at ASC`,
      [feedbackId]
    );

    // If no messages but has admin_notes, create a synthetic message
    let messages = result.rows;
    const adminNotes = feedbackCheck.rows[0].admin_notes;
    if (messages.length === 0 && adminNotes) {
      messages = [{
        id: 0,
        sender_role: "admin",
        message: adminNotes,
        created_at: null,
        sender_nickname: "Admin",
        is_legacy: true,
      }];
    }

    return res.json({ messages });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({ messages: [] });
    }
    console.error("[feedback] admin messages error:", error);
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// POST /api/updates/admin/feedback/:id/messages - Send a message to a feedback ticket (admin)
router.post("/admin/feedback/:id/messages", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    const { message } = req.body || {};
    if (!message || String(message).trim().length < 1) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Check feedback exists and status
    const feedbackCheck = await pool.query(
      "SELECT id, user_id, status, title FROM user_feedback WHERE id = $1",
      [feedbackId]
    );
    if (feedbackCheck.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    const feedback = feedbackCheck.rows[0];
    if (feedback.status === "closed") {
      return res.status(400).json({ error: "Cannot send message to closed ticket" });
    }

    const sanitizedMessage = String(message).trim().slice(0, 5000);
    const preview = sanitizedMessage.slice(0, 200);

    // Insert message
    const msgResult = await pool.query(
      `INSERT INTO feedback_messages (feedback_id, sender_role, sender_user_id, message)
       VALUES ($1, 'admin', $2, $3)
       RETURNING *`,
      [feedbackId, req.adminUser?.id, sanitizedMessage]
    );

    // Update feedback last_message fields and set status to in_progress if new, also mark as read
    await pool.query(
      `UPDATE user_feedback 
       SET last_message_at = now(), 
           last_message_preview = $1, 
           last_message_by = 'admin', 
           status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END,
           admin_read_at = COALESCE(admin_read_at, now()),
           updated_at = now()
       WHERE id = $2`,
      [preview, feedbackId]
    );

    // Create notification for user
    if (feedback.user_id) {
      try {
        await createNotification(feedback.user_id, NOTIFICATION_TYPES.FEEDBACK_MESSAGE, {
          feedbackId: feedbackId,
          title: feedback.title,
          messagePreview: preview,
        });
      } catch (notifErr) {
        console.error("[feedback] Failed to create notification:", notifErr);
      }
    }

    await logAdmin(req.adminUser?.id, "feedback.message", null, { feedbackId });

    return res.json({ ok: true, message: msgResult.rows[0] });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(503).json({ error: "Feature not available" });
    }
    console.error("[feedback] admin send message error:", error);
    return res.status(500).json({ error: "Failed to send message" });
  }
});

// POST /api/updates/admin/feedback/:id/close - Close a feedback ticket (admin)
router.post("/admin/feedback/:id/close", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    const result = await pool.query(
      `UPDATE user_feedback 
       SET status = 'closed', closed_by_role = 'admin', closed_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [feedbackId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    await logAdmin(req.adminUser?.id, "feedback.close", null, { feedbackId });

    return res.json({ ok: true, feedback: result.rows[0] });
  } catch (error) {
    console.error("[feedback] admin close error:", error);
    return res.status(500).json({ error: "Failed to close ticket" });
  }
});

// POST /api/updates/admin/feedback/:id/reopen - Reopen a feedback ticket (admin)
router.post("/admin/feedback/:id/reopen", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    const result = await pool.query(
      `UPDATE user_feedback 
       SET status = 'in_progress', closed_by_role = NULL, closed_at = NULL, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [feedbackId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    await logAdmin(req.adminUser?.id, "feedback.reopen", null, { feedbackId });

    return res.json({ ok: true, feedback: result.rows[0] });
  } catch (error) {
    console.error("[feedback] admin reopen error:", error);
    return res.status(500).json({ error: "Failed to reopen ticket" });
  }
});

// DELETE /api/updates/admin/feedback/:id - Delete feedback (admin)
router.delete("/admin/feedback/:id", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }
    
    const result = await pool.query(
      "DELETE FROM user_feedback WHERE id = $1 RETURNING id",
      [feedbackId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    
    await logAdmin(req.adminUser?.id, "feedback.delete", null, { feedbackId });
    
    return res.json({ ok: true });
  } catch (error) {
    // If table doesn't exist yet (not migrated), return a helpful error
    if (error?.code === "42P01") {
      console.warn("[feedback] user_feedback table does not exist");
      return res.status(503).json({ 
        error: "Feedback feature not available. Database migration required.", 
        code: "TABLE_NOT_EXISTS" 
      });
    }
    console.error("[feedback] delete error:", error);
    return res.status(500).json({ error: "Failed to delete feedback" });
  }
});

// POST /api/updates/admin/feedback/:id/mark-read - Mark a single feedback as read (admin)
router.post("/admin/feedback/:id/mark-read", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const feedbackId = parseInt(req.params.id, 10);
    if (!Number.isFinite(feedbackId)) {
      return res.status(400).json({ error: "Invalid feedback ID" });
    }

    const result = await pool.query(
      `UPDATE user_feedback 
       SET admin_read_at = now()
       WHERE id = $1 AND admin_read_at IS NULL
       RETURNING id, admin_read_at`,
      [feedbackId]
    );

    if (result.rows.length === 0) {
      // Check if it exists but was already read
      const exists = await pool.query("SELECT id, admin_read_at FROM user_feedback WHERE id = $1", [feedbackId]);
      if (exists.rows.length === 0) {
        return res.status(404).json({ error: "Feedback not found" });
      }
      return res.json({ ok: true, alreadyRead: true, admin_read_at: exists.rows[0].admin_read_at });
    }

    return res.json({ ok: true, admin_read_at: result.rows[0].admin_read_at });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(503).json({ error: "Feature not available" });
    }
    console.error("[feedback] mark-read error:", error);
    return res.status(500).json({ error: "Failed to mark as read" });
  }
});

export default router;
