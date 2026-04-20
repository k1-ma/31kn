/**
 * Shared tombstone (soft-delete) helpers — server-side copy.
 *
 * Every check for "is this item deleted?" MUST go through isDeleted().
 * Raw `.deletedAt` truthy checks are forbidden outside this file.
 *
 * This is a CommonJS-compatible ES module duplicate of src/lib/tombstones.js
 * kept in sync manually. The logic MUST be identical on client and server.
 *
 * @module tombstones
 */

/**
 * Check if an item is deleted based on its deletedAt field.
 * An item is considered deleted only if deletedAt is a positive number (> 0).
 *
 * @param {Object} item - The item to check
 * @returns {boolean} - true if the item is deleted, false otherwise
 */
export function isDeleted(item) {
  return typeof item?.deletedAt === "number" && item.deletedAt > 0;
}

/**
 * Return a shallow copy of `item` without the deletedAt property.
 *
 * @param {Object} item - The item to strip
 * @returns {Object} - Shallow copy without deletedAt
 */
export function withoutDeletedAt(item) {
  if (!item) return item;
  const { deletedAt, ...rest } = item;
  return rest;
}
