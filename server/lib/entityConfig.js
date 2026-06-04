/**
 * Per-entity table configuration for the finance domain.
 *
 * This is the heart of the v2 data model: every finance collection lives in
 * its own normalized table (see server/db.js) instead of a single JSONB
 * `states.state_json` blob. Each config below declares how a database row maps
 * to the DTO shape the client already consumes, so the REST layer and the
 * client store speak the same field names with zero per-page churn.
 *
 * `kind` controls in/out coercion:
 *   text  — passed through as-is
 *   num   — BIGINT/INTEGER. Postgres returns BIGINT as a *string*; we coerce
 *           to Number on the way out (all amounts are integer cents, well
 *           within Number.MAX_SAFE_INTEGER) so client arithmetic (`+`) never
 *           silently concatenates strings.
 *   bool  — boolean
 *   ts    — TIMESTAMPTZ, serialized to an ISO string on the way out
 *   date  — DATE, serialized to 'YYYY-MM-DD' on the way out
 *   json  — JSONB; node-pg parses it on read, we JSON.stringify on write
 */

// 1 trillion cents = 10 billion currency units. Mirrors the old blob guard.
export const MAX_AMOUNT_CENTS = 1_000_000_000_00;

/** @typedef {{ key: string, col: string, kind: 'text'|'num'|'bool'|'ts'|'date'|'json' }} EntityField */

export const ENTITIES = {
  wallets: {
    name: "wallets",
    table: "wallets",
    idPrefix: "wal",
    required: ["name", "type", "currency"],
    fields: [
      { key: "name", col: "name", kind: "text" },
      { key: "type", col: "type", kind: "text" },
      { key: "currency", col: "currency", kind: "text" },
      { key: "balance_cents", col: "balance_cents", kind: "num" },
      { key: "color", col: "color", kind: "text" },
      { key: "icon", col: "icon", kind: "text" },
      { key: "sortOrder", col: "sort_order", kind: "num" },
      { key: "isArchived", col: "is_archived", kind: "bool" },
    ],
  },

  categories: {
    name: "categories",
    table: "categories",
    idPrefix: "cat",
    required: ["name", "kind"],
    fields: [
      { key: "name", col: "name", kind: "text" },
      { key: "kind", col: "kind", kind: "text" },
      { key: "icon", col: "icon", kind: "text" },
      { key: "color", col: "color", kind: "text" },
      { key: "parentId", col: "parent_id", kind: "text" },
      { key: "sortOrder", col: "sort_order", kind: "num" },
      { key: "isArchived", col: "is_archived", kind: "bool" },
    ],
  },

  transactions: {
    name: "transactions",
    table: "transactions",
    idPrefix: "tra",
    required: ["type", "currency"],
    fields: [
      { key: "type", col: "type", kind: "text" },
      { key: "amount_cents", col: "amount_cents", kind: "num" },
      { key: "currency", col: "currency", kind: "text" },
      { key: "walletId", col: "wallet_id", kind: "text" },
      { key: "categoryId", col: "category_id", kind: "text" },
      { key: "toWalletId", col: "to_wallet_id", kind: "text" },
      { key: "date", col: "date", kind: "ts" },
      { key: "note", col: "note", kind: "text" },
      { key: "tags", col: "tags", kind: "json" },
      { key: "recurringId", col: "recurring_id", kind: "text" },
    ],
  },

  budgets: {
    name: "budgets",
    table: "budgets",
    idPrefix: "bud",
    required: ["name", "period", "currency"],
    fields: [
      { key: "name", col: "name", kind: "text" },
      { key: "categoryIds", col: "category_ids", kind: "json" },
      { key: "period", col: "period", kind: "text" },
      { key: "startDate", col: "start_date", kind: "date" },
      { key: "endDate", col: "end_date", kind: "date" },
      { key: "limit_cents", col: "limit_cents", kind: "num" },
      { key: "currency", col: "currency", kind: "text" },
      { key: "rollover", col: "rollover", kind: "bool" },
      { key: "alertAt", col: "alert_at", kind: "num" },
    ],
  },

  goals: {
    name: "goals",
    table: "goals",
    idPrefix: "goa",
    required: ["name", "currency"],
    fields: [
      { key: "name", col: "name", kind: "text" },
      { key: "target_cents", col: "target_cents", kind: "num" },
      { key: "current_cents", col: "current_cents", kind: "num" },
      { key: "currency", col: "currency", kind: "text" },
      { key: "walletId", col: "wallet_id", kind: "text" },
      { key: "target_date", col: "target_date", kind: "ts" },
      { key: "color", col: "color", kind: "text" },
      { key: "icon", col: "icon", kind: "text" },
      { key: "note", col: "note", kind: "text" },
    ],
  },

  // Client collection name is "recurring"; the table is recurring_rules.
  recurring: {
    name: "recurring",
    table: "recurring_rules",
    idPrefix: "rec",
    required: ["frequency", "startDate"],
    fields: [
      { key: "template", col: "template", kind: "json" },
      { key: "frequency", col: "frequency", kind: "text" },
      { key: "every", col: "every", kind: "num" },
      { key: "startDate", col: "start_date", kind: "ts" },
      { key: "endDate", col: "end_date", kind: "ts" },
      { key: "nextRunAt", col: "next_run_at", kind: "ts" },
      { key: "active", col: "active", kind: "bool" },
    ],
  },

  debts: {
    name: "debts",
    table: "debts",
    idPrefix: "deb",
    required: ["direction", "currency"],
    fields: [
      { key: "direction", col: "direction", kind: "text" },
      { key: "counterparty", col: "counterparty", kind: "text" },
      { key: "amount_cents", col: "amount_cents", kind: "num" },
      { key: "currency", col: "currency", kind: "text" },
      { key: "due_date", col: "due_date", kind: "ts" },
      { key: "note", col: "note", kind: "text" },
      { key: "is_settled", col: "is_settled", kind: "bool" },
    ],
  },
};

/** Ordered list of collection names — used by import/export/backfill. */
export const ENTITY_NAMES = Object.keys(ENTITIES);

function isoOrNull(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function dateOrNull(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/**
 * Map a raw database row to the DTO shape the client store expects.
 * Timestamps become ISO strings; BIGINT cents become Numbers; JSONB is
 * already parsed by node-pg.
 */
export function rowToDto(config, row) {
  if (!row) return null;
  const dto = { id: row.id };
  for (const f of config.fields) {
    const raw = row[f.col];
    switch (f.kind) {
      case "num":
        dto[f.key] = raw == null ? null : Number(raw);
        break;
      case "bool":
        dto[f.key] = raw == null ? null : !!raw;
        break;
      case "ts":
        dto[f.key] = isoOrNull(raw);
        break;
      case "date":
        dto[f.key] = dateOrNull(raw);
        break;
      case "json":
        dto[f.key] = raw ?? null;
        break;
      default:
        dto[f.key] = raw ?? null;
    }
  }
  dto.createdAt = isoOrNull(row.created_at);
  dto.updatedAt = isoOrNull(row.updated_at);
  dto.deletedAt = row.deleted_at ? isoOrNull(row.deleted_at) : null;
  return dto;
}

/**
 * Coerce an incoming DTO value to the parameter we bind for its column.
 * Returns `undefined` for fields that were not provided so callers can skip
 * them in partial updates.
 */
export function dtoValueToParam(field, body) {
  if (!(field.key in body)) return undefined;
  const v = body[field.key];
  switch (field.kind) {
    case "num":
      return v == null ? null : Number(v);
    case "bool":
      return v == null ? null : !!v;
    case "json":
      return v == null ? null : JSON.stringify(v);
    default:
      // text / ts / date — store as-is (Postgres parses ISO strings fine).
      return v == null ? null : v;
  }
}

/** True for JSONB columns, which need an explicit ::jsonb cast in SQL. */
export function isJsonField(field) {
  return field.kind === "json";
}

/**
 * Light validation: reject obviously corrupt amounts and missing required
 * fields on create. Mirrors the lenient posture of the old blob validator —
 * the goal is to block garbage, not to enforce a strict schema.
 *
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
export function validateEntity(config, body, { partial = false } = {}) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid payload" };
  }
  if (!partial) {
    for (const key of config.required || []) {
      const v = body[key];
      if (v === undefined || v === null || v === "") {
        return { valid: false, error: `Field "${key}" is required` };
      }
    }
  }
  for (const f of config.fields) {
    if (!(f.key in body) || body[f.key] == null) continue;
    if (f.kind === "num" && f.col.endsWith("_cents")) {
      const n = Number(body[f.key]);
      if (!Number.isFinite(n) || !Number.isInteger(n) || Math.abs(n) > MAX_AMOUNT_CENTS) {
        return { valid: false, error: `Invalid amount for "${f.key}"` };
      }
    }
  }
  return { valid: true };
}
