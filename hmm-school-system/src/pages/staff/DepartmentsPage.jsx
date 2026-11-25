import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, fullName, Loading, useRowFlash } from "../../lib/ui.jsx";
import { can, STAFF_EDITORS } from "../../lib/roles.js";

function DepartmentRow({ dept, staff, editable, notice, onDone, flash }) {
  const { t, lang } = useLang();
  const [name, setName] = useState(dept.name);
  const [nameAm, setNameAm] = useState(dept.name_am || "");
  const [leader, setLeader] = useState(dept.leader_staff_id || "");

  async function save() {
    const { error } = await supabase.from("departments")
      .update({ name: name.trim(), name_am: nameAm.trim() || null, leader_staff_id: leader || null }).eq("id", dept.id);
    error ? notice.fail(error) : (notice.ok(), onDone());
  }
  return (
    <tr className={flash}>
      <td data-label={t("common.name")}><input aria-label={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} /></td>
      <td data-label={t("common.nameAm")}><input aria-label={t("common.nameAm")} value={nameAm} onChange={(e) => setNameAm(e.target.value)} disabled={!editable} lang="am" /></td>
      <td data-label={t("departments.leader")}>
        <select aria-label={t("departments.leader")} value={leader} onChange={(e) => setLeader(e.target.value)} disabled={!editable}>
          <option value="">{t("departments.noLeader")}</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s, lang)}</option>)}
        </select>
      </td>
      <td className="row-actions" data-label="">{editable && <button type="button" className="btn-small" onClick={save}>{t("common.save")}</button>}</td>
    </tr>
  );
}

export default function DepartmentsPage() {
  const { t } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, STAFF_EDITORS);
  const notice = useNotice();
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");

  const { data, error, loading, reload } = useQuery(async () => {
    const [d, s] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("staff").select("id,first_name,father_name,grandfather_name,first_name_am,father_name_am,grandfather_name_am").eq("employment_status", "active").order("first_name"),
    ]);
    return d.error ? d : s.error ? s : { data: { departments: d.data, staff: s.data } };
  }, []);
  const flash = useRowFlash(data?.departments);

  async function add(e) {
    e.preventDefault();
    notice.clear();
    const { error: err } = await supabase.from("departments").insert({ name: name.trim(), name_am: nameAm.trim() || null });
    if (err) return notice.fail(err);
    setName(""); setNameAm("");
    notice.ok();
    reload();
  }

  if (loading) return <Loading />;
  if (error) return <LoadError />;

  return (
    <>
      {!editable && <p className="muted">{t("common.readOnly")}</p>}
      <Notice notice={notice.notice} />
      {editable && (
        <form className="panel formgrid" onSubmit={add}>
          <h2>{t("departments.add")}</h2>
          <div><label htmlFor="dn">{t("common.name")}</label><input id="dn" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><label htmlFor="dna">{t("common.nameAm")}</label><input id="dna" value={nameAm} onChange={(e) => setNameAm(e.target.value)} lang="am" /></div>
          <div className="formgrid-action"><button type="submit" className="btn-small">{t("common.add")}</button></div>
        </form>
      )}
      <div className="tablewrap edit-cards">
        <table className="stack">
          <thead><tr><th>{t("common.name")}</th><th>{t("common.nameAm")}</th><th>{t("departments.leader")}</th><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
          <tbody>
            {data.departments.map((d) => (
              <DepartmentRow key={`${d.id}-${d.name}-${d.name_am}-${d.leader_staff_id}`} flash={flash(d.id)} dept={d} staff={data.staff} editable={editable} notice={notice} onDone={reload} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
