import { useCallback, useState } from "react";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, LoadError, Loading, pick, fullName } from "../../lib/ui.jsx";
import { fmt } from "../../lib/marksData.js";
import { loadReport } from "../../lib/reportsData.js";
import { formatEc } from "../../lib/ethiopian.js";
import { isPass } from "../../lib/marksEngine.js";
import { sectionLabel, useMarksRef, useYearSemester } from "../marks/MarksParts.jsx";
import { useSectionScope, YearSectionPicker } from "./ReportsParts.jsx";
import { pickTemplate } from "../../lib/reportTemplate.js";
import { loadTemplates } from "./formData.js";
import FormCards from "./FormCards.jsx";

const ALL = "__all__";

export default function ReportCardPage() {
  const refQ = useMarksRef();
  const { t } = useLang();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  if (!refQ.data.years.length) return <p className="empty">{t("marks.noYear")}</p>;
  return <Inner refData={refQ.data} />;
}

function Inner({ refData }) {
  const { t } = useLang();
  const ys = useYearSemester(refData);
  const scope = useSectionScope(refData, ys.yearId, { wholeOnly: true });
  if (scope.loading) return <Loading />;
  if (scope.error) return <LoadError />;
  return (
    <section className="panel">
      <p className="muted no-print">{t("reports.cards.intro")}</p>
      {!scope.section ? (
        <>
          <YearSectionPicker refData={refData} ys={ys} scope={scope} />
          <p className="empty">{t("reports.noSections")}</p>
        </>
      ) : (
        <Cards key={`${ys.yearId}|${scope.section.id}`} refData={refData} ys={ys} scope={scope} />
      )}
    </section>
  );
}

function Cards({ refData, ys, scope }) {
  const { t, lang } = useLang();
  const { section, gradeSubjects } = scope;
  const [who, setWho] = useState(ALL);
  const [mode, setMode] = useState(null);           // null = the default (the school's form when there is one)
  const [formFailed, setFormFailed] = useState(false);
  const [printForm, setPrintForm] = useState(null); // set by FormCards once its page images can be printed
  const onReady = useCallback((fn) => setPrintForm(() => fn), []);
  const tplQ = useQuery(() => loadTemplates(), []);
  const q = useQuery(() => loadReport({ refData, gradeSubjects, yearId: ys.yearId, gradeId: section.grade_id, sectionId: section.id }), [ys.yearId, section.id]);
  const group = q.data?.groups[0];
  const rows = group ? [...group.report.rows].sort((a, b) => fullName(a.enrollment.students, "en").localeCompare(fullName(b.enrollment.students, "en"))) : [];
  const shown = who === ALL ? rows : rows.filter((r) => r.enrollment.id === who);
  const tpl = group ? pickTemplate(tplQ.data, { gradeId: section.grade_id, streamId: group.streamId, kind: "yearly" }) : null;
  const useSchool = Boolean(tpl) && !formFailed && (mode ?? "school") === "school";
  const printNow = () => (useSchool ? printForm?.() : window.print());
  const picker = (
    <>
      <label>
        <span className="small muted">{t("marks.student")}</span>
        <select value={who} onChange={(e) => setWho(e.target.value)}>
          <option value={ALL}>{t("reports.cards.all")}</option>
          {rows.map((r) => (<option key={r.enrollment.id} value={r.enrollment.id}>{fullName(r.enrollment.students, lang)}</option>))}
        </select>
      </label>
      {tpl && !formFailed && (
        <label>
          <span className="small muted">{t("reports.formUse.label")}</span>
          <select value={useSchool ? "school" : "plain"} onChange={(e) => setMode(e.target.value)}>
            <option value="school">{t("reports.formUse.school")}</option>
            <option value="plain">{t("reports.formUse.plain")}</option>
          </select>
        </label>
      )}
      <button type="button" onClick={printNow} disabled={shown.length === 0 || (useSchool && !printForm)}>{t("reports.print")}</button>
    </>
  );
  return (
    <>
      <YearSectionPicker refData={refData} ys={ys} scope={scope} extra={picker} />
      {formFailed && <p className="flash error no-print" role="alert"><span>{t("reports.formUse.loadFailed")}</span></p>}
      {!tpl && (tplQ.data?.length ?? 0) > 0 && <p className="small muted no-print">{t("reports.formUse.none")}</p>}
      {useSchool && <p className="small muted no-print">{t("reports.formUse.note")}</p>}
      {q.loading ? <Loading /> : q.error ? <LoadError /> : shown.length === 0 ? <p className="empty">{t("marks.results.noStudents")}</p> : useSchool ? (
        <FormCards template={tpl} rows={shown} refData={refData} year={refData.years.find((y) => y.id === ys.yearId)} section={section} onReady={onReady} onFailed={() => setFormFailed(true)} />
      ) : (
        shown.map((r) => (
          <ReportCard key={r.enrollment.id} refData={refData} year={refData.years.find((y) => y.id === ys.yearId)} section={section} sems={q.data.sems} subjects={group.subjects} row={r} total={rows.length} />
        ))
      )}
    </>
  );
}

function ReportCard({ refData, year, section, sems, subjects, row, total }) {
  const { t, lang } = useLang();
  const places = refData.yearlyPlaces;
  const s = row.enrollment.students;
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const verdict = row.overall === null ? null : !row.complete ? "incomplete" : row.passed ? "pass" : "fail";
  return (
    <article className="report-card">
      <div className="rc-head">
        <div className="rc-title">
          <strong>{t("school.name")}</strong>
          <span>{t("school.city")}</span>
          <h2>{t("reports.card.title")}</h2>
        </div>
      </div>
      <dl className="rc-info">
        <div><dt>{t("marks.student")}</dt><dd>{fullName(s, lang)}</dd></div>
        <div><dt>{t("reports.studentId")}</dt><dd>{s.student_code}</dd></div>
        <div><dt>{t("reports.card.year")}</dt><dd>{year?.label}</dd></div>
        <div><dt>{t("reports.card.gradeSection")}</dt><dd>{sectionLabel(section, refData.grades, refData.streams, lang, pick)}</dd></div>
        <div><dt>{t("reports.card.sex")}</dt><dd>{t(`students.sexes.${s.sex}`)}</dd></div>
        <div><dt>{t("reports.card.dob")}</dt><dd>{formatEc(s.date_of_birth, lang)}</dd></div>
      </dl>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>{t("reports.card.subject")}</th>
              {sems.map((x) => (<th key={x.id} className="center">{t("marks.semesterN", { n: x.number })}</th>))}
              <th className="center">{t("marks.yearlyAverage")} %</th>
              <th className="center">{t("reports.card.result")}</th>
            </tr>
          </thead>
          <tbody>
            {row.results.map((x) => (
              <tr key={x.subject.id}>
                <td>{pick(x.subject, lang)}</td>
                {x.perSem.map((r, i) => (
                  <td key={sems[i].id} className="center">
                    {r ? <span style={r.complete ? undefined : { fontStyle: "italic" }}>{fmt(r.result, 2)}<span className="small muted"> /{fmt(r.max)}</span></span> : "—"}
                  </td>
                ))}
                <td className="center"><strong>{x.yearly.average === null ? "—" : fmt(x.yearly.average, places)}</strong></td>
                <td className="center">
                  {x.yearly.average === null ? "—" : !x.yearly.complete ? t("marks.incomplete") : isPass(x.yearly.average, 100, refData.passMark) ? t("marks.pass") : t("marks.fail")}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={sems.length + 1}>{t("marks.results.overall")}</td>
              <td className="center"><strong>{row.overall === null ? "—" : fmt(row.overall, places)}</strong></td>
              <td className="center"><strong>{verdict ? t(`reports.card.verdict.${verdict}`) : "—"}</strong></td>
            </tr>
            <tr>
              <td colSpan={sems.length + 1}>{t("reports.card.rank")}</td>
              <td className="center" colSpan={2}>{row.rank ? t("reports.of", { n: row.rank, total }) : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="small muted">{t("reports.card.passNote", { pass: fmt(refData.passMark) })}{!row.complete && ` ${t("reports.card.incompleteNote")}`}</p>
      <div className="rc-sign">
        <div><span>{t("reports.card.homeroom")}</span></div>
        <div><span>{t("reports.card.director")}</span></div>
        <div><span>{t("reports.card.date")}: {formatEc(iso, lang)}</span></div>
      </div>
    </article>
  );
}
