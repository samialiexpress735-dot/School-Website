// Step 5: loading helpers for the marks screens.
import { supabase } from "./supabase.js";
import { assembleStructures, effectiveStream } from "./marksEngine.js";

const PAGE = 1000; // the server returns at most 1000 rows per request

// Reads every row of a query. build() must return a NEW query each time it is called.
export async function fetchAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return { data: rows, error: null };
}

// ids are sent in small groups so the request address never gets too long
async function fetchIn(table, column, ids, select = "*", size = 60) {
  const rows = [];
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    const r = await fetchAll(() => supabase.from(table).select(select).in(column, chunk));
    if (r.error) return r;
    rows.push(...r.data);
  }
  return { data: rows, error: null };
}

// Everything the marks screens share: years, semesters, grades, streams, subjects, settings, and who I am.
export async function loadMarksReference(userId) {
  const [y, sem, g, st, sub, set, me] = await Promise.all([
    supabase.from("academic_years").select("id,label,is_current,is_closed,year_ec").order("year_ec", { ascending: false }),
    supabase.from("semesters").select("*").order("number"),
    supabase.from("grades").select("*").order("number"),
    supabase.from("streams").select("*").order("code"),
    supabase.from("subjects").select("*").order("name"),
    supabase.from("school_settings").select("*").in("key", ["pass_mark", "yearly_rounding_places"]),
    userId ? supabase.from("staff").select("id").eq("profile_id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const bad = [y, sem, g, st, sub, set, me].find((r) => r.error);
  if (bad) return { data: null, error: bad.error };
  const setting = (key, fallback) => {
    const row = set.data.find((s) => s.key === key);
    const n = Number(row?.value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    data: {
      years: y.data,
      semesters: sem.data,
      grades: g.data,
      streams: st.data,
      subjects: sub.data,
      passMark: setting("pass_mark", 50),
      yearlyPlaces: setting("yearly_rounding_places", 1),
      myStaffId: me.data?.id ?? null,
    },
    error: null,
  };
}

// Structures (with their groups and components) of a year, optionally one grade.
export async function loadStructures({ yearId, gradeId }) {
  const rows = await fetchAll(() => {
    let q = supabase.from("assessment_structures").select("*").eq("academic_year_id", yearId);
    if (gradeId) q = q.eq("grade_id", gradeId);
    return q;
  });
  if (rows.error) return rows;
  const ids = rows.data.map((s) => s.id);
  if (ids.length === 0) return { data: [], error: null };
  const [g, c] = await Promise.all([fetchIn("assessment_groups", "structure_id", ids), fetchIn("assessment_components", "structure_id", ids)]);
  if (g.error || c.error) return { data: null, error: g.error || c.error };
  return { data: assembleStructures(rows.data, g.data, c.data), error: null };
}

// Marks of some students (optionally only some assessments) as a Map "enrollmentId|componentId" -> score.
export async function loadMarks(enrollmentIds, componentIds = null) {
  if (enrollmentIds.length === 0) return { data: new Map(), error: null };
  const r = await fetchIn("marks", "enrollment_id", enrollmentIds, "enrollment_id,component_id,score", 40);
  if (r.error) return r;
  const keep = componentIds ? new Set(componentIds) : null;
  const map = new Map();
  for (const m of r.data) if (!keep || keep.has(m.component_id)) map.set(`${m.enrollment_id}|${m.component_id}`, Number(m.score));
  return { data: map, error: null };
}

export const markKey = (enrollmentId, componentId) => `${enrollmentId}|${componentId}`;

// The marks of ONE student as { componentId: score } for the engine.
export function scoresForStudent(marks, enrollmentId, structure) {
  const out = {};
  for (const g of structure?.groups || []) {
    for (const c of g.components) {
      const v = marks.get(markKey(enrollmentId, c.id));
      if (v !== undefined) out[c.id] = v;
    }
  }
  return out;
}

// Which semester to show first: the one that includes today, otherwise semester 1.
export function defaultSemesterId(semesters, yearId) {
  const list = semesters.filter((s) => s.academic_year_id === yearId).sort((a, b) => a.number - b.number);
  const today = new Date().toISOString().slice(0, 10);
  const now = list.find((s) => s.start_date && s.end_date && s.start_date <= today && today <= s.end_date);
  return (now || list[0])?.id || "";
}

// The subjects a grade and stream learn in a year, from grade_subjects.
export function subjectsOfGrade(gradeSubjects, subjects, { yearId, gradeId, streamId, streams }) {
  const want = effectiveStream(streamId, streams);
  const ids = new Set(
    gradeSubjects
      .filter((gs) => gs.academic_year_id === yearId && gs.grade_id === gradeId && effectiveStream(gs.stream_id, streams) === want)
      .map((gs) => gs.subject_id)
  );
  return subjects.filter((s) => ids.has(s.id));
}

// "12" or "12.5" (never "12.00")
export function fmt(n, places = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = Number(n).toFixed(places);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

// Lists sections by grade, then shift, then name (A, B, ... AA).
export function sortSections(sections, grades) {
  const no = (id) => grades.find((g) => g.id === id)?.number || 0;
  return [...sections].sort(
    (a, b) => no(a.grade_id) - no(b.grade_id) || (a.stream_id || "").localeCompare(b.stream_id || "") || a.shift.localeCompare(b.shift) || a.name.length - b.name.length || a.name.localeCompare(b.name)
  );
}
