import { useMemo } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useQuery } from "../../lib/ui.jsx";
import { can, ATTENDANCE_VIEW_ALL } from "../../lib/roles.js";
import { fetchAll, sortSections } from "../../lib/marksData.js";

// The sections the signed-in person may see in a year: everyone with a view-all role sees all of them,
// a teacher sees the sections they teach or are homeroom of.
export function useVisibleSections(refData, yearId) {
  const { profile } = useAuth();
  const seesAll = can(profile, ATTENDANCE_VIEW_ALL);
  const sectionsQ = useQuery(
    () => (yearId ? fetchAll(() => supabase.from("sections").select("*").eq("academic_year_id", yearId)) : { data: [] }),
    [yearId]
  );
  const assignQ = useQuery(
    () =>
      yearId && refData.myStaffId
        ? supabase.from("teacher_assignments").select("section_id").eq("academic_year_id", yearId).eq("staff_id", refData.myStaffId)
        : { data: [] },
    [yearId]
  );
  const homeroomOf = (s) => Boolean(refData.myStaffId && s.homeroom_staff_id === refData.myStaffId);
  const assigned = useMemo(() => new Set((assignQ.data || []).map((a) => a.section_id)), [assignQ.data]);
  const sections = useMemo(() => {
    const all = sectionsQ.data || [];
    const mine = seesAll ? all : all.filter((s) => homeroomOf(s) || assigned.has(s.id));
    return sortSections(mine, refData.grades);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsQ.data, assigned, seesAll]);
  return {
    sections,
    loading: sectionsQ.loading || assignQ.loading,
    error: sectionsQ.error || assignQ.error,
    reload: sectionsQ.reload,
    homeroomOf,
    isMine: (s) => homeroomOf(s) || assigned.has(s.id),
  };
}

// Active students of a section in a year, with their names
export async function loadSectionStudents(sectionId, yearId) {
  const r = await fetchAll(() =>
    supabase
      .from("enrollments")
      .select("id,status,students(first_name,father_name,grandfather_name,first_name_am,father_name_am,grandfather_name_am,student_code)")
      .eq("section_id", sectionId)
      .eq("academic_year_id", yearId)
  );
  if (r.error) return r;
  return { data: r.data.filter((e) => e.status !== "withdrawn" && e.status !== "graduated"), error: null };
}

// The semester that contains a date, or null
export const semesterOfDate = (semesters, yearId, iso) =>
  semesters.find((s) => s.academic_year_id === yearId && s.start_date && s.end_date && iso >= s.start_date && iso <= s.end_date) || null;

export const byName = (lang, nameFn) => (a, b) => nameFn(a.students, lang).localeCompare(nameFn(b.students, lang), lang === "am" ? "am" : "en");
