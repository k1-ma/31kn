import bcrypt from "bcryptjs";
import { getPool } from "./db.service.js";

// Hash a tournament vote password before storing in DB.
// Empty/nullish input is preserved as null (no password required).
// Already-hashed values (bcrypt prefix) pass through unchanged so that
// updates preserving the existing hash don't double-hash.
export function hashVotePassword(input) {
  if (input === null || input === undefined) return null;
  const s = String(input);
  if (!s) return null;
  if (/^\$2[aby]\$/.test(s)) return s;
  return bcrypt.hashSync(s, 10);
}

// Compare a submitted plain-text vote password against the stored value.
// Supports both the new bcrypt-hashed format and legacy plaintext rows
// so existing tournaments keep working until they're updated.
export function verifyVotePassword(stored, submitted) {
  if (typeof stored !== "string" || typeof submitted !== "string") return false;
  if (!stored) return false;
  if (/^\$2[aby]\$/.test(stored)) {
    try { return bcrypt.compareSync(submitted, stored); } catch { return false; }
  }
  // Legacy plaintext fallback (constant-time on equal-length buffers).
  if (stored.length !== submitted.length) return false;
  let diff = 0;
  for (let i = 0; i < stored.length; i++) {
    diff |= stored.charCodeAt(i) ^ submitted.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function generateSlug(name) {
  const base = String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : suffix;
}

// ---------------------------------------------------------------------------
// Tournament CRUD
// ---------------------------------------------------------------------------

export async function listTournaments(filters = {}) {
  const pool = getPool();
  if (!pool) return { tournaments: [], total: 0 };

  const safeLimit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const safeOffset = Math.max(0, Number(filters.offset) || 0);

  let whereClause = "";
  const params = [safeLimit, safeOffset];
  let paramIdx = 3;

  const conditions = [];
  if (filters.status) {
    conditions.push(`t.status = $${paramIdx++}`);
    params.push(filters.status);
  }
  if (filters.search) {
    conditions.push(`(t.name ILIKE $${paramIdx} OR t.slug ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }
  if (conditions.length) whereClause = "WHERE " + conditions.join(" AND ");

  const countRes = await pool.query(
    `SELECT COUNT(*) FROM tournaments t ${whereClause}`,
    params.slice(2)
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const res = await pool.query(
    `SELECT t.* FROM tournaments t ${whereClause}
     ORDER BY t.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  return { tournaments: res.rows, total };
}

export async function getTournament(id) {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query("SELECT * FROM tournaments WHERE id = $1", [id]);
  return res.rows[0] || null;
}

export async function getTournamentBySlug(slug) {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query("SELECT * FROM tournaments WHERE slug = $1", [slug]);
  return res.rows[0] || null;
}

export async function createTournament(data, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const slug = generateSlug(data.name || "tournament");
  const res = await pool.query(
    `INSERT INTO tournaments
       (name, slug, description, rules_text, start_date, end_date, status, scoring_config, timezone, vote_password, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      data.name,
      slug,
      data.description || null,
      data.rules_text || null,
      data.start_date || null,
      data.end_date || null,
      data.status || "draft",
      JSON.stringify(data.scoring_config || {}),
      data.timezone || "Europe/Kyiv",
      hashVotePassword(data.vote_password),
      adminId || null,
    ]
  );
  return res.rows[0];
}

export async function updateTournament(id, data, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const allowedFields = [
    "name", "description", "rules_text", "banner_image_url", "timezone",
    "start_date", "end_date", "status", "scoring_config",
    "visibility_config", "theme_config", "vote_password",
  ];

  const sets = [];
  const params = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${idx++}`);
      let val;
      if (["scoring_config", "visibility_config", "theme_config"].includes(field)) {
        val = JSON.stringify(data[field]);
      } else if (field === "vote_password") {
        val = hashVotePassword(data[field]);
      } else {
        val = data[field];
      }
      params.push(val);
    }
  }

  if (!sets.length) return { error: "No valid fields to update" };

  sets.push(`updated_by = $${idx++}`);
  params.push(adminId || null);
  sets.push(`updated_at = now()`);
  params.push(id);

  const res = await pool.query(
    `UPDATE tournaments SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

export async function deleteTournament(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };
  await pool.query("DELETE FROM tournaments WHERE id = $1", [id]);
  return { success: true };
}

export async function duplicateTournament(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const orig = await getTournament(id);
  if (!orig) return { error: "Tournament not found" };

  const newSlug = generateSlug(orig.name);
  const res = await pool.query(
    `INSERT INTO tournaments
       (name, slug, description, rules_text, banner_image_url, timezone,
        start_date, end_date, status, scoring_config, visibility_config, theme_config, vote_password, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      `${orig.name} (copy)`,
      newSlug,
      orig.description,
      orig.rules_text,
      orig.banner_image_url,
      orig.timezone,
      orig.start_date,
      orig.end_date,
      JSON.stringify(orig.scoring_config || {}),
      JSON.stringify(orig.visibility_config || {}),
      JSON.stringify(orig.theme_config || {}),
      orig.vote_password || null,
      adminId || null,
    ]
  );
  return res.rows[0];
}

export async function archiveTournament(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };
  const res = await pool.query(
    `UPDATE tournaments SET status = 'archived', archived_at = now(), updated_by = $2, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, adminId || null]
  );
  return res.rows[0] || null;
}

export async function unarchiveTournament(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };
  const res = await pool.query(
    `UPDATE tournaments SET status = 'draft', archived_at = NULL, updated_by = $2, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, adminId || null]
  );
  return res.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export async function listParticipants(tournamentId, filters = {}) {
  const pool = getPool();
  if (!pool) return [];

  const conditions = ["p.tournament_id = $1"];
  const params = [tournamentId];
  let idx = 2;

  if (filters.role) {
    conditions.push(`p.role = $${idx++}`);
    params.push(filters.role);
  }
  if (filters.status) {
    conditions.push(`p.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.search) {
    conditions.push(`(p.display_name ILIKE $${idx} OR p.username ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const res = await pool.query(
    `SELECT p.* FROM tournament_participants p
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.total_points DESC, p.display_name, p.id`,
    params
  );
  return res.rows;
}

export async function getParticipant(participantId) {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    "SELECT * FROM tournament_participants WHERE id = $1",
    [participantId]
  );
  return res.rows[0] || null;
}

export async function createParticipant(tournamentId, data, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const res = await pool.query(
    `INSERT INTO tournament_participants
       (tournament_id, display_name, username, role, total_points, status, notes, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      tournamentId,
      data.display_name,
      data.username || null,
      data.role || "participant",
      0,
      data.status || "active",
      data.notes || null,
      JSON.stringify(data.meta || {}),
    ]
  );
  return res.rows[0];
}

export async function updateParticipant(tournamentId, participantId, data, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const allowedFields = ["display_name", "username", "role", "status", "manual_rank", "notes"];
  const sets = [];
  const params = [];
  let idx = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${idx++}`);
      params.push(data[field]);
    }
  }
  if (!sets.length) return { error: "No valid fields to update" };

  sets.push(`updated_at = now()`);
  params.push(participantId);

  const res = await pool.query(
    `UPDATE tournament_participants SET ${sets.join(", ")}
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

export async function deleteParticipant(tournamentId, participantId, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };
  await pool.query(
    "DELETE FROM tournament_participants WHERE id = $1 AND tournament_id = $2",
    [participantId, tournamentId]
  );
  return { success: true };
}

export async function bulkCreateParticipants(tournamentId, participants, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const client = await pool.connect();
  const created = [];
  try {
    await client.query("BEGIN");
    for (const p of participants) {
      const res = await client.query(
        `INSERT INTO tournament_participants
           (tournament_id, display_name, username, role, total_points, status, notes, meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          tournamentId,
          p.display_name,
          p.username || null,
          p.role || "participant",
          0,
          p.status || "active",
          p.notes || null,
          JSON.stringify(p.meta || {}),
        ]
      );
      created.push(res.rows[0]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return created;
}

// ---------------------------------------------------------------------------
// Points Management
// ---------------------------------------------------------------------------

export async function addPoints(tournamentId, participantId, pointsDelta, reason, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const logRes = await client.query(
      `INSERT INTO tournament_points_log (tournament_id, participant_id, points_delta, reason, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tournamentId, participantId, pointsDelta, reason || null, adminId || null]
    );

    // Incremental update: add delta directly instead of recalculating from log
    const pRes = await client.query(
      `UPDATE tournament_participants 
       SET total_points = total_points + $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [pointsDelta, participantId]
    );

    await client.query("COMMIT");
    return { log: logRes.rows[0], participant: pRes.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function bulkAddPoints(tournamentId, entries, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const client = await pool.connect();
  const results = [];
  try {
    await client.query("BEGIN");

    for (const entry of entries) {
      await client.query(
        `INSERT INTO tournament_points_log (tournament_id, participant_id, points_delta, reason, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [tournamentId, entry.participant_id, entry.points_delta, entry.reason || null, adminId || null]
      );

      // Incremental update: add delta directly
      const pRes = await client.query(
        `UPDATE tournament_participants 
         SET total_points = total_points + $1, updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [entry.points_delta, entry.participant_id]
      );
      results.push(pRes.rows[0]);
    }

    await client.query("COMMIT");
    return { participants: results };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setPoints(tournamentId, participantId, totalPoints, reason, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query(
      "SELECT total_points FROM tournament_participants WHERE id = $1 AND tournament_id = $2",
      [participantId, tournamentId]
    );
    if (!currentRes.rows[0]) {
      await client.query("ROLLBACK");
      return { error: "Participant not found" };
    }

    const currentTotal = Number(currentRes.rows[0].total_points) || 0;
    const delta = totalPoints - currentTotal;

    await client.query(
      `INSERT INTO tournament_points_log (tournament_id, participant_id, points_delta, reason, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [tournamentId, participantId, delta, reason || `Set points to ${totalPoints}`, adminId || null]
    );

    await client.query(
      `UPDATE tournament_participants SET total_points = $1, updated_at = now() WHERE id = $2`,
      [totalPoints, participantId]
    );

    const pRes = await client.query(
      "SELECT * FROM tournament_participants WHERE id = $1",
      [participantId]
    );

    await client.query("COMMIT");
    return { participant: pRes.rows[0] };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getPointsHistory(tournamentId, opts = {}) {
  const pool = getPool();
  if (!pool) return { logs: [], total: 0 };

  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);

  const countRes = await pool.query(
    "SELECT COUNT(*) FROM tournament_points_log WHERE tournament_id = $1",
    [tournamentId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const res = await pool.query(
    `SELECT l.*, p.display_name AS participant_name, p.username AS participant_username,
            u.nickname AS admin_name
     FROM tournament_points_log l
     JOIN tournament_participants p ON p.id = l.participant_id
     LEFT JOIN users u ON u.id = l.created_by
     WHERE l.tournament_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2 OFFSET $3`,
    [tournamentId, limit, offset]
  );
  return { logs: res.rows, total };
}

export async function getParticipantPointsHistory(tournamentId, participantId, opts = {}) {
  const pool = getPool();
  if (!pool) return { logs: [], total: 0 };

  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);

  const countRes = await pool.query(
    "SELECT COUNT(*) FROM tournament_points_log WHERE tournament_id = $1 AND participant_id = $2",
    [tournamentId, participantId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const res = await pool.query(
    `SELECT l.*, u.nickname AS admin_name
     FROM tournament_points_log l
     LEFT JOIN users u ON u.id = l.created_by
     WHERE l.tournament_id = $1 AND l.participant_id = $2
     ORDER BY l.created_at DESC
     LIMIT $3 OFFSET $4`,
    [tournamentId, participantId, limit, offset]
  );
  return { logs: res.rows, total };
}

export async function deletePointsLog(logId, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const logRes = await client.query(
      "SELECT * FROM tournament_points_log WHERE id = $1",
      [logId]
    );
    if (!logRes.rows[0]) {
      await client.query("ROLLBACK");
      return { error: "Log entry not found" };
    }
    const logEntry = logRes.rows[0];

    await client.query("DELETE FROM tournament_points_log WHERE id = $1", [logId]);

    await client.query(
      `UPDATE tournament_participants 
       SET total_points = COALESCE((
         SELECT SUM(points_delta) FROM tournament_points_log WHERE participant_id = $1
       ), 0), updated_at = now()
       WHERE id = $1`,
      [logEntry.participant_id]
    );

    const pRes = await client.query(
      "SELECT * FROM tournament_participants WHERE id = $1",
      [logEntry.participant_id]
    );

    await client.query("COMMIT");
    return { participant: pRes.rows[0], deletedLog: logEntry };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getLeaderboard(tournamentId) {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query(
    `SELECT p.id, p.display_name, p.username, p.role, p.avatar_url, p.status,
            p.total_points, p.bonus_points, p.penalty_points, p.manual_rank, p.notes,
            p.updated_at,
            (SELECT MAX(l.created_at) FROM tournament_points_log l WHERE l.participant_id = p.id) AS last_points_update
     FROM tournament_participants p
     WHERE p.tournament_id = $1 AND p.status != 'hidden'
     ORDER BY 
       CASE WHEN p.manual_rank IS NOT NULL THEN 0 ELSE 1 END,
       p.manual_rank ASC NULLS LAST,
       p.total_points DESC,
       p.updated_at ASC,
       p.display_name ASC`,
    [tournamentId]
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// Public Links
// ---------------------------------------------------------------------------

export async function getPublicLink(tournamentId) {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    "SELECT * FROM tournament_public_links WHERE tournament_id = $1",
    [tournamentId]
  );
  return res.rows[0] || null;
}

export async function createPublicLink(tournamentId, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const publicSlug = generateSlug("pub");
  const res = await pool.query(
    `INSERT INTO tournament_public_links
       (tournament_id, public_slug, is_enabled, public_config)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [tournamentId, publicSlug, false, JSON.stringify({})]
  );
  return res.rows[0];
}

export async function updatePublicLink(tournamentId, data, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const sets = [];
  const params = [];
  let idx = 1;

  if (data.is_enabled !== undefined) {
    sets.push(`is_enabled = $${idx++}`);
    params.push(data.is_enabled);
  }
  if (data.public_config !== undefined) {
    sets.push(`public_config = $${idx++}`);
    params.push(JSON.stringify(data.public_config));
  }
  if (!sets.length) return { error: "No valid fields to update" };

  sets.push(`updated_at = now()`);
  params.push(tournamentId);

  const res = await pool.query(
    `UPDATE tournament_public_links SET ${sets.join(", ")}
     WHERE tournament_id = $${idx}
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

export async function regeneratePublicSlug(tournamentId, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const newSlug = generateSlug("pub");
  const res = await pool.query(
    `UPDATE tournament_public_links SET public_slug = $1, updated_at = now()
     WHERE tournament_id = $2
     RETURNING *`,
    [newSlug, tournamentId]
  );
  return res.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export async function logTournamentAudit(
  tournamentId, entityType, entityId, action, beforeData, afterData, adminId
) {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query(
    `INSERT INTO tournament_audit_log
       (tournament_id, entity_type, entity_id, action, before_data, after_data, actor_admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      tournamentId,
      entityType,
      entityId || null,
      action,
      beforeData ? JSON.stringify(beforeData) : null,
      afterData ? JSON.stringify(afterData) : null,
      adminId || null,
    ]
  );
  return res.rows[0];
}

export async function getAuditLog(tournamentId, opts = {}) {
  const pool = getPool();
  if (!pool) return [];

  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);

  const res = await pool.query(
    `SELECT * FROM tournament_audit_log
     WHERE tournament_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [tournamentId, limit, offset]
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// Public view
// ---------------------------------------------------------------------------

export async function getPublicTournamentBySlug(publicSlug) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT * FROM tournament_public_links WHERE public_slug = $1 AND is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  const tRes = await pool.query(
    `SELECT id, name, slug, description, rules_text, banner_image_url, timezone,
            start_date, end_date, status, scoring_config, visibility_config, theme_config
     FROM tournaments WHERE id = $1`,
    [link.tournament_id]
  );
  const tournament = tRes.rows[0];
  if (!tournament) return null;

  const participantsRes = await pool.query(
    `SELECT id, tournament_id, display_name, username, role, avatar_url, status,
            total_points, bonus_points, penalty_points, manual_rank, notes, updated_at
     FROM tournament_participants WHERE tournament_id = $1 AND status != 'hidden'
     ORDER BY
       CASE WHEN manual_rank IS NOT NULL THEN 0 ELSE 1 END,
       manual_rank ASC NULLS LAST,
       total_points DESC,
       display_name ASC`,
    [tournament.id]
  );

  const recentChangesRes = await pool.query(
    `SELECT l.*, p.display_name AS participant_name
     FROM tournament_points_log l
     JOIN tournament_participants p ON p.id = l.participant_id
     WHERE l.tournament_id = $1
     ORDER BY l.created_at DESC
     LIMIT 20`,
    [tournament.id]
  );

  return {
    tournament,
    participants: participantsRes.rows,
    recentChanges: recentChangesRes.rows,
    publicConfig: link.public_config,
  };
}

// ---------------------------------------------------------------------------
// Displayed tournament (user-facing leaderboard in LIBRARY)
// ---------------------------------------------------------------------------

export async function setDisplayedTournament(id, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const check = await pool.query("SELECT id FROM tournaments WHERE id = $1", [id]);
  if (!check.rows.length) return { error: "Tournament not found" };

  // Atomic single-statement update: at most one tournament can be is_displayed.
  // Avoids the race where two concurrent admins both pass the clear+set
  // sequence and end up with two displayed tournaments.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE tournaments SET is_displayed = false WHERE is_displayed = true AND id <> $1", [id]);
    await client.query(
      "UPDATE tournaments SET is_displayed = true, updated_by = $2 WHERE id = $1",
      [id, adminId || null]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return { error: e?.message || "Failed to set displayed tournament" };
  } finally {
    client.release();
  }

  return { ok: true };
}

export async function clearDisplayedTournament() {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  await pool.query("UPDATE tournaments SET is_displayed = false WHERE is_displayed = true");
  return { ok: true };
}

export async function getDisplayedTournament() {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query("SELECT * FROM tournaments WHERE is_displayed = true LIMIT 1");
  const tournament = res.rows[0];
  if (!tournament) return null;

  // Fetch public slug for the tournament (if exists)
  const linkRes = await pool.query(
    "SELECT public_slug FROM tournament_public_links WHERE tournament_id = $1 AND is_enabled = true LIMIT 1",
    [tournament.id]
  );
  const publicSlug = linkRes.rows[0]?.public_slug || null;

  // Fetch leaderboard with vote stats (participants sorted by total points)
  const participantsRes = await pool.query(
    `SELECT p.id, p.display_name AS nickname, p.avatar_url, p.total_points, p.status,
            COALESCE(stats.total_correct, 0)::int AS total_correct,
            COALESCE(stats.total_voted_assets, 0)::int AS total_voted_assets
     FROM tournament_participants p
     LEFT JOIN (
       SELECT tournament_id, normalized_nickname,
              SUM(correct_count) AS total_correct,
              SUM(total_assets) AS total_voted_assets
       FROM tournament_day_scores
       WHERE tournament_id = $1
       GROUP BY tournament_id, normalized_nickname
     ) stats ON stats.tournament_id = $1
            AND stats.normalized_nickname = LOWER(TRIM(p.display_name))
     WHERE p.tournament_id = $1 AND p.status != 'disqualified'
     ORDER BY p.total_points DESC, p.display_name ASC`,
    [tournament.id]
  );

  return {
    tournament: { ...tournament, public_slug: publicSlug },
    leaderboard: participantsRes.rows,
  };
}
