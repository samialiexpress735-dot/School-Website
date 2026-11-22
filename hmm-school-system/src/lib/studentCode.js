// Student ID: HMM-<year E.C.>-<5 random characters>-<1 check character>, for example HMM-2019-7QK4M-X
// The alphabet has 31 characters (no 0, O, 1, I, L). The check character is a weighted sum mod 31,
// the same rule as the database function student_code_check(), so a mistyped ID can be spotted.
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function checkChar(year, rand) {
  let total = Number(year);
  for (let i = 0; i < rand.length; i += 1) {
    const idx = CODE_ALPHABET.indexOf(rand[i]);
    if (idx < 0) return null;
    total += idx * (i + 1);
  }
  return CODE_ALPHABET[total % 31];
}

export const normalizeStudentCode = (text) => String(text ?? "").trim().toUpperCase();

// Looks like a full student ID (shape only)
export const looksLikeStudentCode = (text) => /^HMM-\d{4}-[A-Z0-9]{5}-[A-Z0-9]$/.test(normalizeStudentCode(text));

export function isValidStudentCode(text) {
  const m = /^HMM-(\d{4})-([2-9A-HJKMNP-Z]{5})-([2-9A-HJKMNP-Z])$/.exec(normalizeStudentCode(text));
  return Boolean(m) && checkChar(Number(m[1]), m[2]) === m[3];
}
