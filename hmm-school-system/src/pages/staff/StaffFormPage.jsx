import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, pick, fullName, Loading } from "../../lib/ui.jsx";
import { can, STAFF_EDITORS, ALL_ROLES } from "../../lib/roles.js";
import { useConfirm } from "../../components/Dialogs.jsx";

const EMPTY = {
  employee_id: "", staff_type: "teaching", position: "",
  first_name: "", father_name: "", grandfather_name: "",
  first_name_am: "", father_name_am: "", grandfather_name_am: "",
  sex: "", date_of_birth: "", phone: "", email: "", address: "",
  department_id: "", qualification: "", field_of_study: "", hire_date: "", employment_status: "active",
};
const TEXT_FIELDS = Object.keys(EMPTY);

function AccountPanel({ staff, onChanged }) {
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const { session, profile } = useAuth();
  const isAdmin = profile?.role === "system_admin";
  const notice = useNotice();
  const [pickId, setPickId] = useState("");
  const [role, setRole] = useState("teacher");

  const accounts = useQuery(async () => {
    const [p, s] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,role,is_active").order("email"),
      supabase.from("staff").select("profile_id").not("profile_id", "is", null),
    ]);
    if (p.error) return p;
    if (s.error) return s;
    return { data: { profiles: p.data, linkedIds: new Set(s.data.map((x) => x.profile_id)) } };
  }, [staff.profile_id]);

  const linkedProfile = accounts.data?.profiles.find((p) => p.id === staff.profile_id);
  const [roleDraft, setRoleDraft] = useState("");
  const [activeDraft, setActiveDraft] = useState(true);
  useEffect(() => {
    if (linkedProfile) {
      setRoleDraft(linkedProfile.role || "");
      setActiveDraft(linkedProfile.is_active);
    }
  }, [linkedProfile?.id, linkedProfile?.role, linkedProfile?.is_active]); // eslint-disable-line

  if (accounts.loading) return null;
  if (accounts.error) return <LoadError />;

  const free = accounts.data.profiles.filter((p) => !accounts.data.linkedIds.has(p.id));
  const ownAccount = staff.profile_id && staff.profile_id === session?.user?.id;

  async function link() {
    notice.clear();
    const a = await supabase.from("staff").update({ profile_id: pickId }).eq("id", staff.id);
    if (a.error) return notice.fail(a.error);
    const b = await supabase.from("profiles").update({
      role, is_active: true,
      full_name: fullName(staff, "en"), full_name_am: fullName(staff, "am") !== fullName(staff, "en") ? fullName(staff, "am") : null,
    }).eq("id", pickId);
    if (b.error) return notice.fail(b.error);
    setPickId("");
    notice.ok();
    onChanged();
  }
  async function saveRole() {
    const { error } = await supabase.from("profiles").update({ role: roleDraft || null, is_active: activeDraft }).eq("id", staff.profile_id);
    error ? notice.fail(error) : (notice.ok(), accounts.reload());
  }
  async function unlink() {
    if (!(await confirm({ title: t("dialog.unlink.title"), body: t("dialog.unlink.body"), confirmLabel: t("dialog.unlink.confirm"), tone: "danger" }))) return;
    const a = await supabase.from("profiles").update({ role: null }).eq("id", staff.profile_id);
    if (a.error) return notice.fail(a.error);
    const b = await supabase.from("staff").update({ profile_id: null }).eq("id", staff.id);
    b.error ? notice.fail(b.error) : (notice.ok(), onChanged());
  }

  return (
    <section className="panel">
      <h2>{t("staff.account.title")}</h2>
      <Notice notice={notice.notice} />
      {!isAdmin && <p className="muted">{t("staff.account.onlyAdmin")}</p>}

      {staff.profile_id ? (
        <>
          <p>{t("staff.account.linkedAs", { email: linkedProfile?.email || "—" })}</p>
          {isAdmin && (
            <div className="formgrid">
              <div>
                <label htmlFor="acrole">{t("staff.account.role")}</label>
                <select id="acrole" value={roleDraft} disabled={ownAccount} onChange={(e) => setRoleDraft(e.target.value)}>
                  <option value="">—</option>
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="inline"><input type="checkbox" checked={activeDraft} disabled={ownAccount} onChange={(e) => setActiveDraft(e.target.checked)} /> {t("common.active")}</label>
              </div>
              <div className="row-actions">
                <button type="button" className="btn-small" disabled={ownAccount} onClick={saveRole}>{t("staff.account.saveRole")}</button>
                <button type="button" className="btn-small danger" disabled={ownAccount} onClick={unlink}>{t("staff.account.unlink")}</button>
              </div>
              {ownAccount && <p className="muted small full">{t("staff.account.ownRole")}</p>}
            </div>
          )}
        </>
      ) : isAdmin ? (
        <>
          <p className="muted">{t("staff.account.help")}</p>
          {free.length === 0 ? <p>{t("staff.account.noneFree")}</p> : (
            <div className="formgrid">
              <div>
                <label htmlFor="acpick">{t("staff.account.pick")}</label>
                <select id="acpick" value={pickId} onChange={(e) => setPickId(e.target.value)}>
                  <option value="">—</option>
                  {free.map((p) => <option key={p.id} value={p.id}>{p.email}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="acrole2">{t("staff.account.role")}</label>
                <select id="acrole2" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                </select>
              </div>
              <div className="formgrid-action"><button type="button" className="btn-small" disabled={!pickId} onClick={link}>{t("staff.account.link")}</button></div>
            </div>
          )}
        </>
      ) : (
        <p>{t("staff.notLinked")}</p>
      )}
    </section>
  );
}

// Delete a staff member (teaching or non-teaching). The database has the final say (015): it refuses when the person
// taught in a closed academic year, when the person has a login and the signed-in user is not the system admin,
// and when it is the signed-in user's own record. The dialog first says what will change.
function DeletePanel({ staff }) {
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const isAdmin = profile?.role === "system_admin";
  const own = Boolean(staff.profile_id) && staff.profile_id === session?.user?.id;
  const blockedByLogin = Boolean(staff.profile_id) && !isAdmin;

  async function remove() {
    notice.clear();
    setBusy(true);
    // what the delete will take with it, so the person can decide with the facts
    const [asg, home, lead] = await Promise.all([
      supabase.from("teacher_assignments").select("id", { count: "exact", head: true }).eq("staff_id", staff.id),
      supabase.from("sections").select("id", { count: "exact", head: true }).eq("homeroom_staff_id", staff.id),
      supabase.from("departments").select("id", { count: "exact", head: true }).eq("leader_staff_id", staff.id),
    ]);
    if (asg.error || home.error || lead.error) { setBusy(false); return notice.fail(asg.error || home.error || lead.error); }
    const items = [];
    if (asg.count) items.push(t("staff.delete.itemAssignments", { n: asg.count }));
    if (home.count) items.push(t("staff.delete.itemHomeroom", { n: home.count }));
    if (lead.count) items.push(t("staff.delete.itemLeader", { n: lead.count }));
    if (staff.profile_id) items.push(t("staff.delete.itemLogin"));
    const ok = await confirm({
      title: t("dialog.deleteStaff.title", { name: fullName(staff, lang) }),
      body: t("dialog.deleteStaff.body"),
      items,
      footer: t("dialog.deleteStaff.footer"),
      confirmLabel: t("dialog.deleteStaff.confirm"),
      tone: "danger",
    });
    if (!ok) { setBusy(false); return; }
    const { error } = await supabase.from("staff").delete().eq("id", staff.id);
    setBusy(false);
    if (error) {
      const m = error.message || "";
      const key = ["STAFF_HAS_CLOSED_YEAR_HISTORY", "STAFF_ACCOUNT_LINKED", "STAFF_OWN_ACCOUNT", "STAFF_DELETE_NOT_ALLOWED"].find((k) => m.includes(k));
      return notice.fail(error, key ? t(`staff.delete.err.${key}`) : undefined);
    }
    navigate(`/${lang}/staff`);
  }

  return (
    <section className="panel">
      <h2>{t("staff.delete.title")}</h2>
      <Notice notice={notice.notice} />
      <p className="muted">{t("staff.delete.help")}</p>
      {own && <p className="muted small">{t("staff.delete.own")}</p>}
      {!own && blockedByLogin && <p className="muted small">{t("staff.delete.needAdmin")}</p>}
      <p>
        <button type="button" className="btn-small danger" disabled={busy || own || blockedByLogin} onClick={remove}>
          {t("staff.delete.button")}
        </button>
      </p>
    </section>
  );
}

export default function StaffFormPage() {
  const { t, lang } = useLang();
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { profile, session, refreshProfile } = useAuth();
  const editable = can(profile, STAFF_EDITORS);
  const notice = useNotice();
  const [f, setF] = useState(EMPTY);

  const departments = useQuery(() => supabase.from("departments").select("*").order("name"), []);
  const record = useQuery(() => (isNew ? { data: null } : supabase.from("staff").select("*").eq("id", id).maybeSingle()), [id]);

  useEffect(() => {
    if (record.data) {
      const next = { ...EMPTY };
      TEXT_FIELDS.forEach((k) => { next[k] = record.data[k] ?? ""; });
      setF(next);
    }
  }, [record.data]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    notice.clear();
    if (!f.first_name.trim() || !f.father_name.trim() || !f.sex) return notice.fail(null, t("staff.required"));
    const payload = {};
    TEXT_FIELDS.forEach((k) => { payload[k] = typeof f[k] === "string" && f[k].trim() === "" ? null : (typeof f[k] === "string" ? f[k].trim() : f[k]); });
    payload.staff_type = f.staff_type;
    payload.employment_status = f.employment_status;
    payload.first_name = f.first_name.trim();
    payload.father_name = f.father_name.trim();
    payload.sex = f.sex;

    const q = isNew
      ? supabase.from("staff").insert(payload).select("id").single()
      : supabase.from("staff").update(payload).eq("id", id).select("id").single();
    const { data, error } = await q;
    if (error) return notice.fail(error, error.code === "23505" ? t("staff.duplicateId") : undefined);
    notice.ok();
    // The database copies the names to the person's login, so their dashboard shows the new name.
    // If this is the signed-in person's own record, show it now.
    if (!isNew && record.data?.profile_id && record.data.profile_id === session?.user?.id) refreshProfile?.();
    if (isNew) navigate(`/${lang}/staff/${data.id}`);
    else record.reload();
  }

  if (!isNew && record.loading) return <Loading />;
  if (record.error || departments.error) return <LoadError />;
  if (!isNew && !record.data && !record.loading) return <p>{t("common.noData")}</p>;

  const dis = !editable;
  const field = (k, label, props = {}) => (
    <div>
      <label htmlFor={`f_${k}`}>{label}</label>
      <input id={`f_${k}`} value={f[k]} onChange={set(k)} disabled={dis} {...props} />
    </div>
  );

  return (
    <>
      <p><Link to={`/${lang}/staff`}>← {t("staff.backToList")}</Link></p>
      {dis && <p className="muted">{t("common.readOnly")}</p>}
      <Notice notice={notice.notice} />

      <form className="panel formgrid" onSubmit={save}>
        <h2>{isNew ? t("staff.add") : fullName(f, lang) || t("staff.editTitle")}</h2>

        {field("employee_id", t("staff.employeeId"))}
        <div>
          <label htmlFor="f_type">{t("staff.type")}</label>
          <select id="f_type" value={f.staff_type} onChange={set("staff_type")} disabled={dis}>
            {["teaching", "non_teaching"].map((k) => <option key={k} value={k}>{t(`staff.types.${k}`)}</option>)}
          </select>
        </div>
        {field("position", t("staff.position"), { placeholder: t("staff.positionHelp") })}

        {field("first_name", `${t("staff.firstName")} *`, { required: true })}
        {field("father_name", `${t("staff.fatherName")} *`, { required: true })}
        {field("grandfather_name", t("staff.grandfatherName"))}
        {field("first_name_am", t("staff.firstNameAm"), { lang: "am" })}
        {field("father_name_am", t("staff.fatherNameAm"), { lang: "am" })}
        {field("grandfather_name_am", t("staff.grandfatherNameAm"), { lang: "am" })}

        <div>
          <label htmlFor="f_sex">{t("staff.sex")} *</label>
          <select id="f_sex" value={f.sex} onChange={set("sex")} disabled={dis} required>
            <option value="">—</option>
            {["male", "female"].map((k) => <option key={k} value={k}>{t(`staff.sexes.${k}`)}</option>)}
          </select>
        </div>
        {field("date_of_birth", t("staff.dob"), { type: "date" })}
        {field("phone", t("staff.phone"), { type: "tel", inputMode: "tel" })}
        {field("email", t("staff.email"), { type: "email" })}
        {field("address", t("staff.address"))}

        <div>
          <label htmlFor="f_dept">{t("staff.department")}</label>
          <select id="f_dept" value={f.department_id} onChange={set("department_id")} disabled={dis}>
            <option value="">{t("staff.none")}</option>
            {(departments.data || []).map((d) => <option key={d.id} value={d.id}>{pick(d, lang)}</option>)}
          </select>
        </div>
        {field("qualification", t("staff.qualification"))}
        {field("field_of_study", t("staff.fieldOfStudy"))}
        {field("hire_date", t("staff.hireDate"), { type: "date" })}
        <div>
          <label htmlFor="f_status">{t("staff.status")}</label>
          <select id="f_status" value={f.employment_status} onChange={set("employment_status")} disabled={dis}>
            {["active", "on_leave", "transferred", "resigned", "retired"].map((k) => <option key={k} value={k}>{t(`staff.statuses.${k}`)}</option>)}
          </select>
        </div>

        <p className="muted small full">{t("staff.photoLater")}</p>
        {editable && <div className="formgrid-action sticky-actions"><button type="submit" className="btn-small">{t("common.save")}</button></div>}
      </form>

      {!isNew && record.data && <AccountPanel staff={record.data} onChanged={record.reload} />}
      {!isNew && record.data && editable && <DeletePanel staff={record.data} />}
    </>
  );
}
