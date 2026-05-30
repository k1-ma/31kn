import { Router } from "express";
import { queryWithRecovery } from "../services/db.service.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotency } from "../middleware/idempotency.js";

const router = Router();

// Max absolute amount in integer cents: 1 trillion cents = 10 billion currency units.
const MAX_AMOUNT_CENTS = 1_000_000_000_00;

// Collections that, when present in the state blob, must be arrays.
const ARRAY_COLLECTIONS = [
  "wallets",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "recurring",
  "debts",
];

function firstPresent(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/**
 * Validate a state blob before persisting. Lenient about field naming
 * (accepts camelCase and snake_case) and only checks fields that are present.
 * The goal is to reject obviously malicious/corrupt amounts and shapes,
 * not to enforce a strict schema.
 *
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
function validateStatePayload(state) {
  if (!state || typeof state !== "object") {
    return { valid: false, error: "Invalid state payload" };
  }

  // Known collections, if present, must be arrays.
  for (const name of ARRAY_COLLECTIONS) {
    const val = state[name];
    if (val === undefined || val === null) continue;
    if (!Array.isArray(val)) {
      return { valid: false, error: `Field "${name}" must be an array` };
    }
  }

  // Transactions: amount (cents) must be a finite integer within range.
  if (Array.isArray(state.transactions)) {
    for (const tx of state.transactions) {
      if (!tx || typeof tx !== "object") continue;
      const amount = firstPresent(tx, ["amountCents", "amount_cents", "amount"]);
      if (amount === undefined) continue;
      if (
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        !Number.isInteger(amount) ||
        Math.abs(amount) > MAX_AMOUNT_CENTS
      ) {
        return { valid: false, error: "Invalid transaction amount" };
      }
    }
  }

  // Budgets: limit must be a finite non-negative integer within range.
  if (Array.isArray(state.budgets)) {
    for (const b of state.budgets) {
      if (!b || typeof b !== "object") continue;
      const limit = firstPresent(b, ["limitCents", "limit_cents"]);
      if (limit === undefined) continue;
      if (
        typeof limit !== "number" ||
        !Number.isFinite(limit) ||
        !Number.isInteger(limit) ||
        limit < 0 ||
        limit > MAX_AMOUNT_CENTS
      ) {
        return { valid: false, error: "Invalid budget limit" };
      }
    }
  }

  // Goals: target must be a finite non-negative integer within range.
  if (Array.isArray(state.goals)) {
    for (const g of state.goals) {
      if (!g || typeof g !== "object") continue;
      const target = firstPresent(g, ["targetCents", "target_cents"]);
      if (target === undefined) continue;
      if (
        typeof target !== "number" ||
        !Number.isFinite(target) ||
        !Number.isInteger(target) ||
        target < 0 ||
        target > MAX_AMOUNT_CENTS
      ) {
        return { valid: false, error: "Invalid goal target" };
      }
    }
  }

  return { valid: true };
}

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
    const validation = validateStatePayload(state);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
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
