import { Router } from "express";
import multer from "multer";
import { getPool, ensurePool, dbUnavailableResponse } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { logAdmin } from "../services/audit.service.js";
import {
  createVideo,
  uploadVideo,
  getVideo,
  deleteVideo,
  generateSignedEmbedUrl,
  getThumbnailUrl,
  pollVideoStatus,
  isBunnyStreamConfigured,
  generateDirectUploadCredentials,
  VideoProcessingError,
} from "../services/bunnyStream.service.js";

const router = Router();

// Default categories for education videos (used as fallback when DB is unavailable)
const DEFAULT_VIDEO_CATEGORIES = ["Basics", "Strategy", "RiskManagement", "Psychology", "TechnicalAnalysis", "Platform", "Other"];

/**
 * Fetch valid category names from the database.
 * Falls back to hardcoded defaults if the query fails.
 */
async function getValidCategories(pool) {
  try {
    const result = await pool.query("SELECT name FROM education_categories ORDER BY sort_order ASC");
    if (result.rows.length > 0) {
      return result.rows.map((r) => r.name);
    }
  } catch (err) {
    console.warn("[education] Failed to fetch categories from DB, using defaults:", err.message);
  }
  return DEFAULT_VIDEO_CATEGORIES;
}

// Video status enum
const VIDEO_STATUSES = ["uploading", "processing", "ready", "failed"];

// Lazy reconciliation tuning — bound work per GET so we don't hammer Bunny.
const RECONCILE_BATCH_LIMIT = 5;
const RECONCILE_TTL_SECONDS = 30;

/**
 * Lazy reconciliation for stuck "processing" videos.
 * Background polling (pollVideoStatus) is best-effort and may be lost on a
 * server restart, leaving rows stuck in 'processing'. On every list-style GET
 * we re-check up to RECONCILE_BATCH_LIMIT rows whose updated_at is older than
 * RECONCILE_TTL_SECONDS, and update the DB if Bunny says they're now
 * ready/failed. This is best-effort — errors are logged, never thrown.
 */
async function reconcileProcessingVideos(pool) {
  if (!isBunnyStreamConfigured()) return;
  try {
    const stale = await pool.query(
      `SELECT id, bunny_video_id
         FROM education_videos
        WHERE status = 'processing'
          AND updated_at < NOW() - INTERVAL '${RECONCILE_TTL_SECONDS} seconds'
        ORDER BY updated_at ASC
        LIMIT $1`,
      [RECONCILE_BATCH_LIMIT]
    );

    // Parallelize the Bunny lookups — they're independent network calls.
    // RECONCILE_BATCH_LIMIT is small (5) so unlimited parallelism is fine
    // and keeps total wallclock close to the slowest single request.
    const bunnyResults = await Promise.allSettled(
      stale.rows.map(async (row) => {
        const bunnyData = await getVideo(row.bunny_video_id);
        return { row, bunnyData };
      })
    );

    for (const settled of bunnyResults) {
      if (settled.status === "rejected") {
        console.warn("[education] reconcile failed:", settled.reason?.message || settled.reason);
        continue;
      }
      const { row, bunnyData } = settled.value;
      try {
        let nextStatus = "processing";
        if (bunnyData.status === 4) nextStatus = "ready";
        else if (bunnyData.status === 5) nextStatus = "failed";

        if (nextStatus !== "processing") {
          await pool.query(
            `UPDATE education_videos
                SET status = $1, duration_seconds = $2, updated_at = NOW()
              WHERE id = $3`,
            [nextStatus, bunnyData.length || 0, row.id]
          );
        } else {
          // Touch updated_at so we honor the TTL and don't re-check immediately.
          await pool.query(
            `UPDATE education_videos SET updated_at = NOW() WHERE id = $1`,
            [row.id]
          );
        }
      } catch (innerErr) {
        console.warn("[education] reconcile failed for video", row.bunny_video_id, innerErr?.message || innerErr);
      }
    }
  } catch (err) {
    console.warn("[education] reconcileProcessingVideos error:", err?.message || err);
  }
}

// Configure multer for in-memory file upload (up to 2GB).
// fileFilter restricts uploads to video MIME types — without it the legacy
// /admin/upload endpoint accepts any file type, and an attacker (or a
// confused admin) could upload arbitrary blobs that we'd then ship to Bunny.
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/mpeg",
  "video/x-msvideo",
  "video/3gpp",
  "video/3gpp2",
  "application/octet-stream", // some browsers omit a real video/* type
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2000 * 1024 * 1024, // 2GB
  },
  fileFilter(req, file, cb) {
    const mime = String(file?.mimetype || "").toLowerCase();
    if (mime.startsWith("video/") || ALLOWED_VIDEO_MIME.has(mime)) {
      return cb(null, true);
    }
    const err = new Error("Only video files are allowed");
    err.code = "INVALID_MIME";
    return cb(err);
  },
});

// Wrap upload.single() so multer errors (size limit, MIME filter rejection)
// surface as 400 JSON instead of bubbling to the default 500 handler.
function uploadVideoMiddleware(field) {
  const handler = upload.single(field);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();
      if (err.code === "INVALID_MIME") {
        return res.status(400).json({ error: err.message });
      }
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File too large" });
      }
      return res.status(400).json({ error: err.message || "Upload failed" });
    });
  };
}

/**
 * Auto-create education tables if they don't exist
 */
async function ensureEducationTables(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS education_videos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT DEFAULT '',
        category VARCHAR(100) DEFAULT 'Other',
        bunny_video_id VARCHAR(100) NOT NULL,
        bunny_thumbnail_url TEXT DEFAULT '',
        duration_seconds INTEGER DEFAULT 0,
        file_size_bytes BIGINT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'uploading',
        sort_order INTEGER DEFAULT 0,
        is_published BOOLEAN DEFAULT false,
        created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_edu_videos_published ON education_videos(is_published, sort_order);
      
      CREATE TABLE IF NOT EXISTS education_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id INTEGER NOT NULL REFERENCES education_videos(id) ON DELETE CASCADE,
        watched BOOLEAN DEFAULT false,
        progress_seconds INTEGER DEFAULT 0,
        watched_at TIMESTAMPTZ,
        UNIQUE(user_id, video_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_edu_progress_user ON education_progress(user_id);
      
      CREATE TABLE IF NOT EXISTS education_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        display_name VARCHAR(200) NOT NULL,
        color VARCHAR(50) DEFAULT 'bg-slate-500/20 text-slate-400',
        sort_order INTEGER DEFAULT 0,
        is_system BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed default categories only when the table is empty (first-time setup).
    // This prevents deleted categories from being re-inserted on every request.
    const { rows } = await pool.query("SELECT 1 FROM education_categories LIMIT 1");
    if (rows.length === 0) {
      await pool.query(`
        INSERT INTO education_categories (name, display_name, color, sort_order, is_system)
        VALUES 
          ('Basics', 'Basics', 'bg-blue-500/20 text-blue-400', 1, true),
          ('Strategy', 'Strategy', 'bg-purple-500/20 text-purple-400', 2, true),
          ('RiskManagement', 'Risk Management', 'bg-red-500/20 text-red-400', 3, true),
          ('Psychology', 'Psychology', 'bg-amber-500/20 text-amber-400', 4, true),
          ('TechnicalAnalysis', 'Technical Analysis', 'bg-emerald-500/20 text-emerald-400', 5, true),
          ('Platform', 'Platform', 'bg-pink-500/20 text-pink-400', 6, true),
          ('Other', 'Other', 'bg-slate-500/20 text-slate-400', 7, true)
        ON CONFLICT (name) DO NOTHING;
      `);
    }
  } catch (error) {
    console.error("[education] Failed to create tables:", error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER ENDPOINTS (authenticated users)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/education - List published videos with user progress
router.get("/", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    // Auto-create tables if needed
    await ensureEducationTables(pool);

    // Lazy reconciliation: catch up videos stuck in 'processing' if the
    // background poll was lost (e.g. server restart). Bounded + TTL'd so it
    // doesn't hammer Bunny on every request.
    await reconcileProcessingVideos(pool);

    const result = await pool.query(
      `SELECT
        ev.id, ev.title, ev.description, ev.category,
        ev.bunny_thumbnail_url, ev.duration_seconds, ev.sort_order,
        ep.watched, ep.progress_seconds, ep.watched_at
       FROM education_videos ev
       LEFT JOIN education_progress ep ON ev.id = ep.video_id AND ep.user_id = $1
       WHERE ev.is_published = true AND ev.status = 'ready'
       ORDER BY ev.sort_order ASC, ev.created_at DESC`,
      [req.session.userId]
    );

    return res.json({ videos: result.rows });
  } catch (error) {
    if (error?.code === "42P01") {
      console.warn("[education] Tables do not exist, returning empty array");
      return res.json({ videos: [] });
    }
    console.error("[education] list error:", error);
    return res.status(500).json({ error: "Failed to fetch videos" });
  }
});

// GET /api/education/categories - Get unique categories
router.get("/categories", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    // Lazy reconciliation (see GET / above) — keep category list fresh even
    // if background polling died on a previous deploy.
    await reconcileProcessingVideos(pool);

    const result = await pool.query(
      `SELECT DISTINCT category
       FROM education_videos
       WHERE is_published = true AND status = 'ready'
       ORDER BY category`
    );

    return res.json({ categories: result.rows.map((r) => r.category) });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({ categories: [] });
    }
    console.error("[education] categories error:", error);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// POST /api/education/:id/embed-url - Generate signed embed URL
router.post("/:id/embed-url", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  if (!isBunnyStreamConfigured()) {
    return res.status(503).json({ error: "Video streaming service is not configured" });
  }

  try {
    await ensureEducationTables(pool);

    const videoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) {
      return res.status(400).json({ error: "Invalid video ID" });
    }

    // Check if video exists and is published
    const result = await pool.query(
      "SELECT bunny_video_id FROM education_videos WHERE id = $1 AND is_published = true AND status = 'ready'",
      [videoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Video not found or not available" });
    }

    const bunnyVideoId = result.rows[0].bunny_video_id;
    const embedUrl = generateSignedEmbedUrl(bunnyVideoId, 3600); // 1 hour expiry

    return res.json({ embedUrl, expiresIn: 3600 });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(404).json({ error: "Video not found" });
    }
    console.error("[education] embed-url error:", error);
    return res.status(500).json({ error: "Failed to generate video URL" });
  }
});

// POST /api/education/:id/progress - Update user progress
router.post("/:id/progress", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const videoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) {
      return res.status(400).json({ error: "Invalid video ID" });
    }

    const { watched, progressSeconds } = req.body || {};
    const sanitizedWatched = Boolean(watched);
    const sanitizedProgress = Math.max(0, parseInt(progressSeconds, 10) || 0);

    // Upsert progress
    await pool.query(
      `INSERT INTO education_progress (user_id, video_id, watched, progress_seconds, watched_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $3 THEN NOW() ELSE NULL END)
       ON CONFLICT (user_id, video_id)
       DO UPDATE SET 
         watched = $3,
         progress_seconds = $4,
         watched_at = CASE WHEN $3 THEN NOW() ELSE education_progress.watched_at END`,
      [req.session.userId, videoId, sanitizedWatched, sanitizedProgress]
    );

    return res.json({ ok: true });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(503).json({ error: "Progress tracking not available" });
    }
    console.error("[education] progress error:", error);
    return res.status(500).json({ error: "Failed to save progress" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/education/admin/list - List all videos (admin)
router.get("/admin/list", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const result = await pool.query(
      `SELECT 
        ev.id, ev.title, ev.description, ev.category, ev.bunny_video_id,
        ev.bunny_thumbnail_url, ev.duration_seconds, ev.file_size_bytes,
        ev.status, ev.sort_order, ev.is_published,
        ev.created_by_admin_id, ev.created_at, ev.updated_at,
        u.username as created_by_username
       FROM education_videos ev
       LEFT JOIN users u ON ev.created_by_admin_id = u.id
       ORDER BY ev.sort_order ASC, ev.created_at DESC`
    );

    return res.json({ videos: result.rows });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({ videos: [] });
    }
    console.error("[education] admin list error:", error);
    return res.status(500).json({ error: "Failed to fetch videos" });
  }
});

// POST /api/education/admin/create-upload - Create video on Bunny Stream and return direct upload credentials
// This avoids sending the video file through the serverless function (Vercel 4.5MB payload limit)
router.post("/admin/create-upload", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  if (!isBunnyStreamConfigured()) {
    return res.status(503).json({ error: "Video streaming service is not configured" });
  }

  try {
    await ensureEducationTables(pool);

    const { title, description, category, is_published, fileSize } = req.body || {};

    // Validation
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ error: "Title is required (min 3 characters)" });
    }

    const sanitizedTitle = String(title).trim().slice(0, 500);

    // Create video in Bunny Stream
    const bunnyVideo = await createVideo(sanitizedTitle);
    const bunnyVideoId = bunnyVideo.guid;

    // Generate direct upload credentials (TUS protocol)
    const uploadCredentials = generateDirectUploadCredentials(bunnyVideoId);

    return res.json({
      ok: true,
      videoId: bunnyVideoId,
      upload: uploadCredentials,
    });
  } catch (error) {
    console.error("[education] create-upload error:", error);
    return res.status(500).json({ error: error.message || "Failed to create upload" });
  }
});

// POST /api/education/admin/confirm-upload - Confirm video upload and save to database
router.post("/admin/confirm-upload", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  if (!isBunnyStreamConfigured()) {
    return res.status(503).json({ error: "Video streaming service is not configured" });
  }

  try {
    await ensureEducationTables(pool);

    const { videoId, title, description, category, is_published, fileSize } = req.body || {};

    if (!videoId) {
      return res.status(400).json({ error: "videoId is required" });
    }
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ error: "Title is required (min 3 characters)" });
    }

    const sanitizedTitle = String(title).trim().slice(0, 500);
    const sanitizedDescription = description ? String(description).slice(0, 5000) : "";
    const validCategories = await getValidCategories(pool);
    const sanitizedCategory = validCategories.includes(category) ? category : "Other";
    const sanitizedPublished = is_published === "true" || is_published === true;
    const sanitizedVideoId = String(videoId).slice(0, 100);
    const sanitizedFileSize = Math.max(0, Math.min(Number(fileSize) || 0, 5 * 1024 * 1024 * 1024)); // cap at 5GB

    // Get thumbnail URL
    const thumbnailUrl = getThumbnailUrl(sanitizedVideoId);

    // Insert into database
    const result = await pool.query(
      `INSERT INTO education_videos 
        (title, description, category, bunny_video_id, bunny_thumbnail_url, 
         file_size_bytes, status, is_published, created_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, title, bunny_video_id, status`,
      [
        sanitizedTitle,
        sanitizedDescription,
        sanitizedCategory,
        sanitizedVideoId,
        thumbnailUrl,
        sanitizedFileSize,
        "processing",
        sanitizedPublished,
        req.session.userId,
      ]
    );

    const video = result.rows[0];

    // Log admin action
    await logAdmin(req.session.userId, "education.upload", null, {
      videoId: video.id,
      title: sanitizedTitle,
      category: sanitizedCategory,
    });

    // Start polling status asynchronously (don't wait for it)
    pollVideoStatus(sanitizedVideoId)
      .then(async (bunnyData) => {
        await pool.query(
          `UPDATE education_videos 
           SET status = 'ready', duration_seconds = $1, updated_at = NOW()
           WHERE bunny_video_id = $2`,
          [bunnyData.length || 0, sanitizedVideoId]
        );
      })
      .catch((err) => {
        console.error("[education] Status polling failed:", err);
        // Only mark as failed if Bunny reported an actual error, not on timeout
        if (err instanceof VideoProcessingError) {
          pool.query(
            "UPDATE education_videos SET status = 'failed', updated_at = NOW() WHERE bunny_video_id = $1",
            [sanitizedVideoId]
          ).catch((e) => console.error("[education] Failed to update status:", e));
        } else {
          console.log("[education] Polling timed out for video %s — status remains 'processing'. Use check-status to update manually.", sanitizedVideoId);
        }
      });

    return res.json({ ok: true, video });
  } catch (error) {
    console.error("[education] confirm-upload error:", error);
    return res.status(500).json({ error: error.message || "Failed to confirm upload" });
  }
});

// POST /api/education/admin/upload - Upload new video
router.post("/admin/upload", requireAdmin, uploadVideoMiddleware("file"), async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  if (!isBunnyStreamConfigured()) {
    return res.status(503).json({ error: "Video streaming service is not configured" });
  }

  try {
    await ensureEducationTables(pool);

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { title, description, category, is_published } = req.body || {};

    // Validation
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ error: "Title is required (min 3 characters)" });
    }

    const sanitizedTitle = String(title).trim().slice(0, 500);
    const sanitizedDescription = description ? String(description).slice(0, 5000) : "";
    const validCategories = await getValidCategories(pool);
    const sanitizedCategory = validCategories.includes(category) ? category : "Other";
    const sanitizedPublished = is_published === "true" || is_published === true;

    // Step 1: Create video in Bunny Stream
    const bunnyVideo = await createVideo(sanitizedTitle);
    const bunnyVideoId = bunnyVideo.guid;

    // Step 2: Upload video file
    await uploadVideo(bunnyVideoId, req.file.buffer);

    // Step 3: Get thumbnail URL
    const thumbnailUrl = getThumbnailUrl(bunnyVideoId);

    // Step 4: Insert into database
    const result = await pool.query(
      `INSERT INTO education_videos 
        (title, description, category, bunny_video_id, bunny_thumbnail_url, 
         file_size_bytes, status, is_published, created_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, title, bunny_video_id, status`,
      [
        sanitizedTitle,
        sanitizedDescription,
        sanitizedCategory,
        bunnyVideoId,
        thumbnailUrl,
        req.file.size,
        "processing",
        sanitizedPublished,
        req.session.userId,
      ]
    );

    const video = result.rows[0];

    // Log admin action
    await logAdmin(req.session.userId, "education.upload", null, {
      videoId: video.id,
      title: sanitizedTitle,
      category: sanitizedCategory,
    });

    // Start polling status asynchronously (don't wait for it)
    pollVideoStatus(bunnyVideoId)
      .then(async (bunnyData) => {
        // Update database with final status
        await pool.query(
          `UPDATE education_videos 
           SET status = 'ready', duration_seconds = $1, updated_at = NOW()
           WHERE bunny_video_id = $2`,
          [bunnyData.length || 0, bunnyVideoId]
        );
      })
      .catch((err) => {
        console.error("[education] Status polling failed:", err);
        // Only mark as failed if Bunny reported an actual error, not on timeout
        if (err instanceof VideoProcessingError) {
          pool.query(
            "UPDATE education_videos SET status = 'failed', updated_at = NOW() WHERE bunny_video_id = $1",
            [bunnyVideoId]
          ).catch((e) => console.error("[education] Failed to update status:", e));
        } else {
          console.log("[education] Polling timed out for video %s — status remains 'processing'. Use check-status to update manually.", bunnyVideoId);
        }
      });

    return res.json({ ok: true, video });
  } catch (error) {
    console.error("[education] upload error:", error);
    return res.status(500).json({ error: error.message || "Failed to upload video" });
  }
});

// PUT /api/education/admin/:id - Update video metadata
router.put("/admin/:id", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const videoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) {
      return res.status(400).json({ error: "Invalid video ID" });
    }

    const { title, description, category, is_published, sort_order } = req.body || {};

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title !== undefined) {
      const sanitizedTitle = String(title).trim().slice(0, 500);
      if (sanitizedTitle.length < 3) {
        return res.status(400).json({ error: "Title must be at least 3 characters" });
      }
      updates.push(`title = $${paramIndex++}`);
      values.push(sanitizedTitle);
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(String(description).slice(0, 5000));
    }

    if (category !== undefined) {
      const validCategories = await getValidCategories(pool);
      const sanitizedCategory = validCategories.includes(category) ? category : "Other";
      updates.push(`category = $${paramIndex++}`);
      values.push(sanitizedCategory);
    }

    if (is_published !== undefined) {
      updates.push(`is_published = $${paramIndex++}`);
      values.push(Boolean(is_published));
    }

    if (sort_order !== undefined) {
      const sanitizedOrder = Math.max(0, parseInt(sort_order, 10) || 0);
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(sanitizedOrder);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(videoId);

    const result = await pool.query(
      `UPDATE education_videos 
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, title, category, is_published, sort_order`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    await logAdmin(req.session.userId, "education.update", null, {
      videoId,
      updates: Object.keys(req.body),
    });

    return res.json({ ok: true, video: result.rows[0] });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(404).json({ error: "Video not found" });
    }
    console.error("[education] update error:", error);
    return res.status(500).json({ error: "Failed to update video" });
  }
});

// DELETE /api/education/admin/:id - Delete video
router.delete("/admin/:id", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const videoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) {
      return res.status(400).json({ error: "Invalid video ID" });
    }

    // Get video info first
    const videoResult = await pool.query(
      "SELECT bunny_video_id, title FROM education_videos WHERE id = $1",
      [videoId]
    );

    if (videoResult.rows.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const video = videoResult.rows[0];

    // Delete from Bunny Stream
    if (isBunnyStreamConfigured()) {
      try {
        await deleteVideo(video.bunny_video_id);
      } catch (err) {
        console.error("[education] Bunny delete error:", err);
        // Continue with DB deletion even if Bunny fails
      }
    }

    // Delete from database (progress entries will cascade delete)
    await pool.query("DELETE FROM education_videos WHERE id = $1", [videoId]);

    await logAdmin(req.session.userId, "education.delete", null, {
      videoId,
      title: video.title,
    });

    return res.json({ ok: true });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(404).json({ error: "Video not found" });
    }
    console.error("[education] delete error:", error);
    return res.status(500).json({ error: "Failed to delete video" });
  }
});

// PUT /api/education/admin/:id/publish - Toggle publish status
router.put("/admin/:id/publish", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const videoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) {
      return res.status(400).json({ error: "Invalid video ID" });
    }

    const result = await pool.query(
      `UPDATE education_videos 
       SET is_published = NOT is_published, updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, is_published`,
      [videoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    await logAdmin(req.session.userId, "education.publish", null, {
      videoId,
      isPublished: result.rows[0].is_published,
    });

    return res.json({ ok: true, video: result.rows[0] });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(404).json({ error: "Video not found" });
    }
    console.error("[education] publish error:", error);
    return res.status(500).json({ error: "Failed to toggle publish status" });
  }
});

// PUT /api/education/admin/reorder - Reorder videos
router.put("/admin/reorder", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const { items } = req.body || {};

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Items array is required" });
    }

    // Update sort_order for each video
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const videoId = parseInt(item.id, 10);
        if (Number.isFinite(videoId)) {
          await client.query(
            "UPDATE education_videos SET sort_order = $1, updated_at = NOW() WHERE id = $2",
            [i, videoId]
          );
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await logAdmin(req.session.userId, "education.reorder", null, {
      itemCount: items.length,
    });

    return res.json({ ok: true });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(404).json({ error: "Videos not found" });
    }
    console.error("[education] reorder error:", error);
    return res.status(500).json({ error: "Failed to reorder videos" });
  }
});

// POST /api/education/admin/:id/check-status - Check video processing status
router.post("/admin/:id/check-status", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  if (!isBunnyStreamConfigured()) {
    return res.status(503).json({ error: "Video streaming service is not configured" });
  }

  try {
    await ensureEducationTables(pool);

    const videoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) {
      return res.status(400).json({ error: "Invalid video ID" });
    }

    // Get bunny_video_id
    const videoResult = await pool.query(
      "SELECT bunny_video_id FROM education_videos WHERE id = $1",
      [videoId]
    );

    if (videoResult.rows.length === 0) {
      return res.status(404).json({ error: "Video not found" });
    }

    const bunnyVideoId = videoResult.rows[0].bunny_video_id;

    // Get status from Bunny
    const bunnyData = await getVideo(bunnyVideoId);

    // Map Bunny status to our status
    let status = "processing";
    if (bunnyData.status === 4) status = "ready";
    else if (bunnyData.status === 5) status = "failed";

    // Update database
    await pool.query(
      `UPDATE education_videos 
       SET status = $1, duration_seconds = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, bunnyData.length || 0, videoId]
    );

    return res.json({
      ok: true,
      status,
      duration: bunnyData.length || 0,
      bunnyStatus: bunnyData.status,
    });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(404).json({ error: "Video not found" });
    }
    console.error("[education] check-status error:", error);
    return res.status(500).json({ error: "Failed to check video status" });
  }
});

// POST /api/education/admin/:id/embed-url - Generate signed embed URL for admin preview
router.post("/admin/:id/embed-url", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  if (!isBunnyStreamConfigured()) {
    return res.status(503).json({ error: "Video streaming service is not configured" });
  }

  try {
    await ensureEducationTables(pool);

    const videoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(videoId)) {
      return res.status(400).json({ error: "Invalid video ID" });
    }

    // Admin can preview any ready video regardless of publish status
    const result = await pool.query(
      "SELECT bunny_video_id FROM education_videos WHERE id = $1 AND status = 'ready'",
      [videoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Video not found or not ready" });
    }

    const bunnyVideoId = result.rows[0].bunny_video_id;
    const embedUrl = generateSignedEmbedUrl(bunnyVideoId, 3600); // 1 hour expiry

    return res.json({ embedUrl, expiresIn: 3600 });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(404).json({ error: "Video not found" });
    }
    console.error("[education] admin embed-url error:", error);
    return res.status(500).json({ error: "Failed to generate video URL" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY MANAGEMENT ENDPOINTS (ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/education/admin/categories - List all categories (admin)
router.get("/admin/categories", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const result = await pool.query(
      `SELECT id, name, display_name, color, sort_order, is_system, created_at, updated_at
       FROM education_categories
       ORDER BY sort_order ASC, name ASC`
    );

    return res.json({ categories: result.rows });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({ categories: [] });
    }
    console.error("[education] admin categories list error:", error);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// POST /api/education/admin/categories - Create new category (admin)
router.post("/admin/categories", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const { name, display_name, color } = req.body || {};

    if (!name || !display_name) {
      return res.status(400).json({ error: "Name and display name are required" });
    }

    const sanitizedName = String(name).trim().slice(0, 100);
    const sanitizedDisplayName = String(display_name).trim().slice(0, 200);
    const sanitizedColor = color ? String(color).trim().slice(0, 50) : "bg-slate-500/20 text-slate-400";

    const result = await pool.query(
      `INSERT INTO education_categories (name, display_name, color, is_system)
       VALUES ($1, $2, $3, false)
       RETURNING id, name, display_name, color, sort_order, is_system`,
      [sanitizedName, sanitizedDisplayName, sanitizedColor]
    );

    await logAdmin(req.session.userId, "education.category.create", null, {
      categoryId: result.rows[0].id,
      name: sanitizedName,
    });

    return res.json({ ok: true, category: result.rows[0] });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(400).json({ error: "Category with this name already exists" });
    }
    console.error("[education] admin category create error:", error);
    return res.status(500).json({ error: error.message || "Failed to create category" });
  }
});

// PUT /api/education/admin/categories/:id - Update category (admin)
router.put("/admin/categories/:id", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const categoryId = parseInt(req.params.id, 10);
    if (!Number.isFinite(categoryId)) {
      return res.status(400).json({ error: "Invalid category ID" });
    }

    const { display_name, color, sort_order } = req.body || {};

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(String(display_name).trim().slice(0, 200));
    }

    if (color !== undefined) {
      updates.push(`color = $${paramIndex++}`);
      values.push(String(color).trim().slice(0, 50));
    }

    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      values.push(Math.max(0, parseInt(sort_order, 10) || 0));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updates.push(`updated_at = NOW()`);
    values.push(categoryId);

    const result = await pool.query(
      `UPDATE education_categories 
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, name, display_name, color, sort_order, is_system`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    await logAdmin(req.session.userId, "education.category.update", null, {
      categoryId,
      updates: Object.keys(req.body),
    });

    return res.json({ ok: true, category: result.rows[0] });
  } catch (error) {
    console.error("[education] admin category update error:", error);
    return res.status(500).json({ error: "Failed to update category" });
  }
});

// DELETE /api/education/admin/categories/:id - Delete category (admin)
router.delete("/admin/categories/:id", requireAdmin, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    await ensureEducationTables(pool);

    const categoryId = parseInt(req.params.id, 10);
    if (!Number.isFinite(categoryId)) {
      return res.status(400).json({ error: "Invalid category ID" });
    }

    // Check if it's a system category
    const catResult = await pool.query(
      "SELECT name, is_system FROM education_categories WHERE id = $1",
      [categoryId]
    );

    if (catResult.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Prevent deletion of the "Other" category since it's the default fallback
    if (catResult.rows[0].name === "Other") {
      return res.status(400).json({ error: "Cannot delete the default 'Other' category" });
    }

    // Update videos using this category to "Other"
    await pool.query(
      "UPDATE education_videos SET category = 'Other' WHERE category = $1",
      [catResult.rows[0].name]
    );

    // Delete the category
    await pool.query("DELETE FROM education_categories WHERE id = $1", [categoryId]);

    await logAdmin(req.session.userId, "education.category.delete", null, {
      categoryId,
      name: catResult.rows[0].name,
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("[education] admin category delete error:", error);
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;
