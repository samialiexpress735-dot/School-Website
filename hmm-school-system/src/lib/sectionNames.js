const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB ... (same naming as the Sections screen; no fixed limit)
export function sectionName(index) {
  let n = index;
  let out = "";
  do {
    out = LETTERS[n % 26] + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

// The next `count` names that are not in `used`
export function nextSectionNames(used, count) {
  const taken = new Set([...used].map((x) => String(x).toUpperCase()));
  const out = [];
  for (let i = 0; out.length < count; i += 1) {
    const name = sectionName(i);
    if (!taken.has(name)) out.push(name);
  }
  return out;
}
