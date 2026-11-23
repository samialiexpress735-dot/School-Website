import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, pick } from "../../lib/ui.jsx";
import { can, MARK_LOCKERS } from "../../lib/roles.js";
import { fetchAll, sortSections, subjectsOfGrade } from "../../lib/marksData.js";
import { sectionLabel } from "../marks/MarksParts.jsx";

// Which sections (and subjects) the signed-in person may report on.
// The administration and unit leaders see everything; a homeroom teacher sees the whole section;
// a subject teacher sees only their own subject(s). The database decides what can really be read.
// wholeOnly: list only the sections where the person can see every subject (rosters, report cards).
export function useSectionScope(refData, yearId, { wholeOnly = false } = {}) {
  const { profile } = useAuth();
  const seesAll = can(profile, MARK_LOCKERS);
  const [sectionId, setSectionId] = useState("");

  const sectionsQ = useQuery(
    () => (yearId ? fetchAll(() => supabase.from("sections").select("*").eq("academic_year_id", yearId)) : { data: [] }),
    [yearId]
  );
  const assignQ = useQuery(
    () =>
      yearId && refData.myStaffId
        ? supabase.from("teacher_assignments").select("section_id,subject_id").eq("academic_year_id", yearId).eq("staff_id", refData.myStaffId)
        : { data: [] },
    [yearId]
  );
  const gsQ = useQuery(
    () => (yearId ? fetchAll(() => supabase.from("grade_subjects").select("*").eq("academic_year_id", yearId)) : { data: [] }),
    [yearId]
  );

  const homeroomOf = (s) => Boolean(refData.myStaffId && s.homeroom_staff_id === refData.myStaffId);
  const sections = useMemo(() => {
    const all = sectionsQ.data || [];
    const taught = (s) => (assignQ.data || []).some((a) => a.section_id === s.id);
    const mine = seesAll ? all : all.filter((s) => homeroomOf(s) || (!wholeOnly && taught(s)));
    return sortSections(mine, refData.grades);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsQ.data, assignQ.data, seesAll, wholeOnly]);

  useEffect(() => {
    if (!sections.find((s) => s.id === sectionId)) setSectionId(sections[0]?.id || "");
  }, [sections, sectionId]);

  const section = sections.find((s) => s.id === sectionId) || null;
  const wholeSection = Boolean(section && (seesAll || homeroomOf(section)));
  const subjects = useMemo(() => {
    if (!section) return [];
    const all = subjectsOfGrade(gsQ.data || [], refData.subjects, { yearId, gradeId: section.grade_id, streamId: section.stream_id, streams: refData.streams });
    const mine = new Set((assignQ.data || []).filter((a) => a.section_id === section.id).map((a) => a.subject_id));
    return wholeSection ? all : all.filter((s) => mine.has(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, gsQ.data, assignQ.data, wholeSection]);

  return {
    loading: sectionsQ.loading || assignQ.loading || gsQ.loading,
    error: sectionsQ.error || assignQ.error || gsQ.error,
    sections, section, sectionId, setSectionId, wholeSection, subjects, gradeSubjects: gsQ.data || [],
  };
}

export function YearSectionPicker({ refData, ys, scope, extra }) {
  const { t, lang } = useLang();
  return (
    <div className="toolbar no-print">
      <label>
        <span className="small muted">{t("marks.year")}</span>
        <select value={ys.yearId} onChange={(e) => ys.changeYear(e.target.value)}>
          {refData.years.map((y) => (<option key={y.id} value={y.id}>{y.label}</option>))}
        </select>
      </label>
      <label>
        <span className="small muted">{t("marks.section")}</span>
        <select value={scope.sectionId} onChange={(e) => scope.setSectionId(e.target.value)}>
          {scope.sections.map((s) => (<option key={s.id} value={s.id}>{sectionLabel(s, refData.grades, refData.streams, lang, pick)}</option>))}
        </select>
      </label>
      {extra}
    </div>
  );
}

// "Pass" / "Fail" / "Incomplete" pill for an overall or subject average.
export function ResultPill({ average, complete, passMark }) {
  const { t } = useLang();
  if (average === null || average === undefined) return <span className="muted">—</span>;
  if (!complete) return <span className="pill warn">{t("marks.incomplete")}</span>;
  return average * 1 >= passMark - 1e-9 ? <span className="pill ok">{t("marks.pass")}</span> : <span className="pill warn">{t("marks.fail")}</span>;
}
