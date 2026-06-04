/**
 * Generic per-entity REST router factory.
 *
 * Builds a CRUD router for one normalized finance table from its
 * entityConfig. Every route is scoped to the authenticated user (user_id is
 * read from the session, never the body — see userScope.js) and mutations
 * cost O(1 row), which is the whole point of the v2 model: changing one
 * transaction writes one row, not the user's entire state.
 *
 *   GET    /            list all rows (incl. soft-deleted, so Trash works)
 *   POST   /            create (client may supply id for optimistic UI)
 *   PUT    /:id         full update of provided fields
 *   PATCH  /:id         alias of PUT (partial update)
 *   DELETE /:id         soft delete (sets deleted_at)
 *   POST   /:id/restore clear deleted_at
 *   DELETE /:id/purge   hard delete
 */

import crypto from "node:crypto";
import { Router } from "express";
import { queryWithRecovery } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotency } from "../middleware/idempotency.js";
import { rejectUserIdInRequest, getUserId } from "../utils/userScope.js";
import {
  rowToDto,
  dtoValueToParam,
  isJsonField,
  validateEntity,
} from "./entityConfig.js";

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

// A bound placeholder, with a ::jsonb cast for JSONB columns.
function placeholder(idx, field) {
  return isJsonField(field) ? `$${idx}::jsonb` : `$${idx}`;
}

export function createEntityRouter(config) {
  const router = Router();
  router.use(requireAuth);

  // GET / — list every row the user owns (client filters soft-deletes).
  router.get("/", async (req, res) => {
    try {
      const userId = getUserId(req);
      const q = await queryWithRecovery(
        `SELECT * FROM ${config.table} WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      );
      return res.json({ items: q.rows.map((r) => rowToDto(config, r)) });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Failed to load", code: "LOAD_FAILED" });
    }
  });

  // POST / — create. Client-supplied id is honored (enables optimistic UI and
  // makes retries idempotent via ON CONFLICT).
  router.post("/", rejectUserIdInRequest, idempotency(), async (req, res) => {
    try {
      const userId = getUserId(req);
      const body = req.body || {};
      const validation = validateEntity(config, body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error, code: "INVALID_PAYLOAD" });
      }

      const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : newId(config.idPrefix);
      const cols = ["id", "user_id"];
      const vals = [id, userId];
      const ph = ["$1", "$2"];
      let idx = 3;
      for (const f of config.fields) {
        const param = dtoValueToParam(f, body);
        if (param === undefined) continue;
        cols.push(f.col);
        vals.push(param);
        ph.push(placeholder(idx, f));
        idx++;
      }
      cols.push("created_at", "updated_at");
      ph.push("now()", "now()");

      const sql = `INSERT INTO ${config.table} (${cols.join(", ")})
                   VALUES (${ph.join(", ")})
                   ON CONFLICT (id) DO NOTHING
                   RETURNING *`;
      const q = await queryWithRecovery(sql, vals);
      let row = q.rows?.[0];
      if (!row) {
        // Conflict: the row already exists (client retry). Return it, scoped
        // to the owner so a guessed id from another user leaks nothing.
        const existing = await queryWithRecovery(
          `SELECT * FROM ${config.table} WHERE id = $1 AND user_id = $2`,
          [id, userId]
        );
        row = existing.rows?.[0];
        if (!row) {
          return res.status(409).json({ error: "ID already in use", code: "ID_CONFLICT" });
        }
        return res.status(200).json({ item: rowToDto(config, row) });
      }
      return res.status(201).json({ item: rowToDto(config, row) });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Failed to create", code: "CREATE_FAILED" });
    }
  });

  async function update(req, res) {
    try {
      const userId = getUserId(req);
      const body = req.body || {};
      const validation = validateEntity(config, body, { partial: true });
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error, code: "INVALID_PAYLOAD" });
      }

      const sets = [];
      const vals = [];
      let idx = 1;
      for (const f of config.fields) {
        const param = dtoValueToParam(f, body);
        if (param === undefined) continue;
        sets.push(`${f.col} = ${placeholder(idx, f)}`);
        vals.push(param);
        idx++;
      }
      sets.push("updated_at = now()");
      vals.push(req.params.id, userId);

      const sql = `UPDATE ${config.table} SET ${sets.join(", ")}
                   WHERE id = $${idx} AND user_id = $${idx + 1}
                   RETURNING *`;
      const q = await queryWithRecovery(sql, vals);
      const row = q.rows?.[0];
      if (!row) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return res.json({ item: rowToDto(config, row) });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Failed to update", code: "UPDATE_FAILED" });
    }
  }
  router.put("/:id", rejectUserIdInRequest, idempotency(), update);
  router.patch("/:id", rejectUserIdInRequest, idempotency(), update);

  // DELETE /:id — soft delete.
  router.delete("/:id", idempotency(), async (req, res) => {
    try {
      const userId = getUserId(req);
      const q = await queryWithRecovery(
        `UPDATE ${config.table} SET deleted_at = now(), updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [req.params.id, userId]
      );
      const row = q.rows?.[0];
      if (!row) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return res.json({ item: rowToDto(config, row) });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Failed to delete", code: "DELETE_FAILED" });
    }
  });

  // POST /:id/restore — clear the tombstone.
  router.post("/:id/restore", idempotency(), async (req, res) => {
    try {
      const userId = getUserId(req);
      const q = await queryWithRecovery(
        `UPDATE ${config.table} SET deleted_at = NULL, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING *`,
        [req.params.id, userId]
      );
      const row = q.rows?.[0];
      if (!row) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return res.json({ item: rowToDto(config, row) });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Failed to restore", code: "RESTORE_FAILED" });
    }
  });

  // DELETE /:id/purge — permanent delete.
  router.delete("/:id/purge", idempotency(), async (req, res) => {
    try {
      const userId = getUserId(req);
      const q = await queryWithRecovery(
        `DELETE FROM ${config.table} WHERE id = $1 AND user_id = $2 RETURNING id`,
        [req.params.id, userId]
      );
      if (!q.rows?.[0]) return res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return res.json({ ok: true, id: q.rows[0].id });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Failed to purge", code: "PURGE_FAILED" });
    }
  });

  return router;
}
