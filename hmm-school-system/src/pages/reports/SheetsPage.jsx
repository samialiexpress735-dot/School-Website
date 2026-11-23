import { useEffect, useState } from "react";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, LoadError, Loading, pick, fullName } from "../../lib/ui.jsx";
import { fmt } from "../../lib/marksData.js";
import { loadReport } from "../../lib/reportsData.js";
import { isPass } from "../../lib/marksEngine.js";
import { rankValues } from "../../lib/reports.js";
import { useMarksRef, useYearSemester } from "../marks/MarksParts.jsx";
import { useSectionScope, YearSectionPicker, ResultPill } from "./ReportsParts.jsx";

export default function SheetsPage() {
  const refQ = useMarksRef();
  const { t } = useLang();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  if (!refQ.data.years.length) return <p className="empty">{t("marks.noYear")}</p>;
  return <Inner refData={refQ.data} />;
}

function Inner({ refData }) {
  const { t, lang } = useLang();
  const ys = useYearSemester(refData);
  const scope = useSectionScope(refData, ys.yearId);
  const [subjectId, setSubjectId] = useState("");
  useEffect(() => {
    if (!scope.subjects.find((s) => s.id === subjectId)) setSubjectId(scope.subjects[0]?.id || "");
  }, [scope.subjects, subjectId]);
  if (scope.loading) return <Loading />;
  if (scope.error) return <LoadError />;
  const picker = (
    <>
      <label>
        <span className="small muted">{t("reports.card.subject")}</span>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {scope.subjects.map((s) => (<option key={s.id} value={s.id}>{pick(s, lang)}</option>))}
        </select>
      </label>
      <button type="button" onClick={() => window.print()} disabled={!subjectId}>{t("reports.print")}</button>
    </>
  );
  return (
    <section className="panel">
      <p className="muted no-print">{t("reports.sheets.intro")}</p>
      <YearSectionPicker refData={refData} ys={ys} scope={scope} extra={picker} />
      {!scope.section ? <p className="empty">{t("reports.noSections")}</p> : !subjectId ? <p className="empty">{t("marks.entry.noSubjects")}</p> : (
        <Sheet key={`${ys.yearId}|${scope.section.id}|${subjectId}`} refData={refData} yearId={ys.yearId} section={scope.section} gradeSubjects={scope.gradeSubjects} subjectId={subjectId} />
      )}
    </section>
  );
}

function Sheet({ refData, yearId, section, gradeSubjects, subjectId }) {
  const { t, lang } = useLang();
  const q = useQuery(() => loadReport({ refData, gradeSubjects, yearId, gradeId: section.grade_id, sectionId: section.id }), [yearId, section.id]);
  if (q.loading) return <Loading />;
  if (q.error) return <LoadError />;
  const group = q.data.groups[0];
  const idx = group ? group.subjects.findIndex((s) => s.id === subjectId) : -1;
  if (!group || idx < 0 || group.report.rows.length === 0) return <p className="empty">{t("marks.results.noStudents")}</p>;
  const sems = q.data.sems;
  const places = refData.yearlyPlaces;
  const list = group.report.rows.map((r) => ({ e: r.enrollment, ...r.results[idx] }));
  const ranks = rankValues(list.map((x) => x.yearly.average));
  list.forEach((x, i) => (x.rank = ranks[i]));
  list.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const avgs = list.map((x) => x.yearly.average).filter((v) => v !== null);
  const done = list.filter((x) => x.yearly.average !== null && x.yearly.complete);
  const passed = done.filter((x) => isPass(x.yearly.average, 100, refData.passMark)).length;
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th className="center">{t("reports.rank")}</th>
            <th>{t("marks.student")}</th>
            {sems.map((s) => (<th key={s.id} className="center">{t("marks.semesterN", { n: s.number })}</th>))}
            <th className="center">{t("marks.yearlyAverage")} %</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((x) => (
            <tr key={x.e.id}>
              <td className="center"><strong>{x.rank ?? "—"}</strong></td>
              <td>{fullName(x.e.students, lang)}</td>
              {x.perSem.map((r, i) => (
                <td key={sems[i].id} className="center">
                  {r ? <span style={r.complete ? undefined : { fontStyle: "italic" }}>{fmt(r.result, 2)}<span className="small muted"> /{fmt(r.max)}</span></span> : <span className="muted">—</span>}
                </td>
              ))}
              <td className="center"><strong>{x.yearly.average === null ? "—" : fmt(x.yearly.average, places)}</strong></td>
              <td><ResultPill average={x.yearly.average} complete={x.yearly.complete} passMark={refData.passMark} /></td>
            </tr>
          ))}
        </tbody>
        {avgs.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={sems.length + 2}>
                {t("marks.classAverage")}: <strong>{fmt(avgs.reduce((s, v) => s + v, 0) / avgs.length, 1)}</strong>
                {" · "}{t("reports.sheets.highest")}: <strong>{fmt(Math.max(...avgs), places)}</strong>
                {" · "}{t("reports.sheets.lowest")}: <strong>{fmt(Math.min(...avgs), places)}</strong>
                {done.length > 0 && <>{" · "}{t("reports.sheets.passed")}: <strong>{passed}/{done.length}</strong></>}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
