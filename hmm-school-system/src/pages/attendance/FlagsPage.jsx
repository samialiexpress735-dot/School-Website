import { useMemo } from "react";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, Loading, LoadError, pick, fullName } from "../../lib/ui.jsx";
import { fetchAll } from "../../lib/marksData.js";
import { useMarksRef, useYearSemester, YearSemesterPicker, sectionLabel } from "../marks/MarksParts.jsx";

const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export default function FlagsPage() {
  const refQ = useMarksRef();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  return <Inner refData={refQ.data} />;
}

function Inner({ refData }) {
  const { t, lang } = useLang();
  const ys = useYearSemester(refData);
  const { yearId, semesterId } = ys;

  const q = useQuery(async () => {
    if (!yearId) return { data: { flags: [], enrollments: [], sections: [] }, error: null };
    const fl = await supabase.rpc("attendance_flags", { p_year: yearId, p_semester: semesterId || null });
    if (fl.error) return { data: null, error: fl.error };
    const flags = fl.data;
    const sectionIds = [...new Set(flags.map((f) => f.section_id))];
    const [secs, ens] = await Promise.all([
      sectionIds.length ? fetchAll(() => supabase.from("sections").select("*").in("id", sectionIds)) : { data: [] },
      (async () => {
        const rows = [];
        for (const c of chunks(flags.map((f) => f.enrollment_id), 60)) {
          const r = await supabase.from("enrollments").select("id,students(first_name,father_name,grandfather_name,first_name_am,father_name_am,grandfather_name_am,student_code)").in("id", c);
          if (r.error) return r;
          rows.push(...r.data);
        }
        return { data: rows };
      })(),
    ]);
    const bad = [secs, ens].find((r) => r.error);
    return bad ? { data: null, error: bad.error } : { data: { flags, enrollments: ens.data, sections: secs.data }, error: null };
  }, [yearId, semesterId]);

  const rows = useMemo(() => {
    if (!q.data) return [];
    const en = new Map(q.data.enrollments.map((e) => [e.id, e]));
    const sec = new Map(q.data.sections.map((s) => [s.id, s]));
    return q.data.flags
      .map((f) => ({ f, e: en.get(f.enrollment_id), s: sec.get(f.section_id) }))
      .filter((r) => r.e && r.s)
      .sort((a, b) => b.f.absent - a.f.absent || fullName(a.e.students, lang).localeCompare(fullName(b.e.students, lang)));
  }, [q.data, lang]);

  if (!refData.years.length) return <p className="empty">{t("marks.noYear")}</p>;

  return (
    <section className="panel">
      <p className="muted">{t("attendance.flags.intro")}</p>
      <YearSemesterPicker refData={refData} state={ys} />
      {q.loading ? (
        <Loading />
      ) : q.error ? (
        <LoadError />
      ) : rows.length === 0 ? (
        <p className="empty">{t("attendance.flags.none")}</p>
      ) : (
        <div className="tablewrap">
          <table className="stack">
            <thead>
              <tr>
                <th>{t("marks.student")}</th>
                <th>{t("marks.section")}</th>
                <th className="center">{t("attendance.status.absent")}</th>
                <th className="center">{t("attendance.flags.limit")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ f, e, s }) => (
                <tr key={f.enrollment_id}>
                  <th data-label={t("marks.student")} scope="row">
                    {fullName(e.students, lang)}
                    <span className="small muted code-small"> {e.students.student_code}</span>
                  </th>
                  <td data-label={t("marks.section")}>{sectionLabel(s, refData.grades, refData.streams, lang, pick)}</td>
                  <td className="center" data-label={t("attendance.status.absent")}><span className="pill warn">{f.absent}</span></td>
                  <td className="center" data-label={t("attendance.flags.limit")}>{f.threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
