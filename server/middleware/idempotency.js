// HTTP-level idempotency middleware.
//
// Behaviour:
//   - Only intercepts POST/PUT/PATCH/DELETE. Other methods pass through.
//   - If no Idempotency-Key header: pass through (do NOT 400). Wired-up
//     gradually; legacy clients without the header must still work.
//   - If header is present but malformed: pass through with a warn log.
//   - If header is present and valid:
//       1. Acquire a Postgres advisory lock keyed on sha256(key|method|path)
//          inside a SHORT-lived transaction. Lookup the cache.
//       2. Cache hit → replay status + response_body. Done.
//       3. Cache miss → release lock, run handler, capture response,
//          INSERT into idempotency_keys ON CONFLICT (key) DO NOTHING when
//          the response finishes (only for 2xx — see shouldCacheStatus).
//
// res.json patch chain:
//   This middleware patches res.json. server/middleware/metrics.js (a global
//   middleware applied earlier in the chain) ALSO patches res.json. Express
//   nests these patches naturally — handler → idempotency.json → metrics.json
//   → express.json — so both layers get a turn. We always call the *prior*
//   value of res.json (which is whatever was on res when we patched), so the
//   metrics layer keeps recording byte counts.
//
// Failures are non-blocking:
//   If the middleware itself throws (DB unavailable, lock timeout, etc.) we
//   log and FALL THROUGH to the handler. An idempotency layer bug must not
//   block legitimate writes.

import crypto from "node:crypto";
import { getPool } from "../services/db.service.js";

// UUID v1-v5 (case-insensitive). crypto.randomUUID() emits v4.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Methods we intercept. GET/HEAD/OPTIONS pass through.
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Response status codes worth caching. Only 2xx is cached: caching 4xx
// produced "zombie" idempotency entries (e.g. a 409 version conflict on
// PUT /api/state would replay the conflict on retry, even after the client
// re-fetched and reconciled). 5xx is always transient — never cache.
function shouldCacheStatus(status) {
  return status >= 200 && status < 300;
}

// Hash (key|method|path) → two int32 for pg_advisory_xact_lock(int4, int4).
// We need *signed* int32 because Postgres int4 is signed. Buffer.readInt32BE
// returns a signed 32-bit interpretation, which is what we want.
function advisoryLockArgs(key, method, path) {
  const hash = crypto
    .createHash("sha256")
    .update(`${key}|${method}|${path}`)
    .digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

export function idempotency() {
  return async function idempotencyMiddleware(req, res, next) {
    if (!MUTATION_METHODS.has(req.method)) return next();

    const key = req.get("Idempotency-Key");
    if (!key) {
      // No header — pass through. Logged at debug level only to keep the
      // signal-to-noise reasonable while we roll this out gradually.
      // (Most legacy callers will not send the header until the frontend
      // patch is fully deployed.)
      return next();
    }
    if (!UUID_RE.test(key)) {
      console.warn(
        `[idempotency] invalid Idempotency-Key on ${req.method} ${req.path}: ${key.slice(0, 64)}`
      );
      return next();
    }

    const pool = getPool();
    if (!pool) {
      // DB down — let the request through and let downstream middleware
      // (ensureDb) handle the 503 response. We are intentionally never the
      // reason a request fails.
      return next();
    }

    const userId = req.session?.userId ?? null;
    const method = req.method;
    const path = req.path;

    // ── Cache-check phase ──────────────────────────────────────────────
    // Short transaction: acquire the advisory lock, look up, commit. Lock
    // releases on commit. We do NOT hold the lock across the handler —
    // serial retries (the 99% case) still benefit because the cache row
    // is committed before the next retry arrives. Truly concurrent retries
    // may both proceed; in practice the underlying writes are idempotent
    // (PUT /api/state uses ON CONFLICT, ideas POST is at worst a duplicate
    // row that the next idempotency check would prevent on later retries).
    let cachedRow = null;
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const [k1, k2] = advisoryLockArgs(key, method, path);
        await client.query("SELECT pg_advisory_xact_lock($1, $2)", [k1, k2]);
        const result = await client.query(
          `SELECT status_code, response_body
             FROM idempotency_keys
             WHERE key = $1 AND expires_at > now()
             LIMIT 1`,
          [key]
        );
        cachedRow = result.rows?.[0] ?? null;
        await client.query("COMMIT");
      } catch (innerErr) {
        try { await client.query("ROLLBACK"); } catch {}
        throw innerErr;
      } finally {
        client.release();
      }
    } catch (err) {
      // Cache lookup failed — log and fall through. Never block the handler.
      console.warn(
        `[idempotency] cache lookup failed on ${method} ${path}: ${err?.message || err}`
      );
      return next();
    }

    if (cachedRow) {
      // Cache hit — replay.
      console.log(
        `[idempotency] replay ${method} ${path} key=${key.slice(0, 8)}… status=${cachedRow.status_code}`
      );
      return res
        .status(cachedRow.status_code)
        .json(cachedRow.response_body);
    }

    // ── Capture phase ──────────────────────────────────────────────────
    // Patch res.json to capture the body before it's serialized. Capture
    // the *current* res.json (which may already be patched by metrics.js)
    // and call it through, so the metrics layer keeps working.
    const priorJson = res.json.bind(res);
    let captured = false;
    let capturedBody;
    let capturedStatus;
    res.json = function patchedJson(body) {
      if (!captured) {
        captured = true;
        capturedBody = body;
        capturedStatus = res.statusCode || 200;
      }
      return priorJson(body);
    };

    // After response finishes, persist the cache entry. Use 'finish' (the
    // body fully flushed) rather than 'close' (which fires on aborted
    // connections too — we don't want to cache a half-sent response).
    res.on("finish", () => {
      if (!captured) return;
      const status = capturedStatus;
      if (!shouldCacheStatus(status)) return;
      // Body must be JSON-serializable for the JSONB column. The handlers
      // in scope all use res.json with plain objects, so this is safe.
      pool
        .query(
          `INSERT INTO idempotency_keys
             (key, user_id, method, path, status_code, response_body, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() + interval '24 hours')
           ON CONFLICT (key) DO NOTHING`,
          [key, userId, method, path, status, capturedBody ?? null]
        )
        .catch((err) => {
          console.warn(
            `[idempotency] cache insert failed on ${method} ${path}: ${err?.message || err}`
          );
        });
    });

    return next();
  };
}
