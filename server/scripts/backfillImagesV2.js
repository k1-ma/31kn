#!/usr/bin/env node
/**
 * Phase 4 backfill: populate state_json_v2 + user_images for existing users.
 *
 * Why: Phase 2 dual-write only fills v2 on the next sync. Users who haven't
 * synced since dual-write was enabled still have an empty state_json_v2.
 * Phase 3 read path falls back to canonical state_json for them, which is
 * safe but means we can't fully retire the v1 path until everyone is on v2.
 *
 * What this script does, per user (one user at a time, no parallelism):
 *   1. SELECT state_json + the v2 status flags.
 *   2. Skip if v2 is already populated and not stale and not stamped failed.
 *   3. Otherwise call writeStateV2() — same code path as production dual-write,
 *      with the same preflight + postwrite verify, the same transactional
 *      rollback. Forces the env gate open via { forceEnabled: true } so the
 *      script works regardless of IMAGE_DUAL_WRITE.
 *   4. Log the outcome.
 *
 * Invariants guaranteed by writeStateV2:
 *   - Original state_json is never touched.
 *   - On any verify mismatch the user_images insert and state_json_v2 update
 *     ROLLBACK as one transaction. state_v2_verify_failed_at gets stamped so
 *     the next read silently falls back to v1.
 *   - Dedup is per-user by sha256, so re-running is safe (no duplicate rows).
 *
 * Usage:
 *
 *   # Dry run — list what would be backfilled, change nothing.
 *   DATABASE_URL=postgres://... node server/scripts/backfillImagesV2.js --dry-run
 *
 *   # Backfill everyone who needs it.
 *   DATABASE_URL=postgres://... node server/scripts/backfillImagesV2.js
 *
 *   # Just a specific user (handy for spot checks).
 *   DATABASE_URL=postgres://... node server/scripts/backfillImagesV2.js --user 5
 *
 *   # Throttle: sleep N ms between users (default 100).
 *   DATABASE_URL=postgres://... node server/scripts/backfillImagesV2.js --sleep 500
 *
 * Resumable: idempotent by design. Killing the process and restarting picks
 * up where you left off because users with a fresh, clean v2 are skipped.
 */

import process from "node:process";
import { createPoolOnly } from "../db.js";
import { writeStateV2 } from "../services/imageStore.service.js";

// Same threshold the read path uses (V2_STALE_MS = 30s in imageStore.service.js).
// We backfill anything that lags more than this; otherwise we trust v2.
const STALE_THRESHOLD_MS = 30_000;

function parseArgs(argv) {
  const args = { dryRun: false, user: null, sleepMs: 100 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--user") args.user = Number(argv[++i]);
    else if (a === "--sleep") args.sleepMs = Number(argv[++i]);
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function ms() { return Date.now(); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function listCandidates(pool, onlyUserId) {
  // Returns rows for users whose v2 needs to be (re)written:
  //   - state_json IS NOT NULL (no point backfilling someone with no state)
  //   - and one of: v2 empty / v2 stale / v2 verify-failed stamp present
  const params = [STALE_THRESHOLD_MS / 1000];
  let where = `state_json IS NOT NULL
              AND (
                state_json_v2 IS NULL
                OR state_v2_verify_failed_at IS NOT NULL
                OR state_v2_updated_at IS NULL
                OR EXTRACT(EPOCH FROM (updated_at - state_v2_updated_at)) > $1
              )`;
  if (onlyUserId != null) {
    params.push(onlyUserId);
    where += ` AND user_id = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT user_id,
            state_json_v2 IS NULL                                  AS v2_empty,
            state_v2_verify_failed_at IS NOT NULL                  AS v2_failed_stamp,
            EXTRACT(EPOCH FROM (updated_at - state_v2_updated_at)) AS lag_s,
            jsonb_array_length(COALESCE(state_json->'trades',     '[]'::jsonb)) AS trades_count,
            jsonb_array_length(COALESCE(state_json->'accounts',   '[]'::jsonb)) AS accounts_count,
            jsonb_array_length(COALESCE(state_json->'documents',  '[]'::jsonb)) AS documents_count,
            jsonb_array_length(COALESCE(state_json->'backtests',  '[]'::jsonb)) AS backtests_count,
            pg_column_size(state_json)                              AS state_size
       FROM states
      WHERE ${where}
      ORDER BY user_id ASC`,
    params
  );
  return r.rows;
}

async function fetchCanonicalState(pool, userId) {
  const r = await pool.query(
    `SELECT state_json FROM states WHERE user_id = $1`,
    [userId]
  );
  return r.rows?.[0]?.state_json ?? null;
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = ms();

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.error("DATABASE_URL not set. Refusing to run.");
    process.exit(2);
  }

  const pool = await createPoolOnly();

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    op: "backfill_start",
    dryRun: args.dryRun,
    onlyUserId: args.user,
    sleepMs: args.sleepMs,
  }));

  let candidates;
  try {
    candidates = await listCandidates(pool, args.user);
  } catch (err) {
    console.error("Failed to list candidates:", err?.message || err);
    process.exit(1);
  }

  console.log(JSON.stringify({
    op: "candidates_listed",
    count: candidates.length,
  }));

  if (candidates.length === 0) {
    console.log("Nothing to backfill. Everyone is on v2 already.");
    await pool.end();
    return;
  }

  // Show a preview line per user so dry-run is readable.
  for (const c of candidates) {
    console.log(JSON.stringify({
      op: "candidate",
      userId: c.user_id,
      v2Empty: c.v2_empty,
      v2FailedStamp: c.v2_failed_stamp,
      lagS: c.lag_s == null ? null : Number(c.lag_s),
      trades: c.trades_count,
      accounts: c.accounts_count,
      documents: c.documents_count,
      backtests: c.backtests_count,
      stateSizeBytes: c.state_size,
    }));
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ op: "dry_run_done", processed: 0, ok: 0, failed: 0 }));
    await pool.end();
    return;
  }

  let okCount = 0;
  let failedCount = 0;
  const failures = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const userId = c.user_id;
    const t0 = ms();

    let canonicalState;
    try {
      canonicalState = await fetchCanonicalState(pool, userId);
    } catch (err) {
      failedCount++;
      failures.push({ userId, reason: "fetch_state_failed", error: err?.message });
      console.log(JSON.stringify({
        op: "user_failed", userId, reason: "fetch_state_failed", error: err?.message,
      }));
      continue;
    }

    if (canonicalState == null) {
      // state_json was nulled between the listing query and now — skip.
      console.log(JSON.stringify({ op: "user_skipped", userId, reason: "state_null" }));
      continue;
    }

    let result;
    try {
      result = await writeStateV2({
        pool,
        userId,
        canonicalState,
        statementTimeout: "60s",   // big stock states can take a while
        forceEnabled: true,
      });
    } catch (err) {
      // writeStateV2 doesn't throw, but defensive guard.
      result = { ok: false, reason: "exception", error: err?.message };
    }

    const elapsedMs = ms() - t0;
    if (result?.ok) {
      okCount++;
      console.log(JSON.stringify({
        op: "user_ok",
        userId,
        elapsedMs,
        progress: `${i + 1}/${candidates.length}`,
        stats: result.stats,
      }));
    } else {
      failedCount++;
      failures.push({ userId, reason: result?.reason, error: result?.error });
      console.log(JSON.stringify({
        op: "user_failed",
        userId,
        elapsedMs,
        progress: `${i + 1}/${candidates.length}`,
        reason: result?.reason,
        stats: result?.stats,
      }));
    }

    if (args.sleepMs > 0 && i < candidates.length - 1) {
      await sleep(args.sleepMs);
    }
  }

  const totalMs = ms() - startedAt;
  console.log(JSON.stringify({
    op: "backfill_done",
    totalMs,
    candidates: candidates.length,
    ok: okCount,
    failed: failedCount,
    failures,
  }));

  // Final verification query for the operator:
  const verify = await pool.query(
    `SELECT count(*) AS total,
            count(state_json_v2) AS v2,
            count(state_v2_verify_failed_at) AS verify_failed
       FROM states
      WHERE state_json IS NOT NULL`
  );
  console.log(JSON.stringify({
    op: "post_backfill_verify",
    total: Number(verify.rows[0].total),
    v2: Number(verify.rows[0].v2),
    verify_failed: Number(verify.rows[0].verify_failed),
  }));

  await pool.end();
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
