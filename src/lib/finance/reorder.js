import { active } from "./store.jsx";

/**
 * Compute a swap of two items' sortOrder values within a list. Returns
 * the two items the caller should upsert (or null if the move is a no-op
 * — i.e. the item is at the top and dir is up, or at the bottom and dir
 * is down). Operates on the active (non-deleted) members only and
 * preserves a stable ordering by current sortOrder ASC, then id.
 *
 * @template T
 * @param {Array<T>} items
 * @param {T} item       the item being moved
 * @param {-1 | 1} direction  -1 = up, 1 = down
 * @param {(x: T) => boolean} [predicate]  restricts which siblings count
 * @returns {[T, T] | null}
 */
export function reorderSiblings(items, item, direction, predicate = () => true) {
  const list = active(items)
    .filter(predicate)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id)));

  const idx = list.findIndex((x) => x.id === item.id);
  if (idx < 0) return null;
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= list.length) return null;

  const a = list[idx];
  const b = list[swapIdx];
  return [
    { ...a, sortOrder: b.sortOrder ?? swapIdx },
    { ...b, sortOrder: a.sortOrder ?? idx },
  ];
}
