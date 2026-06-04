import { apiJson } from "@/lib/api.js";

/**
 * Finance data-access layer. One query per normalized collection, mirrored
 * 1:1 to the per-entity REST endpoints (server/routes/finance.routes.js).
 * The TanStack Query cache is the client's single source of truth — there is
 * no hand-rolled sync layer, no IndexedDB blob, no merge/reconcile logic.
 */

export const ENTITY_NAMES = [
  "wallets",
  "categories",
  "transactions",
  "budgets",
  "goals",
  "recurring",
  "debts",
];

/** Query keys are namespaced per user so a logout/login swaps cleanly. */
export const qk = {
  all: (userId) => ["finance", userId],
  entity: (name, userId) => ["finance", userId, name],
  prefs: (userId) => ["finance", userId, "prefs"],
};

export async function fetchEntity(name) {
  const res = await apiJson(`/api/${name}`);
  return Array.isArray(res?.items) ? res.items : [];
}

export async function fetchPrefs() {
  const res = await apiJson(`/api/preferences`);
  return res?.prefs || {};
}
