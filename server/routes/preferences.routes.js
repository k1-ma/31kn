/**
 * GET/PUT /api/preferences — per-user UI preferences (base currency, theme).
 *
 * These were the only non-collection part of the old state blob. They live in
 * a dedicated one-row-per-user table with a small JSONB payload (≤ 2 KB),
 * which is the allowed use of JSONB: opaque per-user settings, NOT an entity
 * collection. See docs/ARCHITECTURE.md.
 */

import { Router } from "express";
import { queryWithRecovery } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotency } from "../middleware/idempotency.js";
import { rejectUserIdInRequest, getUserId } from "../utils/userScope.js";

const router = Router();
const MAX_PREFS_BYTES = 2 * 1024;
const DEFAULT_PREFS = { baseCurrency: "UAH", theme: "system" };

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const q = await queryWithRecovery(
      "SELECT prefs FROM user_preferences WHERE user_id = $1",
      [userId]
    );
    return res.json({ prefs: { ...DEFAULT_PREFS, ...(q.rows?.[0]?.prefs || {}) } });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to load preferences", code: "LOAD_FAILED" });
  }
});

router.put("/", requireAuth, rejectUserIdInRequest, idempotency(), async (req, res) => {
  try {
    const userId = getUserId(req);
    const prefs = req.body?.prefs ?? req.body;
    if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
      return res.status(400).json({ error: "Invalid preferences payload", code: "INVALID_PAYLOAD" });
    }
    const serialized = JSON.stringify(prefs);
    if (Buffer.byteLength(serialized, "utf8") > MAX_PREFS_BYTES) {
      return res.status(413).json({ error: "Preferences too large", code: "PREFS_TOO_LARGE" });
    }
    await queryWithRecovery(
      `INSERT INTO user_preferences (user_id, prefs, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
      [userId, serialized]
    );
    return res.json({ prefs: { ...DEFAULT_PREFS, ...prefs } });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to save preferences", code: "SAVE_FAILED" });
  }
});

export default router;
