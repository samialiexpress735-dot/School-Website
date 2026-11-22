import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, Loading, LoadError, pick, fullName } from "../../lib/ui.jsx";
import { useMarksRef, useYearSemester, YearSemesterPicker, sectionLabel } from "../marks/MarksParts.jsx";
import { useVisibleSections, loadSectionStudents, byName } from "./AttendanceParts.jsx";

export default function SummaryPage() {
  const refQ = useMarksRef();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  return <Inner refData={refQ.data} />;
}

function Inner({ refData }) {
  const { t, lang } = useLang();
  const ys = useYearSemester(refData);
  const vis = useVisibleSections(refData, ys.yearId);
  const [sectionId, setSectionId] = useState("");
  useEffect(() => {
    if (!vis.sections.find((s) => s.id === sectionId)) setSectionId(vis.sections[0]?.id || "");
  }, [vis.sections, sectionId]);

  if (vis.loading) return <Loading />;
  if (vis.error) return <LoadError />;
  if (!refData.years.length) return <p className="empty">{t("marks.noYear")}</p>;
  const section = vis.sections.find((s) => s.id === sectionId) || null;

  return (
    <section className="panel">
      <p className="muted">{t("attendance.summary.intro")}</p>
      <YearSemesterPicker
        refData={refData}
        state={ys}
        extra={
          <label>
            <span className="small muted">{t("marks.section")}</span>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {vis.sections.map((s) => (
                <option key={s.id} value={s.id}>{sectionLabel(s, refData.grades, refData.streams, lang, pick)}</option>
              ))}
            </select>
          </label>
        }
      />
      {!section ? <p className="empty">{t("attendance.noSections")}</p> : <Table key={`${ys.yearId}|${ys.semesterId}|${section.id}`} yearId={ys.yearId} semesterId={ys.semesterId} section={section} />}
    </section>
  );
}

function Table({ yearId, semesterId, section }) {
  const { t, lang } = useLang();
  const q = useQuery(async () => {
    const [st, sm] = await Promise.all([
      loadSectionStudents(section.id, yearId),
      supabase.rpc("attendance_summary", { p_section: section.id, p_semester: semesterId || null }),
    ]);
    const bad = [st, sm].find((r) => r.error);
    return bad ? { data: null, error: bad.error } : { data: { students: st.data, summary: sm.data }, error: null };
  }, [section.id, yearId, semesterId]);

  const rows = useMemo(() => {
    if (!q.data) return [];
    const m = new Map(q.data.summary.map((s) => [s.enrollment_id, s]));
    return [...q.data.students].sort(byName(lang, fullName)).map((e) => ({ e, s: m.get(e.id) }));
  }, [q.data, lang]);

  if (q.loading) return <Loading />;
  if (q.error) return <LoadError />;
  if (rows.length === 0) return <p className="empty">{t("attendance.noStudents")}</p>;
  const threshold = q.data.summary[0]?.threshold;
  const days = Math.max(0, ...q.data.summary.map((s) => s.days_recorded));

  return (
    <>
      <p className="small muted">{t("attendance.summary.note", { n: threshold ?? "–", days })}</p>
      <div className="tablewrap">
        <table className="stack">
          <thead>
            <tr>
              <th>{t("marks.student")}</th>
              <th className="center">{t("attendance.status.present")}</th>
              <th className="center">{t("attendance.status.absent")}</th>
              <th className="center">{t("attendance.status.late")}</th>
              <th className="center">{t("attendance.status.excused")}</th>
              <th className="center">{t("attendance.summary.recorded")}</th>
              <th>{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, s }) => (
              <tr key={e.id} className={s?.flagged ? "row-bad" : ""}>
                <th data-label={t("marks.student")} scope="row">
                  {fullName(e.students, lang)}
                  <span className="small muted code-small"> {e.students.student_code}</span>
                </th>
                <td className="center" data-label={t("attendance.status.present")}>{s?.present ?? 0}</td>
                <td className="center" data-label={t("attendance.status.absent")}><strong>{s?.absent ?? 0}</strong></td>
                <td className="center" data-label={t("attendance.status.late")}>{s?.late ?? 0}</td>
                <td className="center" data-label={t("attendance.status.excused")}>{s?.excused ?? 0}</td>
                <td className="center" data-label={t("attendance.summary.recorded")}>{s?.days_recorded ?? 0}</td>
                <td data-label={t("common.status")}>
                  {s?.flagged ? <span className="pill warn">{t("attendance.atLimit")}</span> : <span className="pill ok">{t("attendance.summary.ok")}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
