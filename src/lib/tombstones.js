/**
 * Shared tombstone (soft-delete) helpers.
 *
 * Every check for "is this item deleted?" MUST go through isDeleted().
 * Raw `.deletedAt` truthy checks are forbidden outside this file —
 * they behave inconsistently for edge values like 0, null, and undefined.
 *
 * @module tombstones
 */

/**
 * Check if an item is deleted based on its deletedAt field.
 * An item is considered deleted only if deletedAt is a positive number (> 0).
 * Valid deletion timestamps are always positive (Date.now() > 0).
 * deletedAt: 0, null, or undefined means the item is NOT deleted.
 *
 * @param {Object} item - The item to check
 * @returns {boolean} - true if the item is deleted, false otherwise
 */
export function isDeleted(item) {
  return typeof item?.deletedAt === "number" && item.deletedAt > 0;
}

/**
 * Return a shallow copy of `item` without the deletedAt property.
 * Useful when you want to strip tombstone metadata before displaying.
 *
 * @param {Object} item - The item to strip
 * @returns {Object} - Shallow copy without deletedAt
 */
export function withoutDeletedAt(item) {
  if (!item) return item;
  const { deletedAt, ...rest } = item;
  return rest;
}
