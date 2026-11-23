// UI v2, Part C: which rows of a list were added or changed since the last load, so the page can
// highlight them for a moment ("the row you just saved"). Pure, so it is easy to test.

// prev: Map(id -> signature) from the last load, or null for the first load (nothing is flashed then).
// Returns { ids: Set of new or changed ids, next: the new Map }.
export function changedIds(prev, rows, keyOf = (r) => r.id) {
  const next = new Map();
  const ids = new Set();
  for (const r of rows) {
    const id = keyOf(r);
    const sig = JSON.stringify(r);
    next.set(id, sig);
    if (prev && prev.get(id) !== sig) ids.add(id);
  }
  return { ids, next };
}
