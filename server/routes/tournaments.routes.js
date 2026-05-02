import crypto from "node:crypto";
import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { voteRateLimit, publicReadRateLimit } from "../middleware/rateLimitDb.js";
import * as svc from "../services/tournament.service.js";
import * as scoring from "../services/tournamentScoring.service.js";
import * as importExport from "../services/tournamentImportExport.service.js";
import * as voting from "../services/tournamentVoting.service.js";

const adminRouter = Router();
const publicRouter = Router();
const userRouter = Router();

// Per-IP rate limit for unauthenticated public reads (leaderboard, vote-config,
// participant history, etc.). Prevents trivial DoS / scraping of public DB.
publicRouter.use(publicReadRateLimit);

/**
 * Constant-time string comparison to mitigate timing attacks on vote_password.
 *
 * Hashing both inputs through SHA-256 before timingSafeEqual eliminates the
 * length-based side channel: regardless of the original lengths, the
 * compared buffers are always 32 bytes. The previous implementation took an
 * obvious early-exit on length mismatch (and the dummy compare ran on a
 * different-sized buffer), which leaks the password length over the network.
 */
function safeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ah = crypto.createHash("sha256").update(a, "utf8").digest();
  const bh = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ah, bh);
}

// --------------- Admin Routes ---------------

// Tournaments CRUD
adminRouter.get("/", requireAdmin, async (req, res) => {
  try {
    const { search, status, page, limit } = req.query;
    const result = await svc.listTournaments({
      search: search || null,
      status: status || null,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] list error:", err?.message || err);
    return res.status(500).json({ error: "Failed to list tournaments" });
  }
});

adminRouter.post("/", requireAdmin, async (req, res) => {
  try {
    const result = await svc.createTournament(req.body, req.adminUser?.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] create error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create tournament" });
  }
});

adminRouter.get("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.getTournament(id);
    if (!result) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    // Merge public link info
    const publicLink = await svc.getPublicLink(id);
    if (publicLink) {
      result.public_slug = publicLink.public_slug;
      result.is_public = publicLink.is_enabled;
    }
    return res.json({ tournament: result });
  } catch (err) {
    console.error("[tournaments] get error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get tournament" });
  }
});

adminRouter.put("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.updateTournament(id, req.body, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] update error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update tournament" });
  }
});

adminRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.deleteTournament(id, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] delete error:", err?.message || err);
    return res.status(500).json({ error: "Failed to delete tournament" });
  }
});

adminRouter.post("/:id/duplicate", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.duplicateTournament(id, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] duplicate error:", err?.message || err);
    return res.status(500).json({ error: "Failed to duplicate tournament" });
  }
});

adminRouter.post("/:id/archive", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.archiveTournament(id, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] archive error:", err?.message || err);
    return res.status(500).json({ error: "Failed to archive tournament" });
  }
});

adminRouter.post("/:id/unarchive", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.unarchiveTournament(id, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] unarchive error:", err?.message || err);
    return res.status(500).json({ error: "Failed to unarchive tournament" });
  }
});

// Participants
adminRouter.get("/:id/participants", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const { search, status } = req.query;
    const result = await svc.listParticipants(id, {
      search: search || null,
      status: status || null,
    });
    if (result?.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({ participants: Array.isArray(result) ? result : [] });
  } catch (err) {
    console.error("[tournaments] list participants error:", err?.message || err);
    return res.status(500).json({ error: "Failed to list participants" });
  }
});

adminRouter.post("/:id/participants", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.createParticipant(id, req.body, req.adminUser?.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] create participant error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create participant" });
  }
});

adminRouter.put("/:id/participants/:participantId", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isFinite(id) || !Number.isFinite(participantId)) {
      return res.status(400).json({ error: "Bad id" });
    }

    const result = await svc.updateParticipant(id, participantId, req.body, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Participant not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] update participant error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update participant" });
  }
});

adminRouter.delete("/:id/participants/:participantId", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isFinite(id) || !Number.isFinite(participantId)) {
      return res.status(400).json({ error: "Bad id" });
    }

    const result = await svc.deleteParticipant(id, participantId, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Participant not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] delete participant error:", err?.message || err);
    return res.status(500).json({ error: "Failed to delete participant" });
  }
});

adminRouter.post("/:id/participants/bulk", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    let { participants, names } = req.body || {};
    if (Array.isArray(names) && !Array.isArray(participants)) {
      participants = names.filter((n) => typeof n === "string" && n.trim()).map((n) => ({ display_name: n.trim() }));
    }
    if (!Array.isArray(participants)) {
      return res.status(400).json({ error: "participants or names array is required" });
    }

    const result = await svc.bulkCreateParticipants(id, participants, req.adminUser?.id);
    if (result?.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({ participants: Array.isArray(result) ? result : [] });
  } catch (err) {
    console.error("[tournaments] bulk create participants error:", err?.message || err);
    return res.status(500).json({ error: "Failed to bulk create participants" });
  }
});

adminRouter.post("/:id/participants/import", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const { fileData, file, mode } = req.body || {};
    const base64Data = fileData || file;
    if (!base64Data) {
      return res.status(400).json({ error: "fileData (base64) is required" });
    }

    const buffer = Buffer.from(base64Data, "base64");
    const parsed = await importExport.parseParticipantsFile(buffer);
    if (parsed.errors && parsed.errors.length > 0 && parsed.participants.length === 0) {
      return res.status(400).json({ error: "Invalid file", errors: parsed.errors });
    }
    const result = await importExport.importParticipants(id, parsed.participants, mode || "upsert", req.adminUser?.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] import participants error:", err?.message || err);
    return res.status(500).json({ error: "Failed to import participants" });
  }
});

adminRouter.get("/:id/participants/export", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const wb = await importExport.exportParticipants(id);
    if (!wb) {
      return res.status(500).json({ error: "DB not available" });
    }

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="tournament-${id}-participants.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error("[tournaments] export participants error:", err?.message || err);
    return res.status(500).json({ error: "Failed to export participants" });
  }
});

adminRouter.get("/:id/participants/template", requireAdmin, async (req, res) => {
  try {
    const wb = await importExport.generateParticipantsTemplate();
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="participants-template.xlsx"');
    return res.send(buf);
  } catch (err) {
    console.error("[tournaments] template error:", err?.message || err);
    return res.status(500).json({ error: "Failed to generate template" });
  }
});

// Points Management
adminRouter.post("/:id/participants/:participantId/add-points", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isFinite(id) || !Number.isFinite(participantId)) {
      return res.status(400).json({ error: "Bad id" });
    }

    const { points_delta, reason } = req.body || {};
    if (points_delta === undefined || points_delta === null) {
      return res.status(400).json({ error: "points_delta is required" });
    }

    const result = await svc.addPoints(id, participantId, Number(points_delta), reason, req.adminUser?.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] add points error:", err?.message || err);
    return res.status(500).json({ error: "Failed to add points" });
  }
});

adminRouter.post("/:id/participants/:participantId/set-points", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isFinite(id) || !Number.isFinite(participantId)) {
      return res.status(400).json({ error: "Bad id" });
    }

    const { total_points, reason } = req.body || {};
    if (total_points === undefined || total_points === null) {
      return res.status(400).json({ error: "total_points is required" });
    }

    const result = await svc.setPoints(id, participantId, Number(total_points), reason, req.adminUser?.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] set points error:", err?.message || err);
    return res.status(500).json({ error: "Failed to set points" });
  }
});

adminRouter.post("/:id/points/bulk-add", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: "entries array is required" });
    }

    const result = await svc.bulkAddPoints(id, entries, req.adminUser?.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] bulk add points error:", err?.message || err);
    return res.status(500).json({ error: "Failed to bulk add points" });
  }
});

adminRouter.get("/:id/points/history", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);

    const result = await svc.getPointsHistory(id, { limit, offset });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] points history error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get points history" });
  }
});

adminRouter.get("/:id/participants/:participantId/history", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isFinite(id) || !Number.isFinite(participantId)) {
      return res.status(400).json({ error: "Bad id" });
    }

    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);

    const result = await svc.getParticipantPointsHistory(id, participantId, { limit, offset });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] participant history error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get participant history" });
  }
});

adminRouter.delete("/:id/points/:logId", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const logId = Number(req.params.logId);
    if (!Number.isFinite(id) || !Number.isFinite(logId)) {
      return res.status(400).json({ error: "Bad id" });
    }

    const result = await svc.deletePointsLog(logId, req.adminUser?.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] delete points log error:", err?.message || err);
    return res.status(500).json({ error: "Failed to delete points log" });
  }
});

// Leaderboard
adminRouter.get("/:id/leaderboard", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const includeHidden = req.query.includeHidden === "true";
    const result = await scoring.getLeaderboard(id, { includeHidden });
    return res.json({ leaderboard: Array.isArray(result) ? result : [] });
  } catch (err) {
    console.error("[tournaments] leaderboard error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// Export routes
adminRouter.get("/:id/export/leaderboard", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const wb = await importExport.exportLeaderboard(id);
    if (!wb) return res.status(500).json({ error: "DB not available" });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="tournament-${id}-leaderboard.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error("[tournaments] export leaderboard error:", err?.message || err);
    return res.status(500).json({ error: "Failed to export leaderboard" });
  }
});

adminRouter.get("/:id/export/history", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const wb = await importExport.exportPointsHistory(id);
    if (!wb) return res.status(500).json({ error: "DB not available" });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="tournament-${id}-history.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error("[tournaments] export history error:", err?.message || err);
    return res.status(500).json({ error: "Failed to export history" });
  }
});

// Set displayed tournament (for user-facing leaderboard in LIBRARY)
adminRouter.put("/:id/set-displayed", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.setDisplayedTournament(id, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] set-displayed error:", err?.message || err);
    return res.status(500).json({ error: "Failed to set displayed tournament" });
  }
});

adminRouter.put("/:id/clear-displayed", requireAdmin, async (req, res) => {
  try {
    const result = await svc.clearDisplayedTournament();
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] clear-displayed error:", err?.message || err);
    return res.status(500).json({ error: "Failed to clear displayed tournament" });
  }
});

// Public Link management
adminRouter.get("/:id/public-link", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.getPublicLink(id);
    return res.json(result || {});
  } catch (err) {
    console.error("[tournaments] get public link error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get public link" });
  }
});

adminRouter.post("/:id/public-link", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.createPublicLink(id, req.adminUser?.id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] create public link error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create public link" });
  }
});

adminRouter.put("/:id/public-link", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.updatePublicLink(id, req.body, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] update public link error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update public link" });
  }
});

adminRouter.post("/:id/public-link/regenerate", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await svc.regeneratePublicSlug(id, req.adminUser?.id);
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] regenerate slug error:", err?.message || err);
    return res.status(500).json({ error: "Failed to regenerate public slug" });
  }
});

// Public page aliases
adminRouter.put("/:id/public", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    let link = await svc.getPublicLink(id);
    if (!link) {
      link = await svc.createPublicLink(id, req.adminUser?.id);
    }

    const result = await svc.updatePublicLink(id, { is_enabled: req.body.is_public }, req.adminUser?.id);
    if (result?.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] update public error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update public settings" });
  }
});

adminRouter.post("/:id/public/generate-slug", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    let existing = await svc.getPublicLink(id);
    let result;
    if (existing) {
      result = await svc.regeneratePublicSlug(id, req.adminUser?.id);
    } else {
      result = await svc.createPublicLink(id, req.adminUser?.id);
    }
    if (result?.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] generate slug error:", err?.message || err);
    return res.status(500).json({ error: "Failed to generate public slug" });
  }
});

// Audit
adminRouter.get("/:id/audit", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);

    const result = await svc.getAuditLog(id, { limit, offset });
    if (result?.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({ logs: Array.isArray(result) ? result : [] });
  } catch (err) {
    console.error("[tournaments] audit log error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get audit log" });
  }
});

// --------------- Admin Voting Routes ---------------

// Vote Days CRUD
adminRouter.get("/:id/vote-days", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.listVoteDays(id);
    return res.json({ days: Array.isArray(result) ? result : [] });
  } catch (err) {
    console.error("[tournaments] list vote days error:", err?.message || err);
    return res.status(500).json({ error: "Failed to list vote days" });
  }
});

adminRouter.post("/:id/vote-days", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.createVoteDay(id, req.body, req.adminUser?.id);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] create vote day error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create vote day" });
  }
});

// Quick-create vote day for today (Kyiv 9:00-10:00, open, with default assets)
adminRouter.post("/:id/vote-days/quick-today", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.quickCreateToday(id, req.adminUser?.id);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] quick create vote day error:", err?.message || err);
    return res.status(500).json({ error: "Failed to quick-create vote day" });
  }
});

adminRouter.get("/:id/vote-days/:dayId", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(dayId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.getVoteDay(dayId);
    if (!result) return res.status(404).json({ error: "Vote day not found" });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] get vote day error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get vote day" });
  }
});

adminRouter.put("/:id/vote-days/:dayId", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(dayId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.updateVoteDay(dayId, req.body, req.adminUser?.id);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] update vote day error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update vote day" });
  }
});

// Vote Assets
adminRouter.post("/:id/vote-days/:dayId/assets", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(dayId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.createVoteAsset(dayId, req.body);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] create vote asset error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create vote asset" });
  }
});

adminRouter.put("/:id/vote-days/:dayId/assets/:assetId", requireAdmin, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(assetId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.updateVoteAsset(assetId, req.body);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] update vote asset error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update vote asset" });
  }
});

adminRouter.delete("/:id/vote-days/:dayId/assets/:assetId", requireAdmin, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(assetId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.deleteVoteAsset(assetId);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] delete vote asset error:", err?.message || err);
    return res.status(500).json({ error: "Failed to delete vote asset" });
  }
});

// Default Assets (per-tournament configurable defaults)
adminRouter.get("/:id/default-assets", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.listDefaultAssets(id);
    return res.json({ assets: result });
  } catch (err) {
    console.error("[tournaments] list default assets error:", err?.message || err);
    return res.status(500).json({ error: "Failed to list default assets" });
  }
});

adminRouter.post("/:id/default-assets", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.createDefaultAsset(id, req.body);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] create default asset error:", err?.message || err);
    return res.status(500).json({ error: "Failed to create default asset" });
  }
});

adminRouter.put("/:id/default-assets/:assetId", requireAdmin, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(assetId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.updateDefaultAsset(assetId, req.body);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] update default asset error:", err?.message || err);
    return res.status(500).json({ error: "Failed to update default asset" });
  }
});

adminRouter.delete("/:id/default-assets/:assetId", requireAdmin, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(assetId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.deleteDefaultAsset(assetId);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] delete default asset error:", err?.message || err);
    return res.status(500).json({ error: "Failed to delete default asset" });
  }
});

// Vote viewing
adminRouter.get("/:id/vote-days/:dayId/votes", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(dayId)) return res.status(400).json({ error: "Bad id" });
    const { search } = req.query;
    const result = await voting.getVotesForDay(dayId, { search: search || null });
    return res.json({ votes: Array.isArray(result) ? result : [] });
  } catch (err) {
    console.error("[tournaments] get votes error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get votes" });
  }
});

// Delete individual vote
adminRouter.delete("/:id/vote-days/:dayId/votes/:voteId", requireAdmin, async (req, res) => {
  try {
    const voteId = Number(req.params.voteId);
    if (!Number.isFinite(voteId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.deleteVote(voteId, req.adminUser?.id);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] delete vote error:", err?.message || err);
    return res.status(500).json({ error: "Failed to delete vote" });
  }
});

// Invalidate (reset) vote — allows same nickname/IP to vote again
adminRouter.post("/:id/vote-days/:dayId/votes/:voteId/invalidate", requireAdmin, async (req, res) => {
  try {
    const voteId = Number(req.params.voteId);
    if (!Number.isFinite(voteId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.invalidateVote(voteId, req.adminUser?.id);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] invalidate vote error:", err?.message || err);
    return res.status(500).json({ error: "Failed to invalidate vote" });
  }
});

// Delete vote day
adminRouter.delete("/:id/vote-days/:dayId", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(dayId)) return res.status(400).json({ error: "Bad id" });
    const result = await voting.deleteVoteDay(dayId, req.adminUser?.id);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[tournaments] delete vote day error:", err?.message || err);
    return res.status(500).json({ error: "Failed to delete vote day" });
  }
});

// Resolve / Re-resolve day
adminRouter.post("/:id/vote-days/:dayId/resolve", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(dayId)) return res.status(400).json({ error: "Bad id" });
    const { outcomes, pointsMultiplier } = req.body || {};
    if (!Array.isArray(outcomes) || outcomes.length === 0) {
      return res.status(400).json({ error: "outcomes array is required" });
    }
    const result = await voting.resolveDay(dayId, outcomes, req.adminUser?.id, { pointsMultiplier });
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] resolve day error:", err?.message || err);
    return res.status(500).json({ error: "Failed to resolve day" });
  }
});

adminRouter.post("/:id/vote-days/:dayId/re-resolve", requireAdmin, async (req, res) => {
  try {
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(dayId)) return res.status(400).json({ error: "Bad id" });
    const { outcomes, pointsMultiplier } = req.body || {};
    if (!Array.isArray(outcomes) || outcomes.length === 0) {
      return res.status(400).json({ error: "outcomes array is required" });
    }
    const result = await voting.reResolveDay(dayId, outcomes, req.adminUser?.id, { pointsMultiplier });
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] re-resolve day error:", err?.message || err);
    return res.status(500).json({ error: "Failed to re-resolve day" });
  }
});

// Manual vote addition
adminRouter.post("/:id/vote-days/:dayId/manual-vote", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dayId = Number(req.params.dayId);
    if (!Number.isFinite(id) || !Number.isFinite(dayId)) return res.status(400).json({ error: "Bad id" });
    const { nickname, selections } = req.body || {};
    if (!nickname?.trim()) return res.status(400).json({ error: "nickname is required" });
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: "selections array is required" });
    }
    const result = await voting.addManualVote(id, dayId, nickname, selections, req.adminUser?.id);
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] manual vote error:", err?.message || err);
    return res.status(500).json({ error: "Failed to add manual vote" });
  }
});

// Voting exports
adminRouter.get("/:id/exports/votes", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const data = await voting.exportVotes(id);
    return res.json({ data });
  } catch (err) {
    console.error("[tournaments] export votes error:", err?.message || err);
    return res.status(500).json({ error: "Failed to export votes" });
  }
});

adminRouter.get("/:id/exports/resolved-results", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const data = await voting.exportResolvedResults(id);
    return res.json({ data });
  } catch (err) {
    console.error("[tournaments] export resolved results error:", err?.message || err);
    return res.status(500).json({ error: "Failed to export resolved results" });
  }
});

adminRouter.get("/:id/exports/leaderboard", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const data = await voting.exportLeaderboard(id);
    return res.json({ data });
  } catch (err) {
    console.error("[tournaments] export leaderboard error:", err?.message || err);
    return res.status(500).json({ error: "Failed to export leaderboard" });
  }
});

// --------------- Public Routes ---------------

publicRouter.get("/:publicSlug", async (req, res) => {
  try {
    const { publicSlug } = req.params;
    if (!publicSlug) {
      return res.status(400).json({ error: "Public slug is required" });
    }

    const result = await svc.getPublicTournamentBySlug(publicSlug);
    if (!result) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    if (result.error) {
      const status = result.error === "Tournament not found" ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] public get error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get tournament" });
  }
});

publicRouter.get("/:publicSlug/leaderboard", async (req, res) => {
  try {
    const { publicSlug } = req.params;
    if (!publicSlug) {
      return res.status(400).json({ error: "Public slug is required" });
    }

    const data = await svc.getPublicTournamentBySlug(publicSlug);
    if (!data) {
      return res.status(404).json({ error: "Tournament not found" });
    }
    return res.json({
      leaderboard: data.participants || [],
      recentChanges: data.recentChanges || [],
    });
  } catch (err) {
    console.error("[tournaments] public leaderboard error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

publicRouter.get("/:publicSlug/participants/:participantId/history", async (req, res) => {
  try {
    const { publicSlug, participantId } = req.params;
    if (!publicSlug) return res.status(400).json({ error: "Public slug is required" });

    const pId = Number(participantId);
    if (!Number.isFinite(pId)) return res.status(400).json({ error: "Bad participant id" });

    // Verify tournament is public
    const data = await svc.getPublicTournamentBySlug(publicSlug);
    if (!data) return res.status(404).json({ error: "Tournament not found" });

    // Verify participant belongs to this tournament and is not hidden
    const participant = (data.participants || []).find((p) => p.id === pId);
    if (!participant) return res.status(404).json({ error: "Participant not found" });

    const result = await svc.getParticipantPointsHistory(data.tournament.id, pId, { limit: 200 });
    return res.json({
      participant,
      logs: result.logs || [],
    });
  } catch (err) {
    console.error("[tournaments] public participant history error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get participant history" });
  }
});

// Public Voting endpoints
publicRouter.get("/:publicSlug/vote-config", async (req, res) => {
  try {
    const { publicSlug } = req.params;
    if (!publicSlug) return res.status(400).json({ error: "Public slug is required" });
    const result = await voting.getPublicVoteConfig(publicSlug);
    if (!result) return res.status(404).json({ error: "Tournament not found" });
    // Strip internal tournament ID and actual password from public response
    const { id, vote_password, ...publicTournament } = result.tournament;
    return res.json({ ...result, tournament: publicTournament });
  } catch (err) {
    console.error("[tournaments] public vote config error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get vote config" });
  }
});

// Vote config for a specific day (by vote_token)
publicRouter.get("/:publicSlug/vote-config/:voteToken", async (req, res) => {
  try {
    const { publicSlug, voteToken } = req.params;
    if (!publicSlug || !voteToken) return res.status(400).json({ error: "Slug and vote token are required" });
    const result = await voting.getPublicVoteConfigByToken(publicSlug, voteToken);
    if (!result) return res.status(404).json({ error: "Tournament not found" });
    // Strip internal tournament ID and actual password from public response
    const { id, vote_password, ...publicTournament } = result.tournament;
    return res.json({ ...result, tournament: publicTournament });
  } catch (err) {
    console.error("[tournaments] public vote config by token error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get vote config" });
  }
});

publicRouter.get("/:publicSlug/vote-day/current", async (req, res) => {
  try {
    const { publicSlug } = req.params;
    if (!publicSlug) return res.status(400).json({ error: "Public slug is required" });
    const result = await voting.getCurrentVoteDay(publicSlug);
    return res.json(result || { day: null, assets: [] });
  } catch (err) {
    console.error("[tournaments] public current vote day error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get current vote day" });
  }
});

publicRouter.post("/:publicSlug/vote", voteRateLimit, async (req, res) => {
  try {
    const { publicSlug } = req.params;
    if (!publicSlug) return res.status(400).json({ error: "Public slug is required" });

    // Look up tournament via public slug
    const config = await voting.getPublicVoteConfig(publicSlug);
    if (!config) return res.status(404).json({ error: "Tournament not found" });

    const { nickname, selections, vote_password: submittedPassword } = req.body || {};
    if (!nickname || typeof nickname !== "string" || !nickname.trim()) {
      return res.status(400).json({ error: "nickname is required" });
    }
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: "selections array is required" });
    }

    if (!config.currentDay) {
      return res.status(400).json({ error: "No active voting day" });
    }

    // Check vote password if set (constant-time comparison)
    if (config.tournament.vote_password) {
      if (!safeEqualString(submittedPassword || "", config.tournament.vote_password)) {
        return res.status(403).json({ error: "invalid_vote_password" });
      }
    }

    // Collect IP and device info for logging
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
    const ipHash = ip ? Buffer.from(ip).toString("base64").slice(0, 20) : null;
    const userAgent = req.headers["user-agent"] || null;

    const result = await voting.submitVote(
      config.tournament.id,
      config.currentDay.id,
      nickname.trim(),
      selections,
      { ip_hash: ipHash, fingerprint: req.body.fingerprint || null, user_agent: userAgent }
    );

    if (result?.error) {
      const statusCode = (result.error === "already_voted" || result.error === "ip_already_voted") ? 409 : 400;
      return res.status(statusCode).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] public vote error:", err?.message || err);
    return res.status(500).json({ error: "Failed to submit vote" });
  }
});

// Submit vote for a specific day (by vote_token)
publicRouter.post("/:publicSlug/vote/:voteToken", voteRateLimit, async (req, res) => {
  try {
    const { publicSlug, voteToken } = req.params;
    if (!publicSlug || !voteToken) return res.status(400).json({ error: "Slug and vote token are required" });

    const config = await voting.getPublicVoteConfigByToken(publicSlug, voteToken);
    if (!config) return res.status(404).json({ error: "Tournament not found" });

    const { nickname, selections, vote_password: submittedPassword } = req.body || {};
    if (!nickname || typeof nickname !== "string" || !nickname.trim()) {
      return res.status(400).json({ error: "nickname is required" });
    }
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: "selections array is required" });
    }

    if (!config.currentDay) {
      return res.status(400).json({ error: "No voting day found for this link" });
    }

    if (!config.currentDay.is_voting_open) {
      return res.status(400).json({ error: "voting_window_closed" });
    }

    // Check vote password if set (constant-time comparison)
    if (config.tournament.vote_password) {
      if (!safeEqualString(submittedPassword || "", config.tournament.vote_password)) {
        return res.status(403).json({ error: "invalid_vote_password" });
      }
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
    const ipHash = ip ? Buffer.from(ip).toString("base64").slice(0, 20) : null;
    const userAgent = req.headers["user-agent"] || null;

    const result = await voting.submitVote(
      config.tournament.id,
      config.currentDay.id,
      nickname.trim(),
      selections,
      { ip_hash: ipHash, fingerprint: req.body.fingerprint || null, user_agent: userAgent }
    );

    if (result?.error) {
      const statusCode = (result.error === "already_voted" || result.error === "ip_already_voted") ? 409 : 400;
      return res.status(statusCode).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] public vote by token error:", err?.message || err);
    return res.status(500).json({ error: "Failed to submit vote" });
  }
});

// Public voting leaderboard (using cache)
publicRouter.get("/:publicSlug/vote-leaderboard", async (req, res) => {
  try {
    const { publicSlug } = req.params;
    if (!publicSlug) return res.status(400).json({ error: "Public slug is required" });
    const result = await voting.getPublicLeaderboard(publicSlug);
    if (!result) return res.status(404).json({ error: "Tournament not found" });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] public vote leaderboard error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

// Public vote day links (open + upcoming days for voting navigation)
publicRouter.get("/:publicSlug/vote-day-links", async (req, res) => {
  try {
    const { publicSlug } = req.params;
    if (!publicSlug) return res.status(400).json({ error: "Public slug is required" });
    const result = await voting.getPublicVoteDayLinks(publicSlug);
    if (!result) return res.status(404).json({ error: "Tournament not found" });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] public vote day links error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get vote day links" });
  }
});

// Public resolved voting days (with all votes for expandable view)
publicRouter.get("/:publicSlug/vote-days-public", async (req, res) => {
  try {
    const { publicSlug } = req.params;
    if (!publicSlug) return res.status(400).json({ error: "Public slug is required" });
    const result = await voting.getPublicResolvedDays(publicSlug);
    if (!result) return res.status(404).json({ error: "Tournament not found" });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] public resolved days error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get resolved days" });
  }
});

// Public participant day history
publicRouter.get("/:publicSlug/participant/:nickname/history", async (req, res) => {
  try {
    const { publicSlug, nickname } = req.params;
    if (!publicSlug || !nickname) return res.status(400).json({ error: "Slug and nickname are required" });
    const result = await voting.getParticipantDayHistory(publicSlug, decodeURIComponent(nickname));
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json({ days: result });
  } catch (err) {
    console.error("[tournaments] public participant history error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get participant history" });
  }
});

// Public participant specific day detail
publicRouter.get("/:publicSlug/participant/:nickname/day/:dayId", async (req, res) => {
  try {
    const { publicSlug, nickname, dayId } = req.params;
    if (!publicSlug || !nickname) return res.status(400).json({ error: "Slug and nickname are required" });
    const dId = Number(dayId);
    if (!Number.isFinite(dId)) return res.status(400).json({ error: "Bad day id" });
    const result = await voting.getParticipantDayDetail(publicSlug, decodeURIComponent(nickname), dId);
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] public participant day detail error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get day detail" });
  }
});

// --------------- User Routes (auth required, not admin) ---------------

userRouter.get("/active", requireAuth, async (req, res) => {
  try {
    const data = await svc.getDisplayedTournament();
    if (!data) {
      return res.json({ tournament: null, leaderboard: [] });
    }
    return res.json(data);
  } catch (err) {
    console.error("[tournaments] get displayed error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get displayed tournament" });
  }
});

// Participant day history for the active (displayed) tournament
userRouter.get("/active/participant/:nickname/history", requireAuth, async (req, res) => {
  try {
    const { nickname } = req.params;
    if (!nickname) return res.status(400).json({ error: "Nickname is required" });
    const data = await svc.getDisplayedTournament();
    if (!data?.tournament?.id) return res.status(404).json({ error: "No active tournament" });
    const result = await voting.getParticipantDayHistoryById(data.tournament.id, decodeURIComponent(nickname));
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json({ days: result });
  } catch (err) {
    console.error("[tournaments] user participant history error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get participant history" });
  }
});

// Participant specific day detail for the active (displayed) tournament
userRouter.get("/active/participant/:nickname/day/:dayId", requireAuth, async (req, res) => {
  try {
    const { nickname, dayId } = req.params;
    if (!nickname) return res.status(400).json({ error: "Nickname is required" });
    const dId = Number(dayId);
    if (!Number.isFinite(dId)) return res.status(400).json({ error: "Bad day id" });
    const data = await svc.getDisplayedTournament();
    if (!data?.tournament?.id) return res.status(404).json({ error: "No active tournament" });
    const result = await voting.getParticipantDayDetailById(data.tournament.id, decodeURIComponent(nickname), dId);
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.json(result);
  } catch (err) {
    console.error("[tournaments] user participant day detail error:", err?.message || err);
    return res.status(500).json({ error: "Failed to get day detail" });
  }
});

export { adminRouter, publicRouter, userRouter };
