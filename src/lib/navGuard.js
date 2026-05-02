/**
 * Lightweight cross-component "unsaved changes" registry.
 *
 * Pages that own modal forms or rich editors (e.g. Trades.jsx) call
 * setDirty(key, true) when their form has unsaved input, and false when
 * it's saved or discarded. Layouts that drive in-app navigation (e.g.
 * JournalApp.jsx's handleSetActive) call shouldBlockNav() before
 * transitioning to ask the user for confirmation when any registered
 * key is still dirty.
 *
 * This is intentionally a module-level registry instead of React context
 * because the dirty-tracking is keyed by component instance, not by tree
 * position, and we don't need re-renders on dirty changes.
 */
const dirty = new Map();

export function setDirty(key, isDirty) {
  if (!key) return;
  if (isDirty) dirty.set(key, true);
  else dirty.delete(key);
}

export function clearDirty(key) {
  if (key) dirty.delete(key);
  else dirty.clear();
}

export function isAnyDirty() {
  return dirty.size > 0;
}
