import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, LoadError, Loading, pick, fullName } from "../../lib/ui.jsx";
import { can, MARK_LOCKERS } from "../../lib/roles.js";
import {
  allComponents, averagePercent, computeSemester, computeYearly, effectiveStream, isPass, percent, pickStructure,
} from "../../lib/marksEngine.js";
import { fetchAll, fmt, loadMarks, loadStructures, scoresForStudent, sortSections, subjectsOfGrade } from "../../lib/marksData.js";
import { useMarksRef, sectionLabel } from "./MarksParts.jsx";
import { useYearSemester } from "./MarksParts.jsx";

export default function ResultsPage() {
  const refQ = useMarksRef();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  return <ResultsInner refData={refQ.data} />;
}

const ALL = "__all__";

function ResultsInner({ refData }) {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const ys = useYearSemester(refData);
  const { yearId } = ys;
  const [sectionId, setSectionId] = useState("");
  const [view, setView] = useState("");
  const seesAll = can(profile, MARK_LOCKERS);

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

  const homeroomOf = (s) => refData.myStaffId && s.homeroom_staff_id === refData.myStaffId;
  const sections = useMemo(() => {
    const all = sectionsQ.data || [];
    const mine = seesAll ? all : all.filter((s) => homeroomOf(s) || (assignQ.data || []).some((a) => a.section_id === s.id));
    return sortSections(mine, refData.grades);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsQ.data, assignQ.data, seesAll]);
  const section = sections.find((s) => s.id === sectionId) || null;
  useEffect(() => {
    if (!sections.find((s) => s.id === sectionId)) setSectionId(sections[0]?.id || "");
  }, [sections, sectionId]);

  const wholeSection = Boolean(section && (seesAll || homeroomOf(section)));
  const subjects = useMemo(() => {
    if (!section) return [];
    const all = subjectsOfGrade(gsQ.data || [], refData.subjects, { yearId, gradeId: section.grade_id, streamId: section.stream_id, streams: refData.streams });
    const mine = new Set((assignQ.data || []).filter((a) => a.section_id === section.id).map((a) => a.subject_id));
    return wholeSection ? all : all.filter((s) => mine.has(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, gsQ.data, assignQ.data, wholeSection]);

  useEffect(() => {
    const valid = (view === ALL && wholeSection) || subjects.find((s) => s.id === view);
    if (!valid) setView(wholeSection ? ALL : subjects[0]?.id || "");
  }, [subjects, view, wholeSection]);

  if (sectionsQ.loading || assignQ.loading || gsQ.loading) return <Loading />;
  if (sectionsQ.error || assignQ.error || gsQ.error) return <LoadError />;
  if (!refData.years.length) return <p className="empty">{t("marks.noYear")}</p>;

  return (
    <section className="panel">
      <p className="muted">{t("marks.results.intro", { pass: fmt(refData.passMark) })}</p>
      <div className="toolbar">
        <label>
          <span className="small muted">{t("marks.year")}</span>
          <select value={yearId} onChange={(e) => ys.changeYear(e.target.value)}>
            {refData.years.map((y) => (
              <option key={y.id} value={y.id}>{y.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="small muted">{t("marks.section")}</span>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{sectionLabel(s, refData.grades, refData.streams, lang, pick)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="small muted">{t("marks.view")}</span>
          <select value={view} onChange={(e) => setView(e.target.value)}>
            {wholeSection && <option value={ALL}>{t("marks.yearlyAverage")} – {t("marks.results.overall")}</option>}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{pick(s, lang)}</option>
            ))}
          </select>
        </label>
      </div>
      {!wholeSection && section && <p className="small muted">{t("marks.results.onlyYours")}</p>}
      {!section ? (
        <p className="empty">{t("marks.results.noSections")}</p>
      ) : (
        <ResultsTable key={`${yearId}|${section.id}`} refData={refData} yearId={yearId} section={section} subjects={subjects} view={view} />
      )}
    </section>
  );
}

function ResultsTable({ refData, yearId, section, subjects, view }) {
  const { t, lang } = useLang();
  const q = useQuery(async () => {
    const [st, en] = await Promise.all([
      loadStructures({ yearId, gradeId: section.grade_id }),
      fetchAll(() =>
        supabase
          .from("enrollments")
          .select("id,status,students(first_name,father_name,grandfather_name,first_name_am,father_name_am,grandfather_name_am)")
          .eq("section_id", section.id)
          .eq("academic_year_id", yearId)
      ),
    ]);
    const bad = [st, en].find((r) => r.error);
    if (bad) return { data: null, error: bad.error };
    const enrollments = en.data.filter((e) => e.status !== "withdrawn");
    const comps = st.data.flatMap((s) => allComponents(s).map((c) => c.id));
    const m = await loadMarks(enrollments.map((e) => e.id), comps);
    if (m.error) return m;
    return { data: { structures: st.data, enrollments, marks: m.data }, error: null };
  }, [yearId, section.id]);

  const sems = refData.semesters.filter((s) => s.academic_year_id === yearId).sort((a, b) => a.number - b.number);
  const stream = effectiveStream(section.stream_id, refData.streams);

  const rows = useMemo(() => {
    if (!q.data) return [];
    const { structures, enrollments, marks } = q.data;
    const students = [...enrollments].sort((a, b) => fullName(a.students, "en").localeCompare(fullName(b.students, "en")));
    // yearly result of one student in one subject
    const subjectYear = (e, subjectId) => {
      const perSem = sems.map((s) => {
        const st = pickStructure(structures, { semesterId: s.id, gradeId: section.grade_id, streamId: stream, subjectId });
        if (!st) return null;
        const c = computeSemester(st, scoresForStudent(marks, e.id, st));
        return c.formulaError ? null : { result: c.result, max: c.max, complete: c.complete, none: c.missing === c.groups.reduce((n, g) => n + g.count, 0) };
      });
      const shown = perSem.map((r) => (r && !r.none ? r : null));
      return { perSem, yearly: computeYearly(shown.map((r) => r && { ...r }), refData.yearlyPlaces) };
    };
    return students.map((e) => ({ e, subjectYear: (id) => subjectYear(e, id) }));
  }, [q.data, sems, section.grade_id, stream, refData.yearlyPlaces]);

  if (q.loading) return <Loading />;
  if (q.error) return <LoadError />;
  if (q.data.enrollments.length === 0) return <p className="empty">{t("marks.results.noStudents")}</p>;
  if (subjects.length === 0) return <p className="empty">{t("marks.entry.noSubjects")}</p>;

  const pill = (avg, complete) => {
    if (avg === null) return <span className="muted">—</span>;
    if (!complete) return <span className="pill warn">{t("marks.incomplete")}</span>;
    return isPass(avg, 100, refData.passMark) ? <span className="pill ok">{t("marks.pass")}</span> : <span className="pill warn">{t("marks.fail")}</span>;
  };
  const cell = (r) => (r ? <span className={r.complete ? "" : "muted"} style={r.complete ? undefined : { fontStyle: "italic" }}>{fmt(r.result, 2)}<span className="small muted"> /{fmt(r.max)}</span></span> : <span className="muted">—</span>);

  if (view === ALL) {
    const list = rows.map(({ e, subjectYear }) => {
      const per = subjects.map((s) => subjectYear(s.id).yearly);
      return { e, per, overall: averagePercent(per.map((y) => y.average), refData.yearlyPlaces), complete: per.every((y) => y.complete) };
    });
    return (
      <div className="tablewrap">
        <table className="stack">
          <thead>
            <tr>
              <th>{t("marks.student")}</th>
              {subjects.map((s) => (<th key={s.id} className="center">{pick(s, lang)}</th>))}
              <th className="center">{t("marks.results.overall")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map(({ e, per, overall, complete }) => (
              <tr key={e.id}>
                <td className="stack-title">{fullName(e.students, lang)}</td>
                {per.map((y, i) => (
                  <td key={subjects[i].id} className="center" data-label={pick(subjects[i], lang)}>
                    {y.average === null ? <span className="muted">—</span> : <span className={y.complete ? "" : "muted"} style={y.complete ? undefined : { fontStyle: "italic" }}>{fmt(y.average, refData.yearlyPlaces)}</span>}
                  </td>
                ))}
                <td className="center" data-label={t("marks.results.overall")}><strong>{overall === null ? "—" : fmt(overall, refData.yearlyPlaces)}</strong></td>
                <td data-label={t("common.status")}>{pill(overall, complete)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const list = rows.map(({ e, subjectYear }) => ({ e, ...subjectYear(view) }));
  const avgs = list.map((x) => x.yearly.average).filter((v) => v !== null);
  const classAvg = avgs.length ? avgs.reduce((s, v) => s + v, 0) / avgs.length : null;
  return (
    <div className="tablewrap">
      <table className="stack">
        <thead>
          <tr>
            <th>{t("marks.student")}</th>
            {sems.map((s) => (<th key={s.id} className="center">{t("marks.semesterN", { n: s.number })}</th>))}
            <th className="center">{t("marks.yearlyAverage")} <span className="small muted">%</span></th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map(({ e, perSem, yearly }) => (
            <tr key={e.id}>
              <td className="stack-title">{fullName(e.students, lang)}</td>
              {perSem.map((r, i) => (<td key={sems[i].id} className="center" data-label={t("marks.semesterN", { n: sems[i].number })}>{cell(r && !r.none ? r : null)}</td>))}
              <td className="center" data-label={t("marks.yearlyAverage")}><strong>{yearly.average === null ? "—" : fmt(yearly.average, refData.yearlyPlaces)}</strong></td>
              <td data-label={t("common.status")}>{pill(yearly.average, yearly.complete)}</td>
            </tr>
          ))}
        </tbody>
        {classAvg !== null && (
          <tfoot>
            <tr>
              <td colSpan={sems.length + 1} className="stack-title">{t("marks.classAverage")}</td>
              <td className="center" data-label=""><strong>{fmt(classAvg, 1)}</strong></td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
