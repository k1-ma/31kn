#!/usr/bin/env node
/**
 * Demo seed: populate a single account with ~30 days of realistic finance
 * activity so it reads like a real person who kept the app for a month.
 *
 * This is a DEMO / PORTFOLIO helper — it fills wallets, categories,
 * transactions, budgets, goals, recurring rules and debts for one user. It
 * respects the v2 data model (Rules 1-4): one normalized row per entity, money
 * as integer cents, per-entity inserts (no blob), O(change) writes. Wallet
 * `balance_cents` is the OPENING balance; the effective balance shown in the
 * app is opening + transactions (see src/lib/finance/calc.js → walletBalance).
 *
 * Usage:
 *   DATABASE_URL=postgres://… node server/scripts/seed-demo.js --user=k1hntd
 *   DATABASE_URL=postgres://… npm run seed:demo -- --user=k1hntd
 *
 * Flags:
 *   --user=<username>   target account (default: k1hntd)
 *   --days=<n>          history length in days (default: 30)
 *   --keep              do NOT wipe the user's existing finance rows first
 *                       (default behaviour wipes them so re-runs are clean)
 *
 * Re-running replaces the demo data (unless --keep). It only ever touches the
 * named user's rows; no other account is read or modified.
 */

import dotenv from "dotenv";
import { createPoolOnly } from "../db.js";
import { ENTITIES, dtoValueToParam, isJsonField } from "../lib/entityConfig.js";

dotenv.config();

// ── CLI args ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const USERNAME = typeof args.user === "string" ? args.user : "k1hntd";
const DAYS = Number(args.days) || 30;
const WIPE = !args.keep;
const CURRENCY = "UAH";

// ── Deterministic PRNG so re-runs produce the same story ────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x31_4e7d);
const rand = (min, max) => min + (max - min) * rng();
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;

let idSeq = 0;
function genId(prefix) {
  idSeq += 1;
  return `${prefix}_seed_${Date.now().toString(36)}_${idSeq.toString(36)}`;
}

const cents = (uah) => Math.round(uah * 100);

// Anchor "now" once so every date is relative to the same instant.
const NOW = new Date();
function at(daysAgo, hour = 12, minute = 0) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  // Never date a transaction in the future (matters for today's entries when
  // the random hour lands after the current time).
  if (d.getTime() > NOW.getTime()) return new Date(NOW.getTime() - 60_000).toISOString();
  return d.toISOString();
}
function plusDays(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// ── Generic per-entity insert (mirrors backfill-entities.js) ────────────────
async function insert(client, name, userId, item) {
  const config = ENTITIES[name];
  const cols = ["id", "user_id"];
  const vals = [item.id || genId(config.idPrefix), userId];
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
  cols.push("created_at", "updated_at");
  ph.push(item.createdAt ? `$${idx++}` : "now()", item.updatedAt ? `$${idx++}` : "now()");
  if (item.createdAt) vals.push(item.createdAt);
  if (item.updatedAt) vals.push(item.updatedAt);
  await client.query(
    `INSERT INTO ${config.table} (${cols.join(", ")}) VALUES (${ph.join(", ")})
     ON CONFLICT (id) DO NOTHING`,
    vals
  );
  return vals[0];
}

// ── Wallets (opening balances as of `DAYS` ago) ─────────────────────────────
const WALLETS = [
  { key: "card", name: "Картка Monobank", type: "card", icon: "💳", color: "#6366F1", sortOrder: 1, opening: 26000 },
  { key: "cash", name: "Готівка", type: "cash", icon: "💵", color: "#10B981", sortOrder: 2, opening: 2400 },
  { key: "savings", name: "Заощадження", type: "savings", icon: "💰", color: "#F59E0B", sortOrder: 3, opening: 45000 },
];

// ── Categories (from src/lib/finance/seed.js) ───────────────────────────────
const CATEGORIES = [
  // expense
  { name: "Їжа", kind: "expense", icon: "🍔", color: "#F97316", sortOrder: 1 },
  { name: "Житло", kind: "expense", icon: "🏠", color: "#0EA5E9", sortOrder: 2 },
  { name: "Транспорт", kind: "expense", icon: "🚗", color: "#6366F1", sortOrder: 3 },
  { name: "Одяг", kind: "expense", icon: "👕", color: "#EC4899", sortOrder: 4 },
  { name: "Здоров'я", kind: "expense", icon: "💊", color: "#EF4444", sortOrder: 5 },
  { name: "Розваги", kind: "expense", icon: "🎬", color: "#8B5CF6", sortOrder: 6 },
  { name: "Освіта", kind: "expense", icon: "📚", color: "#0891B2", sortOrder: 7 },
  { name: "Подорожі", kind: "expense", icon: "✈️", color: "#14B8A6", sortOrder: 8 },
  { name: "Подарунки", kind: "expense", icon: "🎁", color: "#F59E0B", sortOrder: 9 },
  { name: "Тварини", kind: "expense", icon: "🐾", color: "#A16207", sortOrder: 10 },
  { name: "Підписки", kind: "expense", icon: "📱", color: "#7C3AED", sortOrder: 11 },
  { name: "Інше", kind: "expense", icon: "❓", color: "#94A3B8", sortOrder: 99 },
  // income
  { name: "Зарплата", kind: "income", icon: "💼", color: "#10B981", sortOrder: 1 },
  { name: "Фріланс", kind: "income", icon: "💻", color: "#06B6D4", sortOrder: 2 },
  { name: "Подарунки", kind: "income", icon: "🎁", color: "#F59E0B", sortOrder: 3 },
  { name: "Інвестиції", kind: "income", icon: "📈", color: "#84CC16", sortOrder: 4 },
];

// merchant pools for flavour
const GROCERY = ["АТБ", "Сільпо", "Varus", "Novus", "Ашан"];
const COFFEE = ["Aroma Kava", "Львівські круасани", "Кав'ярня біля дому", "WOG Cafe"];
const FOOD_OUT = ["Glovo", "Bolt Food", "McDonald's", "Піцерія", "Сушія"];
const TAXI = ["Uber", "Bolt", "Uklon"];

export function buildTransactions(wal, cat) {
  const txs = [];
  const add = (daysAgo, hour, type, walletKey, catName, amountUah, note, tags) => {
    const t = {
      type,
      amount_cents: cents(amountUah),
      currency: CURRENCY,
      walletId: wal[walletKey],
      categoryId: catName ? cat[catName] : null,
      date: at(daysAgo, hour, randInt(0, 59)),
      note: note || null,
      tags: tags && tags.length ? tags : null,
    };
    txs.push(t);
  };
  const addTransfer = (daysAgo, hour, fromKey, toKey, amountUah, note) => {
    txs.push({
      type: "transfer",
      amount_cents: cents(amountUah),
      currency: CURRENCY,
      walletId: wal[fromKey],
      toWalletId: wal[toKey],
      categoryId: null,
      date: at(daysAgo, hour, randInt(0, 59)),
      note: note || null,
      tags: null,
    });
  };

  // ── Fixed monthly events ──────────────────────────────────────────────────
  add(DAYS - 2, 10, "expense", "card", "Житло", 12000, "Оренда квартири", ["оренда"]);
  add(DAYS - 3, 11, "expense", "card", "Житло", 2650, "Комуналка + інтернет", ["комуналка"]);
  add(DAYS - 8, 12, "income", "card", "Зарплата", 38000, "Зарплата за місяць", ["зарплата"]);
  add(3, 12, "income", "card", "Зарплата", 16000, "Аванс", ["зарплата"]);
  add(DAYS - 16, 18, "income", "card", "Фріланс", 9500, "Замовлення на Upwork", ["фріланс"]);
  add(DAYS - 11, 19, "income", "cash", "Подарунки", 1000, "Подарунок на день народження", null);

  // subscriptions
  add(DAYS - 5, 9, "expense", "card", "Підписки", 259, "Netflix", ["підписка"]);
  add(DAYS - 5, 9, "expense", "card", "Підписки", 119, "Spotify", ["підписка"]);
  add(DAYS - 6, 9, "expense", "card", "Підписки", 899, "ChatGPT Plus", ["підписка"]);
  add(DAYS - 14, 9, "expense", "card", "Підписки", 149, "YouTube Premium", ["підписка"]);

  // occasional bigger expenses
  add(DAYS - 9, 16, "expense", "card", "Одяг", 2890, "Куртка, Reserved", null);
  add(DAYS - 12, 14, "expense", "card", "Здоров'я", 1240, "Аптека + вітаміни", ["здоров'я"]);
  add(DAYS - 19, 13, "expense", "card", "Тварини", 740, "Корм для кота", null);
  add(DAYS - 7, 20, "expense", "card", "Розваги", 980, "Кіно + бар з друзями", null);
  add(DAYS - 18, 21, "expense", "card", "Розваги", 1450, "Концерт", null);
  add(DAYS - 4, 17, "expense", "card", "Подарунки", 1600, "Подарунок мамі", null);
  add(DAYS - 13, 15, "expense", "card", "Освіта", 1900, "Курс на Udemy", ["навчання"]);

  // transfers / savings discipline
  addTransfer(DAYS - 8, 13, "card", "savings", 6000, "Відкладаю з зарплати");
  addTransfer(DAYS - 20, 11, "card", "cash", 2000, "Зняв готівку");
  addTransfer(DAYS - 6, 18, "card", "cash", 1500, "Зняв готівку");

  // ── Recurring daily-ish life ──────────────────────────────────────────────
  for (let d = DAYS - 1; d >= 0; d--) {
    // groceries every ~2 days
    if (d % 2 === 0 || chance(0.2)) {
      const shop = pick(GROCERY);
      add(d, randInt(17, 20), "expense", chance(0.7) ? "card" : "cash", "Їжа", randInt(180, 820), shop, ["продукти"]);
    }
    // coffee most workdays
    if (chance(0.55)) {
      add(d, randInt(8, 11), "expense", chance(0.5) ? "card" : "cash", "Їжа", randInt(55, 145), pick(COFFEE), ["кафе"]);
    }
    // lunch / delivery a couple times a week
    if (chance(0.3)) {
      add(d, randInt(12, 14), "expense", "card", "Їжа", randInt(180, 460), pick(FOOD_OUT), ["обід"]);
    }
    // transport a few times a week
    if (chance(0.4)) {
      if (chance(0.5)) {
        add(d, randInt(8, 21), "expense", "card", "Транспорт", randInt(70, 320), pick(TAXI), ["таксі"]);
      } else {
        add(d, randInt(8, 19), "expense", "cash", "Транспорт", randInt(8, 40), "Громадський транспорт", null);
      }
    }
    // small misc now and then
    if (chance(0.12)) {
      add(d, randInt(10, 20), "expense", chance(0.5) ? "card" : "cash", "Інше", randInt(50, 350), "Дрібні витрати", null);
    }
  }

  return txs;
}

function buildBudgets(cat) {
  const firstOfMonth = new Date(NOW.getFullYear(), NOW.getMonth(), 1).toISOString().slice(0, 10);
  return [
    { name: "Їжа", categoryIds: [cat["Їжа"]], period: "monthly", startDate: firstOfMonth, limit_cents: cents(13000), currency: CURRENCY, rollover: false, alertAt: 80 },
    { name: "Транспорт", categoryIds: [cat["Транспорт"]], period: "monthly", startDate: firstOfMonth, limit_cents: cents(4000), currency: CURRENCY, rollover: false, alertAt: 80 },
    { name: "Розваги", categoryIds: [cat["Розваги"]], period: "monthly", startDate: firstOfMonth, limit_cents: cents(5000), currency: CURRENCY, rollover: false, alertAt: 75 },
    { name: "Підписки", categoryIds: [cat["Підписки"]], period: "monthly", startDate: firstOfMonth, limit_cents: cents(1800), currency: CURRENCY, rollover: false, alertAt: 90 },
  ];
}

function buildGoals(wal) {
  return [
    { name: "Відпустка в Італії", target_cents: cents(60000), current_cents: cents(31000), currency: CURRENCY, walletId: wal.savings, target_date: plusDays(120), icon: "✈️", color: "#14B8A6", note: "Рим + Флоренція восени" },
    { name: "Новий ноутбук", target_cents: cents(75000), current_cents: cents(28000), currency: CURRENCY, walletId: wal.savings, target_date: plusDays(90), icon: "💻", color: "#6366F1", note: "MacBook Air M-серії" },
    { name: "Подушка безпеки", target_cents: cents(120000), current_cents: cents(45000), currency: CURRENCY, walletId: wal.savings, target_date: plusDays(300), icon: "🛟", color: "#10B981", note: "3 місяці витрат" },
  ];
}

function buildRecurring(wal, cat) {
  const mk = (template, startAgo, nextIn) => ({
    template,
    frequency: "monthly",
    every: 1,
    startDate: at(startAgo, 10, 0),
    nextRunAt: plusDays(nextIn),
    active: true,
  });
  return [
    mk({ type: "income", amount_cents: cents(38000), currency: CURRENCY, walletId: wal.card, categoryId: cat["Зарплата"], note: "Зарплата" }, DAYS - 8, DAYS - 8 + 30 - DAYS),
    mk({ type: "expense", amount_cents: cents(12000), currency: CURRENCY, walletId: wal.card, categoryId: cat["Житло"], note: "Оренда квартири" }, DAYS - 2, 30 - 2),
    mk({ type: "expense", amount_cents: cents(259), currency: CURRENCY, walletId: wal.card, categoryId: cat["Підписки"], note: "Netflix" }, DAYS - 5, 30 - 5),
  ];
}

function buildDebts() {
  return [
    { direction: "owe", counterparty: "Андрій", amount_cents: cents(3000), currency: CURRENCY, due_date: plusDays(12), note: "Позичив на ремонт телефона", is_settled: false },
    { direction: "owed", counterparty: "Олена", amount_cents: cents(1500), currency: CURRENCY, due_date: plusDays(6), note: "За квитки на концерт", is_settled: false },
  ];
}

async function run() {
  const pool = await createPoolOnly();

  const u = await pool.query("SELECT id, username FROM users WHERE username = $1", [USERNAME]);
  if (!u.rows.length) {
    console.error(`[seed-demo] user "${USERNAME}" not found — nothing seeded.`);
    await pool.end();
    process.exit(1);
  }
  const userId = u.rows[0].id;
  console.log(`[seed-demo] target: ${USERNAME} (id=${userId}), ${DAYS}d history, wipe=${WIPE}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (WIPE) {
      // Only this user's finance rows — hard delete so re-runs stay clean.
      for (const t of ["transactions", "budgets", "goals", "recurring_rules", "debts", "categories", "wallets"]) {
        await client.query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
      }
      console.log("[seed-demo] cleared existing finance rows for user");
    }

    // wallets
    const wal = {};
    for (const w of WALLETS) {
      wal[w.key] = await insert(client, "wallets", userId, {
        name: w.name, type: w.type, currency: CURRENCY, balance_cents: cents(w.opening),
        icon: w.icon, color: w.color, sortOrder: w.sortOrder, isArchived: false,
        createdAt: at(DAYS, 8, 0),
      });
    }

    // categories (keyed by name; income/expense names are unique within this set)
    const cat = {};
    for (const c of CATEGORIES) {
      const id = await insert(client, "categories", userId, { ...c, createdAt: at(DAYS, 8, 0) });
      cat[c.name] = id;
    }

    // transactions
    const txs = buildTransactions(wal, cat);
    for (const t of txs) {
      await insert(client, "transactions", userId, { ...t, createdAt: t.date, updatedAt: t.date });
    }

    // budgets / goals / recurring / debts
    for (const b of buildBudgets(cat)) await insert(client, "budgets", userId, b);
    for (const g of buildGoals(wal)) await insert(client, "goals", userId, g);
    for (const r of buildRecurring(wal, cat)) await insert(client, "recurring", userId, r);
    for (const d of buildDebts()) await insert(client, "debts", userId, d);

    await client.query("COMMIT");

    console.log(
      `[seed-demo] ✓ done — ${WALLETS.length} wallets, ${CATEGORIES.length} categories, ` +
        `${txs.length} transactions, ${buildBudgets(cat).length} budgets, ` +
        `${buildGoals(wal).length} goals, ${buildRecurring(wal, cat).length} recurring, ` +
        `${buildDebts().length} debts`
    );
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[seed-demo] failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run only when invoked directly (not when imported for testing).
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  run().catch((err) => {
    console.error("[seed-demo] fatal:", err?.message || err);
    process.exit(1);
  });
}

export { WALLETS, CATEGORIES, buildBudgets, buildGoals, buildRecurring, buildDebts };
