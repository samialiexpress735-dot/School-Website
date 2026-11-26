import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, Loading, LoadError } from "../../lib/ui.jsx";
import { DEFAULT_AGE_LIMITS } from "../../lib/age.js";
import { studentTemplateXlsx, resultsCsv, downloadText, downloadBlob, readImportFile, checkRow, nameKey } from "../../lib/importer.js";

const CHUNK = 50;

export default function ImportPage() {
  const { t } = useLang();
  const [yearId, setYearId] = useState("");
  const [rows, setRows] = useState(null);      // checked rows
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [progress, setProgress] = useState(null);
  const [outcome, setOutcome] = useState(null); // { ok, failed, results }
  const [templateError, setTemplateError] = useState(false);

  const ref = useQuery(async () => {
    const [y, g, s, a] = await Promise.all([
      supabase.from("academic_years").select("id,label,is_current,year_ec,gc_start_year,start_date,is_closed").order("year_ec", { ascending: false }),
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*"),
      supabase.from("school_settings").select("*").eq("key", "age_limits").maybeSingle(),
    ]);
    const bad = [y, g, s, a].find((r) => r.error);
    return bad || { data: { years: y.data, grades: g.data, streams: s.data, ageLimits: a.data?.value || DEFAULT_AGE_LIMITS } };
  }, []);
  useEffect(() => {
    if (ref.data && !yearId) setYearId((ref.data.years.find((y) => y.is_current) || ref.data.years[0])?.id || "");
  }, [ref.data]); // eslint-disable-line
  const sections = useQuery(() => (yearId ? supabase.from("sections").select("id,name,shift,grade_id,stream_id").eq("academic_year_id", yearId) : { data: [] }), [yearId]);

  const year = ref.data?.years.find((y) => y.id === yearId);
  const ctx = useMemo(() => !ref.data ? null : ({
    yearId, grades: ref.data.grades, streams: ref.data.streams, sections: sections.data || [], ageLimits: ref.data.ageLimits,
    yearStart: year?.start_date || (year?.gc_start_year ? `${year.gc_start_year}-09-11` : null),
  }), [ref.data, sections.data, yearId, year]);

  if (ref.loading || sections.loading) return <Loading />;
  if (ref.error || sections.error) return <LoadError />;
  if (!ref.data.years.length) return <p className="empty">{t("import.noYear")}</p>;

  async function downloadTemplate() {
    setTemplateError(false);
    try { downloadBlob("student-import-template.xlsx", await studentTemplateXlsx({ grades: ref.data.grades, streams: ref.data.streams, sections: sections.data || [] })); } catch { setTemplateError(true); }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true); setReadError(false); setOutcome(null); setRows(null);
    try {
      const raw = await readImportFile(file);
      if (!raw.length) throw new Error("empty");
      const checked = raw.map((r) => ({ ...checkRow(r, ctx), raw: r }));

      // the same student twice in the file
      const seen = new Map();
      checked.forEach((c) => {
        const k = nameKey({ ...c.payload.student, dob: c.dob });
        if (!c.dob) return;
        seen.set(k, (seen.get(k) || 0) + 1);
      });
      checked.forEach((c) => { if (c.dob && seen.get(nameKey({ ...c.payload.student, dob: c.dob })) > 1) c.warnings.push({ key: "dupInFile", params: {} }); });

      // students that already exist (same names and date of birth)
      const dobs = [...new Set(checked.map((c) => c.dob).filter(Boolean))];
      const existing = new Set();
      for (let i = 0; i < dobs.length; i += 150) {
        const { data } = await supabase.from("students").select("first_name,father_name,grandfather_name,date_of_birth").in("date_of_birth", dobs.slice(i, i + 150));
        (data || []).forEach((s) => existing.add(nameKey({ ...s, dob: s.date_of_birth })));
      }
      checked.forEach((c) => { if (c.dob && existing.has(nameKey({ ...c.payload.student, dob: c.dob }))) c.warnings.push({ key: "dupInDb", params: {} }); });
      setRows(checked);
    } catch {
      setReadError(true);
    }
    setReading(false);
  }

  const good = (rows || []).filter((r) => r.errors.length === 0);
  const withWarn = good.filter((r) => r.warnings.length > 0).length;
  const bad = (rows || []).length - good.length;

  async function run() {
    setProgress({ done: 0, total: good.length });
    const results = [];
    for (let i = 0; i < good.length; i += CHUNK) {
      const part = good.slice(i, i + CHUNK);
      const { data, error } = await supabase.rpc("import_students", { p_rows: part.map((r) => r.payload) });
      part.forEach((r, j) => {
        const x = error ? { ok: false, error: error.message } : data[j];
        results.push({ row: r.row, name: r.name, ok: x.ok, code: x.student_code, error: x.error });
      });
      setProgress({ done: Math.min(i + CHUNK, good.length), total: good.length });
    }
    setProgress(null);
    const failedRows = results.filter((r) => !r.ok);
    // rows that failed validation in the preview are listed in the results file too
    const skipped = (rows || []).filter((r) => r.errors.length).map((r) => ({ row: r.row, name: r.name, ok: false, error: r.errors.map((e) => t(`import.err.${e.key}`, e.params)).join(" ") }));
    setOutcome({ ok: results.length - failedRows.length, failed: failedRows.length, results: [...results, ...skipped].sort((a, b) => a.row - b.row) });
    setRows(null);
  }

  return (
    <>
      <p className="muted">{t("import.intro")}</p>
      <section className="panel">
        <label htmlFor="imp_year">{t("import.year")}</label>
        <select id="imp_year" value={yearId} onChange={(e) => { setYearId(e.target.value); setRows(null); setOutcome(null); }}>
          {ref.data.years.filter((y) => !y.is_closed).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
      </section>

      <section className="panel">
        <h2>{t("import.step1")}</h2>
        <button type="button" className="btn-small secondary" onClick={downloadTemplate}>{t("import.download")}</button>
        {templateError && <p className="flash error" role="alert">{t("import.templateFailed")}</p>}
      </section>

      <section className="panel">
        <h2>{t("import.step2")}</h2>
        <p className="muted">{t("import.fileHelp")}</p>
        <label className="btn-small linkbtn filebtn">
          {t("import.choose")}
          <input type="file" accept=".csv,.xlsx,text/csv" onChange={onFile} className="sr-only" />
        </label>
        {reading && <p role="status">{t("import.reading")}</p>}
        {readError && <p className="flash error" role="alert">{t("import.readFailed")}</p>}
      </section>

      {rows && (
        <section className="panel">
          <h2>{t("import.step3")}</h2>
          <p role="status"><strong>{t("import.summary", { ok: good.length - withWarn, warn: withWarn, bad })}</strong></p>
          <div className="tablewrap">
            <table className="stack">
              <thead><tr><th>{t("import.row")}</th><th>{t("import.student")}</th><th>{t("import.result")}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={r.errors.length ? "row-bad" : r.warnings.length ? "row-warn" : ""}>
                    <td data-label={t("import.row")}>{r.row}</td>
                    <th scope="row" data-label={t("import.student")}>{r.name || "—"}</th>
                    <td data-label={t("import.result")}>
                      {r.errors.length === 0 && r.warnings.length === 0 && <span className="pill ok">{t("import.ready")}</span>}
                      {r.errors.map((e, i) => <p key={`e${i}`} className="small msg-err"><strong>{t("import.error")}:</strong> {t(`import.err.${e.key}`, e.params)}</p>)}
                      {r.warnings.map((e, i) => <p key={`w${i}`} className="small msg-warn"><strong>{t("import.warning")}:</strong> {t(`import.warn.${e.key}`, e.params)}</p>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row-actions wizard-actions">
            <button type="button" className="btn-small" disabled={!good.length || Boolean(progress)} aria-busy={Boolean(progress)} onClick={run}>
              {progress ? `${t("import.importing")} ${progress.done}/${progress.total}` : t("import.importReady", { n: good.length })}
            </button>
          </div>
        </section>
      )}

      {outcome && (
        <section className="notice success" role="status">
          <h2>{t("import.done", { n: outcome.ok })}</h2>
          {outcome.failed > 0 && <p className="msg-err">{t("import.failed", { n: outcome.failed })}</p>}
          <button type="button" className="btn-small secondary" onClick={() => downloadText("student-import-results.csv", resultsCsv(outcome.results))}>{t("import.downloadResults")}</button>
        </section>
      )}
    </>
  );
}
