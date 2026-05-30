import bcrypt from "bcryptjs";
import { getPool, getUserById, safeUser } from "./db.service.js";
import { normalizeHexColor, validateEmail } from "../utils/validators.js";
import { logAdmin } from "./audit.service.js";
import { BCRYPT_COST } from "./auth.service.js";

// In-memory cache for dashboard summary (key = "from|to", value = { data, ts })
const _summaryCache = new Map();
const SUMMARY_CACHE_TTL = 300_000; // 5 minutes

// Track last stats-cache refresh to rate-limit at most once per 10 minutes
let _lastCacheRefreshAt = 0;
let _cacheRefreshInProgress = false;
const CACHE_REFRESH_COOLDOWN = 10 * 60 * 1000; // 10 minutes

export async function getAllUsers() {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query(`
    SELECT 
      u.id, 
      u.username, 
      u.nickname, 
      u.role, 
      u.role_color, 
      u.is_disabled, 
      u.disabled_reason, 
      u.disabled_until, 
      u.email, 
      u.created_ip,
      u.created_at, 
      u.updated_at,
      COALESCE(jsonb_array_length(s.state_json->'wallets'), 0) AS wallets_count,
      COALESCE(jsonb_array_length(s.state_json->'transactions'), 0) AS transactions_count,
      ls.ip AS last_ip
    FROM users u
    LEFT JOIN states s ON s.user_id = u.id
    LEFT JOIN (
      SELECT DISTINCT ON (user_id) user_id, ip
      FROM sessions
      WHERE revoked = false
      ORDER BY user_id, last_seen_at DESC NULLS LAST, created_at DESC
    ) ls ON ls.user_id = u.id
    ORDER BY u.role DESC, u.id ASC
  `);
  return r.rows || [];
}

export async function createUser({ username, nickname, password, role, role_color, adminId }) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  if (!username || !password) {
    return { error: "Username and password required" };
  }
  if (String(password).length < 8) {
    return { error: "Password too short (min 8)" };
  }

  const nextRole = role ? String(role).trim() : "user";
  if (nextRole.length > 32) {
    return { error: "Role too long" };
  }

  let nextRoleColor = null;
  try {
    nextRoleColor = normalizeHexColor(role_color);
  } catch (e) {
    return { error: e?.message || "Bad role_color" };
  }

  const hash = await bcrypt.hash(String(password), BCRYPT_COST);

  try {
    const r = await pool.query(
      `INSERT INTO users (username, nickname, password_hash, role, role_color, is_disabled, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,false,now(),now())
       RETURNING id, username, nickname, role, role_color, is_disabled, created_at, updated_at`,
      [String(username), nickname ? String(nickname) : null, hash, nextRole || "user", nextRoleColor]
    );
    const user = r.rows?.[0];
    await logAdmin(adminId, "user.create", user.id, {
      username: user.username,
      role: user.role,
      role_color: user.role_color,
    });
    return { user };
  } catch (e) {
    if (String(e?.message || "").toLowerCase().includes("unique")) {
      return { error: "Login already exists" };
    }
    return { error: "DB error" };
  }
}

export async function updateUser(id, { nickname, newPassword, role, role_color, is_disabled, email, adminId }) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const u = await getUserById(id);
  if (!u) return { error: "User not found" };

  const changingRole = role !== undefined;
  const changingDisabled = is_disabled !== undefined;
  const changingEmail = email !== undefined;
  if (u.role === "admin" && (changingRole || changingDisabled)) {
    return { error: "Cannot change role/disable admin" };
  }

  const nextRole = role !== undefined ? String(role).trim() : u.role;
  if (nextRole.length > 32) {
    return { error: "Role too long" };
  }

  let nextRoleColor = u.role_color;
  if (role_color !== undefined) {
    try {
      nextRoleColor = normalizeHexColor(role_color);
    } catch (e) {
      return { error: e?.message || "Bad role_color" };
    }
  }
  const nextDisabled = is_disabled !== undefined ? !!is_disabled : !!u.is_disabled;
  
  // Handle email update with validation
  let nextEmail = u.email;
  if (changingEmail) {
    const emailCheck = validateEmail(email, { required: false });
    if (!emailCheck.valid) {
      return { error: emailCheck.error };
    }
    nextEmail = emailCheck.normalized;
    // Check for duplicate email if setting a new one
    if (nextEmail) {
      const existingWithEmail = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id <> $2",
        [nextEmail, id]
      );
      if (existingWithEmail.rows?.length > 0) {
        return { error: "Email already in use" };
      }
    }
  }

  if (newPassword) {
    if (String(newPassword).length < 8) {
      return { error: "Password too short (min 8)" };
    }
    const hash = await bcrypt.hash(String(newPassword), BCRYPT_COST);
    await pool.query(
      `UPDATE users
       SET nickname = $1,
           password_hash = $2,
           role = $3,
           role_color = $4,
           is_disabled = $5,
           email = $6,
           updated_at = now()
       WHERE id = $7`,
      [
        nickname !== undefined ? (nickname ? String(nickname) : null) : u.nickname,
        hash,
        nextRole,
        nextRoleColor,
        nextDisabled,
        nextEmail,
        id,
      ]
    );
    await logAdmin(adminId, "user.password_reset", id, { username: u.username });
  } else {
    await pool.query(
      `UPDATE users
       SET nickname = $1,
           role = $2,
           role_color = $3,
           is_disabled = $4,
           email = $5,
           updated_at = now()
       WHERE id = $6`,
      [
        nickname !== undefined ? (nickname ? String(nickname) : null) : u.nickname,
        nextRole,
        nextRoleColor,
        nextDisabled,
        nextEmail,
        id,
      ]
    );
  }

  if (changingRole) await logAdmin(adminId, "user.role_set", id, { role: nextRole });
  if (role_color !== undefined) await logAdmin(adminId, "user.role_color_set", id, { role_color: nextRoleColor });
  if (changingDisabled) await logAdmin(adminId, nextDisabled ? "user.disabled" : "user.enabled", id, null);
  if (changingEmail) await logAdmin(adminId, "user.email_set", id, { email: nextEmail });

  return { ok: true };
}

export async function deleteUser(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const u = await getUserById(id);
  if (!u) return { error: "User not found" };
  if (u.role === "admin") return { error: "Cannot delete admin" };

  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  await logAdmin(adminId, "user.delete", id, null);
  return { ok: true };
}

const FULL_DELETE_GUARD_KEY = process.env.FULL_DELETE_GUARD_KEY || "3GuardDelete10302040Key.";

export async function fullDeleteUser(id, adminId, guardKey) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  if (!guardKey || guardKey !== FULL_DELETE_GUARD_KEY) {
    return { error: "Invalid guard key" };
  }

  const u = await getUserById(id);
  if (!u) return { error: "User not found" };
  if (u.role === "admin") return { error: "Cannot delete admin" };

  const meta = { username: u.username, email: u.email || null };

  // Clean up SET NULL references to fully purge user data
  await pool.query("UPDATE admin_logs SET target_user_id = NULL WHERE target_user_id = $1", [id]);
  await pool.query("UPDATE admin_logs SET admin_user_id = NULL WHERE admin_user_id = $1", [id]);
  await pool.query("DELETE FROM usage_daily WHERE user_id = $1", [id]);
  await pool.query("UPDATE public_shares SET user_id = NULL WHERE user_id = $1", [id]);
  await pool.query("UPDATE user_feedback SET user_id = NULL WHERE user_id = $1", [id]);
  await pool.query("UPDATE feedback_messages SET sender_user_id = NULL WHERE sender_user_id = $1", [id]);
  await pool.query("UPDATE ip_bans SET created_by_admin_id = NULL WHERE created_by_admin_id = $1", [id]);

  // Delete user (CASCADE handles remaining FK references)
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  await logAdmin(adminId, "user.full_delete", null, meta);
  return { ok: true };
}

export async function logoutAllUserSessions(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const u = await getUserById(id);
  if (!u) return { error: "User not found" };
  if (u.role === "admin") return { error: "Cannot logout admin" };

  const r = await pool.query("UPDATE sessions SET revoked = true WHERE user_id = $1 AND revoked = false", [id]);
  await logAdmin(adminId, "user.logout_all", id, { username: u.username, removed: r.rowCount || 0 });

  return { ok: true, removed: r.rowCount || 0 };
}

// Ban management
export async function banUser(id, { reason, disabled_until, adminId }) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const u = await getUserById(id);
  if (!u) return { error: "User not found" };
  if (u.role === "admin") return { error: "Cannot ban admin" };

  await pool.query(
    `UPDATE users 
     SET is_disabled = true, 
         disabled_reason = $1, 
         disabled_until = $2,
         updated_at = now()
     WHERE id = $3`,
    [reason || null, disabled_until || null, id]
  );

  // Revoke all sessions
  await pool.query("UPDATE sessions SET revoked = true WHERE user_id = $1 AND revoked = false", [id]);

  await logAdmin(adminId, "user.ban", id, { reason, disabled_until });
  return { ok: true };
}

export async function unbanUser(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const u = await getUserById(id);
  if (!u) return { error: "User not found" };

  await pool.query(
    `UPDATE users 
     SET is_disabled = false, 
         disabled_reason = NULL, 
         disabled_until = NULL,
         updated_at = now()
     WHERE id = $1`,
    [id]
  );

  await logAdmin(adminId, "user.unban", id, null);
  return { ok: true };
}

// IP Bans
export async function getIpBans() {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query(
    `SELECT b.id, b.ip, b.reason, b.created_at, b.expires_at, u.username as created_by_username
     FROM ip_bans b
     LEFT JOIN users u ON u.id = b.created_by_admin_id
     ORDER BY b.created_at DESC`
  );
  return r.rows || [];
}

export async function createIpBan({ ip, reason, expires_at, adminId }) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  if (!ip || !String(ip).trim()) {
    return { error: "IP address required" };
  }

  const r = await pool.query(
    `INSERT INTO ip_bans (ip, reason, expires_at, created_by_admin_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, ip, reason, created_at, expires_at`,
    [String(ip).trim(), reason || null, expires_at || null, adminId || null]
  );

  await logAdmin(adminId, "ip_ban.create", null, { ip: String(ip).trim(), reason, expires_at });
  return { ban: r.rows?.[0] };
}

export async function deleteIpBan(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const existing = await pool.query("SELECT ip FROM ip_bans WHERE id = $1", [id]);
  if (!existing.rows?.length) {
    return { error: "Ban not found" };
  }

  await pool.query("DELETE FROM ip_bans WHERE id = $1", [id]);
  await logAdmin(adminId, "ip_ban.remove", null, { ip: existing.rows[0].ip });
  return { ok: true };
}

export async function isIpBanned(ip) {
  const pool = getPool();
  if (!pool) return null;
  if (!ip) return null;

  const r = await pool.query(
    `SELECT id, ip, reason, expires_at FROM ip_bans 
     WHERE ip = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [String(ip)]
  );
  return r.rows?.[0] || null;
}

// Usage statistics
export async function getUsageStats({ dayFrom, dayTo, userId }) {
  const pool = getPool();
  if (!pool) return { stats: [], totals: {} };

  let whereClause = "WHERE 1=1";
  const params = [];
  let idx = 1;

  if (dayFrom) {
    whereClause += ` AND day >= $${idx}`;
    params.push(dayFrom);
    idx++;
  }
  if (dayTo) {
    whereClause += ` AND day <= $${idx}`;
    params.push(dayTo);
    idx++;
  }
  if (userId) {
    whereClause += ` AND user_id = $${idx}`;
    params.push(userId);
    idx++;
  }

  const sql = `
    SELECT 
      u.day,
      u.user_id,
      u.ip,
      u.requests,
      u.bytes_in,
      u.bytes_out,
      u.total_ms,
      users.username
    FROM usage_daily u
    LEFT JOIN users ON users.id = u.user_id
    ${whereClause}
    ORDER BY u.day DESC, u.requests DESC
    LIMIT 1000
  `;

  const r = await pool.query(sql, params);

  // Get totals
  const totalsSql = `
    SELECT 
      COALESCE(SUM(requests), 0) as total_requests,
      COALESCE(SUM(bytes_in), 0) as total_bytes_in,
      COALESCE(SUM(bytes_out), 0) as total_bytes_out,
      COALESCE(SUM(total_ms), 0) as total_ms
    FROM usage_daily
    ${whereClause}
  `;
  const totalsR = await pool.query(totalsSql, params);

  return {
    stats: r.rows || [],
    totals: totalsR.rows?.[0] || {},
  };
}

// Dashboard stats
export async function getDashboardStats() {
  const pool = getPool();
  if (!pool) return null;

  const [usersResult, sessionsResult, logsResult, usageResult, statsCache] = await Promise.all([
    pool.query("SELECT COUNT(*) as count FROM users"),
    pool.query("SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE revoked = false AND expires_at > now()"),
    pool.query("SELECT COALESCE(reltuples, 0)::bigint as count FROM pg_class WHERE relname = 'admin_logs'"),
    pool.query(`
      SELECT 
        COALESCE(SUM(requests), 0) as requests_today,
        COALESCE(SUM(bytes_out), 0) as bytes_today
      FROM usage_daily 
      WHERE day = CURRENT_DATE
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(transactions_count), 0) AS total_transactions,
        COALESCE(SUM(wallets_count), 0) AS total_wallets,
        MAX(updated_at) AS cache_updated_at
      FROM user_stats_cache
    `),
  ]);

  return {
    total_users: parseInt(usersResult.rows?.[0]?.count || 0),
    active_sessions: parseInt(sessionsResult.rows?.[0]?.count || 0),
    total_transactions: parseInt(statsCache.rows?.[0]?.total_transactions || 0),
    total_wallets: parseInt(statsCache.rows?.[0]?.total_wallets || 0),
    total_logs: parseInt(logsResult.rows?.[0]?.count || 0),
    requests_today: parseInt(usageResult.rows?.[0]?.requests_today || 0),
    bytes_today: parseInt(usageResult.rows?.[0]?.bytes_today || 0),
    cache_updated_at: statsCache.rows?.[0]?.cache_updated_at || null,
  };
}

// Refresh the user_stats_cache table from the live states table.
// This is the one place that does the expensive JSONB full-scan, but it is
// rate-limited to at most once per 10 minutes.
export async function refreshUserStatsCache() {
  const pool = getPool();
  if (!pool) return { error: "Database unavailable" };

  const now = Date.now();
  if (now - _lastCacheRefreshAt < CACHE_REFRESH_COOLDOWN) {
    return { ok: true, skipped: true, nextRefreshIn: Math.ceil((CACHE_REFRESH_COOLDOWN - (now - _lastCacheRefreshAt)) / 1000) };
  }
  if (_cacheRefreshInProgress) {
    return { ok: true, skipped: true, nextRefreshIn: 0 };
  }

  // Use a dedicated client so we can raise statement_timeout for this one heavy query
  _cacheRefreshInProgress = true;
  const client = await pool.connect();
  let updated = 0;
  try {
    await client.query("SET statement_timeout = '60s'");
    const r = await client.query(`
      INSERT INTO user_stats_cache (user_id, transactions_count, wallets_count, categories_count, updated_at)
      SELECT
        s.user_id,
        COALESCE(jsonb_array_length(COALESCE(s.state_json->'transactions',    '[]'::jsonb)), 0),
        COALESCE(jsonb_array_length(COALESCE(s.state_json->'wallets',  '[]'::jsonb)), 0),
        COALESCE(jsonb_array_length(COALESCE(s.state_json->'categories', '[]'::jsonb)), 0),
        now()
      FROM states s
      WHERE s.state_json IS NOT NULL
      ON CONFLICT (user_id) DO UPDATE SET
        transactions_count    = EXCLUDED.transactions_count,
        wallets_count  = EXCLUDED.wallets_count,
        categories_count = EXCLUDED.categories_count,
        updated_at      = EXCLUDED.updated_at
    `);
    updated = r.rowCount || 0;
    _lastCacheRefreshAt = Date.now();
    // Invalidate summary in-memory cache so next request picks up fresh totals
    _summaryCache.clear();
  } finally {
    _cacheRefreshInProgress = false;
    await client.query("SET statement_timeout = '10s'").catch(() => {});
    client.release();
  }

  return { ok: true, updated };
}

// Range metrics: counts of new transactions/wallets/categories/active users
// over the requested window. Reads timestamps embedded in state_json.
export async function getDashboardSummary(fromDate, toDate) {
  const pool = getPool();
  if (!pool) return null;

  // Check in-memory cache
  const cacheKey = `${fromDate}|${toDate}`;
  const cached = _summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SUMMARY_CACHE_TTL) {
    return cached.data;
  }

  // Convert dates to milliseconds for JSONB createdAt comparison
  const fromMs = new Date(fromDate).setUTCHours(0, 0, 0, 0);
  const toMs = new Date(toDate).setUTCHours(23, 59, 59, 999);

  // Convert dates to UTC ISO for SQL date comparisons
  const fromDateObj = new Date(fromDate);
  fromDateObj.setUTCHours(0, 0, 0, 0);
  const toDateObj = new Date(toDate);
  toDateObj.setUTCHours(23, 59, 59, 999);

  // Run lightweight queries in parallel
  let activeUsers = 0;
  try {
    const activeUsersResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS count FROM usage_daily
       WHERE day >= $1::date AND day <= $2::date AND user_id IS NOT NULL`,
      [fromDate, toDate]
    );
    activeUsers = parseInt(activeUsersResult.rows?.[0]?.count || 0);
  } catch (err) {
    console.error("[admin] getDashboardSummary lightweight queries error:", err?.message || err);
  }

  // Heavy JSONB query for period-filtered finance entities.
  // Uses a dedicated client with raised statement_timeout + JS-side timeout
  let transactionsCreated = null;
  let walletsCreated = null;
  let categoriesCreated = null;

  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '30s'");

    // JS-side timeout is shorter (25s) so we can release the client gracefully
    // before the PostgreSQL statement_timeout (30s) fires.
    const jsTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("JSONB query timed out after 25s")), 25_000)
    );

    const jsonbQuery = client.query(
      `SELECT
        COUNT(*) FILTER (WHERE elem_type = 'transaction') AS trades_created,
        COUNT(*) FILTER (WHERE elem_type = 'wallet') AS accounts_created,
        COUNT(*) FILTER (WHERE elem_type = 'category') AS documents_created
      FROM (
        SELECT 'transaction' AS elem_type
        FROM states s, jsonb_array_elements(COALESCE(s.state_json->'transactions', '[]'::jsonb)) AS elem
        WHERE s.state_json IS NOT NULL
          AND (elem->>'createdAt')::bigint BETWEEN $1 AND $2
          AND (elem->>'deletedAt') IS NULL
        UNION ALL
        SELECT 'account' AS elem_type
        FROM states s, jsonb_array_elements(COALESCE(s.state_json->'wallets', '[]'::jsonb)) AS elem
        WHERE s.state_json IS NOT NULL
          AND (elem->>'createdAt')::bigint BETWEEN $1 AND $2
          AND (elem->>'deletedAt') IS NULL
          AND (elem->>'archivedAt') IS NULL
        UNION ALL
        SELECT 'category' AS elem_type
        FROM states s, jsonb_array_elements(COALESCE(s.state_json->'categories', '[]'::jsonb)) AS elem
        WHERE s.state_json IS NOT NULL
          AND (elem->>'createdAt')::bigint BETWEEN $1 AND $2
          AND (elem->>'deletedAt') IS NULL
      ) combined`,
      [fromMs, toMs]
    );

    const jsonbResult = await Promise.race([jsonbQuery, jsTimeout]);
    const row = jsonbResult.rows?.[0] || {};
    transactionsCreated = parseInt(row.trades_created || 0);
    walletsCreated = parseInt(row.accounts_created || 0);
    categoriesCreated = parseInt(row.documents_created || 0);
  } catch (err) {
    console.error("[admin] getDashboardSummary JSONB query error:", err?.message || err);
    // Return null to signal frontend to show "—" instead of misleading "0"
    transactionsCreated = null;
    walletsCreated = null;
    categoriesCreated = null;
  } finally {
    await client.query("SET statement_timeout = '10s'").catch(() => {});
    client.release();
  }

  const result = {
    range: { from: fromDate, to: toDate },
    metrics: {
      transactionsCreated,
      walletsCreated,
      activeUsers,
      categoriesCreated,
    },
  };

  // Store in cache
  _summaryCache.set(cacheKey, { data: result, ts: Date.now() });
  // Evict stale entries
  if (_summaryCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of _summaryCache) {
      if (now - v.ts > SUMMARY_CACHE_TTL) _summaryCache.delete(k);
    }
  }

  return result;
}

// Top users by transactions and wallets — reads from pre-computed cache, no JSONB scan
export async function getTopUsers(limit = 10) {
  const pool = getPool();
  if (!pool) return null;

  const r = await pool.query(`
    SELECT
      u.id,
      u.username,
      u.nickname,
      u.role,
      u.role_color,
      u.created_at,
      COALESCE(sc.transactions_count,    0) AS transactions_count,
      COALESCE(sc.wallets_count,  0) AS wallets_count,
      COALESCE(sc.categories_count, 0) AS categories_count,
      ls.last_seen_at
    FROM users u
    LEFT JOIN user_stats_cache sc ON sc.user_id = u.id
    LEFT JOIN (
      SELECT user_id, MAX(last_seen_at) AS last_seen_at
      FROM sessions
      WHERE revoked = false
      GROUP BY user_id
    ) ls ON ls.user_id = u.id
    ORDER BY COALESCE(sc.transactions_count, 0) DESC, COALESCE(sc.wallets_count, 0) DESC
    LIMIT $1
  `, [limit]);

  return r.rows || [];
}
