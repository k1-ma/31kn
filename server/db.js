import bcrypt from "bcryptjs";
import dns from "node:dns";
import pg from "pg";

const { Pool } = pg;

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

export async function createPoolOnly() {
  const DATABASE_URL = getDatabaseUrl();
  if (!DATABASE_URL) {
    throw new Error("Postgres connection string is not set. Set DATABASE_URL.");
  }
  const isLocal = /localhost|127\.0\.0\.1/i.test(DATABASE_URL);
  const sslDisabled = String(process.env.PGSSL_DISABLE || "").trim() === "1";
  const ssl = !isLocal && !sslDisabled ? { rejectUnauthorized: false } : false;

  if (globalThis.__koshyk_pool) {
    try {
      await globalThis.__koshyk_pool.query("SELECT 1");
      return globalThis.__koshyk_pool;
    } catch {
      try { await globalThis.__koshyk_pool.end(); } catch {}
      globalThis.__koshyk_pool = null;
    }
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX) || 15,
    ssl,
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  pool.on("connect", (client) => {
    client
      .query("SET statement_timeout = '10s'; SET idle_in_transaction_session_timeout = '10s'")
      .catch(() => {});
  });

  await pool.query("SELECT 1");
  globalThis.__koshyk_pool = pool;
  return pool;
}

/**
 * Initialize Koshyk schema. Auth + sync + admin tables, plus optional
 * finance tables for future per-entity REST endpoints. The current client
 * keeps finance state in IndexedDB and the JSON `states` blob, so the
 * finance tables sit empty until that wiring lands.
 */
export async function initDb({ admin } = {}) {
  const pool = await createPoolOnly();

  // ── Auth core ─────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      nickname TEXT,
      display_name TEXT,
      display_name_changed_at TIMESTAMPTZ,
      username_changed_at TIMESTAMPTZ,
      email TEXT,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      email_verified_at TIMESTAMPTZ,
      email_verify_token TEXT,
      email_verify_token_expires_at TIMESTAMPTZ,
      pending_email TEXT,
      pending_email_token TEXT,
      pending_email_token_expires_at TIMESTAMPTZ,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      role_color TEXT,
      is_disabled BOOLEAN NOT NULL DEFAULT false,
      disabled_reason TEXT,
      disabled_until TIMESTAMPTZ,
      created_ip TEXT,
      totp_enabled BOOLEAN NOT NULL DEFAULT false,
      totp_secret TEXT,
      totp_secret_pending TEXT,
      totp_confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      google_id TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL;
  `);

  // ── Sessions ──────────────────────────────────────────────────────────────
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

  // ── 2FA + recovery ────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_challenges (
      ticket TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS backup_codes (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS totp_used_codes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, code)
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed BOOLEAN NOT NULL DEFAULT false
    );
  `);

  // ── State blob (legacy sync target) ──────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS states (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json JSONB,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS states_updated_at_idx ON states(updated_at DESC);
  `);

  // ── Admin / ops ───────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id BIGSERIAL PRIMARY KEY,
      admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ip_bans (
      id BIGSERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ,
      created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS ip_bans_ip_idx ON ip_bans(ip);

    CREATE TABLE IF NOT EXISTS usage_daily (
      day DATE NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      ip TEXT,
      requests INTEGER NOT NULL DEFAULT 0,
      bytes_in BIGINT NOT NULL DEFAULT 0,
      bytes_out BIGINT NOT NULL DEFAULT 0,
      total_ms BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (day, user_id)
    );
    CREATE INDEX IF NOT EXISTS usage_daily_day_idx ON usage_daily(day);

    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT NOT NULL,
      action TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, action, window_start)
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      response_status INTEGER,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at);

    CREATE TABLE IF NOT EXISTS user_stats_cache (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      transactions_count INTEGER NOT NULL DEFAULT 0,
      wallets_count INTEGER NOT NULL DEFAULT 0,
      categories_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT,
      body TEXT,
      data JSONB,
      read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
  `);

  // ── Finance domain (per-entity tables, ready for future REST wiring) ─────
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
      attachments JSONB,
      recurring_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions(user_id, date DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS transactions_user_category_idx ON transactions(user_id, category_id) WHERE deleted_at IS NULL;

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
      color TEXT,
      icon TEXT,
      note TEXT,
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
    CREATE INDEX IF NOT EXISTS recurring_user_idx ON recurring_rules(user_id) WHERE deleted_at IS NULL;

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
    CREATE INDEX IF NOT EXISTS debts_user_idx ON debts(user_id) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS exchange_rates_cache (
      base TEXT NOT NULL,
      quote TEXT NOT NULL,
      rate NUMERIC NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (base, quote)
    );
  `);

  // ── Seed admin user ──────────────────────────────────────────────────────
  if (admin?.username && admin?.password) {
    const exists = await pool.query("SELECT id FROM users WHERE username = $1", [admin.username]);
    if (!exists.rows.length) {
      const hash = await bcrypt.hash(admin.password, 10);
      await pool.query(
        "INSERT INTO users (username, password_hash, role, email_verified) VALUES ($1, $2, 'admin', true)",
        [admin.username, hash]
      );
    }
  }

  return pool;
}
