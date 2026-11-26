import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, Loading, LoadError } from "../../lib/ui.jsx";
import { can, STAFF_EDITORS } from "../../lib/roles.js";
import { resultsCsv, downloadText, downloadBlob, readImportFile } from "../../lib/importer.js";
import { staffTemplateXlsx, staffTemplateCsv, checkStaffRow, staffNameKey } from "../../lib/staffImporter.js";

const CHUNK = 50;

export default function StaffImportPage() {
  const { t } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, STAFF_EDITORS);
  const [rows, setRows] = useState(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [templateError, setTemplateError] = useState(false);
  const [progress, setProgress] = useState(null);
  const [outcome, setOutcome] = useState(null);

  const departments = useQuery(() => supabase.from("departments").select("id,name,name_am"), []);

  if (departments.loading) return <Loading />;
  if (departments.error) return <LoadError />;
  if (!editable) return <p className="muted">{t("common.readOnly")}</p>;

  async function downloadTemplate() {
    setTemplateError(false);
    try { downloadBlob("staff-import-template.xlsx", await staffTemplateXlsx(departments.data || [])); } catch { setTemplateError(true); }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true); setReadError(false); setOutcome(null); setRows(null);
    try {
      const raw = await readImportFile(file);
      if (!raw.length) throw new Error("empty");
      const checked = raw.map((r) => ({ ...checkStaffRow(r, { departments: departments.data }), raw: r }));

      // employee ids already used in the database
      const { data: existing, error } = await supabase.from("staff").select("employee_id,first_name,father_name,grandfather_name");
      if (error) throw error;
      const usedIds = new Set(existing.map((s) => (s.employee_id || "").toLowerCase()).filter(Boolean));
      const usedNames = new Set(existing.map(staffNameKey));

      // the same employee id twice in the file: only the first row keeps it
      const idSeen = new Set();
      const nameCount = new Map();
      checked.forEach((c) => {
        const id = (c.payload.employee_id || "").toLowerCase();
        if (id) {
          if (usedIds.has(id)) c.errors.push({ key: "idInDb", params: {} });
          else if (idSeen.has(id)) c.errors.push({ key: "idInFile", params: {} });
          idSeen.add(id);
        }
        const nk = staffNameKey(c.payload);
        nameCount.set(nk, (nameCount.get(nk) || 0) + 1);
      });
      checked.forEach((c) => {
        const nk = staffNameKey(c.payload);
        if (nameCount.get(nk) > 1) c.warnings.push({ key: "dupInFile", params: {} });
        if (usedNames.has(nk)) c.warnings.push({ key: "dupInDb", params: {} });
      });
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
      // one request per chunk; if it is refused, try the rows one by one so only the bad row fails
      let { error } = await supabase.from("staff").insert(part.map((r) => r.payload));
      if (!error) {
        part.forEach((r) => results.push({ row: r.row, name: r.name, ok: true, code: r.payload.employee_id }));
      } else {
        for (const r of part) {
          const one = await supabase.from("staff").insert(r.payload);
          const dup = one.error?.code === "23505";
          results.push({ row: r.row, name: r.name, ok: !one.error, code: r.payload.employee_id, error: one.error ? (dup ? t("import.staff.err.idInDb") : one.error.message) : null });
        }
      }
      setProgress({ done: Math.min(i + CHUNK, good.length), total: good.length });
    }
    setProgress(null);
    const failedRows = results.filter((r) => !r.ok);
    const skipped = (rows || []).filter((r) => r.errors.length).map((r) => ({ row: r.row, name: r.name, ok: false, error: r.errors.map((e) => t(`import.staff.err.${e.key}`, e.params)).join(" ") }));
    setOutcome({ ok: results.length - failedRows.length, failed: failedRows.length + skipped.length, results: [...results, ...skipped].sort((a, b) => a.row - b.row) });
    setRows(null);
  }

  return (
    <>
      <p className="muted">{t("import.staff.intro")}</p>

      <section className="panel">
        <h2>{t("import.step1")}</h2>
        <button type="button" className="btn-small secondary" onClick={downloadTemplate}>{t("import.download")}</button>
        {" "}<button type="button" className="btn-small secondary" onClick={() => downloadText("staff-import-template.csv", staffTemplateCsv())}>{t("import.downloadCsv")}</button>
        {templateError && <p className="flash error" role="alert">{t("import.templateFailed")}</p>}
      </section>

      <section className="panel">
        <h2>{t("import.step2")}</h2>
        <p className="muted">{t("import.staff.fileHelp")}</p>
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
              <thead><tr><th>{t("import.row")}</th><th>{t("import.staff.person")}</th><th>{t("import.result")}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={r.errors.length ? "row-bad" : r.warnings.length ? "row-warn" : ""}>
                    <td data-label={t("import.row")}>{r.row}</td>
                    <th scope="row" data-label={t("import.staff.person")}>{r.name || "—"}</th>
                    <td data-label={t("import.result")}>
                      {r.errors.length === 0 && r.warnings.length === 0 && <span className="pill ok">{t("import.ready")}</span>}
                      {r.errors.map((e, i) => <p key={`e${i}`} className="small msg-err"><strong>{t("import.error")}:</strong> {t(`import.staff.err.${e.key}`, e.params)}</p>)}
                      {r.warnings.map((e, i) => <p key={`w${i}`} className="small msg-warn"><strong>{t("import.warning")}:</strong> {t(`import.staff.warn.${e.key}`, e.params)}</p>)}
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
          <h2>{t("import.staff.done", { n: outcome.ok })}</h2>
          {outcome.failed > 0 && <p className="msg-err">{t("import.failed", { n: outcome.failed })}</p>}
          <button type="button" className="btn-small secondary" onClick={() => downloadText("staff-import-results.csv", resultsCsv(outcome.results, "employee_id"))}>{t("import.staff.downloadResults")}</button>
        </section>
      )}
    </>
  );
}
