// ─────────────────────────────────────────────────────────────────────────────
// IMAGE_STRIPPED RESTORATION UTILITIES
//
// The chunked sync pipeline may replace base64 image data with the placeholder
// "[IMAGE_STRIPPED]" when individual chunks exceed the Vercel body-size limit.
// These helpers restore the real images from the existing server state before
// saving, preventing permanent image loss.
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_STRIPPED = "[IMAGE_STRIPPED]";

/**
 * Recursively restore [IMAGE_STRIPPED] placeholder values from an existing
 * object (typically the current server state).
 *
 * For arrays of objects with `id` fields (trades, images, etc.), items are
 * matched by id so that reordered arrays are handled correctly.
 *
 * @param {*} assembled - The newly assembled state (may contain placeholders)
 * @param {*} existing  - The current server state (source of real images)
 * @returns {*} A copy of `assembled` with placeholders replaced
 */
export function restoreStrippedImages(assembled, existing) {
  if (assembled === IMAGE_STRIPPED) {
    return (existing != null && existing !== IMAGE_STRIPPED) ? existing : assembled;
  }
  if (assembled == null || typeof assembled !== "object") return assembled;
  if (existing == null || typeof existing !== "object") return assembled;

  if (Array.isArray(assembled)) {
    if (!Array.isArray(existing)) return assembled;

    // Check if items have `id` — use id-based matching
    const existingHasIds = existing.some((e) => e && typeof e === "object" && e.id);
    if (existingHasIds) {
      const existingById = new Map();
      for (const item of existing) {
        if (item && item.id) existingById.set(item.id, item);
      }
      return assembled.map((item) => {
        if (item && typeof item === "object" && item.id) {
          const match = existingById.get(item.id);
          return match ? restoreStrippedImages(item, match) : item;
        }
        return item;
      });
    }

    // No ids — fall back to index-based matching
    return assembled.map((item, i) =>
      i < existing.length ? restoreStrippedImages(item, existing[i]) : item
    );
  }

  // Plain object — recurse into each key
  const result = { ...assembled };
  for (const key of Object.keys(result)) {
    if (result[key] === IMAGE_STRIPPED) {
      if (existing[key] != null && existing[key] !== IMAGE_STRIPPED) {
        result[key] = existing[key];
      }
    } else if (typeof result[key] === "object" && result[key] !== null) {
      result[key] = restoreStrippedImages(result[key], existing[key]);
    }
  }
  return result;
}

/**
 * Check whether an object tree contains any [IMAGE_STRIPPED] placeholders.
 * Used as a fast pre-check to avoid unnecessary DB reads.
 */
export function hasStrippedImages(obj) {
  if (obj === IMAGE_STRIPPED) return true;
  if (obj == null || typeof obj !== "object") return false;
  if (Array.isArray(obj)) return obj.some(hasStrippedImages);
  return Object.values(obj).some(hasStrippedImages);
}
