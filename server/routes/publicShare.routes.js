import { Router } from "express";
import crypto from "crypto";
import express from "express";
import { getPool, ensurePool, dbUnavailableResponse, getUserById } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Note: Rate limiting is applied globally to all /api routes in app.js via rateLimitDbMiddleware
// This applies both in-memory burst limiting and database-backed daily limits

// Valid share types
const VALID_TYPES = ["trade", "doc", "idea", "backtest"];

// Max payload size is 50MB (for assembled payload)
const MAX_PAYLOAD_SIZE = 50 * 1024 * 1024;

// Share ID length (24 hex characters from 12 bytes)
const SHARE_ID_LENGTH = 24;

// Max chunk data size (3.5MB to stay well under Vercel's 4.5MB body limit)
const MAX_CHUNK_DATA_SIZE = 3.5 * 1024 * 1024;

// Max chunks per share (prevents abuse)
const MAX_CHUNKS = 100;

// Pending share expiry time (10 minutes) — cleanup stale chunked uploads
// Reduced from 1 hour to prevent DB bloat from failed chunked uploads (BUG #8)
const PENDING_SHARE_TTL_MS = 10 * 60 * 1000;

/**
 * Generate a secure share ID (24 hex characters = 12 bytes)
 * @returns {string}
 */
function generateSecureShareId() {
  return crypto.randomBytes(12).toString("hex");
}

/**
 * Get share URL path by type
 */
function getShareUrlPath(type, shareId) {
  switch (type) {
    case "trade":    return `/share/${shareId}`;
    case "doc":      return `/share-doc/${shareId}`;
    case "idea":     return `/share-idea/${shareId}`;
    case "backtest": return `/share-backtest/${shareId}`;
    default:         return `/share/${shareId}`;
  }
}

/**
 * Cleanup stale pending shares and their chunks (older than 1 hour)
 */
let _cleanupRunning = false;
async function cleanupStalePendingShares(pool) {
  if (_cleanupRunning) return;
  _cleanupRunning = true;
  try {
    const cutoff = new Date(Date.now() - PENDING_SHARE_TTL_MS).toISOString();
    // Delete chunks for stale pending shares
    await pool.query(
      `DELETE FROM share_chunks WHERE share_id IN (
         SELECT id FROM public_shares WHERE status = 'pending' AND created_at < $1
       )`,
      [cutoff]
    );
    // Delete stale pending shares themselves
    await pool.query(
      `DELETE FROM public_shares WHERE status = 'pending' AND created_at < $1`,
      [cutoff]
    );
    // Also delete orphaned chunks (no matching share)
    await pool.query(
      `DELETE FROM share_chunks WHERE created_at < $1`,
      [cutoff]
    );
  } catch (err) {
    console.error("[public-share] cleanup stale pending shares error:", err);
  } finally {
    _cleanupRunning = false;
  }
}

/**
 * POST /api/public-share
 * Create a new public share (requires authentication)
 * For small payloads that fit in a single request.
 */
router.post(
  "/",
  express.json({ limit: "50mb" }),
  requireAuth,
  async (req, res) => {
    let pool = getPool();
    if (!pool) {
      try { pool = await ensurePool(); } catch { /* retry failed */ }
    }
    if (!pool) return res.status(503).json(dbUnavailableResponse());

    try {
      const { type, payload, title, expiresAt } = req.body;

      // Validate type
      if (!type || !VALID_TYPES.includes(type)) {
        return res.status(400).json({
          error: "Invalid type",
          detail: `Type must be one of: ${VALID_TYPES.join(", ")}`,
        });
      }

      // Validate payload
      if (!payload || typeof payload !== "object" || Object.keys(payload).length === 0) {
        return res.status(400).json({
          error: "Invalid payload",
          detail: "Payload must be a non-empty object",
        });
      }

      // Check payload size
      const payloadStr = JSON.stringify(payload);
      if (payloadStr.length > MAX_PAYLOAD_SIZE) {
        return res.status(413).json({
          error: "Payload too large",
          detail: `Payload size (${(payloadStr.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed (${MAX_PAYLOAD_SIZE / (1024 * 1024)} MB)`,
        });
      }

      // Get user info for author name
      const user = await getUserById(req.session.userId);
      const authorName = user?.display_name || user?.nickname || user?.username || null;

      // Generate secure share ID
      const shareId = generateSecureShareId();

      // Parse expires_at if provided
      let expiresAtDate = null;
      if (expiresAt) {
        expiresAtDate = new Date(expiresAt);
        if (Number.isNaN(expiresAtDate.getTime())) {
          return res.status(400).json({
            error: "Invalid expiresAt",
            detail: "expiresAt must be a valid ISO date string",
          });
        }
      }

      // Sanitize title
      const sanitizedTitle = title ? String(title).trim().slice(0, 500) : null;

      // Insert into database
      await pool.query(
        `INSERT INTO public_shares (id, type, user_id, payload, title, author_name, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'complete')`,
        [
          shareId,
          type,
          req.session.userId,
          payload,
          sanitizedTitle,
          authorName,
          expiresAtDate,
        ]
      );

      return res.json({
        shareId,
        url: getShareUrlPath(type, shareId),
      });
    } catch (error) {
      console.error("[public-share] create error:", error);
      return res.status(500).json({ error: "Failed to create public share" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKED UPLOAD — for payloads that exceed Vercel's body size limit (~4.5 MB)
// Flow: POST /chunked/init → POST /chunked/:shareId (×N) → assembled on last chunk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/public-share/chunked/init
 * Initialize a chunked share upload. Creates a pending share record and stores the first chunk.
 */
router.post(
  "/chunked/init",
  express.json({ limit: "4mb" }),
  requireAuth,
  async (req, res) => {
    let pool = getPool();
    if (!pool) {
      try { pool = await ensurePool(); } catch { /* retry failed */ }
    }
    if (!pool) return res.status(503).json(dbUnavailableResponse());

    try {
      const { type, title, expiresAt, totalChunks, chunkData } = req.body;

      // Validate type
      if (!type || !VALID_TYPES.includes(type)) {
        return res.status(400).json({
          error: "Invalid type",
          detail: `Type must be one of: ${VALID_TYPES.join(", ")}`,
        });
      }

      // Validate totalChunks
      if (!totalChunks || typeof totalChunks !== "number" || totalChunks < 2 || totalChunks > MAX_CHUNKS) {
        return res.status(400).json({
          error: "Invalid totalChunks",
          detail: `totalChunks must be between 2 and ${MAX_CHUNKS}`,
        });
      }

      // Validate first chunk data
      if (!chunkData || typeof chunkData !== "string") {
        return res.status(400).json({
          error: "Missing chunkData",
          detail: "First chunk data is required",
        });
      }

      if (chunkData.length > MAX_CHUNK_DATA_SIZE) {
        return res.status(413).json({
          error: "Chunk too large",
          detail: `Chunk data size (${(chunkData.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum (${(MAX_CHUNK_DATA_SIZE / (1024 * 1024)).toFixed(1)} MB)`,
        });
      }

      // Get user info for author name
      const user = await getUserById(req.session.userId);
      const authorName = user?.display_name || user?.nickname || user?.username || null;

      // Generate secure share ID
      const shareId = generateSecureShareId();

      // Parse expires_at if provided
      let expiresAtDate = null;
      if (expiresAt) {
        expiresAtDate = new Date(expiresAt);
        if (Number.isNaN(expiresAtDate.getTime())) {
          return res.status(400).json({
            error: "Invalid expiresAt",
            detail: "expiresAt must be a valid ISO date string",
          });
        }
      }

      // Sanitize title
      const sanitizedTitle = title ? String(title).trim().slice(0, 500) : null;

      // Cleanup stale pending shares (fire-and-forget)
      cleanupStalePendingShares(pool);

      // Create pending share record (payload is empty placeholder, will be filled on finalization)
      await pool.query(
        `INSERT INTO public_shares (id, type, user_id, payload, title, author_name, expires_at, status)
         VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, $6, 'pending')`,
        [shareId, type, req.session.userId, sanitizedTitle, authorName, expiresAtDate]
      );

      // Store first chunk
      await pool.query(
        `INSERT INTO share_chunks (share_id, chunk_index, data)
         VALUES ($1, 0, $2)`,
        [shareId, chunkData]
      );

      return res.json({ shareId, totalChunks });
    } catch (error) {
      console.error("[public-share] chunked init error:", error);
      return res.status(500).json({ error: "Failed to initialize chunked share" });
    }
  }
);

/**
 * POST /api/public-share/chunked/:shareId
 * Upload a subsequent chunk for a pending share.
 * When isLast=true, assembles all chunks into the final payload.
 */
router.post(
  "/chunked/:shareId",
  express.json({ limit: "4mb" }),
  requireAuth,
  async (req, res) => {
    let pool = getPool();
    if (!pool) {
      try { pool = await ensurePool(); } catch { /* retry failed */ }
    }
    if (!pool) return res.status(503).json(dbUnavailableResponse());

    try {
      const { shareId } = req.params;
      const { chunkIndex, chunkData, isLast } = req.body;

      // Validate shareId
      if (!shareId || shareId.length < SHARE_ID_LENGTH) {
        return res.status(400).json({ error: "Invalid share ID" });
      }

      // Validate chunk index
      if (typeof chunkIndex !== "number" || chunkIndex < 1 || chunkIndex >= MAX_CHUNKS) {
        return res.status(400).json({
          error: "Invalid chunkIndex",
          detail: `chunkIndex must be between 1 and ${MAX_CHUNKS - 1}`,
        });
      }

      // Validate chunk data
      if (!chunkData || typeof chunkData !== "string") {
        return res.status(400).json({
          error: "Missing chunkData",
          detail: "Chunk data is required",
        });
      }

      if (chunkData.length > MAX_CHUNK_DATA_SIZE) {
        return res.status(413).json({
          error: "Chunk too large",
          detail: `Chunk data size exceeds maximum`,
        });
      }

      // Verify the pending share exists and belongs to this user
      const shareResult = await pool.query(
        `SELECT id, type, user_id FROM public_shares WHERE id = $1 AND status = 'pending'`,
        [shareId]
      );

      if (shareResult.rows.length === 0) {
        return res.status(404).json({ error: "Pending share not found" });
      }

      const share = shareResult.rows[0];
      if (share.user_id !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Store this chunk
      await pool.query(
        `INSERT INTO share_chunks (share_id, chunk_index, data)
         VALUES ($1, $2, $3)
         ON CONFLICT (share_id, chunk_index) DO UPDATE SET data = $3`,
        [shareId, chunkIndex, chunkData]
      );

      // If this is the last chunk, assemble the full payload
      if (isLast) {
        // Read all chunks in order
        const chunksResult = await pool.query(
          `SELECT data FROM share_chunks WHERE share_id = $1 ORDER BY chunk_index ASC`,
          [shareId]
        );

        // Concatenate all chunk data
        const fullPayloadStr = chunksResult.rows.map(r => r.data).join("");

        // Check total assembled size
        if (fullPayloadStr.length > MAX_PAYLOAD_SIZE) {
          // Cleanup: delete chunks and pending share
          await pool.query(`DELETE FROM share_chunks WHERE share_id = $1`, [shareId]);
          await pool.query(`DELETE FROM public_shares WHERE id = $1 AND status = 'pending'`, [shareId]);
          return res.status(413).json({
            error: "Payload too large",
            detail: `Assembled payload size (${(fullPayloadStr.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum (${MAX_PAYLOAD_SIZE / (1024 * 1024)} MB)`,
          });
        }

        // Parse the assembled JSON
        let payload;
        try {
          payload = JSON.parse(fullPayloadStr);
        } catch (parseErr) {
          // Cleanup on invalid JSON
          await pool.query(`DELETE FROM share_chunks WHERE share_id = $1`, [shareId]);
          await pool.query(`DELETE FROM public_shares WHERE id = $1 AND status = 'pending'`, [shareId]);
          return res.status(400).json({
            error: "Invalid payload",
            detail: "Assembled chunks do not form valid JSON",
          });
        }

        // Update the share with the complete payload
        await pool.query(
          `UPDATE public_shares SET payload = $1, status = 'complete' WHERE id = $2`,
          [JSON.stringify(payload), shareId]
        );

        // Delete chunks (they're no longer needed)
        await pool.query(`DELETE FROM share_chunks WHERE share_id = $1`, [shareId]);

        return res.json({
          ok: true,
          shareId,
          url: getShareUrlPath(share.type, shareId),
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("[public-share] chunked upload error:", error);
      return res.status(500).json({ error: "Failed to upload chunk" });
    }
  }
);

/**
 * GET /api/public-share/:shareId
 * Get a public share by ID (NO authentication required - public access)
 */
router.get("/:shareId", async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { shareId } = req.params;

    if (!shareId || shareId.length < SHARE_ID_LENGTH) {
      return res.status(400).json({ error: "Invalid share ID" });
    }

    // Fetch the share with current user info (LEFT JOIN to get up-to-date author name)
    const result = await pool.query(
      `SELECT s.id, s.type, s.payload, s.title, s.author_name, s.created_at, s.expires_at, s.revoked, s.views, s.status,
              u.display_name AS user_display_name, u.nickname AS user_nickname, u.username AS user_username
       FROM public_shares s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [shareId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Share not found" });
    }

    const share = result.rows[0];

    // Check if revoked
    if (share.revoked) {
      return res.status(404).json({ error: "Share not found" });
    }

    // Check if still pending (chunked upload not finalized)
    if (share.status === "pending") {
      return res.status(404).json({ error: "Share not found" });
    }

    // Check if expired
    if (share.expires_at && new Date(share.expires_at) <= new Date()) {
      return res.status(404).json({ error: "Share has expired" });
    }

    // Increment view count
    pool.query(
      "UPDATE public_shares SET views = views + 1 WHERE id = $1",
      [shareId]
    ).catch((err) => {
      console.error("[public-share] view count update error:", err);
    });

    // Resolve author name: prefer current user name, fall back to stored snapshot
    const authorName = share.user_display_name || share.user_nickname || share.user_username || share.author_name;

    // Set cache headers for CDN caching
    res.set("Cache-Control", "public, max-age=60");

    return res.json({
      id: share.id,
      type: share.type,
      title: share.title,
      authorName,
      createdAt: share.created_at,
      payload: share.payload,
    });
  } catch (error) {
    console.error("[public-share] get error:", error);
    return res.status(500).json({ error: "Failed to fetch public share" });
  }
});

/**
 * DELETE /api/public-share/:shareId
 * Revoke a public share (requires authentication - owner or admin)
 */
router.delete("/:shareId", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { shareId } = req.params;

    if (!shareId) {
      return res.status(400).json({ error: "Share ID required" });
    }

    // Fetch the share to check ownership
    const result = await pool.query(
      "SELECT id, user_id FROM public_shares WHERE id = $1",
      [shareId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Share not found" });
    }

    const share = result.rows[0];
    const isOwner = share.user_id === req.session.userId;
    const isAdmin = req.user?.role === "admin";

    // Check authorization
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Not authorized to delete this share" });
    }

    // Soft delete by setting revoked = true
    await pool.query(
      "UPDATE public_shares SET revoked = true WHERE id = $1",
      [shareId]
    );

    return res.json({ ok: true, message: "Share revoked successfully" });
  } catch (error) {
    console.error("[public-share] delete error:", error);
    return res.status(500).json({ error: "Failed to revoke share" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKED UPLOAD ABORT — cleanup on client error mid-upload (BUG #8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/public-share/chunked/:shareId/abort
 * Abort a chunked share upload. Deletes pending share row + chunks immediately.
 * Called by the client when a chunked upload fails mid-way.
 */
router.delete("/chunked/:shareId/abort", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { shareId } = req.params;

    if (!shareId) {
      return res.status(400).json({ error: "Share ID required" });
    }

    // Check the share exists and belongs to this user
    const result = await pool.query(
      "SELECT id, user_id, status FROM public_shares WHERE id = $1",
      [shareId]
    );

    if (result.rows.length === 0) {
      // Already cleaned up or never existed — treat as success
      return res.json({ ok: true, message: "Share not found (already cleaned up)" });
    }

    const share = result.rows[0];

    // Only the owner can abort their own share
    if (share.user_id !== req.session.userId) {
      return res.status(403).json({ error: "Not authorized to abort this share" });
    }

    // Only abort pending shares — completed shares should use the revoke endpoint
    if (share.status !== "pending") {
      return res.status(400).json({ error: "Can only abort pending shares" });
    }

    // Delete chunks first (foreign key), then the share itself
    await pool.query("DELETE FROM share_chunks WHERE share_id = $1", [shareId]);
    await pool.query("DELETE FROM public_shares WHERE id = $1 AND status = 'pending'", [shareId]);

    console.log(`[public-share] Aborted chunked upload: shareId=${shareId}, userId=${req.session.userId}`);

    return res.json({ ok: true, message: "Chunked upload aborted and cleaned up" });
  } catch (error) {
    console.error("[public-share] abort error:", error);
    return res.status(500).json({ error: "Failed to abort chunked upload" });
  }
});

export default router;
