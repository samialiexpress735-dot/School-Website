// Step 7A: loading and filling the school's own report card forms (screen side; the pure rules are in lib/reportTemplate.js).
import { supabase } from "../../lib/supabase.js";
import { fullName, pick } from "../../lib/ui.jsx";
import { formatEc } from "../../lib/ethiopian.js";
import { signedUrls } from "../../lib/formImages.js";

// Active templates that have a saved version (the ones that can be printed on).
export async function loadTemplates() {
  return supabase.from("report_templates").select("*").eq("is_active", true).not("current_version_id", "is", null);
}

// The saved layout of one version, and the links to its page images.
// The version is read once when the screen opens: a layout saved meanwhile does not change a card half-way through a print run.
export async function loadForm(versionId) {
  const { data, error } = await supabase.from("report_template_versions").select("id,version_no,layout").eq("id", versionId).single();
  if (error) return { data: null, error };
  try {
    const urls = await signedUrls(data.layout.pages.map((p) => p.path));
    return { data: { layout: data.layout, versionNo: data.version_no, urls }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// Days absent and late per student (whole year of the section). A failure leaves those two fields blank.
export async function loadAttendance(sectionId) {
  const { data, error } = await supabase.rpc("attendance_summary", { p_section: sectionId, p_semester: null });
  if (error || !data) return new Map();
  return new Map(data.map((r) => [r.enrollment_id, { absent: r.absent, late: r.late }]));
}

export async function loadHomeroom(staffId, lang) {
  if (!staffId) return "";
  const { data } = await supabase.from("staff").select("*").eq("id", staffId).maybeSingle();
  return data ? fullName(data, lang) : "";
}

// The already-formatted texts for one student that fieldText() and cellText() need.
export function buildFormCtx({ row, refData, year, section, lang, t, homeroom = "", attendance = null }) {
  const s = row.enrollment.students;
  const grade = refData.grades.find((g) => g.id === section.grade_id);
  const st = refData.streams.find((x) => x.id === (row.enrollment.stream_id || section.stream_id));
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const a = attendance?.get(row.enrollment.id);
  return {
    places: refData.yearlyPlaces,
    passMark: refData.passMark,
    passText: t("marks.pass"),
    failText: t("marks.fail"),
    studentName: fullName(s, lang),
    studentId: s.student_code,
    sex: t(`students.sexes.${s.sex}`),
    dob: formatEc(s.date_of_birth, lang),
    grade: grade ? pick(grade, lang) : "",
    section: section.name,
    stream: st && st.code !== "general" ? pick(st, lang) : "",
    year: year?.label ?? "",
    homeroom,
    absent: a?.absent,
    late: a?.late,
    printDate: formatEc(iso, lang),
  };
}
