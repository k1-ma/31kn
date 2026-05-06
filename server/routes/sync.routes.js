import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

/**
 * Legacy /api/sync surface kept as a no-op for older clients. The current
 * client uses /api/state for snapshot exchange. Once the per-entity REST
 * endpoints (wallets/transactions/etc.) ship, this router will be replaced.
 */
router.get("/", requireAuth, (_req, res) => {
  res.json({ ok: true, mode: "state-blob" });
});

router.post("/", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

export default router;
