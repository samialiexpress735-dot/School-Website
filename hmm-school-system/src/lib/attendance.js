// Step 6: attendance rules that the screens mirror from the database (010_step6_attendance.sql).
// The database is the real protection; these helpers only decide what to show and what to offer.
// Dates are plain "YYYY-MM-DD" text and are handled in UTC so the browser's time zone never shifts a day.

export const STATUSES = ["present", "absent", "late", "excused"];
export const DEFAULT_EDIT_DAYS = 3;

const parse = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;

export const addDays = (iso, n) => toIso(parse(iso) + n * DAY);

// 1 = Monday ... 7 = Sunday
export const isoWeekday = (iso) => {
  const w = new Date(parse(iso)).getUTCDay();
  return w === 0 ? 7 : w;
};

// Today as the browser sees it, as YYYY-MM-DD
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// calendar: Map of "YYYY-MM-DD" -> { name, name_am, kind } for holidays, exam days and breaks
export const calendarMap = (rows) => new Map((rows || []).map((r) => [r.calendar_date, r]));

export const isSchoolDay = (iso, calendar) => isoWeekday(iso) <= 5 && !calendar.has(iso);

// Why a day cannot be used: "weekend", "calendar" (holiday, exam day, break), "future" or null when it can
export function dayProblem(iso, calendar, today) {
  if (iso > today) return "future";
  if (isoWeekday(iso) > 5) return "weekend";
  if (calendar.has(iso)) return "calendar";
  return null;
}

// How many school days come after iso, up to and including today
export function schoolDaysSince(iso, calendar, today) {
  let n = 0;
  for (let d = addDays(iso, 1); d <= today; d = addDays(d, 1)) if (isSchoolDay(d, calendar)) n++;
  return n;
}

// Teachers may change attendance only for the last few school days (today included)
export const inEditWindow = (iso, calendar, today, days = DEFAULT_EDIT_DAYS) =>
  iso <= today && schoolDaysSince(iso, calendar, today) < days;

// The most recent school day on or before "from" (looks back at most 60 days)
export function latestSchoolDay(from, calendar) {
  let d = from;
  for (let i = 0; i < 60; i++, d = addDays(d, -1)) if (isSchoolDay(d, calendar)) return d;
  return from;
}

// Previous or next school day (dir = -1 or 1). Never goes past "limit" when given.
export function stepSchoolDay(iso, dir, calendar, limit) {
  let d = iso;
  for (let i = 0; i < 60; i++) {
    d = addDays(d, dir);
    if (limit && d > limit) return iso;
    if (isSchoolDay(d, calendar)) return d;
  }
  return iso;
}

// Count the statuses in { enrollmentId: { status } }
export function tally(rows) {
  const t = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of Object.values(rows)) if (t[r.status] !== undefined) t[r.status]++;
  return t;
}

// Only the rows that differ from what was loaded, or everything when the day was not taken yet
export function changedRows(current, initial, taken) {
  return Object.entries(current)
    .filter(([id, r]) => !taken || !initial[id] || initial[id].status !== r.status || (initial[id].note || "") !== (r.note || ""))
    .map(([id, r]) => ({ enrollment_id: id, status: r.status, note: r.note || "" }));
}

// An excused absence needs a short note (the database refuses it otherwise)
export const missingNotes = (rows) => Object.entries(rows).filter(([, r]) => r.status === "excused" && !String(r.note || "").trim()).map(([id]) => id);
