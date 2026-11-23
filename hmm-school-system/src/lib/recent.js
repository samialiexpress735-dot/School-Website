// UI v2, Part B: the last pages a person opened, kept in this browser only (never sent anywhere).
// Only page addresses are stored (for example "marks/results"), never names or ids.
export const MAX_RECENT = 5;
const SAFE_PATH = /^[a-z]+(\/[a-z]+)?$/;

// Newest first, no repeats, at most max entries.
export function addRecent(list, entry, max = MAX_RECENT) {
  return [entry, ...list.filter((x) => x.path !== entry.path)].slice(0, max);
}

export const isRecentEntry = (x) => Boolean(x && typeof x.path === "string" && SAFE_PATH.test(x.path) && typeof x.module === "string");

const keyFor = (userId) => `hmm.recent.${userId}`;

export function loadRecent(userId) {
  try {
    const v = JSON.parse(window.localStorage.getItem(keyFor(userId)) || "[]");
    return Array.isArray(v) ? v.filter(isRecentEntry).slice(0, MAX_RECENT) : [];
  } catch {
    return []; // storage blocked or damaged: simply no recent pages
  }
}

export function saveRecent(userId, list) {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(list));
  } catch {
    /* storage blocked: ignore */
  }
}
