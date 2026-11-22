// Converts a standard (Gregorian) date like "2026-11-20" to the Ethiopian calendar.
// The database stores standard dates; screens show the Ethiopian date beside them.

const EC_MONTHS = {
  en: ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"],
  am: ["መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"],
};

function gregorianToJdn(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}

export function gcToEc(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || "");
  if (!match) return null;
  const jdn = gregorianToJdn(Number(match[1]), Number(match[2]), Number(match[3]));
  const days = jdn - 1723856;
  const r = ((days % 1461) + 1461) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor(days / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: (n % 30) + 1,
  };
}

export function formatEc(dateStr, lang = "en") {
  const ec = gcToEc(dateStr);
  if (!ec) return "";
  const month = EC_MONTHS[lang === "am" ? "am" : "en"][ec.month - 1];
  return lang === "am" ? `${month} ${ec.day}፣ ${ec.year} ዓ.ም.` : `${month} ${ec.day}, ${ec.year} E.C.`;
}

// ---------------------------------------------------------------------------
// Ethiopian date -> standard (Gregorian) date. Used for dates of birth, which
// are entered in the Ethiopian calendar and stored as standard dates.
// ---------------------------------------------------------------------------
export const isEcLeapYear = (y) => y % 4 === 3;

export function ecMonthDays(year, month) {
  if (month >= 1 && month <= 12) return 30;
  if (month === 13) return isEcLeapYear(year) ? 6 : 5;
  return 0;
}

export function isValidEc(y, m, d) {
  return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)
    && y >= 1900 && y <= 2200 && m >= 1 && m <= 13 && d >= 1 && d <= ecMonthDays(y, m);
}

export function ecToGc(y, m, d) {
  if (!isValidEc(y, m, d)) return null;
  const jdn = 1723856 + 365 * y + Math.floor(y / 4) + 30 * m + d - 31;
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const dd = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * dd) / 4);
  const mm = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * mm + 2) / 5) + 1;
  const month = mm + 3 - 12 * Math.floor(mm / 10);
  const year = 100 * b + dd - 4800 + Math.floor(mm / 10);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "dd/mm/yyyy" (also - or .) written in the Ethiopian calendar -> { y, m, d } or null
export function parseEcText(text) {
  const m = /^\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\s*$/.exec(String(text ?? ""));
  if (!m) return null;
  const ec = { d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) };
  return isValidEc(ec.y, ec.m, ec.d) ? ec : null;
}

export const formatEcText = ({ y, m, d }) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;

export const EC_MONTH_NAMES = EC_MONTHS;
