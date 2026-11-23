import { useLang } from "../../i18n/index.jsx";
import { useQuery, LoadError, Loading, pick, fullName } from "../../lib/ui.jsx";
import { fmt } from "../../lib/marksData.js";
import { loadReport } from "../../lib/reportsData.js";
import { useMarksRef, useYearSemester } from "../marks/MarksParts.jsx";
import { useSectionScope, YearSectionPicker, ResultPill } from "./ReportsParts.jsx";

export default function RosterPage() {
  const refQ = useMarksRef();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  if (!refQ.data.years.length) return <RosterEmpty />;
  return <Inner refData={refQ.data} />;
}
const RosterEmpty = () => {
  const { t } = useLang();
  return <p className="empty">{t("marks.noYear")}</p>;
};

function Inner({ refData }) {
  const { t } = useLang();
  const ys = useYearSemester(refData);
  const scope = useSectionScope(refData, ys.yearId, { wholeOnly: true });
  if (scope.loading) return <Loading />;
  if (scope.error) return <LoadError />;
  return (
    <section className="panel">
      <p className="muted no-print">{t("reports.roster.intro", { pass: fmt(refData.passMark) })}</p>
      <YearSectionPicker refData={refData} ys={ys} scope={scope} extra={<button type="button" onClick={() => window.print()}>{t("reports.print")}</button>} />
      {!scope.section ? <p className="empty">{t("reports.noSections")}</p> : <Roster key={`${ys.yearId}|${scope.section.id}`} refData={refData} yearId={ys.yearId} section={scope.section} gradeSubjects={scope.gradeSubjects} />}
    </section>
  );
}

function Roster({ refData, yearId, section, gradeSubjects }) {
  const { t, lang } = useLang();
  const q = useQuery(() => loadReport({ refData, gradeSubjects, yearId, gradeId: section.grade_id, sectionId: section.id }), [yearId, section.id]);
  if (q.loading) return <Loading />;
  if (q.error) return <LoadError />;
  const group = q.data.groups[0];
  if (!group || group.report.rows.length === 0) return <p className="empty">{t("marks.results.noStudents")}</p>;
  const { subjects, report } = group;
  const rows = [...report.rows].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const places = refData.yearlyPlaces;
  const slanted = (r) => (r.complete ? undefined : { fontStyle: "italic" });
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th className="center">{t("reports.rank")}</th>
            <th>{t("marks.student")}</th>
            {subjects.map((s) => (<th key={s.id} className="center">{pick(s, lang)}</th>))}
            <th className="center">{t("marks.results.overall")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.enrollment.id}>
              <td className="center"><strong>{r.rank ?? "—"}</strong></td>
              <td>{fullName(r.enrollment.students, lang)}<div className="small muted">{r.enrollment.students.student_code}</div></td>
              {r.results.map((x, i) => (
                <td key={subjects[i].id} className="center" style={x.yearly.complete ? undefined : { fontStyle: "italic" }}>
                  {x.yearly.average === null ? <span className="muted">—</span> : fmt(x.yearly.average, places)}
                </td>
              ))}
              <td className="center" style={slanted(r)}><strong>{r.overall === null ? "—" : fmt(r.overall, places)}</strong></td>
              <td><ResultPill average={r.overall} complete={r.complete} passMark={refData.passMark} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>{t("marks.classAverage")}</td>
            {report.classAverages.map((a, i) => (<td key={subjects[i].id} className="center">{a === null ? "—" : fmt(a, places)}</td>))}
            <td className="center"><strong>{report.classOverall === null ? "—" : fmt(report.classOverall, places)}</strong></td>
            <td />
          </tr>
        </tfoot>
      </table>
      <p className="small muted">{t("reports.italicNote")}</p>
    </div>
  );
}
