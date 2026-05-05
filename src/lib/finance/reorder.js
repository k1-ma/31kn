import { active } from "./store.jsx";

/**
 * Compute a swap of two items' sortOrder values within a list. Returns
 * the two items the caller should upsert. `direction` is -1 (up) or +1
 * (down). Operates on the active (non-deleted) members only and
 * preserves a stable ordering by current sortOrder ASC, then id.
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
