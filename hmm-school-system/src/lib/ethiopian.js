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
