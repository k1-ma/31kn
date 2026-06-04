/**
 * Finance domain REST surface.
 *
 * Mounts one normalized per-entity CRUD router per collection plus the
 * preferences endpoint and a transactional bulk-import (backup restore).
 * This replaces the old single-blob /api/state + /api/sync routes entirely.
 *
 * Write rate limiting (60 writes/min/user) is applied to mutations only —
 * reads (the 7 collection GETs on app boot) must not consume the write budget.
 */

import { Router } from "express";
import { getPool, queryWithRecovery } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotency } from "../middleware/idempotency.js";
import { writeRateLimit } from "../middleware/rateLimitDb.js";
import { rejectUserIdInRequest, getUserId } from "../utils/userScope.js";
import { createEntityRouter } from "../lib/entityRouter.js";
import {
  ENTITIES,
  ENTITY_NAMES,
  dtoValueToParam,
  isJsonField,
  validateEntity,
} from "../lib/entityConfig.js";
import preferencesRouter from "./preferences.routes.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Apply a middleware only to mutating requests; let reads pass straight through.
function mutationOnly(mw) {
  return (req, res, next) => (MUTATION_METHODS.has(req.method) ? mw(req, res, next) : next());
}

const router = Router();

// Per-entity CRUD: /api/wallets, /api/transactions, …
for (const name of ENTITY_NAMES) {
  router.use(`/${name}`, mutationOnly(writeRateLimit), createEntityRouter(ENTITIES[name]));
}

// /api/preferences
router.use("/preferences", mutationOnly(writeRateLimit), preferencesRouter);

/**
 * POST /api/import — transactional backup restore.
 *
 * Replaces every collection for the authenticated user in one transaction.
 * This is a deliberate bulk operation (whole-account restore), not a per-item
 * mutation, so it is the one place a full-state write is legitimate.
 */
router.post("/import", requireAuth, writeRateLimit, rejectUserIdInRequest, idempotency(), async (req, res) => {
  const payload = req.body?.data ?? req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid import payload", code: "INVALID_PAYLOAD" });
  }

  // Validate every item up front so a bad row aborts before we touch the DB.
  for (const name of ENTITY_NAMES) {
    const items = payload[name];
    if (items == null) continue;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: `Field "${name}" must be an array`, code: "INVALID_PAYLOAD" });
    }
    for (const item of items) {
      const v = validateEntity(ENTITIES[name], item);
      if (!v.valid) {
        return res.status(400).json({ error: `${name}: ${v.error}`, code: "INVALID_PAYLOAD" });
      }
    }
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "Database unavailable", code: "DB_UNAVAILABLE" });

  const client = await pool.connect();
  try {
    const userId = getUserId(req);
    await client.query("BEGIN");
    for (const name of ENTITY_NAMES) {
      const config = ENTITIES[name];
      const items = payload[name];
      if (items == null) continue;
      await client.query(`DELETE FROM ${config.table} WHERE user_id = $1`, [userId]);
      for (const item of items) {
        const cols = ["id", "user_id"];
        const vals = [
          typeof item.id === "string" && item.id ? item.id : `${config.idPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
        ];
        const ph = ["$1", "$2"];
        let idx = 3;
        for (const f of config.fields) {
          const param = dtoValueToParam(f, item);
          if (param === undefined) continue;
          cols.push(f.col);
          vals.push(param);
          ph.push(isJsonField(f) ? `$${idx}::jsonb` : `$${idx}`);
          idx++;
        }
        // Preserve original timestamps when present, else default to now().
        cols.push("created_at", "updated_at", "deleted_at");
        ph.push(
          item.createdAt ? `$${idx++}` : "now()",
          item.updatedAt ? `$${idx++}` : "now()",
          item.deletedAt ? `$${idx++}` : "NULL"
        );
        if (item.createdAt) vals.push(item.createdAt);
        if (item.updatedAt) vals.push(item.updatedAt);
        if (item.deletedAt) vals.push(item.deletedAt);

        await client.query(
          `INSERT INTO ${config.table} (${cols.join(", ")}) VALUES (${ph.join(", ")})
           ON CONFLICT (id) DO NOTHING`,
          vals
        );
      }
    }

    // Preferences, if included.
    if (payload.prefs && typeof payload.prefs === "object") {
      await client.query(
        `INSERT INTO user_preferences (user_id, prefs, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
        [userId, JSON.stringify(payload.prefs)]
      );
    }

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    return res.status(500).json({ error: err?.message || "Import failed", code: "IMPORT_FAILED" });
  } finally {
    client.release();
  }
});

export default router;
