import { getPool } from "./db.service.js";

export async function logAdmin(adminUserId, action, targetUserId = null, meta = null) {
  try {
    const pool = getPool();
    if (!pool) return;
    await pool.query(
      "INSERT INTO admin_logs (admin_user_id, action, target_user_id, meta_json) VALUES ($1,$2,$3,$4)",
      [adminUserId ?? null, String(action), targetUserId ?? null, meta ? JSON.stringify(meta) : null]
    );
  } catch {
    // ignore
  }
}

export async function getAdminLogs(limit = 50, offset = 0, filters = {}) {
  const pool = getPool();
  if (!pool) return { logs: [], total: 0 };
  
  const safeLimit = Math.min(200, Math.max(1, Number(limit)));
  const safeOffset = Math.max(0, Number(offset));

  let whereClause = "";
  const params = [safeLimit, safeOffset];
  let paramIdx = 3;

  if (filters.action) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += `l.action ILIKE $${paramIdx}`;
    params.push(`%${filters.action}%`);
    paramIdx++;
  }

  if (filters.adminUsername) {
    whereClause += whereClause ? " AND " : " WHERE ";
    whereClause += `au.username ILIKE $${paramIdx}`;
    params.push(`%${filters.adminUsername}%`);
    paramIdx++;
  }

  const sql = `
    SELECT l.id, l.action, l.created_at,
           l.meta_json,
           au.username AS admin_username,
           tu.username AS target_username,
           tu.nickname AS target_nickname
    FROM admin_logs l
    LEFT JOIN users au ON au.id = l.admin_user_id
    LEFT JOIN users tu ON tu.id = l.target_user_id
    ${whereClause}
    ORDER BY l.id DESC
    LIMIT $1 OFFSET $2
  `;

  const r = await pool.query(sql, params);
  const logs = (r.rows || []).map((x) => ({
    id: x.id,
    action: x.action,
    created_at: x.created_at,
    admin_username: x.admin_username,
    target_username: x.target_username,
    target_nickname: x.target_nickname,
    meta: x.meta_json ?? null,
  }));

  return { logs, limit: safeLimit, offset: safeOffset };
}
