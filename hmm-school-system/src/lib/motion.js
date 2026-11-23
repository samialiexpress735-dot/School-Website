// Small pure helpers for the UI v2 Part D motion. No React in here, so they can be tested with node --test.

export const DURATION = { fast: 150, base: 220, slow: 420 };

// True when the person asked their system for less motion. Everything that moves checks this first.
export function reducedMotion() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

export const easeOutCubic = (p) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

// The value to show while counting from `from` to `to`; progress runs from 0 to 1.
// Counts of whole things stay whole (decimals = 0); results keep their decimals.
export function countStep(from, to, progress, decimals = 0) {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return to;
  const v = from + (to - from) * easeOutCubic(progress);
  const f = 10 ** decimals;
  return progress >= 1 ? to : Math.round(v * f) / f;
}

// Students who have just reached the absence limit: flagged now, not flagged before.
// `before` is null on the first load of a sheet, and then nothing pulses.
export function newlyFlagged(before, now) {
  if (!before) return new Set();
  const out = new Set();
  for (const id of now) if (!before.has(id)) out.add(id);
  return out;
}

// How far each item moved between two layouts. prev and next are Maps of id -> { left, top }.
// Items that did not exist before, or did not move by at least 1px, are left out.
export function glideDeltas(prev, next) {
  const out = new Map();
  for (const [id, to] of next) {
    const from = prev.get(id);
    if (!from) continue;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) out.set(id, { dx, dy });
  }
  return out;
}

// A column is unbalanced when its size differs from the average of the sections by more than 25%
// (and by at least 2 students). Only used for a single gentle pulse, never to block anything.
export function unbalancedKeys(totalsByKey) {
  const entries = [...totalsByKey.entries()];
  if (entries.length < 2) return new Set();
  const avg = entries.reduce((s, [, n]) => s + n, 0) / entries.length;
  const out = new Set();
  for (const [k, n] of entries) if (Math.abs(n - avg) >= 2 && Math.abs(n - avg) > avg * 0.25) out.add(k);
  return out;
}
