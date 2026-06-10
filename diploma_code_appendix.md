# Додаток. Лістинг програмного коду

Проєкт **Koshyk** — персональний фінансовий трекер (PWA).
Стек: React 18 + TanStack Query (клієнт), Express + node-pg (сервер), PostgreSQL (БД).
Усі грошові суми зберігаються як цілі копійки (`BIGINT`), сервер — єдине джерело істини,
клієнт синхронізується через TanStack Query з оптимістичними оновленнями.

Нижче наведено лише ключову бізнес-логіку; конфігурація, стилі та допоміжний код опущено.

---

## 1. Схема бази даних

### server/db.js

```js
// ── Користувачі та сесії ────────────────────────────────────────────────────
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT,
    email TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    is_disabled BOOLEAN NOT NULL DEFAULT false,
    totp_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    -- ... (колонки 2FA, верифікації email та модерації опущено)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL;
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip TEXT,
    ua TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
`);

// ── Фінансовий домен: нормалізовані таблиці (по одній на колекцію) ─────────
await pool.query(`
  CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    balance_cents BIGINT NOT NULL DEFAULT 0,
    color TEXT,
    icon TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS wallets_user_idx ON wallets(user_id) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    icon TEXT,
    color TEXT,
    parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS categories_user_idx ON categories(user_id) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    amount_cents BIGINT NOT NULL,
    currency TEXT NOT NULL,
    wallet_id TEXT,
    category_id TEXT,
    to_wallet_id TEXT,
    date TIMESTAMPTZ NOT NULL,
    note TEXT,
    tags JSONB,
    recurring_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS transactions_user_date_idx
    ON transactions(user_id, date DESC) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS transactions_user_category_idx
    ON transactions(user_id, category_id) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category_ids JSONB,
    period TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    limit_cents BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    rollover BOOLEAN NOT NULL DEFAULT false,
    alert_at INTEGER NOT NULL DEFAULT 80,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS budgets_user_idx ON budgets(user_id) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_cents BIGINT NOT NULL DEFAULT 0,
    current_cents BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    wallet_id TEXT,
    target_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS goals_user_idx ON goals(user_id) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS recurring_rules (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template JSONB NOT NULL,
    frequency TEXT NOT NULL,
    every INTEGER NOT NULL DEFAULT 1,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('owe', 'owed')),
    counterparty TEXT,
    amount_cents BIGINT NOT NULL,
    currency TEXT NOT NULL,
    due_date TIMESTAMPTZ,
    note TEXT,
    is_settled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  );

  -- Налаштування користувача: один рядок, малий JSONB (НЕ колекція сутностей)
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
// ... (службові таблиці — rate_limits, idempotency_keys, notifications,
//      admin_logs — та сидінг адміністратора опущено)
```

---

## 2. API-роути та контролери

### server/lib/entityConfig.js

Декларативна конфігурація відображення «рядок БД ↔ DTO» для кожної сутності.
REST-шар і клієнтський стор використовують однакові імена полів.

```js
// 1 трильйон копійок = 10 мільярдів грошових одиниць — верхня межа суми.
export const MAX_AMOUNT_CENTS = 1_000_000_000_00;

export const ENTITIES = {
  wallets: {
    name: "wallets", table: "wallets", idPrefix: "wal",
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

  transactions: {
    name: "transactions", table: "transactions", idPrefix: "tra",
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
    name: "budgets", table: "budgets", idPrefix: "bud",
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

  // ... (конфігурації categories, goals, recurring, debts — аналогічні)
};

export const ENTITY_NAMES = Object.keys(ENTITIES);

/**
 * Рядок БД → DTO для клієнта: TIMESTAMPTZ → ISO-рядок, BIGINT-копійки →
 * Number (PostgreSQL повертає BIGINT як рядок — без приведення клієнтський
 * оператор `+` конкатенував би рядки замість додавання).
 */
export function rowToDto(config, row) {
  if (!row) return null;
  const dto = { id: row.id };
  for (const f of config.fields) {
    const raw = row[f.col];
    switch (f.kind) {
      case "num":  dto[f.key] = raw == null ? null : Number(raw); break;
      case "bool": dto[f.key] = raw == null ? null : !!raw; break;
      case "ts":   dto[f.key] = isoOrNull(raw); break;
      case "date": dto[f.key] = dateOrNull(raw); break;
      case "json": dto[f.key] = raw ?? null; break;
      default:     dto[f.key] = raw ?? null;
    }
  }
  dto.createdAt = isoOrNull(row.created_at);
  dto.updatedAt = isoOrNull(row.updated_at);
  dto.deletedAt = row.deleted_at ? isoOrNull(row.deleted_at) : null;
  return dto;
}

/** DTO-значення → параметр SQL-запиту; undefined = поле не передано. */
export function dtoValueToParam(field, body) {
  if (!(field.key in body)) return undefined;
  const v = body[field.key];
  switch (field.kind) {
    case "num":  return v == null ? null : Number(v);
    case "bool": return v == null ? null : !!v;
    case "json": return v == null ? null : JSON.stringify(v);
    default:     return v == null ? null : v;
  }
}

/** Валідація: обов'язкові поля при створенні + коректність сум у копійках. */
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
// ... (допоміжні функції isoOrNull, dateOrNull, isJsonField опущено)
```

### server/lib/entityRouter.js

Фабрика CRUD-роутера: один універсальний роутер обслуговує всі сім колекцій
(`/api/wallets`, `/api/transactions`, `/api/budgets`, …). Кожен запит обмежено
авторизованим користувачем (`user_id` береться із сесії, ніколи з тіла запиту),
а кожна мутація коштує O(1 рядок).

```js
export function createEntityRouter(config) {
  const router = Router();
  router.use(requireAuth);

  // GET / — список усіх рядків користувача (м'яко видалені теж — для «Кошика»)
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

  // POST / — створення. Клієнт може передати власний id (оптимістичний UI),
  // повторна спроба стає ідемпотентною через ON CONFLICT.
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
        // Конфлікт id: рядок уже існує (повторний запит клієнта). Повертаємо
        // його лише в межах власника — чужий вгаданий id нічого не розкриє.
        const existing = await queryWithRecovery(
          `SELECT * FROM ${config.table} WHERE id = $1 AND user_id = $2`,
          [id, userId]
        );
        row = existing.rows?.[0];
        if (!row) return res.status(409).json({ error: "ID already in use", code: "ID_CONFLICT" });
        return res.status(200).json({ item: rowToDto(config, row) });
      }
      return res.status(201).json({ item: rowToDto(config, row) });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Failed to create", code: "CREATE_FAILED" });
    }
  });

  // PUT/PATCH /:id — часткове оновлення лише переданих полів.
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

  // DELETE /:id — м'яке видалення (ставить deleted_at).
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

  // ... (POST /:id/restore — відновлення з кошика, DELETE /:id/purge —
  //      остаточне видалення; реалізовані аналогічно, опущено)

  return router;
}
```

### server/routes/finance.routes.js

Монтування CRUD-роутерів і транзакційний bulk-import (відновлення з резервної
копії) — єдине легітимне «повне» записування акаунта.

```js
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Ліміт записів (60 мутацій/хв) застосовується лише до запитів, що змінюють дані.
function mutationOnly(mw) {
  return (req, res, next) => (MUTATION_METHODS.has(req.method) ? mw(req, res, next) : next());
}

const router = Router();

// CRUD на кожну сутність: /api/wallets, /api/transactions, …
for (const name of ENTITY_NAMES) {
  router.use(`/${name}`, mutationOnly(writeRateLimit), createEntityRouter(ENTITIES[name]));
}
router.use("/preferences", mutationOnly(writeRateLimit), preferencesRouter);

// POST /api/import — транзакційне відновлення з резервної копії:
// замінює всі колекції користувача в одній транзакції БД.
router.post("/import", requireAuth, writeRateLimit, rejectUserIdInRequest, idempotency(), async (req, res) => {
  const payload = req.body?.data ?? req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Invalid import payload", code: "INVALID_PAYLOAD" });
  }

  // Валідуємо всі елементи до початку транзакції.
  for (const name of ENTITY_NAMES) {
    const items = payload[name];
    if (items == null) continue;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: `Field "${name}" must be an array`, code: "INVALID_PAYLOAD" });
    }
    for (const item of items) {
      const v = validateEntity(ENTITIES[name], item);
      if (!v.valid) {
        return res.status(400).json({ error: `${name}: ${v.error}`, code: "INVALID_PAYLOAD" });
      }
    }
  }

  const client = await pool.connect();
  try {
    const userId = getUserId(req);
    await client.query("BEGIN");
    for (const name of ENTITY_NAMES) {
      const config = ENTITIES[name];
      const items = payload[name];
      if (items == null) continue;
      await client.query(`DELETE FROM ${config.table} WHERE user_id = $1`, [userId]);
      for (const item of items) {
        // ... (динамічне складання INSERT з ON CONFLICT (id) DO NOTHING,
        //      зі збереженням оригінальних createdAt/updatedAt — опущено)
      }
    }
    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    return res.status(500).json({ error: err?.message || "Import failed", code: "IMPORT_FAILED" });
  } finally {
    client.release();
  }
});
```

---

## 3. Бізнес-логіка: баланси, бюджети, статистика

### src/lib/finance/calc.js

```js
import { active } from "./store.jsx";

/**
 * Ефективний баланс гаманця: початковий залишок + усі активні транзакції,
 * що його стосуються (дохід +, витрата −, переказ: −джерело, +призначення).
 * Повертає цілі копійки.
 */
export function walletBalance(wallet, transactions) {
  let total = wallet.balance_cents || 0;
  for (const tx of active(transactions)) {
    if (tx.type === "income" && tx.walletId === wallet.id) {
      total += tx.amount_cents;
    } else if (tx.type === "expense" && tx.walletId === wallet.id) {
      total -= tx.amount_cents;
    } else if (tx.type === "transfer") {
      if (tx.walletId === wallet.id) total -= tx.amount_cents;
      if (tx.toWalletId === wallet.id) total += tx.amount_cents;
    }
  }
  return total;
}

/**
 * Діапазон {start, end} (ISO, end — виключно) поточного вікна бюджету
 * відносно дати-якоря: тиждень/місяць/рік або власний період.
 */
export function budgetWindow(budget, anchor = new Date()) {
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (budget.period === "weekly") {
    const day = start.getDay() || 7; // Пн = 1, Нд = 7
    start.setDate(start.getDate() - (day - 1));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (budget.period === "monthly") {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  } else if (budget.period === "yearly") {
    start.setMonth(0, 1);
    end.setTime(start.getTime());
    end.setFullYear(end.getFullYear() + 1);
  } else if (budget.period === "custom") {
    return {
      start: budget.startDate || start.toISOString(),
      end: budget.endDate || end.toISOString(),
    };
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Сума витрат за категоріями бюджету в його поточному вікні (копійки). */
export function budgetSpent(budget, transactions, anchor = new Date()) {
  const { start, end } = budgetWindow(budget, anchor);
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const cats = new Set(budget.categoryIds || []);
  let total = 0;
  for (const tx of active(transactions)) {
    if (tx.type !== "expense") continue;
    if (cats.size && !cats.has(tx.categoryId)) continue;
    const ts = new Date(tx.date).getTime();
    if (ts < startMs || ts >= endMs) continue;
    total += tx.amount_cents || 0;
  }
  return total;
}

/** Прогрес бюджету 0..1; значення > 1 означає перевищення ліміту. */
export function budgetProgress(budget, transactions) {
  const spent = budgetSpent(budget, transactions);
  if (!budget.limit_cents) return 0;
  return spent / budget.limit_cents;
}

/** Агрегат дохід/витрата/нетто за період (перекази не враховуються). */
export function rangeSummary(transactions, startDate, endDate) {
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  let income = 0;
  let expense = 0;
  for (const tx of active(transactions)) {
    if (tx.type === "transfer") continue;
    const ts = new Date(tx.date).getTime();
    if (ts < startMs || ts >= endMs) continue;
    if (tx.type === "income") income += tx.amount_cents || 0;
    else if (tx.type === "expense") expense += tx.amount_cents || 0;
  }
  return { income, expense, net: income - expense };
}

/** Групування витрат за категоріями в періоді, відсортоване за спаданням. */
export function expenseByCategory(transactions, categories, startDate, endDate) {
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const totals = new Map();
  for (const tx of active(transactions)) {
    if (tx.type !== "expense") continue;
    const ts = new Date(tx.date).getTime();
    if (ts < startMs || ts >= endMs) continue;
    totals.set(tx.categoryId, (totals.get(tx.categoryId) || 0) + (tx.amount_cents || 0));
  }
  const catMap = new Map(active(categories).map((c) => [c.id, c]));
  return Array.from(totals.entries())
    .map(([id, cents]) => ({ category: catMap.get(id), cents }))
    .filter((x) => x.category)
    .sort((a, b) => b.cents - a.cents);
}

/** Дані грошового потоку за останні n місяців (для графіка аналітики). */
export function monthlyCashflow(transactions, months = 6, anchor = new Date()) {
  const out = [];
  const cur = new Date(anchor.getFullYear(), anchor.getMonth() - months + 1, 1);
  for (let i = 0; i < months; i++) {
    const start = new Date(cur);
    const end = new Date(cur);
    end.setMonth(end.getMonth() + 1);
    const { income, expense } = rangeSummary(transactions, start.toISOString(), end.toISOString());
    out.push({
      label: start.toLocaleDateString("en-US", { month: "short" }),
      ym: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      income,
      expense,
      net: income - expense,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/** Прогрес фінансової цілі 0..1 (з обмеженням). */
export function goalProgress(goal) {
  if (!goal.target_cents) return 0;
  return Math.max(0, Math.min(1, (goal.current_cents || 0) / goal.target_cents));
}
```

### src/lib/money.js

Грошові помічники: всі суми — цілі копійки, що виключає накопичення похибки
чисел з рухомою комою при підсумовуванні.

```js
/** Введений рядок ("12,50" / "12.5") або число → цілі копійки. */
export function toCents(input) {
  if (input == null) return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = String(input).replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents) {
  return (Number(cents) || 0) / 100;
}

/** Локалізоване форматування суми; запасний формат без Intl. */
export function formatMoney(cents, currency = "UAH", lang = "uk") {
  const value = fromCents(cents);
  try {
    return new Intl.NumberFormat(lang === "uk" ? "uk-UA" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Сума списку грошових елементів, згрупована за валютою. */
export function sumByCurrency(items, getCents = (x) => x.amount_cents, getCurrency = (x) => x.currency) {
  const totals = {};
  for (const item of items || []) {
    const c = getCurrency(item) || "UAH";
    totals[c] = (totals[c] || 0) + (Number(getCents(item)) || 0);
  }
  return totals;
}

/** Конвертація між валютами за мапою курсів `${from}_${to}` → rate. */
export function convert(cents, fromCurrency, toCurrency, rates) {
  if (fromCurrency === toCurrency) return cents;
  const rate = rates?.[`${fromCurrency}_${toCurrency}`];
  if (!rate || !Number.isFinite(rate)) return null;
  return Math.round(cents * rate);
}

/** Звести мультивалютні підсумки до базової валюти користувача. */
export function totalInBase(totalsByCurrency, base = "UAH", rates = {}) {
  let sum = 0;
  for (const [currency, cents] of Object.entries(totalsByCurrency || {})) {
    if (currency === base) {
      sum += cents;
    } else {
      const converted = convert(cents, currency, base, rates);
      if (converted != null) sum += converted;
    }
  }
  return sum;
}
```

---

## 4. Автентифікація

### server/services/auth.service.js

Сесійна автентифікація: bcrypt-хешування паролів, cookie-сесії в PostgreSQL,
захист від перебору користувачів через вирівнювання часу відповіді.

```js
// Вартість bcrypt для нових хешів; старі (cost 12) дохешовуються при вході.
export const BCRYPT_COST = 14;

// Фіктивний хеш для вирівнювання часу відповіді на неіснуючих користувачах.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync(
  "dummy-password-for-timing-equalization",
  BCRYPT_COST
);

export async function registerUser({ username, password, nickname, email, ip }) {
  if (!isRegistrationEnabled()) {
    return { error: "REGISTRATION_DISABLED", errorCode: "REGISTRATION_DISABLED" };
  }
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.valid) return { error: usernameCheck.error };
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) return { error: passwordCheck.error };
  const emailCheck = validateEmail(email, { required: true });
  if (!emailCheck.valid) return { error: emailCheck.error, errorCode: emailCheck.errorCode };

  const existingUser = await getUserByUsername(usernameCheck.normalized);
  if (existingUser) return { error: "Username already exists", errorCode: "USERNAME_EXISTS" };
  if (emailCheck.normalized) {
    const existingEmail = await getUserByEmail(emailCheck.normalized);
    if (existingEmail) return { error: "Email already registered", errorCode: "EMAIL_EXISTS" };
  }

  // Токен підтвердження email + створення користувача.
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const verifyTokenExpiresAt = new Date(Date.now() + EMAIL_VERIFY_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const hash = await bcrypt.hash(String(password), BCRYPT_COST);
  const r = await pool.query(
    `INSERT INTO users (
      username, nickname, password_hash, role, email, is_disabled, created_ip,
      email_verified, email_verify_token, email_verify_token_expires_at,
      created_at, updated_at
    )
     VALUES ($1, $2, $3, 'user', $4, false, $5, false, $6, $7, now(), now())
     RETURNING id, username, nickname, role, is_disabled, email, email_verified`,
    [usernameCheck.normalized, nickname || null, hash, emailCheck.normalized,
     ip || null, verifyToken, verifyTokenExpiresAt.toISOString()]
  );
  const user = r.rows?.[0];

  // ... (надсилання листа підтвердження та аудит-лог опущено)
  return { user: safeUser(user), emailVerificationRequired: true };
}

export async function loginUser({ username, password }) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable", status: 503 };

  // Вхід за іменем користувача АБО email.
  const identifier = String(username || "").trim().toLowerCase();
  if (!identifier) return { error: "Invalid credentials", status: 401 };

  const u = identifier.includes("@")
    ? await getUserByEmail(identifier)
    : await getUserByUsername(identifier);

  if (!u) {
    // Вирівнювання часу: bcrypt-порівняння виконується й для неіснуючого
    // користувача, щоб запобігти перебору акаунтів за часом відповіді.
    await bcrypt.compare(String(password), DUMMY_BCRYPT_HASH);
    return { error: "Invalid credentials", status: 401 };
  }
  if (u.is_disabled) {
    return { error: "Account disabled", status: 403, reason: u.disabled_reason };
  }
  if (u.disabled_until && new Date(u.disabled_until) > new Date()) {
    return { error: "Account temporarily suspended", status: 403, until: u.disabled_until };
  }

  const ok = await bcrypt.compare(String(password), u.password_hash);
  if (!ok) return { error: "Invalid credentials", status: 401 };

  // ... (опортуністичне дохешування зі старого cost-фактора та перевірка
  //      підтвердження email опущено)
  return { user: u };
}

export async function createSession(userId, ip, ua, remember = false) {
  const pool = getPool();
  if (!pool) return null;

  const sid = crypto.randomUUID();
  const now = new Date();
  const ttlMs = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24; // 30 діб або 1 доба
  const expiresAt = new Date(now.getTime() + ttlMs);

  await pool.query(
    "INSERT INTO sessions (sid, user_id, ip, ua, expires_at) VALUES ($1,$2,$3,$4,$5)",
    [sid, userId, ip || null, ua || null, expiresAt.toISOString()]
  );
  return { sid, expiresAt, ttlMs };
}

export async function revokeSession(sid) {
  const pool = getPool();
  if (!pool) return false;
  await pool.query("UPDATE sessions SET revoked = true WHERE sid = $1", [sid]);
  return true;
}
// ... (зміна пароля, скидання пароля, підтвердження email, OAuth — опущено)
```

### server/middleware/requireAuth.js

```js
export async function requireAuth(req, res, next) {
  let pool;
  try {
    pool = await ensurePool();
  } catch {
    return res.status(503).json({
      code: "DB_UNAVAILABLE",
      messageKey: "common.dbUnavailable",
      retryAfterMs: 1000,
    });
  }

  if (!req.session?.userId) return res.status(401).json({ error: "Not authenticated" });

  const cookieDomain = getCookieDomain() || req._cookieDomainFromHost;
  const u = await getUserById(req.session.userId);
  if (!u || u.is_disabled) {
    // Тимчасове блокування акаунта
    if (u?.disabled_until && new Date(u.disabled_until) > new Date()) {
      try {
        if (req.session?.sid) await pool.query("UPDATE sessions SET revoked = true WHERE sid = $1", [req.session.sid]);
      } catch {}
      clearAllSessionCookies(res, cookieDomain);
      return res.status(403).json({ error: "Account suspended", until: u.disabled_until, reason: u.disabled_reason });
    }
    if (u?.is_disabled) {
      try {
        if (req.session?.sid) await pool.query("UPDATE sessions SET revoked = true WHERE sid = $1", [req.session.sid]);
      } catch {}
      clearAllSessionCookies(res, cookieDomain);
      return res.status(403).json({ error: "Account disabled", reason: u?.disabled_reason });
    }
    if (!u) return res.status(401).json({ error: "User not found" });
  }

  req.user = u;
  return next();
}
```

---

## 5. Клієнтський рівень даних (React + TanStack Query)

### src/queries/finance.js

```js
import { apiJson } from "@/lib/api.js";

// Шар доступу до даних: один запит на нормалізовану колекцію, дзеркально до
// REST-ендпоінтів. Кеш TanStack Query — єдине джерело істини на клієнті.
export const ENTITY_NAMES = [
  "wallets", "categories", "transactions", "budgets", "goals", "recurring", "debts",
];

/** Ключі кешу простором імен користувача — logout/login чисто міняє дані. */
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
```

### src/lib/finance/store.jsx

Фасад фінансового стану: одна `useQuery` на колекцію збирається в спільний
об'єкт `state`, а кожна мутація — оптимістичне оновлення кешу + REST-виклик
з відкатом у разі помилки.

```jsx
export function FinanceProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? "anon";
  const enabled = !!user;

  // Один запит на кожну колекцію.
  const entityQueries = useQueries({
    queries: ENTITY_NAMES.map((name) => ({
      queryKey: qk.entity(name, userId),
      queryFn: () => fetchEntity(name),
      enabled,
    })),
  });
  const prefsQuery = useQuery({ queryKey: qk.prefs(userId), queryFn: fetchPrefs, enabled });

  const loaded =
    enabled && entityQueries.every((q) => !q.isLoading) && !prefsQuery.isLoading;

  // Зведений стан тієї форми, яку споживають сторінки.
  const dataDeps = entityQueries.map((q) => q.data);
  const state = useMemo(() => {
    const next = { updatedAt: nowIso() };
    ENTITY_NAMES.forEach((name, i) => {
      next[name] = entityQueries[i].data || EMPTY_LISTS[name];
    });
    next.prefs = { ...DEFAULT_PREFS, ...(prefsQuery.data || {}) };
    return next;
  }, [...dataDeps, prefsQuery.data]);

  const setList = useCallback(
    (name, updater) => {
      qc.setQueryData(qk.entity(name, userId), (old) => updater(old || []));
    },
    [qc, userId]
  );

  // Створення-або-оновлення сутності: оптимістично в кеш, потім узгодження
  // з рядком сервера; відкат кешу в разі невдачі.
  const upsert = useCallback(
    (name, item) => {
      const key = qk.entity(name, userId);
      const list = qc.getQueryData(key) || [];
      const ts = nowIso();
      const isUpdate = item.id && list.some((x) => x.id === item.id);
      const prev = list;

      if (isUpdate) {
        setList(name, (l) => l.map((x) => (x.id === item.id ? { ...x, ...item, updatedAt: ts } : x)));
        apiJson(`/api/${name}/${item.id}`, { method: "PUT", body: JSON.stringify(item) })
          .then((res) => {
            if (res?.item) setList(name, (l) => l.map((x) => (x.id === item.id ? res.item : x)));
          })
          .catch(() => {
            qc.setQueryData(key, prev);
            onError();
          });
      } else {
        const id = item.id || newId(name.slice(0, 3));
        const optimistic = { ...item, id, createdAt: ts, updatedAt: ts, deletedAt: null };
        setList(name, (l) => [...l, optimistic]);
        apiJson(`/api/${name}`, { method: "POST", body: JSON.stringify(optimistic) })
          .then((res) => {
            if (res?.item) setList(name, (l) => l.map((x) => (x.id === id ? res.item : x)));
          })
          .catch(() => {
            qc.setQueryData(key, prev);
            onError();
          });
      }
    },
    [qc, userId, setList, onError]
  );

  // М'яке видалення: ставимо deletedAt оптимістично, DELETE на сервер.
  const remove = useCallback(
    (name, id) => {
      const key = qk.entity(name, userId);
      const prev = qc.getQueryData(key) || [];
      const ts = nowIso();
      setList(name, (l) => l.map((x) => (x.id === id ? { ...x, deletedAt: ts, updatedAt: ts } : x)));
      apiJson(`/api/${name}/${id}`, { method: "DELETE" })
        .then((res) => {
          if (res?.item) setList(name, (l) => l.map((x) => (x.id === id ? res.item : x)));
        })
        .catch(() => {
          qc.setQueryData(key, prev);
          onError();
        });
    },
    [qc, userId, setList, onError]
  );

  // ... (restore, purge, setPrefs, importBackup та first-run сидінг —
  //      реалізовані за тією ж схемою «оптимістично + відкат», опущено)

  const value = useMemo(
    () => ({ state, loaded, upsert, remove, restore, purge, setPrefs, importBackup }),
    [state, loaded, upsert, remove, restore, purge, setPrefs, importBackup]
  );

  return <FinanceCtx.Provider value={value}>{children}</FinanceCtx.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceCtx);
  if (!ctx) throw new Error("useFinance must be used inside <FinanceProvider/>");
  return ctx;
}

/** Фільтр активних (не видалених м'яко) елементів. */
export function active(list) {
  return (list || []).filter((x) => !x.deletedAt);
}
```

### src/pages/app/TransactionSheet.jsx

Форма додавання/редагування транзакції: конвертація введеної суми в копійки,
валідація, виклик `upsert` (оптимістичний REST-запис).

```jsx
export default function TransactionSheet({ open, onClose, initial = null }) {
  const { t } = useI18n();
  const { state, upsert } = useFinance();

  const [type, setType] = useState(initial?.type || "expense");
  const [amount, setAmount] = useState(initial ? String((initial.amount_cents || 0) / 100) : "0");
  const [walletId, setWalletId] = useState(initial?.walletId || "");
  const [toWalletId, setToWalletId] = useState(initial?.toWalletId || "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId || "");
  const [note, setNote] = useState(initial?.note || "");
  const [tags, setTags] = useState(Array.isArray(initial?.tags) ? initial.tags : []);
  const [date, setDate] = useState(
    initial?.date ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [err, setErr] = useState("");

  // Підказки тегів: найуживаніші теги користувача.
  const tagSuggestions = useMemo(() => {
    const counts = new Map();
    for (const tx of state.transactions || []) {
      if (tx.deletedAt) continue;
      for (const tag of tx.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 12);
  }, [state.transactions]);

  const wallets = useMemo(() => active(state.wallets).filter((w) => !w.isArchived), [state.wallets]);
  const categories = useMemo(
    () => active(state.categories).filter((c) => c.kind === (type === "income" ? "income" : "expense")),
    [state.categories, type]
  );

  const submit = () => {
    const cents = toCents(amount);
    if (cents <= 0) { setErr(t("validation.amountRequired")); return; }
    if (!walletId) { setErr(t("validation.selectWallet")); return; }
    if (type === "transfer" && (!toWalletId || toWalletId === walletId)) {
      setErr(t("validation.sameWallet")); return;
    }
    setErr("");
    upsert("transactions", {
      id: initial?.id,
      type,
      amount_cents: cents,
      currency: state.wallets.find((w) => w.id === walletId)?.currency || "UAH",
      walletId,
      toWalletId: type === "transfer" ? toWalletId : null,
      categoryId: type === "transfer" ? null : categoryId,
      date: new Date(date).toISOString(),
      note: note.trim(),
      tags,
    });
    reset();
    onClose?.();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? t("tx.editTitle") : t("tx.addTitle")}>
      {/* Перемикач типу (витрата / дохід / переказ) */}
      {/* Відображення суми + NumPad для введення */}
      <NumPad value={amount} onChange={(v) => { setAmount(v); if (err) setErr(""); }} />
      {/* Вибір гаманця; для переказу — гаманець-одержувач, інакше — сітка категорій */}
      {/* Поля дати, нотатки та тегів */}
      {/* ... (презентаційна розмітка опущено) */}
      <Button size="lg" className="flex-1" onClick={submit}>
        {t("common.save")}
      </Button>
    </BottomSheet>
  );
}
```
