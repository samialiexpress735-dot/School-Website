// Step 7: loads everything a roster, report card or promotion screen needs and runs the calculations (reports.js).
import { supabase } from "./supabase.js";
import { allComponents, effectiveStream } from "./marksEngine.js";
import { fetchAll, loadMarks, loadStructures, subjectsOfGrade } from "./marksData.js";
import { buildReport } from "./reports.js";
import { fullName } from "./ui.jsx";

const STUDENT_FIELDS =
  "student_code,sex,date_of_birth,first_name,father_name,grandfather_name,first_name_am,father_name_am,grandfather_name_am";

// Students of one grade in one year (all sections, or one section), grouped by stream, with their yearly results.
// withdrawn students are left out. Returns { groups: [{ streamId, subjects, report }], decisions: Map(enrollmentId -> decision) }.
export async function loadReport({ refData, gradeSubjects, yearId, gradeId, sectionId = null, withDecisions = false }) {
  const [st, en] = await Promise.all([
    loadStructures({ yearId, gradeId }),
    fetchAll(() => {
      let q = supabase
        .from("enrollments")
        .select(`id,status,section_id,stream_id,grade_id,sections(name,shift),students(${STUDENT_FIELDS})`)
        .eq("academic_year_id", yearId)
        .eq("grade_id", gradeId);
      if (sectionId) q = q.eq("section_id", sectionId);
      return q;
    }),
  ]);
  const bad = [st, en].find((r) => r.error);
  if (bad) return { data: null, error: bad.error };

  const enrollments = en.data.filter((e) => e.status !== "withdrawn");
  const comps = st.data.flatMap((s) => allComponents(s).map((c) => c.id));
  const m = await loadMarks(enrollments.map((e) => e.id), comps);
  if (m.error) return m;

  const decisions = new Map();
  if (withDecisions && enrollments.length) {
    const ids = enrollments.map((e) => e.id);
    for (let i = 0; i < ids.length; i += 60) {
      const p = await supabase.from("promotions").select("enrollment_id,decision").in("enrollment_id", ids.slice(i, i + 60));
      if (p.error) return { data: null, error: p.error };
      p.data.forEach((r) => decisions.set(r.enrollment_id, r.decision));
    }
  }

  const sems = refData.semesters.filter((s) => s.academic_year_id === yearId).sort((a, b) => a.number - b.number);
  const byStream = new Map();
  for (const e of enrollments) {
    const key = effectiveStream(e.stream_id, refData.streams) || "";
    if (!byStream.has(key)) byStream.set(key, []);
    byStream.get(key).push(e);
  }
  const groups = [...byStream.entries()].map(([key, list]) => {
    const streamId = key || null;
    const subjects = subjectsOfGrade(gradeSubjects, refData.subjects, { yearId, gradeId, streamId, streams: refData.streams });
    const sorted = [...list].sort((a, b) => fullName(a.students, "en").localeCompare(fullName(b.students, "en")));
    const report = buildReport({
      structures: st.data, marks: m.data, enrollments: sorted, subjects, sems, gradeId, stream: streamId,
      places: refData.yearlyPlaces, passMark: refData.passMark,
    });
    return { streamId, subjects, report };
  });
  return { data: { groups, decisions, sems }, error: null };
}
