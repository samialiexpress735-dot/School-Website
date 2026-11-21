import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, LoadError, fullName, pick } from "../../lib/ui.jsx";
import { can, STAFF_EDITORS } from "../../lib/roles.js";

export default function StaffListPage() {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, STAFF_EDITORS);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  const { data, error, loading } = useQuery(
    () => supabase.from("staff").select("*, departments!staff_department_id_fkey(name,name_am)").order("first_name"),
    []
  );

  if (loading) return <p>{t("common.loading")}</p>;
  if (error) return <LoadError />;

  const q = search.trim().toLowerCase();
  const rows = data.filter((s) => {
    if (type && s.staff_type !== type) return false;
    if (status && s.employment_status !== status) return false;
    if (!q) return true;
    const hay = [s.employee_id, s.first_name, s.father_name, s.grandfather_name, s.first_name_am, s.father_name_am, s.grandfather_name_am].join(" ").toLowerCase();
    return hay.includes(q);
  });

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
      </div>

      {rows.length === 0 ? <p>{t("common.noData")}</p> : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{t("staff.employeeId")}</th><th>{t("common.name")}</th><th>{t("staff.type")}</th>
                <th>{t("staff.department")}</th><th>{t("staff.phone")}</th><th>{t("staff.status")}</th><th>{t("staff.hasAccount")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.employee_id || "—"}</td>
                  <th scope="row"><Link to={`/${lang}/staff/${s.id}`}>{fullName(s, lang)}</Link></th>
                  <td>{t(`staff.types.${s.staff_type}`)}{s.position ? <span className="muted"> · {s.position}</span> : null}</td>
                  <td>{pick(s.departments, lang) || "—"}</td>
                  <td>{s.phone || "—"}</td>
                  <td>{t(`staff.statuses.${s.employment_status}`) }</td>
                  <td>{s.profile_id ? <span className="pill">{t("staff.linked")}</span> : <span className="muted">{t("staff.notLinked")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
