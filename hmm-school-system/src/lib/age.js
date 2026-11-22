// Age and the "unusual age for this grade" warning (a warning only, never a block).
export function ageOn(dobIso, refIso) {
  const d = new Date(`${dobIso}T00:00:00Z`);
  const r = new Date(`${refIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(r.getTime())) return null;
  let age = r.getUTCFullYear() - d.getUTCFullYear();
  if (r.getUTCMonth() < d.getUTCMonth() || (r.getUTCMonth() === d.getUTCMonth() && r.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

// limits looks like { "9": [13, 20], "10": [14, 21], ... } (stored in school_settings as age_limits)
export const DEFAULT_AGE_LIMITS = { 9: [13, 20], 10: [14, 21], 11: [15, 22], 12: [16, 23] };

export function ageWarning(gradeNumber, age, limits = DEFAULT_AGE_LIMITS) {
  const range = limits?.[gradeNumber];
  if (!range || age == null) return null;
  if (age < range[0]) return { kind: "young", age, min: range[0], max: range[1] };
  if (age > range[1]) return { kind: "old", age, min: range[0], max: range[1] };
  return null;
}
