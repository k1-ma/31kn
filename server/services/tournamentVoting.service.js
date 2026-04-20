import crypto from "node:crypto";
import { getPool } from "./db.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeNickname(str) {
  return String(str).trim().toLowerCase().replace(/\s+/g, " ");
}

function generateVoteToken() {
  return crypto.randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// Timed voting: auto-transition vote day statuses based on scheduled times
// ---------------------------------------------------------------------------

/**
 * Process timed vote days for a specific tournament.
 * - upcoming + voting_open_at <= NOW() → open
 * - open + voting_close_at IS NOT NULL AND voting_close_at <= NOW() → closed
 */
export async function processTimedVoteDays(tournamentId) {
  const pool = getPool();
  if (!pool) return;

  // Auto-open: upcoming days whose open time has arrived
  await pool.query(
    `UPDATE tournament_vote_days
     SET status = 'open', updated_at = now()
     WHERE tournament_id = $1
       AND status = 'upcoming'
       AND voting_open_at IS NOT NULL
       AND voting_open_at <= now()`,
    [tournamentId]
  );

  // Auto-close: open days whose close time has arrived
  await pool.query(
    `UPDATE tournament_vote_days
     SET status = 'closed', updated_at = now()
     WHERE tournament_id = $1
       AND status = 'open'
       AND voting_close_at IS NOT NULL
       AND voting_close_at <= now()`,
    [tournamentId]
  );
}

/**
 * Process timed vote days across ALL tournaments (for background job).
 */
export async function processAllTimedVoteDays() {
  const pool = getPool();
  if (!pool) return;

  // Auto-open
  await pool.query(
    `UPDATE tournament_vote_days
     SET status = 'open', updated_at = now()
     WHERE status = 'upcoming'
       AND voting_open_at IS NOT NULL
       AND voting_open_at <= now()`
  );

  // Auto-close
  await pool.query(
    `UPDATE tournament_vote_days
     SET status = 'closed', updated_at = now()
     WHERE status = 'open'
       AND voting_close_at IS NOT NULL
       AND voting_close_at <= now()`
  );
}

async function rebuildLeaderboardCache(client, tournamentId) {
  await client.query("DELETE FROM tournament_leaderboard_cache WHERE tournament_id = $1", [tournamentId]);
  await client.query(
    `INSERT INTO tournament_leaderboard_cache
       (tournament_id, normalized_nickname, nickname_snapshot, total_points, resolved_days)
     SELECT s.tournament_id, s.normalized_nickname,
            (SELECT ds.nickname_snapshot FROM tournament_day_scores ds
             WHERE ds.tournament_id = s.tournament_id
               AND ds.normalized_nickname = s.normalized_nickname
             ORDER BY ds.vote_day_id DESC LIMIT 1),
            SUM(s.day_points), COUNT(*)
     FROM tournament_day_scores s
     WHERE s.tournament_id = $1
     GROUP BY s.tournament_id, s.normalized_nickname`,
    [tournamentId]
  );
}

// ---------------------------------------------------------------------------
// Vote Day Management (Admin)
// ---------------------------------------------------------------------------

export async function listVoteDays(tournamentId) {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query(
    `SELECT d.*,
            COALESCE(vc.cnt, 0)::int AS vote_count
     FROM tournament_vote_days d
     LEFT JOIN (
       SELECT vote_day_id, COUNT(*) AS cnt
       FROM tournament_votes
       WHERE status = 'valid'
       GROUP BY vote_day_id
     ) vc ON vc.vote_day_id = d.id
     WHERE d.tournament_id = $1
     ORDER BY d.date_key DESC`,
    [tournamentId]
  );
  return res.rows;
}

export async function getVoteDay(dayId) {
  const pool = getPool();
  if (!pool) return null;

  const dayRes = await pool.query(
    "SELECT * FROM tournament_vote_days WHERE id = $1",
    [dayId]
  );
  const day = dayRes.rows[0] || null;
  if (!day) return null;

  const assetsRes = await pool.query(
    `SELECT * FROM tournament_vote_assets
     WHERE vote_day_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [dayId]
  );
  return { ...day, assets: assetsRes.rows };
}

export async function createVoteDay(tournamentId, data, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const res = await pool.query(
    `INSERT INTO tournament_vote_days
       (tournament_id, date_key, title, status, voting_open_at, voting_close_at, vote_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      tournamentId,
      data.date_key,
      data.title || null,
      data.status || "draft",
      data.voting_open_at || null,
      data.voting_close_at || null,
      generateVoteToken(),
    ]
  );

  const created = res.rows[0];

  await pool.query(
    `INSERT INTO tournament_audit_log
       (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
     VALUES ($1,'vote_day',$2,'create',$3,$4)`,
    [tournamentId, created.id, JSON.stringify(created), adminId || null]
  );

  return created;
}

// Quick-create a vote day for today (Kyiv timezone: UTC+2 / UTC+3 for DST)
// Creates the day with status "open", voting window from 9:00 to 10:00 Kyiv time
// and copies all default assets for this tournament
export async function quickCreateToday(tournamentId, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  // Get today's date in Kyiv timezone using Intl.DateTimeFormat for reliability
  const now = new Date();
  const kyivParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // Returns "YYYY-MM-DD" in en-CA locale
  const dateKey = kyivParts; // e.g. "2026-03-01"

  // Check if day already exists for this tournament
  const existCheck = await pool.query(
    "SELECT id FROM tournament_vote_days WHERE tournament_id = $1 AND date_key = $2",
    [tournamentId, dateKey]
  );
  if (existCheck.rows.length > 0) {
    return { error: "Vote day for today already exists" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create the vote day with status 'open' (no time window — admin controls status)
    const dayRes = await client.query(
      `INSERT INTO tournament_vote_days
         (tournament_id, date_key, title, status, vote_token)
       VALUES ($1,$2,$3,'open',$4)
       RETURNING *`,
      [tournamentId, dateKey, dateKey, generateVoteToken()]
    );
    const day = dayRes.rows[0];

    // Copy default assets from tournament_default_assets
    const defaultAssets = await client.query(
      "SELECT * FROM tournament_default_assets WHERE tournament_id = $1 ORDER BY sort_order ASC, id ASC",
      [tournamentId]
    );

    for (const da of defaultAssets.rows) {
      await client.query(
        `INSERT INTO tournament_vote_assets
           (vote_day_id, asset_code, asset_label, icon_url, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [day.id, da.asset_code, da.asset_label, da.icon_url || null, da.sort_order]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO tournament_audit_log
         (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
       VALUES ($1,'vote_day',$2,'quick_create',$3,$4)`,
      [tournamentId, day.id, JSON.stringify(day), adminId || null]
    );

    await client.query("COMMIT");
    return { day, assetsCount: defaultAssets.rows.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Tournament Default Assets (per-tournament configurable defaults)
// ---------------------------------------------------------------------------

export async function listDefaultAssets(tournamentId) {
  const pool = getPool();
  if (!pool) return [];
  const res = await pool.query(
    "SELECT * FROM tournament_default_assets WHERE tournament_id = $1 ORDER BY sort_order ASC, id ASC",
    [tournamentId]
  );
  return res.rows;
}

export async function createDefaultAsset(tournamentId, data) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };
  if (!data.asset_code?.trim()) return { error: "asset_code is required" };
  // Limit icon_url to ~512KB (base64 encoded, ~700KB string for 512KB file)
  if (data.icon_url && data.icon_url.length > 700 * 1024) {
    return { error: "Icon image too large (max 512KB)" };
  }
  const res = await pool.query(
    `INSERT INTO tournament_default_assets
       (tournament_id, asset_code, asset_label, icon_url, sort_order)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [tournamentId, data.asset_code.trim(), data.asset_label || null, data.icon_url || null, data.sort_order || 0]
  );
  return res.rows[0];
}

export async function updateDefaultAsset(assetId, data) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };
  const allowedFields = ["asset_code", "asset_label", "icon_url", "sort_order"];
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
  params.push(assetId);
  const res = await pool.query(
    `UPDATE tournament_default_assets SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

export async function deleteDefaultAsset(assetId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };
  await pool.query("DELETE FROM tournament_default_assets WHERE id = $1", [assetId]);
  return { ok: true };
}

export async function updateVoteDay(dayId, data, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const allowedFields = ["title", "status", "voting_open_at", "voting_close_at"];
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
  params.push(dayId);

  const res = await pool.query(
    `UPDATE tournament_vote_days SET ${sets.join(", ")}
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  const updated = res.rows[0] || null;

  if (updated) {
    await pool.query(
      `INSERT INTO tournament_audit_log
         (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
       VALUES ($1,'vote_day',$2,'update',$3,$4)`,
      [updated.tournament_id, updated.id, JSON.stringify(updated), adminId || null]
    );
  }

  return updated;
}

export async function createVoteAsset(dayId, data) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const res = await pool.query(
    `INSERT INTO tournament_vote_assets
       (vote_day_id, asset_code, asset_label, icon_url, sort_order)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [dayId, data.asset_code, data.asset_label || null, data.icon_url || null, data.sort_order || 0]
  );
  return res.rows[0];
}

export async function updateVoteAsset(assetId, data) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const allowedFields = ["asset_code", "asset_label", "icon_url", "sort_order", "is_active"];
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

  params.push(assetId);

  const res = await pool.query(
    `UPDATE tournament_vote_assets SET ${sets.join(", ")}
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

export async function deleteVoteAsset(assetId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };
  await pool.query("DELETE FROM tournament_vote_assets WHERE id = $1", [assetId]);
  return { success: true };
}

export async function getVotesForDay(dayId, opts = {}) {
  const pool = getPool();
  if (!pool) return [];

  const conditions = ["v.vote_day_id = $1", "v.status = 'valid'"];
  const params = [dayId];
  let idx = 2;

  if (opts.search) {
    conditions.push(`v.nickname ILIKE $${idx}`);
    params.push(`%${opts.search}%`);
    idx++;
  }

  const res = await pool.query(
    `SELECT v.id AS vote_id, v.nickname, v.normalized_nickname, v.submitted_at, v.status,
            v.ip_hash, v.user_agent,
            s.id AS selection_id, s.asset_id, s.selected_option,
            a.asset_code, a.asset_label
     FROM tournament_votes v
     LEFT JOIN tournament_vote_selections s ON s.vote_id = v.id
     LEFT JOIN tournament_vote_assets a ON a.id = s.asset_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY v.submitted_at DESC, a.sort_order ASC`,
    params
  );

  const votesMap = new Map();
  for (const row of res.rows) {
    if (!votesMap.has(row.vote_id)) {
      votesMap.set(row.vote_id, {
        id: row.vote_id,
        nickname: row.nickname,
        normalized_nickname: row.normalized_nickname,
        submitted_at: row.submitted_at,
        status: row.status,
        ip_hash: row.ip_hash,
        user_agent: row.user_agent,
        selections: [],
      });
    }
    if (row.selection_id) {
      votesMap.get(row.vote_id).selections.push({
        id: row.selection_id,
        asset_id: row.asset_id,
        asset_code: row.asset_code,
        asset_label: row.asset_label,
        selected_option: row.selected_option,
      });
    }
  }
  return Array.from(votesMap.values());
}

// ---------------------------------------------------------------------------
// Vote / Day Deletion & Reset (Admin)
// ---------------------------------------------------------------------------

export async function deleteVote(voteId, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const voteRes = await pool.query(
    `SELECT v.*, d.tournament_id, d.status AS day_status
     FROM tournament_votes v
     JOIN tournament_vote_days d ON d.id = v.vote_day_id
     WHERE v.id = $1`,
    [voteId]
  );
  const vote = voteRes.rows[0];
  if (!vote) return { error: "Vote not found" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM tournament_vote_selections WHERE vote_id = $1", [voteId]);
    await client.query("DELETE FROM tournament_votes WHERE id = $1", [voteId]);

    // If day was resolved, recalculate scores for the affected nickname
    if (vote.day_status === "resolved") {
      await client.query(
        "DELETE FROM tournament_day_scores WHERE vote_day_id = $1 AND normalized_nickname = $2",
        [vote.vote_day_id, vote.normalized_nickname]
      );
      // Rebuild leaderboard cache
      await rebuildLeaderboardCache(client, vote.tournament_id);
    }

    await client.query(
      `INSERT INTO tournament_audit_log
         (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
       VALUES ($1,'vote',$2,'delete',$3,$4)`,
      [vote.tournament_id, voteId, JSON.stringify({ nickname: vote.nickname }), adminId || null]
    );

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteVoteDay(dayId, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const dayRes = await pool.query("SELECT * FROM tournament_vote_days WHERE id = $1", [dayId]);
  const day = dayRes.rows[0];
  if (!day) return { error: "Vote day not found" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete in dependency order
    await client.query(
      `DELETE FROM tournament_vote_selections WHERE vote_id IN
         (SELECT id FROM tournament_votes WHERE vote_day_id = $1)`,
      [dayId]
    );
    await client.query("DELETE FROM tournament_votes WHERE vote_day_id = $1", [dayId]);
    await client.query("DELETE FROM tournament_day_scores WHERE vote_day_id = $1", [dayId]);
    await client.query("DELETE FROM tournament_day_results WHERE vote_day_id = $1", [dayId]);
    await client.query("DELETE FROM tournament_vote_assets WHERE vote_day_id = $1", [dayId]);
    await client.query("DELETE FROM tournament_vote_days WHERE id = $1", [dayId]);

    // Rebuild leaderboard cache
    await rebuildLeaderboardCache(client, day.tournament_id);

    await client.query(
      `INSERT INTO tournament_audit_log
         (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
       VALUES ($1,'vote_day',$2,'delete',$3,$4)`,
      [day.tournament_id, dayId, JSON.stringify({ date_key: day.date_key }), adminId || null]
    );

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function invalidateVote(voteId, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const voteRes = await pool.query(
    `SELECT v.*, d.tournament_id, d.status AS day_status
     FROM tournament_votes v
     JOIN tournament_vote_days d ON d.id = v.vote_day_id
     WHERE v.id = $1`,
    [voteId]
  );
  const vote = voteRes.rows[0];
  if (!vote) return { error: "Vote not found" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE tournament_votes SET status = 'invalidated' WHERE id = $1",
      [voteId]
    );

    // If day was resolved, remove scores for this nickname and rebuild cache
    if (vote.day_status === "resolved") {
      await client.query(
        "DELETE FROM tournament_day_scores WHERE vote_day_id = $1 AND normalized_nickname = $2",
        [vote.vote_day_id, vote.normalized_nickname]
      );
      await rebuildLeaderboardCache(client, vote.tournament_id);
    }

    await client.query(
      `INSERT INTO tournament_audit_log
         (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
       VALUES ($1,'vote',$2,'invalidate',$3,$4)`,
      [vote.tournament_id, voteId, JSON.stringify({ nickname: vote.nickname }), adminId || null]
    );

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Change Vote Submitted Time (Admin — special page only)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Day Resolution (Admin)
// ---------------------------------------------------------------------------

export async function resolveDay(dayId, correctOutcomes, adminId, opts = {}) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const pointsMultiplier = Number(opts.pointsMultiplier) > 0 ? Number(opts.pointsMultiplier) : 1;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // a. Upsert correct outcomes into tournament_day_results
    for (const outcome of correctOutcomes) {
      await client.query(
        `INSERT INTO tournament_day_results (vote_day_id, asset_id, correct_option)
         VALUES ($1, $2, $3)
         ON CONFLICT (vote_day_id, asset_id)
         DO UPDATE SET correct_option = $3, updated_at = now()`,
        [dayId, outcome.asset_id, outcome.correct_option]
      );
    }

    // b. Get all valid votes with selections for this day
    const votesRes = await client.query(
      `SELECT v.id AS vote_id, v.nickname, v.normalized_nickname,
              s.asset_id, s.selected_option,
              a.asset_code
       FROM tournament_votes v
       JOIN tournament_vote_selections s ON s.vote_id = v.id
       JOIN tournament_vote_assets a ON a.id = s.asset_id
       WHERE v.vote_day_id = $1 AND v.status = 'valid'
       ORDER BY v.id, a.sort_order`,
      [dayId]
    );

    // Build a map of correct outcomes for quick lookup
    const correctMap = new Map();
    for (const o of correctOutcomes) {
      correctMap.set(String(o.asset_id), o.correct_option);
    }

    // c-d. Group by vote, score each, upsert into tournament_day_scores
    const voteGroups = new Map();
    for (const row of votesRes.rows) {
      if (!voteGroups.has(row.vote_id)) {
        voteGroups.set(row.vote_id, {
          nickname: row.nickname,
          normalized_nickname: row.normalized_nickname,
          selections: [],
        });
      }
      voteGroups.get(row.vote_id).selections.push(row);
    }

    // Get the vote day to find tournament_id
    const dayRes = await client.query(
      "SELECT * FROM tournament_vote_days WHERE id = $1",
      [dayId]
    );
    const day = dayRes.rows[0];
    if (!day) {
      await client.query("ROLLBACK");
      return { error: "Vote day not found" };
    }

    // Read tournament's scoring_config for wrong_guess_penalty
    const tournamentRes = await client.query(
      "SELECT scoring_config FROM tournaments WHERE id = $1",
      [day.tournament_id]
    );
    const scoringConfig = tournamentRes.rows[0]?.scoring_config || {};
    const wrongGuessPenalty = Number(scoringConfig.wrong_guess_penalty) > 0
      ? Number(scoringConfig.wrong_guess_penalty)
      : 0;

    // Delete old scores for this day (supports re-resolve)
    await client.query(
      "DELETE FROM tournament_day_scores WHERE vote_day_id = $1",
      [dayId]
    );

    for (const [, group] of voteGroups) {
      let correctCount = 0;
      let skippedCount = 0;
      const breakdown = [];

      for (const sel of group.selections) {
        const correct = correctMap.get(String(sel.asset_id));
        const isSkipped = sel.selected_option === "skip";
        const isCorrect = !isSkipped && correct !== undefined && (correct === "both" || sel.selected_option === correct);
        if (isCorrect) correctCount++;
        if (isSkipped) skippedCount++;
        breakdown.push({
          asset_id: sel.asset_id,
          asset_code: sel.asset_code,
          selected_option: sel.selected_option,
          correct_option: correct || null,
          is_correct: isCorrect,
          is_skipped: isSkipped,
        });
      }

      const totalAssets = group.selections.length;
      const incorrectCount = totalAssets - correctCount - skippedCount;
      const dayPoints = Math.round((correctCount * pointsMultiplier - incorrectCount * wrongGuessPenalty) * 100) / 100;

      await client.query(
        `INSERT INTO tournament_day_scores
           (vote_day_id, tournament_id, normalized_nickname, nickname_snapshot,
            correct_count, total_assets, day_points, breakdown)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          dayId,
          day.tournament_id,
          group.normalized_nickname,
          group.nickname,
          correctCount,
          totalAssets,
          dayPoints,
          JSON.stringify(breakdown),
        ]
      );
    }

    // e. Update vote day status to resolved
    await client.query(
      `UPDATE tournament_vote_days
       SET status = 'resolved', resolution_locked_at = now(), updated_at = now()
       WHERE id = $1`,
      [dayId]
    );

    // f. Rebuild leaderboard cache for this tournament
    await rebuildLeaderboardCache(client, day.tournament_id);

    // f2. Sync prediction points to tournament_participants for auto-enrolled voters
    await client.query(
      `UPDATE tournament_participants tp
       SET total_points = lc.total_points
       FROM tournament_leaderboard_cache lc
       WHERE tp.tournament_id = $1
         AND lc.tournament_id = $1
         AND LOWER(TRIM(tp.display_name)) = lc.normalized_nickname
         AND tp.role = 'participant'`,
      [day.tournament_id]
    );

    // g. Audit log
    await client.query(
      `INSERT INTO tournament_audit_log
         (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
       VALUES ($1,'vote_day',$2,'resolve',$3,$4)`,
      [
        day.tournament_id,
        dayId,
        JSON.stringify({ correct_outcomes: correctOutcomes, points_multiplier: pointsMultiplier }),
        adminId || null,
      ]
    );

    await client.query("COMMIT");
    return { success: true, tournament_id: day.tournament_id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function reResolveDay(dayId, correctOutcomes, adminId, opts = {}) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const pointsMultiplier = Number(opts.pointsMultiplier) > 0 ? Number(opts.pointsMultiplier) : 1;

  // Log re-resolve action before running the same resolve logic
  await pool.query(
    `INSERT INTO tournament_audit_log
       (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
     VALUES (
       (SELECT tournament_id FROM tournament_vote_days WHERE id = $1),
       'vote_day', $1, 're-resolve', $2, $3
     )`,
    [dayId, JSON.stringify({ correct_outcomes: correctOutcomes, points_multiplier: pointsMultiplier }), adminId || null]
  );

  return resolveDay(dayId, correctOutcomes, adminId, opts);
}

// ---------------------------------------------------------------------------
// Public Voting
// ---------------------------------------------------------------------------

export async function getPublicVoteConfig(publicSlug) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT pl.tournament_id, t.name, t.description, t.rules_text, t.theme_config, t.vote_password
     FROM tournament_public_links pl
     JOIN tournaments t ON t.id = pl.tournament_id
     WHERE pl.public_slug = $1 AND pl.is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  // Auto-transition timed vote days before querying
  await processTimedVoteDays(link.tournament_id);

  const dayRes = await pool.query(
    `SELECT d.* FROM tournament_vote_days d
     WHERE d.tournament_id = $1 AND d.status = 'open'
     ORDER BY d.date_key DESC
     LIMIT 1`,
    [link.tournament_id]
  );
  let currentDay = dayRes.rows[0] || null;

  // If no open day, check for upcoming day with scheduled open time (for timer display)
  if (!currentDay) {
    const upcomingRes = await pool.query(
      `SELECT d.* FROM tournament_vote_days d
       WHERE d.tournament_id = $1 AND d.status = 'upcoming'
         AND d.voting_open_at IS NOT NULL AND d.voting_open_at > now()
       ORDER BY d.voting_open_at ASC
       LIMIT 1`,
      [link.tournament_id]
    );
    currentDay = upcomingRes.rows[0] || null;
    if (currentDay) {
      currentDay = { ...currentDay, is_voting_open: false };
    }
  } else {
    currentDay = { ...currentDay, is_voting_open: true };
  }

  let assets = [];
  if (currentDay) {
    const assetsRes = await pool.query(
      `SELECT * FROM tournament_vote_assets
       WHERE vote_day_id = $1 AND is_active = true
       ORDER BY sort_order ASC, id ASC`,
      [currentDay.id]
    );
    assets = assetsRes.rows;
  }

  return {
    tournament: {
      id: link.tournament_id,
      name: link.name,
      description: link.description,
      rules_text: link.rules_text,
      theme_config: link.theme_config,
      has_vote_password: !!(link.vote_password && link.vote_password.length > 0),
      vote_password: link.vote_password || null,
    },
    currentDay: currentDay ? { ...currentDay, assets } : null,
  };
}

export async function getPublicVoteConfigByToken(publicSlug, voteToken) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT pl.tournament_id, t.name, t.description, t.rules_text, t.theme_config, t.vote_password
     FROM tournament_public_links pl
     JOIN tournaments t ON t.id = pl.tournament_id
     WHERE pl.public_slug = $1 AND pl.is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  // Auto-transition timed vote days before querying
  await processTimedVoteDays(link.tournament_id);

  const dayRes = await pool.query(
    `SELECT d.* FROM tournament_vote_days d
     WHERE d.tournament_id = $1 AND d.vote_token = $2`,
    [link.tournament_id, voteToken]
  );
  let currentDay = dayRes.rows[0] || null;

  if (currentDay) {
    currentDay = { ...currentDay, is_voting_open: currentDay.status === "open" };
  }

  let assets = [];
  if (currentDay) {
    const assetsRes = await pool.query(
      `SELECT * FROM tournament_vote_assets
       WHERE vote_day_id = $1 AND is_active = true
       ORDER BY sort_order ASC, id ASC`,
      [currentDay.id]
    );
    assets = assetsRes.rows;
  }

  return {
    tournament: {
      id: link.tournament_id,
      name: link.name,
      description: link.description,
      rules_text: link.rules_text,
      theme_config: link.theme_config,
      has_vote_password: !!(link.vote_password && link.vote_password.length > 0),
      vote_password: link.vote_password || null,
    },
    currentDay: currentDay ? { ...currentDay, assets } : null,
  };
}

export async function getCurrentVoteDay(publicSlug) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT pl.tournament_id
     FROM tournament_public_links pl
     WHERE pl.public_slug = $1 AND pl.is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  const dayRes = await pool.query(
    `SELECT d.* FROM tournament_vote_days d
     WHERE d.tournament_id = $1 AND d.status = 'open'
     ORDER BY d.date_key DESC
     LIMIT 1`,
    [link.tournament_id]
  );
  const day = dayRes.rows[0] || null;
  if (!day) return null;

  const assetsRes = await pool.query(
    `SELECT * FROM tournament_vote_assets
     WHERE vote_day_id = $1 AND is_active = true
     ORDER BY sort_order ASC, id ASC`,
    [day.id]
  );

  return { ...day, is_voting_open: true, assets: assetsRes.rows };
}

export async function submitVote(tournamentId, voteDayId, nickname, selections, meta = {}) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const normalizedNick = normalizeNickname(nickname);

  // Check uniqueness
  const existingRes = await pool.query(
    `SELECT id FROM tournament_votes
     WHERE vote_day_id = $1 AND normalized_nickname = $2`,
    [voteDayId, normalizedNick]
  );
  if (existingRes.rows.length > 0) {
    return { error: "already_voted" };
  }

  // Check IP uniqueness (soft anti-abuse)
  if (meta.ip_hash) {
    const ipRes = await pool.query(
      `SELECT id FROM tournament_votes
       WHERE vote_day_id = $1 AND ip_hash = $2 AND status = 'valid'`,
      [voteDayId, meta.ip_hash]
    );
    if (ipRes.rows.length > 0) {
      return { error: "ip_already_voted" };
    }
  }

  // Validate vote day exists and is open
  const dayRes = await pool.query(
    "SELECT id, status FROM tournament_vote_days WHERE id = $1 AND tournament_id = $2",
    [voteDayId, tournamentId]
  );
  if (!dayRes.rows[0]) {
    return { error: "Vote day not found" };
  }
  if (dayRes.rows[0].status !== "open") {
    return { error: "Voting is not open" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const voteRes = await client.query(
      `INSERT INTO tournament_votes
         (vote_day_id, tournament_id, nickname, normalized_nickname, ip_hash, fingerprint, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        voteDayId,
        tournamentId,
        nickname.trim(),
        normalizedNick,
        meta.ip_hash || null,
        meta.fingerprint || null,
        meta.user_agent || null,
      ]
    );
    const vote = voteRes.rows[0];

    for (const sel of selections) {
      await client.query(
        `INSERT INTO tournament_vote_selections (vote_id, asset_id, selected_option)
         VALUES ($1,$2,$3)`,
        [vote.id, sel.asset_id, sel.selected_option]
      );
    }

    // Auto-enroll voter as tournament participant if not already present
    const existingParticipant = await client.query(
      `SELECT id FROM tournament_participants
       WHERE tournament_id = $1 AND LOWER(TRIM(display_name)) = $2`,
      [tournamentId, normalizedNick]
    );
    if (existingParticipant.rows.length === 0) {
      await client.query(
        `INSERT INTO tournament_participants
           (tournament_id, display_name, role, total_points, status)
         VALUES ($1,$2,'participant',0,'active')`,
        [tournamentId, nickname.trim()]
      );
    }

    await client.query("COMMIT");
    return { vote };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Admin Manual Vote
// ---------------------------------------------------------------------------

export async function addManualVote(tournamentId, voteDayId, nickname, selections, adminId) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  if (!nickname?.trim()) return { error: "Nickname is required" };
  if (!Array.isArray(selections) || selections.length === 0) return { error: "Selections are required" };

  const normalizedNick = normalizeNickname(nickname);

  // Validate vote day exists and belongs to tournament
  const dayRes = await pool.query(
    "SELECT id, status FROM tournament_vote_days WHERE id = $1 AND tournament_id = $2",
    [voteDayId, tournamentId]
  );
  if (!dayRes.rows[0]) {
    return { error: "Vote day not found" };
  }

  // Check if nickname already voted on this day
  const existingRes = await pool.query(
    "SELECT id FROM tournament_votes WHERE vote_day_id = $1 AND normalized_nickname = $2 AND status = 'valid'",
    [voteDayId, normalizedNick]
  );
  if (existingRes.rows.length > 0) {
    return { error: "This nickname already has a valid vote for this day" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const voteRes = await client.query(
      `INSERT INTO tournament_votes
         (vote_day_id, tournament_id, nickname, normalized_nickname, ip_hash, fingerprint, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        voteDayId,
        tournamentId,
        nickname.trim(),
        normalizedNick,
        "manual_admin",
        null,
        "manual_admin_entry",
      ]
    );
    const vote = voteRes.rows[0];

    for (const sel of selections) {
      await client.query(
        `INSERT INTO tournament_vote_selections (vote_id, asset_id, selected_option)
         VALUES ($1,$2,$3)`,
        [vote.id, sel.asset_id, sel.selected_option]
      );
    }

    // Auto-enroll voter as tournament participant if not already present
    const existingParticipant = await client.query(
      `SELECT id FROM tournament_participants
       WHERE tournament_id = $1 AND LOWER(TRIM(display_name)) = $2`,
      [tournamentId, normalizedNick]
    );
    if (existingParticipant.rows.length === 0) {
      await client.query(
        `INSERT INTO tournament_participants
           (tournament_id, display_name, role, total_points, status)
         VALUES ($1,$2,'participant',0,'active')`,
        [tournamentId, nickname.trim()]
      );
    }

    // Audit log
    await client.query(
      `INSERT INTO tournament_audit_log
         (tournament_id, entity_type, entity_id, action, after_data, actor_admin_id)
       VALUES ($1,'vote',$2,'manual_add',$3,$4)`,
      [
        tournamentId,
        vote.id,
        JSON.stringify({ nickname: nickname.trim(), selections }),
        adminId || null,
      ]
    );

    await client.query("COMMIT");
    return { vote };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Public Leaderboard
// ---------------------------------------------------------------------------

export async function getPublicLeaderboard(publicSlug) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT pl.tournament_id, t.name, t.description, t.rules_text, t.theme_config
     FROM tournament_public_links pl
     JOIN tournaments t ON t.id = pl.tournament_id
     WHERE pl.public_slug = $1 AND pl.is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  // Fetch leaderboard with win rate stats from day_scores
  const res = await pool.query(
    `SELECT lc.*, lc.nickname_snapshot AS nickname,
            COALESCE(stats.total_correct, 0)::int AS total_correct,
            COALESCE(stats.total_voted_assets, 0)::int AS total_voted_assets
     FROM tournament_leaderboard_cache lc
     LEFT JOIN (
       SELECT tournament_id, normalized_nickname,
              SUM(correct_count) AS total_correct,
              SUM(total_assets) AS total_voted_assets
       FROM tournament_day_scores
       WHERE tournament_id = $1
       GROUP BY tournament_id, normalized_nickname
     ) stats ON stats.tournament_id = lc.tournament_id
            AND stats.normalized_nickname = lc.normalized_nickname
     WHERE lc.tournament_id = $1
     ORDER BY lc.total_points DESC, lc.nickname_snapshot ASC`,
    [link.tournament_id]
  );

  return {
    tournament: {
      name: link.name,
      description: link.description,
      rules_text: link.rules_text,
      theme_config: link.theme_config,
    },
    leaderboard: res.rows,
  };
}

export async function getParticipantDayHistory(publicSlug, nickname) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT pl.tournament_id
     FROM tournament_public_links pl
     WHERE pl.public_slug = $1 AND pl.is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  const normalizedNick = normalizeNickname(nickname);

  const res = await pool.query(
    `SELECT s.*, d.date_key, d.title
     FROM tournament_day_scores s
     JOIN tournament_vote_days d ON d.id = s.vote_day_id
     WHERE s.tournament_id = $1 AND s.normalized_nickname = $2
     ORDER BY d.date_key ASC`,
    [link.tournament_id, normalizedNick]
  );
  return res.rows;
}

export async function getParticipantDayDetail(publicSlug, nickname, dayId) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT pl.tournament_id
     FROM tournament_public_links pl
     WHERE pl.public_slug = $1 AND pl.is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  const normalizedNick = normalizeNickname(nickname);

  const scoreRes = await pool.query(
    `SELECT s.*, d.date_key, d.title
     FROM tournament_day_scores s
     JOIN tournament_vote_days d ON d.id = s.vote_day_id
     WHERE s.vote_day_id = $1 AND s.tournament_id = $2 AND s.normalized_nickname = $3`,
    [dayId, link.tournament_id, normalizedNick]
  );
  const score = scoreRes.rows[0] || null;
  if (!score) return null;

  const selectionsRes = await pool.query(
    `SELECT s.selected_option, a.asset_code, a.asset_label, a.icon_url, a.id AS asset_id,
            r.correct_option
     FROM tournament_votes v
     JOIN tournament_vote_selections s ON s.vote_id = v.id
     JOIN tournament_vote_assets a ON a.id = s.asset_id
     LEFT JOIN tournament_day_results r ON r.vote_day_id = v.vote_day_id AND r.asset_id = a.id
     WHERE v.vote_day_id = $1 AND v.normalized_nickname = $2 AND v.status = 'valid'
     ORDER BY a.sort_order ASC`,
    [dayId, normalizedNick]
  );

  return {
    ...score,
    selections: selectionsRes.rows.map((r) => ({
      asset_id: r.asset_id,
      asset_code: r.asset_code,
      asset_label: r.asset_label,
      icon_url: r.icon_url || null,
      selected_option: r.selected_option,
      correct_option: r.correct_option,
      is_correct: r.correct_option !== null && (r.correct_option === "both" || r.selected_option === r.correct_option),
    })),
  };
}

// ---------------------------------------------------------------------------
// Participant day history / detail by tournament ID (for authenticated users)
// ---------------------------------------------------------------------------

export async function getParticipantDayHistoryById(tournamentId, nickname) {
  const pool = getPool();
  if (!pool) return null;

  const normalizedNick = normalizeNickname(nickname);

  const res = await pool.query(
    `SELECT s.*, d.date_key, d.title
     FROM tournament_day_scores s
     JOIN tournament_vote_days d ON d.id = s.vote_day_id
     WHERE s.tournament_id = $1 AND s.normalized_nickname = $2
     ORDER BY d.date_key ASC`,
    [tournamentId, normalizedNick]
  );
  return res.rows;
}

export async function getParticipantDayDetailById(tournamentId, nickname, dayId) {
  const pool = getPool();
  if (!pool) return null;

  const normalizedNick = normalizeNickname(nickname);

  const scoreRes = await pool.query(
    `SELECT s.*, d.date_key, d.title
     FROM tournament_day_scores s
     JOIN tournament_vote_days d ON d.id = s.vote_day_id
     WHERE s.vote_day_id = $1 AND s.tournament_id = $2 AND s.normalized_nickname = $3`,
    [dayId, tournamentId, normalizedNick]
  );
  const score = scoreRes.rows[0] || null;
  if (!score) return null;

  const selectionsRes = await pool.query(
    `SELECT s.selected_option, a.asset_code, a.asset_label, a.icon_url, a.id AS asset_id,
            r.correct_option
     FROM tournament_votes v
     JOIN tournament_vote_selections s ON s.vote_id = v.id
     JOIN tournament_vote_assets a ON a.id = s.asset_id
     LEFT JOIN tournament_day_results r ON r.vote_day_id = v.vote_day_id AND r.asset_id = a.id
     WHERE v.vote_day_id = $1 AND v.normalized_nickname = $2 AND v.status = 'valid'
     ORDER BY a.sort_order ASC`,
    [dayId, normalizedNick]
  );

  return {
    ...score,
    selections: selectionsRes.rows.map((r) => ({
      asset_id: r.asset_id,
      asset_code: r.asset_code,
      asset_label: r.asset_label,
      icon_url: r.icon_url || null,
      selected_option: r.selected_option,
      correct_option: r.correct_option,
      is_correct: r.correct_option !== null && (r.correct_option === "both" || r.selected_option === r.correct_option),
    })),
  };
}

// ---------------------------------------------------------------------------
// Public resolved vote days (with all votes & outcomes)
// ---------------------------------------------------------------------------

export async function getPublicResolvedDays(publicSlug) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT pl.tournament_id
     FROM tournament_public_links pl
     WHERE pl.public_slug = $1 AND pl.is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  // Get resolved vote days
  const daysRes = await pool.query(
    `SELECT d.id, d.date_key, d.title, d.status, d.voting_open_at, d.voting_close_at
     FROM tournament_vote_days d
     WHERE d.tournament_id = $1 AND d.status = 'resolved'
     ORDER BY d.date_key DESC`,
    [link.tournament_id]
  );

  const days = [];
  for (const day of daysRes.rows) {
    // Get outcomes (correct answers)
    const outcomesRes = await pool.query(
      `SELECT r.asset_id, r.correct_option, a.asset_code, a.asset_label, a.icon_url
       FROM tournament_day_results r
       JOIN tournament_vote_assets a ON a.id = r.asset_id
       WHERE r.vote_day_id = $1
       ORDER BY a.sort_order ASC`,
      [day.id]
    );

    // Get all votes with selections for this day (public-safe: no IP, no user_agent)
    const votesRes = await pool.query(
      `SELECT v.nickname, v.submitted_at,
              s.asset_id, s.selected_option,
              a.asset_code, a.asset_label
       FROM tournament_votes v
       JOIN tournament_vote_selections s ON s.vote_id = v.id
       JOIN tournament_vote_assets a ON a.id = s.asset_id
       WHERE v.vote_day_id = $1 AND v.status = 'valid'
       ORDER BY v.nickname ASC, a.sort_order ASC`,
      [day.id]
    );

    // Group votes by nickname
    const votesMap = new Map();
    for (const row of votesRes.rows) {
      if (!votesMap.has(row.nickname)) {
        votesMap.set(row.nickname, { nickname: row.nickname, submitted_at: row.submitted_at, selections: [] });
      }
      votesMap.get(row.nickname).selections.push({
        asset_id: row.asset_id,
        asset_code: row.asset_code,
        asset_label: row.asset_label,
        selected_option: row.selected_option,
      });
    }

    // Get scores for this day
    const scoresRes = await pool.query(
      `SELECT nickname_snapshot AS nickname, correct_count, total_assets, day_points
       FROM tournament_day_scores
       WHERE vote_day_id = $1`,
      [day.id]
    );
    const scoresMap = new Map();
    for (const s of scoresRes.rows) {
      scoresMap.set(s.nickname, s);
    }

    days.push({
      id: day.id,
      date_key: day.date_key,
      title: day.title,
      outcomes: outcomesRes.rows,
      votes: Array.from(votesMap.values()).map((v) => {
        const sc = scoresMap.get(v.nickname);
        return {
          ...v,
          correct_count: sc?.correct_count ?? null,
          total_assets: sc?.total_assets ?? null,
          day_points: sc?.day_points ?? null,
        };
      }),
    });
  }

  return { days };
}

// ---------------------------------------------------------------------------
// Public vote day links (open + upcoming days with vote tokens)
// ---------------------------------------------------------------------------

export async function getPublicVoteDayLinks(publicSlug) {
  const pool = getPool();
  if (!pool) return null;

  const linkRes = await pool.query(
    `SELECT pl.tournament_id
     FROM tournament_public_links pl
     WHERE pl.public_slug = $1 AND pl.is_enabled = true`,
    [publicSlug]
  );
  const link = linkRes.rows[0];
  if (!link) return null;

  // Auto-transition timed vote days before querying
  await processTimedVoteDays(link.tournament_id);

  const daysRes = await pool.query(
    `SELECT d.id, d.date_key, d.title, d.status, d.vote_token,
            d.voting_open_at, d.voting_close_at,
            COALESCE(vc.cnt, 0)::int AS vote_count
     FROM tournament_vote_days d
     LEFT JOIN (
       SELECT vote_day_id, COUNT(*) AS cnt
       FROM tournament_votes
       WHERE status = 'valid'
       GROUP BY vote_day_id
     ) vc ON vc.vote_day_id = d.id
     WHERE d.tournament_id = $1 AND d.status IN ('open', 'upcoming')
     ORDER BY d.date_key ASC`,
    [link.tournament_id]
  );

  return {
    days: daysRes.rows.map((d) => ({
      id: d.id,
      date_key: d.date_key,
      title: d.title,
      status: d.status,
      vote_token: d.vote_token,
      voting_open_at: d.voting_open_at,
      voting_close_at: d.voting_close_at,
      vote_count: d.vote_count,
    })),
  };
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

export async function exportVotes(tournamentId) {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query(
    `SELECT d.date_key, v.nickname, a.asset_code, s.selected_option, v.submitted_at
     FROM tournament_votes v
     JOIN tournament_vote_days d ON d.id = v.vote_day_id
     JOIN tournament_vote_selections s ON s.vote_id = v.id
     JOIN tournament_vote_assets a ON a.id = s.asset_id
     WHERE v.tournament_id = $1 AND v.status = 'valid'
     ORDER BY d.date_key ASC, v.nickname ASC, a.sort_order ASC`,
    [tournamentId]
  );
  return res.rows;
}

export async function exportResolvedResults(tournamentId) {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query(
    `SELECT d.date_key, v.nickname, a.asset_code, s.selected_option,
            r.correct_option,
            (s.selected_option = r.correct_option) AS is_correct,
            sc.day_points
     FROM tournament_votes v
     JOIN tournament_vote_days d ON d.id = v.vote_day_id
     JOIN tournament_vote_selections s ON s.vote_id = v.id
     JOIN tournament_vote_assets a ON a.id = s.asset_id
     JOIN tournament_day_results r ON r.vote_day_id = d.id AND r.asset_id = a.id
     LEFT JOIN tournament_day_scores sc ON sc.vote_day_id = d.id
       AND sc.normalized_nickname = v.normalized_nickname
     WHERE v.tournament_id = $1 AND v.status = 'valid' AND d.status = 'resolved'
     ORDER BY d.date_key ASC, v.nickname ASC, a.sort_order ASC`,
    [tournamentId]
  );
  return res.rows;
}

export async function exportLeaderboard(tournamentId) {
  const pool = getPool();
  if (!pool) return [];

  const res = await pool.query(
    `SELECT *, ROW_NUMBER() OVER (ORDER BY total_points DESC, nickname_snapshot ASC) AS rank
     FROM tournament_leaderboard_cache
     WHERE tournament_id = $1
     ORDER BY total_points DESC, nickname_snapshot ASC`,
    [tournamentId]
  );
  return res.rows;
}
