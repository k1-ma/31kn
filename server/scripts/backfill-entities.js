#!/usr/bin/env node
/**
 * One-shot backfill: migrate every user's legacy single-blob `states.state_json`
 * into the normalized per-entity tables (wallets, categories, transactions,
 * budgets, goals, recurring_rules, debts) plus user_preferences.
 *
 * The blob's item objects already use the same field names as the v2 DTOs, so
 * we reuse the entityConfig mappers. Inserts are idempotent
 * (ON CONFLICT (id) DO NOTHING) — safe to run multiple times. The `states`
 * table itself is left untouched as a historical record; nothing reads it
 * after this runs.
 *
 *   node server/scripts/backfill-entities.js
 */

import dotenv from "dotenv";
import { initDb } from "../db.js";
import { ENTITIES, ENTITY_NAMES, dtoValueToParam, isJsonField } from "../lib/entityConfig.js";

dotenv.config();

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function insertItem(client, config, userId, item) {
  const cols = ["id", "user_id"];
  const vals = [typeof item.id === "string" && item.id ? item.id : genId(config.idPrefix), userId];
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
    `INSERT INTO ${config.table} (${cols.join(", ")}) VALUES (${ph.join(", ")}) ON CONFLICT (id) DO NOTHING`,
    vals
  );
}

async function run() {
  console.log("[backfill] starting blob → per-entity migration…");
  const pool = await initDb({});
  const states = await pool.query("SELECT user_id, state_json FROM states WHERE state_json IS NOT NULL");
  console.log(`[backfill] ${states.rows.length} state blob(s) to process`);

  let migratedUsers = 0;
  let migratedRows = 0;
  for (const { user_id: userId, state_json: blob } of states.rows) {
    if (!blob || typeof blob !== "object") continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const name of ENTITY_NAMES) {
        const items = Array.isArray(blob[name]) ? blob[name] : [];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          await insertItem(client, ENTITIES[name], userId, item);
          migratedRows++;
        }
      }
      if (blob.prefs && typeof blob.prefs === "object") {
        await client.query(
          `INSERT INTO user_preferences (user_id, prefs, updated_at)
           VALUES ($1, $2::jsonb, now())
           ON CONFLICT (user_id) DO NOTHING`,
          [userId, JSON.stringify(blob.prefs)]
        );
      }
      await client.query("COMMIT");
      migratedUsers++;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch {}
      console.error(`[backfill] user ${userId} failed:`, err?.message || err);
    } finally {
      client.release();
    }
  }

  console.log(`[backfill] ✓ done — ${migratedUsers} user(s), ${migratedRows} row(s) migrated`);
  await pool.end();
  process.exit(0);
}

run().catch((err) => {
  console.error("[backfill] fatal:", err?.message || err);
  process.exit(1);
});
