import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, Loading, LoadError, pick, fullName } from "../../lib/ui.jsx";
import { can, REGISTRARS, STREAM_CHANGERS } from "../../lib/roles.js";
import { rowToForm, dobToGc, validateStep, EMPTY_STUDENT } from "../../lib/studentForm.js";
import EcDate from "../../components/EcDate.jsx";
import { StudentStep, ContactStep, PreviousStep, DocumentsBlock, TextField, RelationshipSelect } from "./StudentParts.jsx";
import { useConfirm } from "../../components/Dialogs.jsx";

const sectionKey = (streams, id) => streams.find((x) => x.id === id && x.code !== "general")?.id || null;

function GuardianRow({ link, studentId, onDone, notice, editable, canRemove }) {
  const confirm = useConfirm();
  const { t } = useLang();
  const g = link.guardians;
  const [v, setV] = useState({ full_name: g.full_name, phone: g.phone || "", occupation: g.occupation || "", address: g.address || "", relationship: link.relationship, is_primary: link.is_primary, is_emergency_contact: link.is_emergency_contact });
  const set = (k) => (val) => setV((x) => ({ ...x, [k]: val }));

  async function save() {
    if (!v.full_name.trim() || !v.relationship.trim()) return notice.fail(null, t("students.wizard.err.guardian"));
    const a = await supabase.from("guardians").update({ full_name: v.full_name.trim(), phone: v.phone.trim() || null, occupation: v.occupation.trim() || null, address: v.address.trim() || null }).eq("id", g.id);
    if (a.error) return notice.fail(a.error);
    if (v.is_primary) await supabase.from("student_guardians").update({ is_primary: false }).eq("student_id", studentId).neq("guardian_id", g.id);
    const b = await supabase.from("student_guardians").update({ relationship: v.relationship, is_primary: v.is_primary, is_emergency_contact: v.is_emergency_contact }).eq("student_id", studentId).eq("guardian_id", g.id);
    b.error ? notice.fail(b.error) : (notice.ok(), onDone());
  }
  async function remove() {
    if (!(await confirm({ title: t("dialog.deleteGuardian.title"), body: t("dialog.deleteGuardian.body"), confirmLabel: t("dialog.deleteGuardian.confirm"), tone: "danger" }))) return;
    const { error } = await supabase.from("student_guardians").delete().eq("student_id", studentId).eq("guardian_id", g.id);
    error ? notice.fail(error, error.message?.includes("at least one") ? t("students.profile.lastGuardian") : undefined) : (notice.ok(), onDone());
  }
  return (
    <div className="subpanel">
      <div className="formgrid">
        <TextField id={`pg_${g.id}_n`} label={t("students.wizard.guardianName")} value={v.full_name} onChange={set("full_name")} disabled={!editable} />
        <div>
          <label htmlFor={`pg_${g.id}_r`}>{t("students.wizard.relationship")}</label>
          <RelationshipSelect id={`pg_${g.id}_r`} value={v.relationship} onChange={set("relationship")} disabled={!editable} />
        </div>
        <TextField id={`pg_${g.id}_p`} label={t("students.wizard.guardianPhone")} type="tel" value={v.phone} onChange={set("phone")} disabled={!editable} />
        <TextField id={`pg_${g.id}_o`} label={t("students.wizard.occupation")} value={v.occupation} onChange={set("occupation")} disabled={!editable} />
        <TextField id={`pg_${g.id}_a`} label={t("students.wizard.address")} value={v.address} onChange={set("address")} disabled={!editable} />
        <div className="checks">
          <label className="inline"><input type="checkbox" checked={v.is_primary} onChange={(e) => set("is_primary")(e.target.checked)} disabled={!editable} /> {t("students.wizard.primary")}</label>
          <label className="inline"><input type="checkbox" checked={v.is_emergency_contact} onChange={(e) => set("is_emergency_contact")(e.target.checked)} disabled={!editable} /> {t("students.wizard.emergency")}</label>
        </div>
      </div>
      {editable && (
        <div className="row-actions">
          <button type="button" className="btn-small" onClick={save}>{t("common.save")}</button>
          {canRemove && <button type="button" className="btn-small danger" onClick={remove}>{t("students.profile.removeGuardian")}</button>}
        </div>
      )}
    </div>
  );
}

function EnrollmentRow({ e, refData, sections, editable, canStream, notice, onDone }) {
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const grade = refData.grades.find((g) => g.id === e.grade_id);
  const stream = refData.streams.find((s) => s.id === e.stream_id);
  const opts = sections.filter((s) => s.academic_year_id === e.academic_year_id && s.grade_id === e.grade_id && sectionKey(refData.streams, s.stream_id) === sectionKey(refData.streams, e.stream_id));

  async function move(sectionId) {
    const { error } = await supabase.from("enrollments").update({ section_id: sectionId || null }).eq("id", e.id);
    error ? notice.fail(error) : (notice.ok(), onDone());
  }
  async function changeStream(streamId) {
    if (!streamId || streamId === e.stream_id) return;
    if (!(await confirm({ title: t("dialog.stream.title"), body: t("students.profile.streamNote"), confirmLabel: t("dialog.stream.confirm"), tone: "danger" }))) return;
    const { error } = await supabase.rpc("change_student_stream", { p_enrollment: e.id, p_stream: streamId });
    error ? notice.fail(error) : (notice.ok(), onDone());
  }

  return (
    <tr>
      <th scope="row" data-label={t("common.academicYear")}>{e.academic_years?.label}</th>
      <td data-label={t("common.grade")}>{pick(grade, lang)}</td>
      <td data-label={t("common.stream")}>
        {grade?.number >= 11 && canStream ? (
          <select aria-label={t("students.profile.changeStream")} value={e.stream_id || ""} onChange={(ev) => changeStream(ev.target.value)}>
            {refData.streams.filter((s) => s.code !== "general").map((s) => <option key={s.id} value={s.id}>{pick(s, lang)}</option>)}
          </select>
        ) : (stream && stream.code !== "general" ? pick(stream, lang) : "—")}
      </td>
      <td data-label={t("students.list.section")}>
        {editable ? (
          <select aria-label={t("students.list.section")} value={e.section_id || ""} onChange={(ev) => move(ev.target.value)}>
            <option value="">{t("students.wizard.noSection")}</option>
            {opts.map((s) => <option key={s.id} value={s.id}>{s.name} · {t(`sections.shifts.${s.shift}`)}</option>)}
          </select>
        ) : (e.sections ? `${e.sections.name} · ${t(`sections.shifts.${e.sections.shift}`)}` : "—")}
      </td>
      <td data-label={t("common.status")}><span className="pill">{t(`students.enrollStatuses.${e.status}`)}</span></td>
    </tr>
  );
}

export default function StudentProfilePage() {
  const confirm = useConfirm();
  const { id } = useParams();
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, REGISTRARS);
  const canStream = can(profile, STREAM_CHANGERS);
  const notice = useNotice();
  const [f, setF] = useState(EMPTY_STUDENT);
  const [newG, setNewG] = useState({ full_name: "", relationship: "", phone: "", occupation: "", address: "" });
  const [enr, setEnr] = useState({ yearId: "", gradeId: "", streamId: "", status: "promoted", sectionId: "" });
  const [newStatus, setNewStatus] = useState("");
  const [errors, setErrors] = useState([]);

  const stu = useQuery(() => supabase.from("students").select("*, student_guardians(relationship, is_primary, is_emergency_contact, guardians(*))").eq("id", id).maybeSingle(), [id]);
  const enrolls = useQuery(() => supabase.from("enrollments").select("*, academic_years(label, year_ec), sections(name, shift)").eq("student_id", id), [id]);
  const ref = useQuery(async () => {
    const [y, g, s, sec] = await Promise.all([
      supabase.from("academic_years").select("id,label,is_current,year_ec,is_closed").order("year_ec", { ascending: false }),
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*").order("code"),
      supabase.from("sections").select("id,name,shift,grade_id,stream_id,academic_year_id"),
    ]);
    const bad = [y, g, s, sec].find((r) => r.error);
    return bad || { data: { years: y.data, grades: g.data, streams: s.data, sections: sec.data } };
  }, []);

  useEffect(() => { if (stu.data) { setF(rowToForm(stu.data)); setNewStatus(stu.data.status); } }, [stu.data]);

  if (stu.loading || ref.loading || enrolls.loading) return <Loading />;
  if (stu.error || ref.error || enrolls.error) return <LoadError />;
  if (!stu.data) return <p className="empty">{t("students.profile.notFound")}</p>;

  const s = stu.data;
  const { years, grades, streams, sections } = ref.data;
  const history = [...enrolls.data].sort((a, b) => (b.academic_years?.year_ec || 0) - (a.academic_years?.year_ec || 0));
  const freeYears = years.filter((y) => !history.some((h) => h.academic_year_id === y.id) && !y.is_closed);
  const reloadAll = () => { stu.reload(); enrolls.reload(); };

  async function savePersonal(e) {
    e.preventDefault();
    notice.clear();
    const errs = validateStep(0, { f, guardians: [], enroll: null });
    setErrors(errs);
    if (errs.length) return;
    const dob = dobToGc(f.dob);
    const text = (k) => (f[k].trim() === "" ? null : f[k].trim());
    const { error } = await supabase.from("students").update({
      first_name: f.first_name.trim(), father_name: f.father_name.trim(), grandfather_name: f.grandfather_name.trim(),
      first_name_am: text("first_name_am"), father_name_am: text("father_name_am"), grandfather_name_am: text("grandfather_name_am"),
      sex: f.sex, date_of_birth: dob.gc, date_of_birth_ec: dob.ecText,
      place_of_birth: text("place_of_birth"), nationality: text("nationality") || "Ethiopian", mother_full_name: text("mother_full_name"), health_condition: text("health_condition"),
      region: text("region"), zone: text("zone"), woreda: text("woreda"), kebele: text("kebele"), house_number: text("house_number"), phone: text("phone"),
      previous_school: text("previous_school"), previous_grade: text("previous_grade"), transfer_certificate_no: text("transfer_certificate_no"),
      grade8_exam_result: f.grade8_exam_result === "" ? null : Number(f.grade8_exam_result), documents: f.documents,
    }).eq("id", id);
    error ? notice.fail(error) : (notice.ok(), reloadAll());
  }

  async function addGuardian() {
    if (!newG.full_name.trim() || !newG.relationship.trim()) return notice.fail(null, t("students.wizard.err.guardian"));
    const a = await supabase.from("guardians").insert({ full_name: newG.full_name.trim(), phone: newG.phone.trim() || null, occupation: newG.occupation.trim() || null, address: newG.address.trim() || null }).select("id").single();
    if (a.error) return notice.fail(a.error);
    const b = await supabase.from("student_guardians").insert({ student_id: id, guardian_id: a.data.id, relationship: newG.relationship });
    if (b.error) return notice.fail(b.error);
    setNewG({ full_name: "", relationship: "", phone: "", occupation: "", address: "" });
    notice.ok();
    stu.reload();
  }

  const gradeSel = grades.find((g) => g.id === enr.gradeId);
  async function enroll() {
    notice.clear();
    if (!enr.yearId || !gradeSel) return notice.fail(null, t("students.wizard.err.grade"));
    if (gradeSel.number >= 11 && !enr.streamId) return notice.fail(null, t("students.wizard.err.stream"));
    const streamId = gradeSel.number <= 10 ? streams.find((x) => x.code === "general")?.id : enr.streamId;
    const { error } = await supabase.from("enrollments").insert({ student_id: id, academic_year_id: enr.yearId, grade_id: gradeSel.id, stream_id: streamId, section_id: enr.sectionId || null, status: enr.status });
    if (error) return notice.fail(error);
    setEnr({ yearId: "", gradeId: "", streamId: "", status: "promoted", sectionId: "" });
    notice.ok();
    enrolls.reload();
  }
  const enrSections = sections.filter((x) => x.academic_year_id === enr.yearId && x.grade_id === enr.gradeId && sectionKey(streams, x.stream_id) === sectionKey(streams, gradeSel && gradeSel.number <= 10 ? null : enr.streamId));

  async function changeStatus() {
    if (newStatus === s.status) return;
    if (!(await confirm({ title: t("dialog.status.title"), body: t("dialog.status.body"), confirmLabel: t("dialog.status.confirm"), tone: "danger" }))) return;
    const { error } = await supabase.rpc("set_student_status", { p_student: id, p_status: newStatus });
    error ? notice.fail(error) : (notice.ok(), reloadAll());
  }

  const links = s.student_guardians || [];
  return (
    <>
      <p><Link to={`/${lang}/students`}>← {t("students.profile.back")}</Link></p>
      <section className="panel hero-lite">
        <h2>{fullName(s, lang)}</h2>
        <p>
          <span className="muted">{t("students.profile.idLabel")}: </span><code className="code-big">{s.student_code}</code>{" "}
          <span className={`pill${s.status === "active" ? "" : " warn"}`}>{t(`students.statuses.${s.status}`)}</span>
        </p>
        <p className="muted small">{t("students.profile.admission")}: {s.admission_date} <EcDate value={s.admission_date} /></p>
      </section>
      <Notice notice={notice.notice} />
      {!editable && <p className="muted">{t("common.readOnly")}</p>}

      <section className="panel">
        <h2>{t("students.profile.enrollments")}</h2>
        {history.length === 0 ? <p className="muted">{t("students.profile.noEnrollments")}</p> : (
          <div className="tablewrap">
            <table className="stack">
              <thead><tr><th>{t("common.academicYear")}</th><th>{t("common.grade")}</th><th>{t("common.stream")}</th><th>{t("students.list.section")}</th><th>{t("common.status")}</th></tr></thead>
              <tbody>
                {history.map((e) => <EnrollmentRow key={`${e.id}-${e.section_id}-${e.stream_id}`} e={e} refData={ref.data} sections={sections} editable={editable} canStream={canStream} notice={notice} onDone={enrolls.reload} />)}
              </tbody>
            </table>
          </div>
        )}
        {editable && freeYears.length > 0 && (
          <>
            <h3 className="mt">{t("students.profile.addEnrollment")}</h3>
            <div className="formgrid">
              <div>
                <label htmlFor="en_year">{t("students.wizard.enrollYear")}</label>
                <select id="en_year" value={enr.yearId} onChange={(e) => setEnr((x) => ({ ...x, yearId: e.target.value, sectionId: "" }))}>
                  <option value="">—</option>
                  {freeYears.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="en_grade">{t("students.wizard.enrollGrade")}</label>
                <select id="en_grade" value={enr.gradeId} onChange={(e) => setEnr((x) => ({ ...x, gradeId: e.target.value, streamId: "", sectionId: "" }))}>
                  <option value="">—</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{pick(g, lang)}</option>)}
                </select>
              </div>
              {gradeSel && gradeSel.number >= 11 && (
                <div>
                  <label htmlFor="en_stream">{t("students.wizard.enrollStream")}</label>
                  <select id="en_stream" value={enr.streamId} onChange={(e) => setEnr((x) => ({ ...x, streamId: e.target.value, sectionId: "" }))}>
                    <option value="">—</option>
                    {streams.filter((x) => x.code !== "general").map((x) => <option key={x.id} value={x.id}>{pick(x, lang)}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="en_status">{t("students.wizard.enrollStatus")}</label>
                <select id="en_status" value={enr.status} onChange={(e) => setEnr((x) => ({ ...x, status: e.target.value }))}>
                  {["new", "promoted", "repeater", "transfer_in"].map((k) => <option key={k} value={k}>{t(`students.enrollStatuses.${k}`)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="en_sec">{t("students.wizard.enrollSection")}</label>
                <select id="en_sec" value={enr.sectionId} onChange={(e) => setEnr((x) => ({ ...x, sectionId: e.target.value }))}>
                  <option value="">{t("students.wizard.noSection")}</option>
                  {enrSections.map((x) => <option key={x.id} value={x.id}>{x.name} · {t(`sections.shifts.${x.shift}`)}</option>)}
                </select>
              </div>
              <div className="formgrid-action"><button type="button" className="btn-small" onClick={enroll}>{t("students.profile.enroll")}</button></div>
            </div>
          </>
        )}
      </section>

      <form className="panel" onSubmit={savePersonal}>
        <h2>{t("students.profile.personal")}</h2>
        {errors.length > 0 && <div className="flash error" role="alert"><ul>{errors.map((k) => <li key={k}>{t(`students.wizard.err.${k}`)}</li>)}</ul></div>}
        <StudentStep f={f} setF={setF} disabled={!editable} />
        <h3 className="mt">{t("students.wizard.steps.contact")}</h3>
        <ContactStep f={f} setF={setF} disabled={!editable} />
        <h3 className="mt">{t("students.wizard.steps.previous")}</h3>
        <PreviousStep f={f} setF={setF} disabled={!editable} />
        <DocumentsBlock f={f} setF={setF} disabled={!editable} />
        {editable && <div className="row-actions"><button type="submit" className="btn-small">{t("students.profile.saveChanges")}</button></div>}
      </form>

      <section className="panel">
        <h2>{t("students.profile.guardians")}</h2>
        {links.map((l) => <GuardianRow key={`${l.guardians.id}-${l.relationship}-${l.is_primary}`} link={l} studentId={id} onDone={stu.reload} notice={notice} editable={editable} canRemove={links.length > 1} />)}
        {editable && (
          <div className="subpanel">
            <h3>{t("students.profile.addGuardian")}</h3>
            <div className="formgrid">
              <TextField id="ng_n" label={t("students.wizard.guardianName")} value={newG.full_name} onChange={(v) => setNewG((x) => ({ ...x, full_name: v }))} />
              <div>
                <label htmlFor="ng_r">{t("students.wizard.relationship")}</label>
                <RelationshipSelect id="ng_r" value={newG.relationship} onChange={(v) => setNewG((x) => ({ ...x, relationship: v }))} />
              </div>
              <TextField id="ng_p" label={t("students.wizard.guardianPhone")} type="tel" value={newG.phone} onChange={(v) => setNewG((x) => ({ ...x, phone: v }))} />
              <div className="formgrid-action"><button type="button" className="btn-small" onClick={addGuardian}>{t("students.profile.addGuardian")}</button></div>
            </div>
          </div>
        )}
      </section>

      {editable && (
        <section className="panel formgrid">
          <h2>{t("students.profile.status")}</h2>
          <div>
            <label htmlFor="st_sel">{t("common.status")}</label>
            <select id="st_sel" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {["active", "transferred_out", "withdrawn", "graduated"].map((k) => <option key={k} value={k}>{t(`students.statuses.${k}`)}</option>)}
            </select>
          </div>
          <div className="formgrid-action"><button type="button" className="btn-small secondary" onClick={changeStatus} disabled={newStatus === s.status}>{t("students.profile.changeStatus")}</button></div>
        </section>
      )}
    </>
  );
}
