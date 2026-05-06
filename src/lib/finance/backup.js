/**
 * JSON backup format: a single file holding the entire finance state plus
 * a small meta header. Versioned so future schema changes can stay
 * compatible. Imports replace the current state wholesale (after a
 * confirmation dialog in the UI).
 */

const BACKUP_VERSION = 1;

const COLLECTIONS = ["wallets", "categories", "transactions", "budgets", "goals", "recurring", "debts"];

/**
 * Build a backup payload from a finance store snapshot. Always includes
 * every known collection (empty array if missing on input) so the
 * resulting JSON has a stable shape.
 *
 * @param {object} state
 * @returns {{ meta: { version: number, app: string, exportedAt: string }, prefs: object, [k: string]: any }}
 */
export function buildBackup(state) {
  const out = {
    meta: {
      version: BACKUP_VERSION,
      app: "koshyk",
      exportedAt: new Date().toISOString(),
    },
    prefs: state.prefs || {},
  };
  for (const c of COLLECTIONS) {
    out[c] = Array.isArray(state[c]) ? state[c] : [];
  }
  return out;
}

/**
 * Parse a backup file and return a normalized state object. Throws on
 * malformed JSON, foreign-app payloads, or future versions.
 *
 * @param {string} text
 * @returns {object}
 * @throws {Error}
 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup file");
  if (parsed.meta?.app && parsed.meta.app !== "koshyk") {
    throw new Error("Not a Koshyk backup");
  }
  if (parsed.meta?.version && parsed.meta.version > BACKUP_VERSION) {
    throw new Error("Backup version too new — please update Koshyk");
  }
  const next = { prefs: parsed.prefs || {} };
  for (const c of COLLECTIONS) {
    next[c] = Array.isArray(parsed[c]) ? parsed[c] : [];
  }
  return next;
}

export { BACKUP_VERSION, COLLECTIONS };
