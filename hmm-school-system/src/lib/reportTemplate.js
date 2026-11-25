// Step 7A: report card templates (blueprint 4.8.1). Pure functions only, so they can be tested without a browser.
//
// A layout describes where values go on the school's own blank form. All positions are PERCENTAGES of the page
// (0 to 100), so they do not depend on the size of the scan. A value is printed in a "cell": the place where a
// row (one subject, a band across the page) crosses a column (one kind of value, a band down the page).
//
// layout = {
//   version: 1,
//   offsetMm: { x, y },                      // fine adjustment for the printer, in millimetres
//   pages:   [{ path, w, h }],               // one or two page images (storage path, pixel size)
//   columns: [{ id, page, kind, x, w, align, size }],
//   rows:    [{ id, page, subjectId, y, h }],
//   fields:  [{ id, page, key, x, y, w, align, size }]
// }

export const LAYOUT_VERSION = 1;
export const PAGE_MM = { w: 210, h: 297 }; // A4

export const COLUMN_KINDS = ["sem1", "sem2", "average", "result"];
export const FIELD_KEYS = [
  "studentName", "studentId", "sex", "dob", "grade", "section", "stream", "year", "homeroom",
  "overall", "rank", "verdict", "absent", "late", "printDate",
];
export const TEMPLATE_KINDS = ["semester1", "semester2", "yearly"];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Positions are kept to one decimal of a percent: fine enough for a printed line, short enough to read.
export const roundPct = (v) => Math.round(clamp(Number(v) || 0, -5, 105) * 10) / 10;

export function newId(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyLayout(pages = []) {
  return { version: LAYOUT_VERSION, offsetMm: { x: 0, y: 0 }, pages, columns: [], rows: [], fields: [] };
}

// Same rules as the database (013), so a mistake is shown on screen before saving. Returns a list of problems.
export function layoutProblems(layout) {
  const out = [];
  if (!layout || typeof layout !== "object") return ["not an object"];
  if (layout.version !== LAYOUT_VERSION) out.push("version");
  const pages = Array.isArray(layout.pages) ? layout.pages : [];
  if (pages.length < 1 || pages.length > 2) out.push("pages");
  for (const arr of ["columns", "rows", "fields"]) {
    const list = layout[arr] ?? [];
    if (!Array.isArray(list)) { out.push(arr); continue; }
    if (list.length > 80) out.push(`${arr} too many`);
    for (const it of list) {
      if (!it || typeof it !== "object") { out.push(arr); continue; }
      for (const k of ["x", "y", "w", "h"]) {
        if (k in it && (typeof it[k] !== "number" || it[k] < -5 || it[k] > 105)) out.push(`${arr}.${k}`);
      }
      if (it.page !== undefined && (it.page < 0 || it.page >= Math.max(pages.length, 1))) out.push(`${arr}.page`);
    }
  }
  return out;
}

// ---------- values ----------

// "12" or "12.5" (never "12.00"), like the built-in card; but "" instead of a dash when there is no value,
// because a blank box on the school's form means "nothing to show", and a zero is never printed for a missing mark.
export function numText(n, places = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const s = Number(n).toFixed(places);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

// The text for one cell of the subject table. `x` is one subject of a student's report row
// ({ subject, perSem: [{ result, max, complete } | null], yearly: { average, complete } }).
export function cellText(kind, x, ctx) {
  if (!x) return "";
  const places = ctx.places ?? 2;
  // Only finalized subjects are printed: a semester cell needs that semester finalized for the subject, and the
  // yearly average and the result need every semester finalized. (ctx.isFinal is left out when nothing is required.)
  const need = kind === "sem1" ? [1] : kind === "sem2" ? [2] : ctx.finalSems ?? [1, 2];
  if (ctx.isFinal && !need.every((n) => ctx.isFinal(x.subject.id, n))) return "";
  if (kind === "sem1" || kind === "sem2") {
    const r = x.perSem?.[kind === "sem1" ? 0 : 1];
    // A semester result with a mark still missing is not final: the box stays blank rather than show a partial total.
    if (!r || !r.complete || !(r.max > 0)) return "";
    return numText((r.result / r.max) * 100, places);
  }
  const y = x.yearly;
  if (!y || y.average === null || y.average === undefined || !y.complete) return "";
  if (kind === "average") return numText(y.average, places);
  if (kind === "result") return y.average >= (ctx.passMark ?? 50) ? ctx.passText ?? "" : ctx.failText ?? "";
  return "";
}

// The text for a single field. `row` is the student's report row, `ctx` holds the already-formatted texts.
// True when every subject of the student is finalized for every semester (or when finalizing is not required).
export function allFinal(row, ctx) {
  if (!ctx.isFinal) return true;
  return (row?.results ?? []).every((x) => (ctx.finalSems ?? [1, 2]).every((n) => ctx.isFinal(x.subject.id, n)));
}

// Which subjects are still not finalized: [{ subject, sem }], for a note above the cards.
export function notFinalList(results, isFinal, sems = [1, 2]) {
  const out = [];
  for (const x of results ?? []) for (const n of sems) if (!isFinal(x.subject.id, n)) out.push({ subject: x.subject, sem: n });
  return out;
}

export function fieldText(key, row, ctx) {
  const places = ctx.places ?? 2;
  switch (key) {
    // Overall average, rank and pass/fail are printed only when every subject has been finalized
    case "overall": return row && row.overall !== null && row.complete && allFinal(row, ctx) ? numText(row.overall, places) : "";
    case "rank": return row?.rank && allFinal(row, ctx) ? String(row.rank) : "";
    case "verdict": return row && row.overall !== null && row.complete && allFinal(row, ctx) ? (row.passed ? ctx.passText ?? "" : ctx.failText ?? "") : "";
    default: return ctx[key] === undefined || ctx[key] === null ? "" : String(ctx[key]);
  }
}

// Everything to print for one student: a flat list of positioned texts. Blank values are left out.
export function buildPrintItems(layout, row, ctx) {
  const items = [];
  const bySubject = new Map((row?.results ?? []).map((x) => [x.subject.id, x]));
  for (const r of layout.rows ?? []) {
    const x = bySubject.get(r.subjectId);
    for (const c of layout.columns ?? []) {
      if ((c.page ?? 0) !== (r.page ?? 0)) continue;
      const text = cellText(c.kind, x, ctx);
      if (text) items.push({ page: r.page ?? 0, x: c.x, y: r.y, w: c.w, h: r.h, text, align: c.align ?? "center", size: c.size ?? 11, id: `${r.id}:${c.id}` });
    }
  }
  for (const f of layout.fields ?? []) {
    const text = fieldText(f.key, row, ctx);
    if (text) items.push({ page: f.page ?? 0, x: f.x, y: f.y, w: f.w, h: f.h ?? 3, text, align: f.align ?? "start", size: f.size ?? 11, id: f.id });
  }
  return items;
}

// ---------- checks before saving or printing ----------

// subjectIds: the subjects this grade (and stream) has. Returns what a person should look at; nothing here blocks saving.
export function templateWarnings(layout, subjectIds) {
  const want = new Set(subjectIds);
  const seen = new Map();
  for (const r of layout.rows ?? []) seen.set(r.subjectId, (seen.get(r.subjectId) ?? 0) + 1);
  return {
    missing: [...want].filter((id) => !seen.has(id)),                 // subjects with no row: they would not be printed
    unknown: [...seen.keys()].filter((id) => id && !want.has(id)),     // rows for a subject this grade does not have
    unassigned: (layout.rows ?? []).filter((r) => !r.subjectId).length, // rows still waiting for a subject
    duplicates: [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    noColumns: (layout.rows ?? []).length > 0 && (layout.columns ?? []).length === 0,
  };
}
export const hasWarnings = (w) => w.missing.length + w.unknown.length + w.unassigned + w.duplicates.length > 0 || w.noColumns;

// Rows for a list of subjects, spread evenly from the first y to the last y (the quick way to set up a form).
export function spreadRows(subjectIds, y1, y2, page = 0, h = 3) {
  const n = subjectIds.length;
  return subjectIds.map((subjectId, i) => ({
    id: newId("r"), page, subjectId, h, y: roundPct(n === 1 ? y1 : y1 + ((y2 - y1) * i) / (n - 1)),
  }));
}

// ---------- drawing rectangles on the form (like the rectangle tool in Paint) ----------

// The rectangle between where the pointer went down and where it is now, whichever way it was dragged.
// Kept on the page (0 to 100 %) and to one decimal.
export function normRect(a, b) {
  const x1 = roundPct(clamp(Math.min(a.x, b.x), 0, 100)), y1 = roundPct(clamp(Math.min(a.y, b.y), 0, 100));
  const x2 = roundPct(clamp(Math.max(a.x, b.x), 0, 100)), y2 = roundPct(clamp(Math.max(a.y, b.y), 0, 100));
  return { x: x1, y: y1, w: roundPct(x2 - x1), h: roundPct(y2 - y1) };
}

// A press and release without dragging is a click, not a rectangle.
export const isClick = (r) => r.w < 0.6 && r.h < 0.6;

// A table drawn as one rectangle: one row per subject, dividing its height evenly. The rows keep the rectangle's left edge and width.
export function tableRows(subjectIds, rect, page = 0) {
  const n = subjectIds.length;
  if (!n) return [];
  const h = roundPct(rect.h / n);
  return subjectIds.map((subjectId, i) => ({ id: newId("r"), page, subjectId, x: rect.x, w: rect.w, y: roundPct(rect.y + (rect.h * i) / n), h }));
}

// The template that serves a grade and stream: active, has a saved version, covers the grade, and either names
// the stream or names none. One that names the stream wins over one that serves every stream; then the newest.
export function pickTemplate(templates, { gradeId, streamId = null, kind = "yearly" }) {
  const fits = (templates ?? []).filter(
    (t) => t.is_active && t.current_version_id && t.kind === kind && (t.grade_ids ?? []).includes(gradeId) &&
      ((t.stream_ids ?? []).length === 0 || (streamId && t.stream_ids.includes(streamId)))
  );
  fits.sort((a, b) => ((b.stream_ids ?? []).length > 0) - ((a.stream_ids ?? []).length > 0) || String(b.updated_at).localeCompare(String(a.updated_at)));
  return fits[0] ?? null;
}

// Nudge an item with the keyboard: 0.1% per press, 1% with Shift. Never leaves the page.
export function nudged(value, dir, big) {
  return roundPct(value + dir * (big ? 1 : 0.1));
}

// Scale a picture so its width is at most maxW pixels (the scan is resized in the browser before upload).
export function fitWidth(w, h, maxW = 1654) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  if (w <= maxW) return { w, h };
  return { w: maxW, h: Math.round((h * maxW) / w) };
}
