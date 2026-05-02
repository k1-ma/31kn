// ─────────────────────────────────────────────────────────────────────────────
// IMAGE STORE SERVICE (Phase 1 of base64-out-of-state migration)
//
// Thin DB layer around the user_images table and the state_json_v2 column on
// states. Pure side-effects; pure helpers (extract/inline/hash) live in
// utils/imageExtraction.js.
//
// Phase 1: nothing wires this in yet. Phase 2 calls writeStateV2() from the
// chunked-sync and PUT /api/state finalizers, gated by IMAGE_DUAL_WRITE.
// ─────────────────────────────────────────────────────────────────────────────

import {
  extractImagesFromState,
  inlineImagesIntoState,
  jsonDeepEqual,
} from "../utils/imageExtraction.js";

export const IMAGE_DUAL_WRITE_ENABLED = String(process.env.IMAGE_DUAL_WRITE || "")
  .trim() === "1";

function logImg(op, userId, details = {}) {
  console.log(
    `[imageStore] ${JSON.stringify({ ts: new Date().toISOString(), op, userId, ...details })}`
  );
}

/**
 * Bulk-insert (or update last_used_at on hit) the supplied images for one
 * user. Sha256 dedup is applied PER USER: if a row with the same
 * (user_id, sha256) already exists, we reuse its image_id and rewrite the
 * supplied state-with-refs to point at the existing row instead.
 *
 * Returns the (possibly rewritten) state and a count of images actually
 * inserted vs deduped.
 *
 * Done in one transaction, on a dedicated client, so a partial failure
 * leaves user_images untouched and the caller can fall back to the
 * canonical state_json path.
 */
export async function persistImagesAndRewriteState(client, userId, stateWithRefs, imagesById) {
  const ids = Object.keys(imagesById);
  if (ids.length === 0) {
    return { state: stateWithRefs, inserted: 0, deduped: 0 };
  }

  // 1. Look up existing rows by sha256 in a single query.
  const shaList = ids.map((id) => imagesById[id].sha256);
  const existing = await client.query(
    `SELECT image_id, sha256
       FROM user_images
      WHERE user_id = $1
        AND sha256 = ANY($2::text[])`,
    [userId, shaList]
  );
  const existingByHash = new Map();
  for (const row of existing.rows) {
    if (!existingByHash.has(row.sha256)) existingByHash.set(row.sha256, row.image_id);
  }

  // 2. Build id-rewrite map: new_id -> existing_id (when sha256 already present).
  const idRewrite = new Map();
  const toInsert = [];
  for (const id of ids) {
    const img = imagesById[id];
    const existingId = existingByHash.get(img.sha256);
    if (existingId) {
      idRewrite.set(id, existingId);
    } else {
      toInsert.push(img);
    }
  }

  // 3. Insert new rows. Multi-row INSERT keeps the round-trip count down.
  if (toInsert.length > 0) {
    const values = [];
    const params = [];
    let p = 1;
    for (const img of toInsert) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(
        userId,
        img.id,
        img.contentType,
        Buffer.from(img.base64, "base64"),
        img.sha256,
        img.byteSize
      );
    }
    await client.query(
      `INSERT INTO user_images (user_id, image_id, content_type, data, sha256, byte_size)
       VALUES ${values.join(",")}
       ON CONFLICT (user_id, image_id) DO UPDATE SET last_used_at = now()`,
      params
    );
  }

  // 4. Touch last_used_at on the deduped existing rows so GC keeps them alive.
  if (idRewrite.size > 0) {
    const touchedIds = Array.from(new Set(idRewrite.values()));
    await client.query(
      `UPDATE user_images SET last_used_at = now()
        WHERE user_id = $1 AND image_id = ANY($2::text[])`,
      [userId, touchedIds]
    );
  }

  // 5. Walk state and rewrite any ref whose id was deduped.
  let rewrittenState = stateWithRefs;
  if (idRewrite.size > 0) {
    rewrittenState = remapRefs(stateWithRefs, idRewrite);
  }

  return {
    state: rewrittenState,
    inserted: toInsert.length,
    deduped: idRewrite.size,
  };
}

function remapRefs(node, idRewrite) {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((x) => remapRefs(x, idRewrite));
  if (typeof node.__imgRef === "string") {
    const next = idRewrite.get(node.__imgRef);
    if (next) return { ...node, __imgRef: next };
    return node;
  }
  const out = {};
  for (const k of Object.keys(node)) {
    out[k] = remapRefs(node[k], idRewrite);
  }
  return out;
}

/**
 * Phase-2 entry point: take the canonical state we are about to write,
 * extract images into user_images, store the rewritten state in
 * states.state_json_v2, and verify round-trip equality.
 *
 * Returns { ok, reason, stats }. NEVER throws — image-pipeline failure
 * MUST NOT block the canonical state_json write that the caller already
 * made (or is about to make).
 *
 * On `ok: false` the caller leaves state_json_v2 alone and the next read
 * stays on the canonical path.
 */
export async function writeStateV2({ pool, userId, canonicalState, statementTimeout }) {
  if (!IMAGE_DUAL_WRITE_ENABLED) {
    return { ok: false, reason: "disabled", stats: null };
  }
  if (canonicalState == null || typeof canonicalState !== "object") {
    return { ok: false, reason: "invalid_state", stats: null };
  }

  let extracted;
  try {
    extracted = extractImagesFromState(canonicalState);
  } catch (err) {
    logImg("extract_failed", userId, { error: err?.message });
    return { ok: false, reason: "extract_failed", stats: null };
  }

  // Pre-flight verify: rebuild from the in-memory map BEFORE touching DB,
  // to catch any pure-logic mismatch before we burn a write.
  let preflight;
  try {
    preflight = inlineImagesIntoState(extracted.state, extracted.images);
  } catch (err) {
    logImg("preflight_inline_failed", userId, { error: err?.message });
    return { ok: false, reason: "preflight_inline_failed", stats: null };
  }
  if (preflight.missingRefs.length > 0 || !jsonDeepEqual(preflight.state, canonicalState)) {
    logImg("preflight_verify_failed", userId, {
      missingRefs: preflight.missingRefs.length,
      severity: "CRITICAL",
    });
    return { ok: false, reason: "preflight_verify_failed", stats: null };
  }

  const client = await pool.connect();
  try {
    if (statementTimeout) {
      await client.query(`SET statement_timeout = '${statementTimeout}'`).catch(() => {});
    }
    await client.query("BEGIN");

    const { state: rewrittenState, inserted, deduped } = await persistImagesAndRewriteState(
      client,
      userId,
      extracted.state,
      extracted.images
    );

    // Post-DB verify: re-read the persisted images back so we know the BYTEA
    // round-trips through Postgres, not just through our in-memory map.
    //
    // PostgreSQL's encode(bytea, 'base64') follows RFC 2045 and inserts a '\n'
    // every 76 characters. Browsers send (and parseDataUrl produces) base64
    // without line breaks, so we strip whitespace on read-back to compare
    // apples-to-apples. We could also do this in SQL via translate(...) but
    // keeping it in JS makes the fix obvious and keeps the SQL simple.
    const refIdSet = collectRefIds(rewrittenState);
    let imageMap = {};
    if (refIdSet.size > 0) {
      const refIds = Array.from(refIdSet);
      const fetched = await client.query(
        `SELECT image_id, content_type, encode(data, 'base64') AS base64
           FROM user_images
          WHERE user_id = $1 AND image_id = ANY($2::text[])`,
        [userId, refIds]
      );
      for (const row of fetched.rows) {
        imageMap[row.image_id] = {
          contentType: row.content_type,
          base64: String(row.base64 || "").replace(/\s+/g, ""),
        };
      }
    }

    const verify = inlineImagesIntoState(rewrittenState, imageMap);
    if (verify.missingRefs.length > 0 || !jsonDeepEqual(verify.state, canonicalState)) {
      await client.query("ROLLBACK");
      await pool
        .query(
          `UPDATE states SET state_v2_verify_failed_at = now() WHERE user_id = $1`,
          [userId]
        )
        .catch(() => {});
      logImg("postwrite_verify_failed", userId, {
        missingRefs: verify.missingRefs.length,
        inserted,
        deduped,
        severity: "CRITICAL",
      });
      return { ok: false, reason: "postwrite_verify_failed", stats: { inserted, deduped } };
    }

    await client.query(
      `UPDATE states
          SET state_json_v2 = $1::jsonb,
              state_v2_updated_at = now(),
              state_v2_verify_failed_at = NULL
        WHERE user_id = $2`,
      [JSON.stringify(rewrittenState), userId]
    );

    await client.query("COMMIT");

    logImg("v2_write_ok", userId, {
      inserted,
      deduped,
      refs: extracted.refCount,
      uniqueImages: extracted.extractedCount,
    });

    return {
      ok: true,
      reason: "ok",
      stats: { inserted, deduped, refs: extracted.refCount, uniqueImages: extracted.extractedCount },
    };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    logImg("v2_write_failed", userId, { error: err?.message });
    return { ok: false, reason: "exception", stats: null };
  } finally {
    if (statementTimeout) {
      await client.query(`SET statement_timeout = DEFAULT`).catch(() => {});
    }
    client.release();
  }
}

function collectRefIds(node, out = new Set()) {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const v of node) collectRefIds(v, out);
    return out;
  }
  if (typeof node.__imgRef === "string") {
    out.add(node.__imgRef);
    return out;
  }
  for (const k of Object.keys(node)) collectRefIds(node[k], out);
  return out;
}
