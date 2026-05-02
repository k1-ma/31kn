// ─────────────────────────────────────────────────────────────────────────────
// IMAGE EXTRACTION UTILITIES (Phase 1 of base64-out-of-state migration)
//
// Pure helpers: walk a state object, replace every base64 data-URL string
// with a small reference object, and return both the rewritten state and a
// map of extracted images. Inverse helper rehydrates a rewritten state by
// inlining base64 strings from the supplied image map.
//
// Round-trip invariant (verified by unit tests and by the runtime
// dual-write verify step):
//
//     inline(extract(s).state, extract(s).images) ≡ s
//
// These helpers are intentionally side-effect free. DB I/O lives in
// services/imageStore.service.js.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomUUID } from "crypto";

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9+.\-]+);base64,([A-Za-z0-9+/=\s]+)$/;
const REF_KEY = "__imgRef";
const REF_VERSION = 1;

export function isDataUrlImage(value) {
  return typeof value === "string" && DATA_URL_RE.test(value);
}

export function isImageRef(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value[REF_KEY] === "string" &&
    value[REF_KEY].length > 0
  );
}

export function parseDataUrl(dataUrl) {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  // Strip whitespace (some clients line-wrap base64).
  const base64 = m[2].replace(/\s+/g, "");
  return { contentType: m[1], base64 };
}

export function hashImageBase64(base64) {
  return createHash("sha256").update(base64, "base64").digest("hex");
}

export function newImageId() {
  // Short-ish but globally unique, prefixed for log readability.
  return `img_${randomUUID()}`;
}

/**
 * Walk an arbitrary value tree. For every base64 image string found, emit a
 * reference object and remember the original payload in `images`.
 *
 * Idempotent: if the input already contains __imgRef objects, they are left
 * intact and counted as references — extracting an already-extracted state
 * returns the same state and an empty image map (so verify-loop is stable
 * across repeated runs).
 *
 * Deduplicates by sha256 within a single extraction so two trades sharing the
 * same screenshot only produce one row.
 *
 * @param {*} root The state tree (any JSON-serializable value).
 * @returns {{ state: any, images: Record<string, { id: string, contentType: string, base64: string, sha256: string, byteSize: number }>, refCount: number, extractedCount: number }}
 */
export function extractImagesFromState(root) {
  const images = Object.create(null);
  const seenBySha = new Map();
  let refCount = 0;
  let extractedCount = 0;

  const walk = (node) => {
    if (node == null) return node;
    if (typeof node === "string") {
      if (!isDataUrlImage(node)) return node;
      const parsed = parseDataUrl(node);
      if (!parsed) return node;
      const sha256 = hashImageBase64(parsed.base64);

      let id = seenBySha.get(sha256);
      if (!id) {
        id = newImageId();
        seenBySha.set(sha256, id);
        // base64 payload kept as-is (no whitespace) so the consumer can write
        // it directly to BYTEA via Buffer.from(base64, 'base64').
        images[id] = {
          id,
          contentType: parsed.contentType,
          base64: parsed.base64,
          sha256,
          byteSize: Math.floor((parsed.base64.length * 3) / 4),
        };
        extractedCount++;
      }
      refCount++;
      return { [REF_KEY]: id, v: REF_VERSION };
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (typeof node === "object") {
      // Already-extracted ref: keep verbatim, count it.
      if (isImageRef(node)) {
        refCount++;
        return node;
      }
      const out = {};
      for (const k of Object.keys(node)) {
        out[k] = walk(node[k]);
      }
      return out;
    }
    return node;
  };

  return { state: walk(root), images, refCount, extractedCount };
}

/**
 * Inverse of extractImagesFromState. Rehydrates {__imgRef: id} objects back
 * into base64 data URLs by looking each ref up in the supplied image map.
 *
 * If `imageMap[id]` is missing, the ref is left in place (so a partial map
 * never silently degrades into "image gone"; the caller can detect leftover
 * refs and treat that as a verify failure).
 *
 * @param {*} root The rewritten state tree.
 * @param {Record<string,{contentType:string,base64:string}>} imageMap By id.
 * @returns {{ state: any, missingRefs: string[] }}
 */
export function inlineImagesIntoState(root, imageMap) {
  const missingRefs = [];

  const walk = (node) => {
    if (node == null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);
    if (isImageRef(node)) {
      const id = node[REF_KEY];
      const img = imageMap?.[id];
      if (!img) {
        missingRefs.push(id);
        return node;
      }
      return `data:${img.contentType};base64,${img.base64}`;
    }
    const out = {};
    for (const k of Object.keys(node)) {
      out[k] = walk(node[k]);
    }
    return out;
  };

  return { state: walk(root), missingRefs };
}

/**
 * Strict deep-equal for JSON-shaped values. Used by the dual-write verify
 * step to make absolutely sure round-trip is lossless before we'd consider
 * trusting the v2 path. Order-sensitive on arrays (intentional — sync needs
 * arrays to round-trip in the same order) and key-set sensitive on objects.
 */
export function jsonDeepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!jsonDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!jsonDeepEqual(a[k], b[k])) return false;
  }
  return true;
}

export const __internal = { DATA_URL_RE, REF_KEY, REF_VERSION };
