import bcrypt from "bcryptjs";
import dns from "node:dns";
import pg from "pg";

const { Pool } = pg;

// Some serverless environments/providers may return IPv6-first DNS answers.
// If IPv6 egress isn't available, Postgres connections can hang then time out.
// Prefer IPv4 to avoid "connection timeout" issues.
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Node < 18 or unsupported environment
}

/**
 * Get database connection URL from environment variables.
 */
function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  );
}

/**
 * Create a pool without running migrations.
 * Use this for production runtime - migrations should be run separately.
 * Performs a quick health check (SELECT 1) to verify connectivity.
 */
export async function createPoolOnly() {
  const DATABASE_URL = getDatabaseUrl();

  if (!DATABASE_URL) {
    throw new Error(
      "Postgres connection string is not set. Set DATABASE_URL (recommended) or use Vercel Postgres vars like POSTGRES_URL/POSTGRES_URL_NON_POOLING."
    );
  }

  // Many managed Postgres providers (including Vercel Postgres, Neon, Supabase)
  // require SSL. node-postgres does NOT understand `sslmode=require` in the URL,
  // so we enable SSL automatically for non-local connections.
  const isLocal = /localhost|127\.0\.0\.1/i.test(DATABASE_URL);
  const sslDisabled = String(process.env.PGSSL_DISABLE || "").trim() === "1";
  const ssl = !isLocal && !sslDisabled ? { rejectUnauthorized: false } : false;

  // Reuse pool across hot reloads / function invocations
  if (globalThis.__tradej_pool) {
    // Quick health check on existing pool
    try {
      await globalThis.__tradej_pool.query("SELECT 1");
      return globalThis.__tradej_pool;
    } catch {
      // Pool is broken, will recreate below
      try {
        await globalThis.__tradej_pool.end();
      } catch {
        // ignore
      }
      globalThis.__tradej_pool = null;
    }
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    ssl,
    connectionTimeoutMillis: 20_000,  // Allow time for serverless DB cold start
    idleTimeoutMillis: 30_000,
    // Enable keepalive to prevent connection drops on idle
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // Set statement timeout to prevent long-running queries from exhausting the pool.
  // 10s is sufficient for legitimate queries; 30s was too long for serverless (Vercel 10-60s function timeout).
  pool.on("connect", (client) => {
    client.query("SET statement_timeout = '10s'; SET idle_in_transaction_session_timeout = '10s'").catch(() => {
      // Ignore errors - this is a best-effort setting
    });
  });

  // Basic connectivity check
  await pool.query("SELECT 1");
  
  globalThis.__tradej_pool = pool;
  return pool;
}

/**
 * Create and initialize Postgres schema.
 * This function runs all migrations and should be used for:
 * - Initial setup
 * - Development (with RUN_MIGRATIONS_ON_BOOT=1)
 * - Explicit migration runs (via migrate.js script)
 *
 * Requires:
 *  - DATABASE_URL (standard Postgres connection string)
 */
export async function initDb({ admin }) {
  const DATABASE_URL = getDatabaseUrl();

  if (!DATABASE_URL) {
    throw new Error(
      "Postgres connection string is not set. Set DATABASE_URL (recommended) or use Vercel Postgres vars like POSTGRES_URL/POSTGRES_URL_NON_POOLING."
    );
  }

  // Get or create pool using createPoolOnly
  const pool = await createPoolOnly();

  // Schema
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      nickname TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      role_color TEXT,
      is_disabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS states (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id BIGSERIAL PRIMARY KEY,
      admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

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

    -- IP bans table
    CREATE TABLE IF NOT EXISTS ip_bans (
      id BIGSERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ,
      created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS ip_bans_ip_idx ON ip_bans(ip);
    CREATE INDEX IF NOT EXISTS ip_bans_expires_idx ON ip_bans(expires_at);

    -- Usage tracking table
    CREATE TABLE IF NOT EXISTS usage_daily (
      day DATE NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ip TEXT,
      requests INTEGER NOT NULL DEFAULT 0,
      bytes_in BIGINT NOT NULL DEFAULT 0,
      bytes_out BIGINT NOT NULL DEFAULT 0,
      total_ms BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (day, user_id, ip)
    );

    CREATE INDEX IF NOT EXISTS usage_daily_day_idx ON usage_daily(day);
    CREATE INDEX IF NOT EXISTS usage_daily_user_idx ON usage_daily(user_id);

    -- Rate limits table for anti-spam
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT NOT NULL,
      action TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INT NOT NULL DEFAULT 0,
      PRIMARY KEY(key, action, window_start)
    );

    CREATE INDEX IF NOT EXISTS rate_limits_key_action_idx ON rate_limits(key, action);

    -- Idempotency keys for mutation endpoints (Step 3 of sync-reliability patch).
    -- Maps client-supplied UUID to the cached response of a successful mutation,
    -- so retries of the same logical operation are deduped at the HTTP layer.
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key UUID PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_body JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at);
    CREATE INDEX IF NOT EXISTS idx_idempotency_user ON idempotency_keys (user_id);

    -- Ideas & Plans Tracker table
    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'Other',
      priority TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'Draft',
      outcome TEXT DEFAULT 'Unknown',
      impact_score INTEGER DEFAULT NULL,
      effort_score INTEGER DEFAULT NULL,
      links JSONB DEFAULT '[]',
      tags JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      implemented_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS ideas_user_id_idx ON ideas(user_id);
    CREATE INDEX IF NOT EXISTS ideas_status_idx ON ideas(status);
    CREATE INDEX IF NOT EXISTS ideas_category_idx ON ideas(category);

    -- Trading Ideas table (new trading-focused ideas)
    CREATE TABLE IF NOT EXISTS trading_ideas (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      pair TEXT,
      direction TEXT NOT NULL DEFAULT 'Long',
      timeframe TEXT,
      status TEXT NOT NULL DEFAULT 'Planned',
      result TEXT NOT NULL DEFAULT 'Unknown',
      notes_html TEXT,
      notes_text TEXT,
      links JSONB DEFAULT '[]',
      images JSONB DEFAULT '[]',
      tags JSONB DEFAULT '[]',
      linked_trade_ids JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS trading_ideas_user_id_idx ON trading_ideas(user_id);
    CREATE INDEX IF NOT EXISTS trading_ideas_status_idx ON trading_ideas(status);
    CREATE INDEX IF NOT EXISTS trading_ideas_result_idx ON trading_ideas(result);

    -- Public shares table for sharing trades/documents/ideas via public links
    CREATE TABLE IF NOT EXISTS public_shares (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('trade', 'doc', 'idea', 'backtest')),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      payload JSONB NOT NULL,
      title TEXT,
      author_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ,
      revoked BOOLEAN NOT NULL DEFAULT false,
      views BIGINT NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS public_shares_created_at_idx ON public_shares(created_at);
    CREATE INDEX IF NOT EXISTS public_shares_user_id_idx ON public_shares(user_id);

    -- Add status column to public_shares if it doesn't exist (for chunked uploads)
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'public_shares' AND column_name = 'status'
      ) THEN
        ALTER TABLE public_shares ADD COLUMN status TEXT NOT NULL DEFAULT 'complete';
      END IF;
    END $$;

    -- Temporary storage for chunked share uploads
    CREATE TABLE IF NOT EXISTS share_chunks (
      share_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (share_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS share_chunks_created_at_idx ON share_chunks(created_at);

    -- Admin backups table for storing database backups
    CREATE TABLE IF NOT EXISTS admin_backups (
      name TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      size_bytes BIGINT NOT NULL,
      format TEXT NOT NULL DEFAULT 'json.gz',
      content BYTEA NOT NULL
    );

    CREATE INDEX IF NOT EXISTS admin_backups_created_at_idx ON admin_backups(created_at);

    -- Project updates table (admin-managed changelog)
    CREATE TABLE IF NOT EXISTS project_updates (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'Other',
      version TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ,
      is_published BOOLEAN NOT NULL DEFAULT false,
      created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS project_updates_published_idx ON project_updates(is_published, published_at DESC);

    -- User feedback table (bug reports & suggestions)
    CREATE TABLE IF NOT EXISTS user_feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_nickname TEXT,
      type TEXT NOT NULL DEFAULT 'bug',
      title TEXT NOT NULL,
      description TEXT,
      images JSONB DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'new',
      admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS user_feedback_status_idx ON user_feedback(status);
    CREATE INDEX IF NOT EXISTS user_feedback_created_at_idx ON user_feedback(created_at DESC);

    -- Notifications table for user inbox system
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      data JSONB DEFAULT '{}',
      read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);

    -- Feedback messages table for ticket conversations
    CREATE TABLE IF NOT EXISTS feedback_messages (
      id SERIAL PRIMARY KEY,
      feedback_id INTEGER NOT NULL REFERENCES user_feedback(id) ON DELETE CASCADE,
      sender_role TEXT NOT NULL,
      sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS feedback_messages_feedback_id_idx ON feedback_messages(feedback_id, created_at DESC);
  `);

  // Safe schema migrations (add new columns if they don't exist)
  // Add email, google_id, disabled_reason, disabled_until, created_ip to users table
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_reason TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_until TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_ip TEXT;
    `);
  } catch (e) {
    // Some databases might not support ADD COLUMN IF NOT EXISTS, so ignore errors
    // eslint-disable-next-line no-console
    console.warn("[db] column migration:", e?.message || e);
  }

  // Create unique index for google_id if not exists
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id) WHERE google_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL;
      CREATE INDEX IF NOT EXISTS users_created_ip_idx ON users(created_ip) WHERE created_ip IS NOT NULL;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] index creation:", e?.message || e);
  }

  // Add version column to states table for optimistic concurrency control
  try {
    await pool.query(`
      ALTER TABLE states ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] states version migration:", e?.message || e);
  }

  // Add TOTP 2FA columns to users table
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_pending TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_confirmed_at TIMESTAMPTZ;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] totp columns migration:", e?.message || e);
  }

  // Create login_challenges table for 2FA ticket flow
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_challenges (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        remember BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS login_challenges_user_id_idx ON login_challenges(user_id);
      CREATE INDEX IF NOT EXISTS login_challenges_expires_idx ON login_challenges(expires_at);
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] login_challenges table:", e?.message || e);
  }

  // Create backup_codes table for 2FA recovery
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS backup_codes (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        used_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS backup_codes_user_id_idx ON backup_codes(user_id);
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] backup_codes table:", e?.message || e);
  }

  // Add display_name and display_name_changed_at columns to users table
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name_changed_at TIMESTAMPTZ;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] display_name columns migration:", e?.message || e);
  }

  // Add username_changed_at column for username change cooldown
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ DEFAULT NULL;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] username_changed_at column migration:", e?.message || e);
  }

  // Add email verification columns to users table
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token_expires_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_token TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_token_expires_at TIMESTAMPTZ;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] email verification columns migration:", e?.message || e);
  }

  // Create password_resets table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        ip TEXT,
        ua TEXT
      );
      CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets(user_id);
      CREATE INDEX IF NOT EXISTS password_resets_token_idx ON password_resets(token);
      CREATE INDEX IF NOT EXISTS password_resets_expires_idx ON password_resets(expires_at);
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] password_resets table:", e?.message || e);
  }

  // Add linked_trade_ids column to trading_ideas table for bidirectional linking
  try {
    await pool.query(`
      ALTER TABLE trading_ideas ADD COLUMN IF NOT EXISTS linked_trade_ids JSONB DEFAULT '[]';
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] trading_ideas linked_trade_ids migration:", e?.message || e);
  }

  // Add idea_date column to trading_ideas table for user-specified idea date
  try {
    await pool.query(`
      ALTER TABLE trading_ideas ADD COLUMN IF NOT EXISTS idea_date DATE;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] trading_ideas idea_date migration:", e?.message || e);
  }

  // Add model_id column to trading_ideas table for linking ideas to trading models
  try {
    await pool.query(`
      ALTER TABLE trading_ideas ADD COLUMN IF NOT EXISTS model_id TEXT;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] trading_ideas model_id migration:", e?.message || e);
  }

  // Add ticket status columns to user_feedback table for ticketing system
  try {
    await pool.query(`
      ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS closed_by_role TEXT;
      ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
      ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
      ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
      ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS last_message_by TEXT;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] user_feedback ticket columns migration:", e?.message || e);
  }

  // Add admin_read_at column to track whether admin has read a feedback item
  try {
    await pool.query(`
      ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS admin_read_at TIMESTAMPTZ;
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] user_feedback admin_read_at migration:", e?.message || e);
  }

  // Chunked sync session tables (replaces in-memory Map for serverless compatibility)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sync_state_sessions (
        session_id TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        total_chunks INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'receiving',
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
        PRIMARY KEY (session_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS sync_state_chunks (
        session_id TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        chunk_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(session_id, user_id, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS sync_state_sessions_expires_idx ON sync_state_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS sync_state_chunks_session_idx ON sync_state_chunks(session_id, user_id);
    `);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[db] sync session tables migration:", e?.message || e);
  }

  // Migrate public_shares type CHECK constraint to include 'backtest'
  try {
    await pool.query(`
      ALTER TABLE public_shares DROP CONSTRAINT IF EXISTS public_shares_type_check;
      ALTER TABLE public_shares ADD CONSTRAINT public_shares_type_check CHECK (type IN ('trade', 'doc', 'idea', 'backtest'));
    `);
  } catch (e) {
    console.warn("[db] public_shares type constraint migration:", e?.message || e);
  }

  // --- Tournament tables ---
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        rules_text TEXT,
        banner_image_url TEXT,
        timezone TEXT NOT NULL DEFAULT 'Europe/Kyiv',
        start_date DATE,
        end_date DATE,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','finished','archived')),
        scoring_config JSONB DEFAULT '{}',
        visibility_config JSONB DEFAULT '{}',
        theme_config JSONB DEFAULT '{}',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        archived_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS tournaments_slug_idx ON tournaments(slug);
      CREATE INDEX IF NOT EXISTS tournaments_status_idx ON tournaments(status);
    `);
  } catch (e) {
    console.warn("[db] tournaments table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_tables (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        include_in_overall BOOLEAN NOT NULL DEFAULT true,
        table_config JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(tournament_id, slug)
      );
      CREATE INDEX IF NOT EXISTS tournament_tables_tournament_idx ON tournament_tables(tournament_id);
    `);
  } catch (e) {
    console.warn("[db] tournament_tables table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_participants (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        table_id INTEGER REFERENCES tournament_tables(id) ON DELETE SET NULL,
        linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        display_name TEXT NOT NULL,
        username TEXT,
        external_id TEXT,
        discord_id TEXT,
        telegram TEXT,
        avatar_url TEXT,
        country_code TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disqualified','hidden')),
        is_manual BOOLEAN NOT NULL DEFAULT true,
        seed_rating NUMERIC,
        notes TEXT,
        meta JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tournament_participants_tournament_idx ON tournament_participants(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_participants_table_idx ON tournament_participants(table_id);
    `);
  } catch (e) {
    console.warn("[db] tournament_participants table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_rounds (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        table_id INTEGER NOT NULL REFERENCES tournament_tables(id) ON DELETE CASCADE,
        round_date DATE,
        asset TEXT,
        round_type TEXT NOT NULL DEFAULT 'combined' CHECK (round_type IN ('long','short','combined','custom')),
        title TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','locked')),
        published_at TIMESTAMPTZ,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tournament_rounds_tournament_idx ON tournament_rounds(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_rounds_table_idx ON tournament_rounds(table_id);
    `);
  } catch (e) {
    console.warn("[db] tournament_rounds table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_results (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        table_id INTEGER NOT NULL REFERENCES tournament_tables(id) ON DELETE CASCADE,
        round_id INTEGER NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
        participant_id INTEGER NOT NULL REFERENCES tournament_participants(id) ON DELETE CASCADE,
        prediction_value TEXT,
        outcome TEXT NOT NULL DEFAULT 'skipped' CHECK (outcome IN ('win','loss','neutral','skipped')),
        base_points NUMERIC NOT NULL DEFAULT 0,
        bonus_points NUMERIC NOT NULL DEFAULT 0,
        penalty_points NUMERIC NOT NULL DEFAULT 0,
        total_points NUMERIC NOT NULL DEFAULT 0,
        accuracy_value NUMERIC,
        streak_after INTEGER,
        admin_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(round_id, participant_id)
      );
      CREATE INDEX IF NOT EXISTS tournament_results_tournament_idx ON tournament_results(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_results_round_idx ON tournament_results(round_id);
      CREATE INDEX IF NOT EXISTS tournament_results_participant_idx ON tournament_results(participant_id);
    `);
  } catch (e) {
    console.warn("[db] tournament_results table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_public_links (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        public_slug TEXT UNIQUE NOT NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT false,
        public_config JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tournament_public_links_slug_idx ON tournament_public_links(public_slug);
    `);
  } catch (e) {
    console.warn("[db] tournament_public_links table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_audit_log (
        id BIGSERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        action TEXT NOT NULL,
        before_data JSONB,
        after_data JSONB,
        actor_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tournament_audit_log_tournament_idx ON tournament_audit_log(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_audit_log_created_idx ON tournament_audit_log(created_at DESC);
    `);
  } catch (e) {
    console.warn("[db] tournament_audit_log table migration:", e?.message || e);
  }

  // --- Tournament schema migration: add points-based workflow columns ---
  try {
    await pool.query(`
      ALTER TABLE tournament_participants
        ADD COLUMN IF NOT EXISTS role TEXT,
        ADD COLUMN IF NOT EXISTS total_points NUMERIC NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS bonus_points NUMERIC NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS penalty_points NUMERIC NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS manual_rank INTEGER;
    `);
  } catch (e) {
    console.warn("[db] tournament_participants migration (add columns):", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_points_log (
        id BIGSERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        participant_id INTEGER NOT NULL REFERENCES tournament_participants(id) ON DELETE CASCADE,
        points_delta NUMERIC NOT NULL DEFAULT 0,
        reason TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tournament_points_log_tournament_idx ON tournament_points_log(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_points_log_participant_idx ON tournament_points_log(participant_id);
      CREATE INDEX IF NOT EXISTS tournament_points_log_created_idx ON tournament_points_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS tournament_points_log_tournament_created_idx ON tournament_points_log(tournament_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS tournament_points_log_participant_created_idx ON tournament_points_log(participant_id, created_at DESC);
    `);
  } catch (e) {
    console.warn("[db] tournament_points_log table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_vote_days (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        date_key TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','open','closed','resolved')),
        voting_open_at TIMESTAMPTZ,
        voting_close_at TIMESTAMPTZ,
        resolution_locked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(tournament_id, date_key)
      );
      CREATE INDEX IF NOT EXISTS tournament_vote_days_tournament_idx ON tournament_vote_days(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_vote_days_status_idx ON tournament_vote_days(status);
    `);
    // Migration: add vote_token column for day-specific voting links
    await pool.query(`ALTER TABLE tournament_vote_days ADD COLUMN IF NOT EXISTS vote_token TEXT`).catch(() => {});
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS tournament_vote_days_token_idx ON tournament_vote_days(vote_token) WHERE vote_token IS NOT NULL`).catch(() => {});
    // Backfill vote_token for existing rows that don't have one
    await pool.query(`UPDATE tournament_vote_days SET vote_token = encode(gen_random_bytes(16), 'hex') WHERE vote_token IS NULL`).catch((e) => {
      console.warn("[db] vote_token backfill warning:", e?.message || e);
    });
  } catch (e) {
    console.warn("[db] tournament_vote_days table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_vote_assets (
        id SERIAL PRIMARY KEY,
        vote_day_id INTEGER NOT NULL REFERENCES tournament_vote_days(id) ON DELETE CASCADE,
        asset_code TEXT NOT NULL,
        asset_label TEXT,
        icon_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tournament_vote_assets_day_idx ON tournament_vote_assets(vote_day_id);
    `);
    // Migration: add icon_url if missing
    await pool.query(`ALTER TABLE tournament_vote_assets ADD COLUMN IF NOT EXISTS icon_url TEXT`).catch(() => {});
  } catch (e) {
    console.warn("[db] tournament_vote_assets table migration:", e?.message || e);
  }

  // Tournament default assets (per-tournament custom default pairs)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_default_assets (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        asset_code TEXT NOT NULL,
        asset_label TEXT,
        icon_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tournament_default_assets_tid_idx ON tournament_default_assets(tournament_id);
    `);
  } catch (e) {
    console.warn("[db] tournament_default_assets table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_votes (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        vote_day_id INTEGER NOT NULL REFERENCES tournament_vote_days(id) ON DELETE CASCADE,
        nickname TEXT NOT NULL,
        normalized_nickname TEXT NOT NULL,
        ip_hash TEXT,
        fingerprint TEXT,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','duplicate','removed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(vote_day_id, normalized_nickname)
      );
      CREATE INDEX IF NOT EXISTS tournament_votes_day_idx ON tournament_votes(vote_day_id);
      CREATE INDEX IF NOT EXISTS tournament_votes_tournament_idx ON tournament_votes(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_votes_nickname_idx ON tournament_votes(normalized_nickname);
    `);
  } catch (e) {
    console.warn("[db] tournament_votes table migration:", e?.message || e);
  }

  // Add user_agent column if missing
  try {
    await pool.query(`ALTER TABLE tournament_votes ADD COLUMN IF NOT EXISTS user_agent TEXT`);
  } catch (e) {
    console.warn("[db] tournament_votes user_agent migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_vote_selections (
        id SERIAL PRIMARY KEY,
        vote_id INTEGER NOT NULL REFERENCES tournament_votes(id) ON DELETE CASCADE,
        asset_id INTEGER NOT NULL REFERENCES tournament_vote_assets(id) ON DELETE CASCADE,
        selected_option TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS tournament_vote_selections_vote_idx ON tournament_vote_selections(vote_id);
    `);
  } catch (e) {
    console.warn("[db] tournament_vote_selections table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_day_results (
        id SERIAL PRIMARY KEY,
        vote_day_id INTEGER NOT NULL REFERENCES tournament_vote_days(id) ON DELETE CASCADE,
        asset_id INTEGER NOT NULL REFERENCES tournament_vote_assets(id) ON DELETE CASCADE,
        correct_option TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(vote_day_id, asset_id)
      );
      CREATE INDEX IF NOT EXISTS tournament_day_results_day_idx ON tournament_day_results(vote_day_id);
    `);
  } catch (e) {
    console.warn("[db] tournament_day_results table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_day_scores (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        vote_day_id INTEGER NOT NULL REFERENCES tournament_vote_days(id) ON DELETE CASCADE,
        normalized_nickname TEXT NOT NULL,
        nickname_snapshot TEXT NOT NULL,
        correct_count INTEGER NOT NULL DEFAULT 0,
        total_assets INTEGER NOT NULL DEFAULT 0,
        day_points NUMERIC(10,2) NOT NULL DEFAULT 0,
        resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        breakdown JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(vote_day_id, normalized_nickname)
      );
      CREATE INDEX IF NOT EXISTS tournament_day_scores_tournament_idx ON tournament_day_scores(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_day_scores_day_idx ON tournament_day_scores(vote_day_id);
      CREATE INDEX IF NOT EXISTS tournament_day_scores_nickname_idx ON tournament_day_scores(normalized_nickname);
    `);
  } catch (e) {
    console.warn("[db] tournament_day_scores table migration:", e?.message || e);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_leaderboard_cache (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        normalized_nickname TEXT NOT NULL,
        nickname_snapshot TEXT NOT NULL,
        total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
        resolved_days INTEGER NOT NULL DEFAULT 0,
        last_resolved_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(tournament_id, normalized_nickname)
      );
      CREATE INDEX IF NOT EXISTS tournament_leaderboard_cache_tournament_idx ON tournament_leaderboard_cache(tournament_id);
      CREATE INDEX IF NOT EXISTS tournament_leaderboard_cache_points_idx ON tournament_leaderboard_cache(tournament_id, total_points DESC);
    `);
  } catch (e) {
    console.warn("[db] tournament_leaderboard_cache table migration:", e?.message || e);
  }

  // Migration: change day_points and total_points from INTEGER to NUMERIC for fractional multipliers
  try {
    await pool.query(`ALTER TABLE tournament_day_scores ALTER COLUMN day_points TYPE NUMERIC(10,2)`);
  } catch (e) {
    console.warn("[db] tournament_day_scores day_points type migration:", e?.message || e);
  }
  try {
    await pool.query(`ALTER TABLE tournament_leaderboard_cache ALTER COLUMN total_points TYPE NUMERIC(10,2)`);
  } catch (e) {
    console.warn("[db] tournament_leaderboard_cache total_points type migration:", e?.message || e);
  }

  // Add is_displayed column to tournaments (only one can be true at a time)
  try {
    await pool.query(`
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_displayed BOOLEAN NOT NULL DEFAULT false;
    `);
  } catch (e) {
    console.warn("[db] tournaments is_displayed migration:", e?.message || e);
  }

  // Add vote_password column to tournaments (optional password for public voting)
  try {
    await pool.query(`
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS vote_password TEXT;
    `);
  } catch (e) {
    console.warn("[db] tournaments vote_password migration:", e?.message || e);
  }

  // Materialized counters cache to avoid expensive JSONB full-scans on every admin request
  // TODO: cache is refreshed only via admin.service.js:refreshUserStatsCache (manual, 10-min rate-limit) — not invalidated on state writes.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_stats_cache (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        trades_count INTEGER NOT NULL DEFAULT 0,
        accounts_count INTEGER NOT NULL DEFAULT 0,
        documents_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS user_stats_cache_updated_at_idx ON user_stats_cache(updated_at);
    `);
  } catch (e) {
    console.warn("[db] user_stats_cache table migration:", e?.message || e);
  }

  // Ensure initial admin exists (idempotent)
  const adminUsername = String(admin.username || "admin");
  const adminPassword = String(admin.password || "change-me");
  const adminNickname = String(admin.nickname || "Admin");

  const existing = await pool.query("SELECT id FROM users WHERE username = $1", [adminUsername]);
  if ((existing.rows || []).length === 0) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await pool.query(
      "INSERT INTO users (username, nickname, password_hash, role) VALUES ($1,$2,$3,'admin')",
      [adminUsername, adminNickname, hash]
    );
    // eslint-disable-next-line no-console
    console.log(`[db] Admin created: ${adminUsername}`);
  }

  return pool;
}
