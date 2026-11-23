// UI v2, Part B: the few counts the dashboard shows. Each count is read on its own; if one cannot be read
// (for example the role may not see it) it is null and its tile is left out. Counts follow the database rules.
import { supabase } from "./supabase.js";

const localIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const count = async (query) => {
  const r = await query;
  return r.error ? null : r.count ?? 0;
};
const head = (table) => supabase.from(table).select("id", { count: "exact", head: true });

export async function loadDashboardStats(profile) {
  const y = await supabase.from("academic_years").select("id,label").eq("is_current", true).maybeSingle();
  if (y.error) return { data: null, error: y.error };
  const year = y.data;
  const stats = { year, students: null, sections: null, mySections: null, staff: null, absentToday: null, noRole: null };
  if (!year) return { data: stats, error: null };

  const role = profile?.role;
  const jobs = [
    count(head("enrollments").eq("academic_year_id", year.id).neq("status", "withdrawn")).then((n) => (stats.students = n)),
    count(head("attendance").eq("attendance_date", localIso()).eq("status", "absent")).then((n) => (stats.absentToday = n)),
  ];
  if (role === "teacher") {
    jobs.push(
      (async () => {
        const me = await supabase.from("staff").select("id").eq("profile_id", profile.id).maybeSingle();
        if (me.error || !me.data) return;
        const [a, h] = await Promise.all([
          supabase.from("teacher_assignments").select("section_id").eq("academic_year_id", year.id).eq("staff_id", me.data.id),
          supabase.from("sections").select("id").eq("academic_year_id", year.id).eq("homeroom_staff_id", me.data.id),
        ]);
        if (a.error || h.error) return;
        stats.mySections = new Set([...a.data.map((x) => x.section_id), ...h.data.map((x) => x.id)]).size;
      })()
    );
  } else {
    jobs.push(count(head("sections").eq("academic_year_id", year.id)).then((n) => (stats.sections = n)));
    if (["system_admin", "director", "vice_director", "unit_leader", "registrar"].includes(role)) {
      jobs.push(count(head("staff").eq("employment_status", "active")).then((n) => (stats.staff = n)));
    }
  }
  if (role === "system_admin") jobs.push(count(head("profiles").is("role", null)).then((n) => (stats.noRole = n)));
  await Promise.all(jobs);
  return { data: stats, error: null };
}
