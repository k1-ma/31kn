import { Router } from "express";
import { getPool, ensurePool, dbUnavailableResponse } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotency } from "../middleware/idempotency.js";

const router = Router();

// Note: Rate limiting is applied globally to all /api routes in app.js via rateLimitDbMiddleware
// This applies both in-memory burst limiting and database-backed daily limits

// Valid enum values for Trading Ideas
const DIRECTIONS = ["Long", "Short", "Both"];
const STATUSES = ["Planned", "Active", "Closed", "Archived"];
const RESULTS = ["Unknown", "Worked", "Failed", "Partial"];

// Limits for linked trade IDs to prevent excessive data storage
const MAX_LINKED_TRADES = 50;

// Helper to validate and sanitize trading idea input
function sanitizeTradingIdeaInput(body) {
  const idea = {};
  
  if (body.title !== undefined) {
    idea.title = String(body.title || "").trim().slice(0, 500);
  }
  if (body.pair !== undefined) {
    idea.pair = String(body.pair || "").trim().slice(0, 50);
  }
  if (body.direction !== undefined) {
    idea.direction = DIRECTIONS.includes(body.direction) ? body.direction : "Long";
  }
  if (body.timeframe !== undefined) {
    idea.timeframe = String(body.timeframe || "").trim().slice(0, 50);
  }
  if (body.status !== undefined) {
    idea.status = STATUSES.includes(body.status) ? body.status : "Planned";
  }
  if (body.result !== undefined) {
    idea.result = RESULTS.includes(body.result) ? body.result : "Unknown";
  }
  if (body.notes_html !== undefined) {
    idea.notes_html = String(body.notes_html || "").slice(0, 50000);
  }
  if (body.notes_text !== undefined) {
    idea.notes_text = String(body.notes_text || "").slice(0, 20000);
  }
  if (body.links !== undefined) {
    idea.links = Array.isArray(body.links) ? body.links.slice(0, 20) : [];
  }
  if (body.images !== undefined) {
    idea.images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];
  }
  if (body.tags !== undefined) {
    idea.tags = Array.isArray(body.tags) ? body.tags.slice(0, 20).map(t => String(t).slice(0, 50)) : [];
  }
  if (body.resolved_at !== undefined) {
    idea.resolved_at = body.resolved_at ? new Date(body.resolved_at) : null;
  }
  // Support idea_date (camelCase ideaDate from frontend) for user-specified idea date
  if (body.ideaDate !== undefined || body.idea_date !== undefined) {
    const raw = body.ideaDate || body.idea_date;
    idea.idea_date = raw ? String(raw).slice(0, 10) : null;
  }
  // Support linkedTradeIds (camelCase from frontend) or linked_trade_ids (snake_case)
  if (body.linkedTradeIds !== undefined || body.linked_trade_ids !== undefined) {
    const tradeIds = body.linkedTradeIds || body.linked_trade_ids;
    idea.linked_trade_ids = Array.isArray(tradeIds) ? tradeIds.slice(0, MAX_LINKED_TRADES).map(id => String(id)) : [];
  }
  // Support modelId (camelCase from frontend) or model_id (snake_case)
  if (body.modelId !== undefined || body.model_id !== undefined) {
    idea.model_id = String(body.modelId || body.model_id || "").trim().slice(0, 100) || null;
  }
  
  return idea;
}

// GET /api/ideas - List all trading ideas for current user
router.get("/", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const { status, result, search, pair } = req.query;

    // Pagination params with safe defaults and clamping
    const DEFAULT_LIMIT = 100;
    const MAX_LIMIT = 500;
    const rawLimit = parseInt(req.query.limit, 10);
    const rawOffset = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    // Build shared WHERE clause (used for both COUNT and SELECT)
    let whereClause = "WHERE user_id = $1 AND deleted_at IS NULL";
    const params = [req.session.userId];
    let paramIdx = 2;

    if (status && STATUSES.includes(status)) {
      whereClause += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (result && RESULTS.includes(result)) {
      whereClause += ` AND result = $${paramIdx++}`;
      params.push(result);
    }
    if (pair) {
      whereClause += ` AND pair ILIKE $${paramIdx++}`;
      params.push(`%${pair}%`);
    }
    if (search) {
      whereClause += ` AND (title ILIKE $${paramIdx} OR notes_text ILIKE $${paramIdx} OR pair ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    // Total count for the same filter set
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM trading_ideas ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    // Page query with LIMIT/OFFSET appended
    const pageParams = params.slice();
    pageParams.push(limit);
    pageParams.push(offset);
    const pageQuery =
      `SELECT * FROM trading_ideas ${whereClause} ORDER BY created_at DESC ` +
      `LIMIT $${paramIdx++} OFFSET $${paramIdx}`;

    const result2 = await pool.query(pageQuery, pageParams);

    // Backward compat: keep `ideas` field for existing frontend (src/pages/Ideas.jsx reads res.ideas).
    return res.json({
      items: result2.rows,
      total,
      limit,
      offset,
      ideas: result2.rows,
    });
  } catch (error) {
    console.error("[trading_ideas] list error:", error);
    return res.status(500).json({ error: "Failed to fetch trading ideas" });
  }
});

// GET /api/ideas/stats - Get aggregated statistics for trading ideas
router.get("/stats", requireAuth, async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const userId = req.session.userId;

    // Single aggregated query: total + active + result counts + status distribution
    const aggResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'Active')::int AS active,
         COUNT(*) FILTER (WHERE result = 'Worked')::int AS worked,
         COUNT(*) FILTER (WHERE result = 'Failed')::int AS failed,
         COUNT(*) FILTER (WHERE result = 'Partial')::int AS partial,
         COUNT(*) FILTER (WHERE status = 'Planned')::int AS status_planned,
         COUNT(*) FILTER (WHERE status = 'Active')::int AS status_active,
         COUNT(*) FILTER (WHERE status = 'Closed')::int AS status_closed,
         COUNT(*) FILTER (WHERE status = 'Archived')::int AS status_archived
       FROM trading_ideas
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    const agg = aggResult.rows[0] || {};
    const total = agg.total || 0;
    const active = agg.active || 0;
    const worked = agg.worked || 0;
    const failed = agg.failed || 0;
    const partial = agg.partial || 0;

    const totalWithResult = worked + failed + partial;
    const successRate = totalWithResult > 0 ? (worked / totalWithResult) * 100 : 0;

    // Build byStatus map preserving prior shape (only include statuses with count > 0,
    // matching original GROUP BY behaviour).
    const byStatus = {};
    if (agg.status_planned) byStatus.Planned = agg.status_planned;
    if (agg.status_active) byStatus.Active = agg.status_active;
    if (agg.status_closed) byStatus.Closed = agg.status_closed;
    if (agg.status_archived) byStatus.Archived = agg.status_archived;

    // Top pairs (kept as separate query because of GROUP BY pair + ORDER BY count + LIMIT)
    const pairResult = await pool.query(
      `SELECT pair, COUNT(*) as count,
        SUM(CASE WHEN result = 'Worked' THEN 1 ELSE 0 END) as worked
       FROM trading_ideas
       WHERE user_id = $1 AND deleted_at IS NULL AND pair IS NOT NULL AND pair != ''
       GROUP BY pair ORDER BY count DESC LIMIT 5`,
      [userId]
    );

    return res.json({
      total,
      active,
      worked,
      failed,
      partial,
      successRate: Math.round(successRate * 10) / 10,
      byStatus,
      topPairs: pairResult.rows,
    });
  } catch (error) {
    console.error("[trading_ideas] stats error:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// POST /api/ideas - Create new trading idea
router.post("/", requireAuth, idempotency(), async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const input = sanitizeTradingIdeaInput(req.body);
    
    if (!input.title || input.title.length < 1) {
      return res.status(400).json({ error: "Title is required" });
    }
    
    const result = await pool.query(
      `INSERT INTO trading_ideas (user_id, title, pair, direction, timeframe, status, result, notes_html, notes_text, links, images, tags, linked_trade_ids, idea_date, model_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        req.session.userId,
        input.title,
        input.pair || null,
        input.direction || "Long",
        input.timeframe || null,
        input.status || "Planned",
        input.result || "Unknown",
        input.notes_html || "",
        input.notes_text || "",
        JSON.stringify(input.links || []),
        JSON.stringify(input.images || []),
        JSON.stringify(input.tags || []),
        JSON.stringify(input.linked_trade_ids || []),
        input.idea_date || null,
        input.model_id || null,
      ]
    );
    
    return res.json({ idea: result.rows[0] });
  } catch (error) {
    console.error("[trading_ideas] create error:", error);
    return res.status(500).json({ error: "Failed to create trading idea" });
  }
});

// PATCH /api/ideas/:id - Update trading idea
router.patch("/:id", requireAuth, idempotency(), async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const ideaId = parseInt(req.params.id, 10);
    if (!Number.isFinite(ideaId)) {
      return res.status(400).json({ error: "Invalid idea ID" });
    }
    
    // Check ownership (and ensure not soft-deleted)
    const existing = await pool.query(
      "SELECT * FROM trading_ideas WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [ideaId, req.session.userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Trading idea not found" });
    }
    
    const currentIdea = existing.rows[0];
    const input = sanitizeTradingIdeaInput(req.body);
    
    // Auto-set resolved_at when result is set (not Unknown)
    if (input.result && input.result !== "Unknown" && currentIdea.result === "Unknown" && !input.resolved_at) {
      input.resolved_at = new Date();
    }
    
    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIdx = 1;
    
    for (const [key, value] of Object.entries(input)) {
      if (key === "links" || key === "images" || key === "tags" || key === "linked_trade_ids") {
        updates.push(`${key} = $${paramIdx++}`);
        params.push(JSON.stringify(value));
      } else {
        updates.push(`${key} = $${paramIdx++}`);
        params.push(value);
      }
    }
    
    if (updates.length === 0) {
      return res.json({ idea: currentIdea });
    }
    
    updates.push(`updated_at = now()`);
    params.push(ideaId);
    params.push(req.session.userId);
    
    const result = await pool.query(
      `UPDATE trading_ideas SET ${updates.join(", ")} WHERE id = $${paramIdx++} AND user_id = $${paramIdx} AND deleted_at IS NULL RETURNING *`,
      params
    );
    
    return res.json({ idea: result.rows[0] });
  } catch (error) {
    console.error("[trading_ideas] update error:", error);
    return res.status(500).json({ error: "Failed to update trading idea" });
  }
});

// DELETE /api/ideas/:id - Delete trading idea
router.delete("/:id", requireAuth, idempotency(), async (req, res) => {
  let pool = getPool();
  if (!pool) {
    try { pool = await ensurePool(); } catch { /* retry failed */ }
  }
  if (!pool) return res.status(503).json(dbUnavailableResponse());

  try {
    const ideaId = parseInt(req.params.id, 10);
    if (!Number.isFinite(ideaId)) {
      return res.status(400).json({ error: "Invalid idea ID" });
    }
    
    // Soft delete: mark deleted_at timestamp instead of removing the row
    const result = await pool.query(
      "UPDATE trading_ideas SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING id",
      [ideaId, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Trading idea not found" });
    }

    return res.json({ ok: true, id: ideaId });
  } catch (error) {
    console.error("[trading_ideas] delete error:", error);
    return res.status(500).json({ error: "Failed to delete trading idea" });
  }
});

export default router;
