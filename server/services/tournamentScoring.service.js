import { getPool } from "./db.service.js";

// ---------------------------------------------------------------------------
// Simple points-based leaderboard
// ---------------------------------------------------------------------------

export async function getLeaderboard(tournamentId, opts = {}) {
  const pool = getPool();
  if (!pool) return [];

  const includeHidden = opts.includeHidden || false;
  const statusFilter = includeHidden ? "" : "AND p.status = 'active'";

  const res = await pool.query(
    `SELECT p.id, p.display_name, p.username, p.role, p.avatar_url, p.status,
            p.total_points, p.bonus_points, p.penalty_points, p.manual_rank, p.notes,
            p.updated_at,
            (SELECT MAX(l.created_at) FROM tournament_points_log l WHERE l.participant_id = p.id) AS last_points_update
     FROM tournament_participants p
     WHERE p.tournament_id = $1 ${statusFilter}
     ORDER BY 
       CASE WHEN p.manual_rank IS NOT NULL THEN 0 ELSE 1 END,
       p.manual_rank ASC NULLS LAST,
       p.total_points DESC,
       p.updated_at ASC,
       p.display_name ASC`,
    [tournamentId]
  );

  // Assign computed rank
  const rows = res.rows.map((row, idx) => ({
    ...row,
    rank: row.manual_rank || (idx + 1),
  }));

  return rows;
}

export async function getPublicViewModel(tournamentId) {
  const pool = getPool();
  if (!pool) return null;

  const tRes = await pool.query(
    `SELECT id, name, slug, description, rules_text, banner_image_url, timezone,
            start_date, end_date, status, theme_config, visibility_config
     FROM tournaments WHERE id = $1`,
    [tournamentId]
  );
  const tournament = tRes.rows[0];
  if (!tournament) return null;

  const leaderboard = await getLeaderboard(tournamentId, { includeHidden: false });

  // Recent changes (last 20 point updates)
  const recentRes = await pool.query(
    `SELECT l.id, l.participant_id, l.points_delta, l.reason, l.created_at,
            p.display_name AS participant_name
     FROM tournament_points_log l
     JOIN tournament_participants p ON p.id = l.participant_id
     WHERE l.tournament_id = $1
     ORDER BY l.created_at DESC
     LIMIT 20`,
    [tournamentId]
  );

  return {
    tournament,
    leaderboard,
    recentChanges: recentRes.rows,
  };
}

export async function getParticipantStats(tournamentId, participantId) {
  const pool = getPool();
  if (!pool) return null;

  const pRes = await pool.query(
    "SELECT * FROM tournament_participants WHERE id = $1 AND tournament_id = $2",
    [participantId, tournamentId]
  );
  if (!pRes.rows[0]) return null;

  const historyRes = await pool.query(
    `SELECT l.*, u.nickname AS admin_name
     FROM tournament_points_log l
     LEFT JOIN users u ON u.id = l.created_by
     WHERE l.participant_id = $1 AND l.tournament_id = $2
     ORDER BY l.created_at DESC`,
    [participantId, tournamentId]
  );

  return {
    participant: pRes.rows[0],
    history: historyRes.rows,
    totalEntries: historyRes.rows.length,
  };
}
