import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, LoadError, fullName, pick, Loading } from "../../lib/ui.jsx";
import { can, STAFF_EDITORS } from "../../lib/roles.js";
import { downloadExport } from "../../lib/exporter.js";

export default function StaffListPage() {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, STAFF_EDITORS);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);

  const { data, error, loading } = useQuery(
    () => supabase.from("staff").select("*, departments!staff_department_id_fkey(name,name_am)").order("first_name"),
    []
  );

  if (loading) return <Loading />;
  if (error) return <LoadError />;

  const q = search.trim().toLowerCase();
  const rows = data.filter((s) => {
    if (type && s.staff_type !== type) return false;
    if (status && s.employment_status !== status) return false;
    if (!q) return true;
    const hay = [s.employee_id, s.first_name, s.father_name, s.grandfather_name, s.first_name_am, s.father_name_am, s.grandfather_name_am].join(" ").toLowerCase();
    return hay.includes(q);
  });

  // the Excel file holds exactly the people in the current list (search and filters applied)
  async function exportExcel() {
    setExporting(true); setExportFailed(false);
    const col = (label, get, width) => ({ label: t(label), get, width });
    try {
      await downloadExport("staff", {
        sheetName: t("staff.title"),
        rows,
        columns: [
          col("staff.employeeId", (s) => s.employee_id, 14),
          col("staff.type", (s) => t(`staff.types.${s.staff_type}`), 16),
          col("staff.position", (s) => s.position, 22),
          col("staff.firstName", (s) => s.first_name), col("staff.fatherName", (s) => s.father_name), col("staff.grandfatherName", (s) => s.grandfather_name),
          col("staff.firstNameAm", (s) => s.first_name_am), col("staff.fatherNameAm", (s) => s.father_name_am), col("staff.grandfatherNameAm", (s) => s.grandfather_name_am),
          col("staff.sex", (s) => (s.sex ? t(`staff.sexes.${s.sex}`) : ""), 10),
          col("staff.dob", (s) => s.date_of_birth, 14), col("staff.phone", (s) => s.phone, 16), col("staff.email", (s) => s.email, 26), col("staff.address", (s) => s.address, 26),
          col("staff.department", (s) => pick(s.departments, lang), 22), col("staff.qualification", (s) => s.qualification), col("staff.fieldOfStudy", (s) => s.field_of_study, 20),
          col("staff.hireDate", (s) => s.hire_date, 14), col("staff.status", (s) => t(`staff.statuses.${s.employment_status}`), 14),
        ],
      });
    } catch { setExportFailed(true); }
    setExporting(false);
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" aria-label={t("staff.search")} placeholder={t("staff.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t("staff.type")} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t("staff.allTypes")}</option>
          {["teaching", "non_teaching"].map((k) => <option key={k} value={k}>{t(`staff.types.${k}`)}</option>)}
        </select>
        <select aria-label={t("staff.status")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("staff.allStatuses")}</option>
          {["active", "on_leave", "transferred", "resigned", "retired"].map((k) => <option key={k} value={k}>{t(`staff.statuses.${k}`)}</option>)}
        </select>
        {editable && <Link className="btn-small linkbtn" to={`/${lang}/staff/new`}>{t("staff.add")}</Link>}
        <button type="button" className="btn-small secondary" disabled={exporting || rows.length === 0} aria-busy={exporting} onClick={exportExcel}>{exporting ? t("export.working") : t("export.button")}</button>
      </div>
      {exportFailed && <p className="flash error" role="alert">{t("export.failed")}</p>}

      {rows.length === 0 ? <p>{t("common.noData")}</p> : (
        <div className="tablewrap">
          <table className="stack">
            <thead>
              <tr>
                <th>{t("staff.employeeId")}</th><th>{t("common.name")}</th><th>{t("staff.type")}</th>
                <th>{t("staff.department")}</th><th>{t("staff.phone")}</th><th>{t("staff.status")}</th><th>{t("staff.hasAccount")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td data-label={t("staff.employeeId")}>{s.employee_id || "—"}</td>
                  <th scope="row" className="stack-title"><Link to={`/${lang}/staff/${s.id}`}>{fullName(s, lang)}</Link></th>
                  <td data-label={t("staff.type")}>{t(`staff.types.${s.staff_type}`)}{s.position ? <span className="muted"> · {s.position}</span> : null}</td>
                  <td data-label={t("staff.department")}>{pick(s.departments, lang) || "—"}</td>
                  <td data-label={t("staff.phone")}>{s.phone || "—"}</td>
                  <td data-label={t("staff.status")}>{t(`staff.statuses.${s.employment_status}`)}</td>
                  <td data-label={t("staff.hasAccount")}>{s.profile_id ? <span className="pill">{t("staff.linked")}</span> : <span className="muted">{t("staff.notLinked")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
