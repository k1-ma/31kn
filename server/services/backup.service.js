import zlib from "node:zlib";

// Default number of backups to keep
const DEFAULT_BACKUP_KEEP = 10;

/**
 * Get the number of backups to keep from environment or default
 */
function getBackupKeepCount() {
  const envVal = process.env.ADMIN_BACKUP_KEEP;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_BACKUP_KEEP;
}

/**
 * Generate a backup name based on current timestamp
 * Format: tradecrm_backup_2026-01-27T12-30-45Z.json.gz
 */
export function generateBackupName() {
  const now = new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
  return `tradecrm_backup_${now}.json.gz`;
}

/**
 * Collect all data from database tables into a JSON payload
 * @param {import("pg").Pool} pool - Database pool
 * @returns {Promise<object>} Backup payload object
 */
export async function generateBackupPayload(pool) {
  const payload = {
    meta: {
      version: 1,
      created_at: new Date().toISOString(),
      app: "tradecrm",
      db: "postgres",
    },
    tables: {},
  };

  // List of tables to backup with their ORDER BY clause for consistency
  // SECURITY: These table names are hardcoded constants, not user input.
  // This is safe because we control the table names list entirely.
  const tables = [
    { name: "users", orderBy: "id" },
    { name: "states", orderBy: "user_id" },
    { name: "sessions", orderBy: "sid" },
    { name: "admin_logs", orderBy: "id" },
    { name: "ip_bans", orderBy: "id" },
    { name: "usage_daily", orderBy: "day, user_id, ip" },
    { name: "rate_limits", orderBy: "key, action, window_start" },
    { name: "ideas", orderBy: "id" },
    { name: "trading_ideas", orderBy: "id" },
    { name: "public_shares", orderBy: "created_at" },
    { name: "admin_backups", orderBy: "created_at" },
  ];

  // Defense in depth: even though `tables` is a hardcoded literal above, run
  // each entry through identifier-shape regexes before interpolating into
  // SQL. If a future change ever pulls names from another source, this turns
  // a potential injection into a "skip + warn" instead.
  const SAFE_IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
  const SAFE_ORDER_RE = /^[a-z_][a-z0-9_]*(\s*,\s*[a-z_][a-z0-9_]*)*$/i;

  for (const { name, orderBy } of tables) {
    if (!SAFE_IDENT_RE.test(name) || !SAFE_ORDER_RE.test(orderBy)) {
      // eslint-disable-next-line no-console
      console.warn(`[backup] Refusing unsafe identifier in backup config: ${name}/${orderBy}`);
      payload.tables[name] = [];
      continue;
    }
    try {
      const result = await pool.query(`SELECT * FROM ${name} ORDER BY ${orderBy}`);
      payload.tables[name] = result.rows || [];
    } catch (err) {
      // Table might not exist yet, store empty array
      // eslint-disable-next-line no-console
      console.warn(`[backup] Could not backup table ${name}`);
      payload.tables[name] = [];
    }
  }

  return payload;
}

/**
 * Compress a JSON payload using gzip
 * @param {object} payload - Object to compress
 * @returns {Buffer} Gzipped buffer
 */
export function gzipJson(payload) {
  const json = JSON.stringify(payload);
  return zlib.gzipSync(Buffer.from(json, "utf-8"), { level: 9 });
}

/**
 * Create a backup record in the database and perform auto-cleanup of old backups
 * @param {object} params
 * @param {import("pg").Pool} params.pool - Database pool
 * @param {string} params.name - Backup name/filename
 * @param {Buffer} params.gzBuffer - Gzipped backup content
 */
export async function createBackupInDb({ pool, name, gzBuffer }) {
  const sizeBytes = gzBuffer.length;

  // Insert the backup
  await pool.query(
    `INSERT INTO admin_backups (name, size_bytes, content, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (name) DO UPDATE SET size_bytes = EXCLUDED.size_bytes, content = EXCLUDED.content, created_at = now()`,
    [name, sizeBytes, gzBuffer]
  );

  // Auto-cleanup: keep only the N most recent backups
  const keepCount = getBackupKeepCount();
  await pool.query(
    `DELETE FROM admin_backups
     WHERE name NOT IN (
       SELECT name FROM admin_backups ORDER BY created_at DESC LIMIT $1
     )`,
    [keepCount]
  );

  return { name, size_bytes: sizeBytes };
}

/**
 * List all backups (metadata only, without content)
 * @param {import("pg").Pool} pool - Database pool
 * @returns {Promise<Array<{name: string, created_at: string, size_bytes: number, format: string}>>}
 */
export async function listBackups(pool) {
  const result = await pool.query(
    `SELECT name, created_at, size_bytes, format
     FROM admin_backups
     ORDER BY created_at DESC`
  );
  return result.rows || [];
}

/**
 * Get a backup by name including content
 * @param {import("pg").Pool} pool - Database pool
 * @param {string} name - Backup name
 * @returns {Promise<{name: string, created_at: string, size_bytes: number, format: string, content: Buffer} | null>}
 */
export async function getBackupContent(pool, name) {
  const result = await pool.query(
    `SELECT name, created_at, size_bytes, format, content
     FROM admin_backups
     WHERE name = $1`,
    [name]
  );
  return result.rows?.[0] || null;
}
