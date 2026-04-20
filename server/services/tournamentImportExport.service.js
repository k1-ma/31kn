import ExcelJS from "exceljs";
import { getPool } from "./db.service.js";

// ---------------------------------------------------------------------------
// Participants Import
// ---------------------------------------------------------------------------

export async function generateParticipantsTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Participants");

  ws.columns = [
    { header: "display_name", key: "display_name", width: 25 },
    { header: "username", key: "username", width: 20 },
    { header: "role", key: "role", width: 20 },
    { header: "notes", key: "notes", width: 30 },
    { header: "status", key: "status", width: 15 },
  ];

  // Style header row
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  // Example rows
  ws.addRow({ display_name: "John Doe", username: "johndoe", role: "Trader", notes: "", status: "active" });
  ws.addRow({ display_name: "Jane Smith", username: "janesmith", role: "Analyst", notes: "", status: "active" });

  return wb;
}

export async function parseParticipantsFile(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.getWorksheet(1);
  if (!ws) throw new Error("No worksheet found in file");

  const headers = [];
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value || "").trim().toLowerCase();
  });

  const requiredHeaders = ["display_name"];
  for (const h of requiredHeaders) {
    if (!headers.includes(h)) {
      throw new Error(`Missing required column: ${h}`);
    }
  }

  const participants = [];
  const errors = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const data = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      if (header) {
        data[header] = cell.value != null ? String(cell.value).trim() : "";
      }
    });

    if (!data.display_name) {
      errors.push({ row: rowNumber, error: "Missing display_name" });
      return;
    }

    const validStatuses = ["active", "hidden", "disqualified"];
    const status = data.status && validStatuses.includes(data.status.toLowerCase())
      ? data.status.toLowerCase()
      : "active";

    participants.push({
      display_name: data.display_name,
      username: data.username || null,
      role: data.role || null,
      notes: data.notes || null,
      status,
      add_points: data.add_points != null && String(data.add_points).trim() !== "" ? Number(data.add_points) : null,
      reason: data.reason || null,
    });
  });

  return { participants, errors };
}

export async function importParticipants(tournamentId, participants, mode = "append", adminId = null) {
  const pool = getPool();
  if (!pool) return { error: "DB not available" };

  const client = await pool.connect();
  const created = [];
  const updated = [];
  let pointsAdded = 0;

  try {
    await client.query("BEGIN");

    if (mode === "replace") {
      // Delete existing participants (and their points log via CASCADE)
      await client.query(
        "DELETE FROM tournament_participants WHERE tournament_id = $1",
        [tournamentId]
      );
    }

    for (const p of participants) {
      let participantId = null;

      if (mode === "upsert") {
        // Try to find existing by display_name + tournament_id
        const existing = await client.query(
          "SELECT id FROM tournament_participants WHERE tournament_id = $1 AND display_name = $2",
          [tournamentId, p.display_name]
        );

        if (existing.rows[0]) {
          participantId = existing.rows[0].id;
          const res = await client.query(
            `UPDATE tournament_participants
             SET username = COALESCE($1, username),
                 role = COALESCE($2, role),
                 notes = COALESCE($3, notes),
                 status = $4,
                 updated_at = now()
             WHERE id = $5
             RETURNING *`,
            [p.username, p.role, p.notes, p.status, participantId]
          );
          updated.push(res.rows[0]);
        }
      }

      if (!participantId) {
        const res = await client.query(
          `INSERT INTO tournament_participants
             (tournament_id, display_name, username, role, notes, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [tournamentId, p.display_name, p.username, p.role, p.notes, p.status]
        );
        participantId = res.rows[0].id;
        created.push(res.rows[0]);
      }

      // Process add_points if provided
      if (p.add_points != null && Number.isFinite(p.add_points) && p.add_points !== 0) {
        await client.query(
          `INSERT INTO tournament_points_log (tournament_id, participant_id, points_delta, reason, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [tournamentId, participantId, p.add_points, p.reason || "Excel import", adminId || null]
        );
        await client.query(
          `UPDATE tournament_participants
           SET total_points = total_points + $1, updated_at = now()
           WHERE id = $2`,
          [p.add_points, participantId]
        );
        pointsAdded++;
      }
    }

    await client.query("COMMIT");
    return { created: created.length, updated: updated.length, pointsAdded, total: created.length + updated.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Participants Export
// ---------------------------------------------------------------------------

export async function exportParticipants(tournamentId) {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query(
    `SELECT p.display_name, p.username, p.role, p.total_points, p.bonus_points,
            p.penalty_points, p.notes, p.status, p.updated_at
     FROM tournament_participants p
     WHERE p.tournament_id = $1
     ORDER BY p.total_points DESC, p.display_name`,
    [tournamentId]
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Participants");

  ws.columns = [
    { header: "display_name", key: "display_name", width: 25 },
    { header: "username", key: "username", width: 20 },
    { header: "role", key: "role", width: 20 },
    { header: "total_points", key: "total_points", width: 15 },
    { header: "add_points", key: "add_points", width: 15 },
    { header: "reason", key: "reason", width: 30 },
    { header: "notes", key: "notes", width: 30 },
    { header: "status", key: "status", width: 15 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  // Highlight the add_points and reason columns
  const addPtsCol = 5; // add_points column
  const reasonCol = 6; // reason column
  ws.getCell(1, addPtsCol).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD4EDDA" },
  };
  ws.getCell(1, reasonCol).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD4EDDA" },
  };
  ws.getCell(1, addPtsCol).note = "Fill this column to add points on import. Leave empty to skip.";
  ws.getCell(1, reasonCol).note = "Optional reason for the points addition (e.g. 'MOTM vote day 3')";

  for (const row of res.rows) {
    ws.addRow({ ...row, add_points: "", reason: "" });
  }

  return wb;
}

// ---------------------------------------------------------------------------
// Leaderboard Export
// ---------------------------------------------------------------------------

export async function exportLeaderboard(tournamentId) {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query(
    `SELECT p.display_name, p.username, p.role, p.total_points, p.status
     FROM tournament_participants p
     WHERE p.tournament_id = $1 AND p.status = 'active'
     ORDER BY 
       CASE WHEN p.manual_rank IS NOT NULL THEN 0 ELSE 1 END,
       p.manual_rank ASC NULLS LAST,
       p.total_points DESC,
       p.display_name ASC`,
    [tournamentId]
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leaderboard");

  ws.columns = [
    { header: "place", key: "place", width: 10 },
    { header: "display_name", key: "display_name", width: 25 },
    { header: "username", key: "username", width: 20 },
    { header: "role", key: "role", width: 20 },
    { header: "points", key: "points", width: 15 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  res.rows.forEach((row, idx) => {
    ws.addRow({
      place: row.manual_rank || (idx + 1),
      display_name: row.display_name,
      username: row.username,
      role: row.role,
      points: Number(row.total_points) || 0,
    });
  });

  return wb;
}

// ---------------------------------------------------------------------------
// Points History Export
// ---------------------------------------------------------------------------

export async function exportPointsHistory(tournamentId) {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query(
    `SELECT p.display_name AS participant, l.points_delta AS delta, l.reason,
            u.nickname AS admin, l.created_at
     FROM tournament_points_log l
     JOIN tournament_participants p ON p.id = l.participant_id
     LEFT JOIN users u ON u.id = l.created_by
     WHERE l.tournament_id = $1
     ORDER BY l.created_at DESC`,
    [tournamentId]
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Points History");

  ws.columns = [
    { header: "participant", key: "participant", width: 25 },
    { header: "delta", key: "delta", width: 10 },
    { header: "reason", key: "reason", width: 40 },
    { header: "admin", key: "admin", width: 20 },
    { header: "created_at", key: "created_at", width: 25 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  for (const row of res.rows) {
    ws.addRow(row);
  }

  return wb;
}
