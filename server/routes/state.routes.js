import { Router } from "express";
import { queryWithRecovery } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotency } from "../middleware/idempotency.js";

const router = Router();

/**
 * GET /api/state — return the current user's serialized state blob.
 * The Koshyk client keeps its primary store in IndexedDB, but a JSON
 * blob is mirrored here so users can restore on a fresh device.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const q = await queryWithRecovery(
      "SELECT state_json, updated_at FROM states WHERE user_id = $1",
      [userId]
    );
    const row = q.rows?.[0];
    return res.json({
      state: row?.state_json || {},
      updatedAt: row?.updated_at || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to load state" });
  }
});

async function saveState(req, res) {
  try {
    const userId = req.session.userId;
    const body = req.body || {};
    const state = body.state ?? body;
    if (!state || typeof state !== "object") {
      return res.status(400).json({ error: "Invalid state payload" });
    }
    const q = await queryWithRecovery(
      `INSERT INTO states (user_id, state_json, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE
         SET state_json = EXCLUDED.state_json,
             updated_at = now()
       RETURNING updated_at`,
      [userId, JSON.stringify(state)]
    );
    return res.json({
      ok: true,
      updatedAt: q.rows?.[0]?.updated_at || new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to save state" });
  }
}

router.put("/", requireAuth, idempotency(), saveState);
router.post("/", requireAuth, idempotency(), saveState);

router.delete("/", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    await queryWithRecovery("DELETE FROM states WHERE user_id = $1", [userId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to clear state" });
  }
});

export default router;
