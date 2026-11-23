import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, Loading, LoadError, pick } from "../../lib/ui.jsx";
import { EMPTY_STUDENT, EMPTY_GUARDIAN, validateStep, validateAll, buildPayload, dobToGc } from "../../lib/studentForm.js";
import { ageOn, ageWarning, DEFAULT_AGE_LIMITS } from "../../lib/age.js";
import { useUnsavedChanges } from "../../components/Dialogs.jsx";
import { StudentStep, ContactStep, PreviousStep, DocumentsBlock, GuardiansStep } from "./StudentParts.jsx";

const STEPS = ["student", "contact", "guardians", "previous", "other", "review"];
const STEP_RULE = { 0: 0, 2: 2, 3: 3, 4: 4 }; // wizard step -> validation step

export default function RegisterPage() {
  const { t, lang } = useLang();
  const w = (k, p) => t(`students.wizard.${k}`, p);
  const [step, setStep] = useState(0);
  const [f, setF] = useState(EMPTY_STUDENT);
  const [guardians, setGuardians] = useState([{ ...EMPTY_GUARDIAN, is_primary: true }]);
  const [enroll, setEnroll] = useState({ on: true, yearId: "", gradeId: "", streamId: "", status: "new", sectionId: "" });
  const [errors, setErrors] = useState([]);
  const [dups, setDups] = useState([]);
  const [dupOk, setDupOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [done, setDone] = useState(null);

  // Leaving with a half-filled form asks first (a link inside the app, closing or refreshing the tab).
  const startedGuardians = JSON.stringify([{ ...EMPTY_GUARDIAN, is_primary: true }]);
  const dirty = !done && !saving && (JSON.stringify(f) !== JSON.stringify(EMPTY_STUDENT) || JSON.stringify(guardians) !== startedGuardians);
  useUnsavedChanges(dirty, "register");

  // After a failed "Next", move focus to the first field that needs attention (or to the message).
  useEffect(() => {
    if (!errors.length) return;
    const el = document.querySelector('.step-enter [aria-invalid="true"]') || document.querySelector(".step-enter .flash.error");
    el?.focus?.();
  }, [errors]);

  const ref = useQuery(async () => {
    const [y, g, s, a] = await Promise.all([
      supabase.from("academic_years").select("id,label,is_current,year_ec,gc_start_year,start_date,is_closed").order("year_ec", { ascending: false }),
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*").order("code"),
      supabase.from("school_settings").select("*").eq("key", "age_limits").maybeSingle(),
    ]);
    const bad = [y, g, s, a].find((r) => r.error);
    if (bad) return bad;
    return { data: { years: y.data, grades: g.data, streams: s.data, ageLimits: a.data?.value || DEFAULT_AGE_LIMITS } };
  }, []);

  useEffect(() => {
    if (ref.data && !enroll.yearId) {
      const cur = ref.data.years.find((y) => y.is_current) || ref.data.years[0];
      setEnroll((e) => ({ ...e, yearId: cur?.id || "", on: Boolean(cur) }));
    }
  }, [ref.data]); // eslint-disable-line

  const sections = useQuery(
    () => (enroll.yearId ? supabase.from("sections").select("id,name,shift,grade_id,stream_id").eq("academic_year_id", enroll.yearId) : { data: [] }),
    [enroll.yearId]
  );

  const grade = ref.data?.grades.find((g) => g.id === enroll.gradeId);
  const streamGeneral = ref.data?.streams.find((s) => s.code === "general");
  const stream = ref.data?.streams.find((s) => s.id === enroll.streamId);
  const ctx = useMemo(
    () => ({ f, guardians, enroll: { on: enroll.on, gradeNo: grade?.number || null, status: enroll.status, streamCode: grade && grade.number <= 10 ? "general" : stream?.code } }),
    [f, guardians, enroll, grade, stream]
  );
  const year = ref.data?.years.find((y) => y.id === enroll.yearId);

  // possible duplicates are looked up when the review step opens
  const dob = dobToGc(f.dob);
  useEffect(() => {
    if (step !== 5 || !dob) return;
    setDupOk(false);
    supabase.rpc("find_duplicate_students", { p_first: f.first_name, p_father: f.father_name, p_grandfather: f.grandfather_name, p_dob: dob.gc })
      .then(({ data }) => setDups(data || []));
  }, [step]); // eslint-disable-line

  if (ref.loading) return <Loading />;
  if (ref.error) return <LoadError />;
  const { years, grades, streams, ageLimits } = ref.data;

  // age warning (never blocks)
  const startIso = year?.start_date || (year?.gc_start_year ? `${year.gc_start_year}-09-11` : null);
  const aw = enroll.on && grade && dob && startIso ? ageWarning(grade.number, ageOn(dob.gc, startIso), ageLimits) : null;

  function pickGrade(gradeId) {
    const g = grades.find((x) => x.id === gradeId);
    setEnroll((e) => ({
      ...e, gradeId, sectionId: "",
      streamId: g && g.number <= 10 ? streamGeneral?.id || "" : "",
      status: g?.number === 9 ? "new" : e.status === "new" ? "promoted" : e.status,
    }));
  }

  function next() {
    const rule = STEP_RULE[step];
    const errs = rule === undefined ? [] : validateStep(rule, ctx);
    setErrors(errs);
    if (!errs.length) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function save() {
    setSaveError("");
    const all = validateAll(ctx);
    if (all.length) {
      const first = [...all].sort((a, b) => a.step - b.step)[0];
      setErrors(all.filter((x) => x.step === first.step).map((x) => x.key));
      setStep(first.step);
      return;
    }
    if (dups.length && !dupOk) return;
    setSaving(true);
    const enrollment = enroll.on
      ? { academic_year_id: enroll.yearId, grade_id: enroll.gradeId, stream_id: enroll.streamId || null, section_id: enroll.sectionId || null, status: enroll.status }
      : null;
    const { data, error } = await supabase.rpc("register_student", { p: buildPayload(f, guardians, enrollment) });
    setSaving(false);
    if (error) return setSaveError(error.message);
    setDone(data);
  }

  function reset() {
    setF(EMPTY_STUDENT);
    setGuardians([{ ...EMPTY_GUARDIAN, is_primary: true }]);
    setEnroll((e) => ({ ...e, gradeId: "", streamId: "", sectionId: "", status: "new" }));
    setErrors([]); setDups([]); setDone(null); setSaveError(""); setStep(0);
  }

  if (done) {
    return (
      <div className="notice success" role="status">
        <h2>{w("registered", { code: done.student_code })}</h2>
        <p className="code">{done.student_code}</p>
        <div className="row-actions">
          <Link className="btn-small linkbtn" to={`/${lang}/students/${done.student_id}`}>{w("openProfile")}</Link>
          <button type="button" className="btn-small secondary" onClick={reset}>{w("another")}</button>
        </div>
      </div>
    );
  }

  const sectionOptions = (sections.data || []).filter((s) => {
    if (s.grade_id !== enroll.gradeId) return false;
    const key = (id) => streams.find((x) => x.id === id && x.code !== "general")?.id || null;
    return key(s.stream_id) === key(enroll.streamId);
  });
  const streamChoices = streams.filter((s) => s.code !== "general");

  const reviewRows = [
    [w("firstName"), `${f.first_name} ${f.father_name} ${f.grandfather_name}`.trim()],
    [w("firstNameAm"), `${f.first_name_am} ${f.father_name_am} ${f.grandfather_name_am}`.trim()],
    [w("sex"), f.sex ? t(`students.sexes.${f.sex}`) : ""],
    [w("dob"), dob ? `${dob.ecText} (${dob.gc})` : ""],
    [w("placeOfBirth"), f.place_of_birth], [w("motherName"), f.mother_full_name], [w("health"), f.health_condition],
    [w("region"), [f.region, f.zone, f.woreda, f.kebele, f.house_number].filter(Boolean).join(" / ")], [w("phone"), f.phone],
    ...guardians.filter((g) => g.full_name).map((g, i) => [w("guardianN", { n: i + 1 }), `${g.full_name} (${g.relationship}) ${g.phone}`.trim()]),
    [w("previousSchool"), f.previous_school], [w("previousGrade"), f.previous_grade], [w("certificate"), f.transfer_certificate_no], [w("grade8"), f.grade8_exam_result],
    [w("documents"), [f.documents.birth_certificate && w("docBirth"), f.documents.transfer_letter && w("docTransfer")].filter(Boolean).join(", ")],
    ...(enroll.on && grade ? [[w("enrollNow"), `${year?.label} · ${pick(grade, lang)}${stream && grade.number > 10 ? ` · ${pick(stream, lang)}` : ""} · ${t(`students.enrollStatuses.${enroll.status}`)}`]] : []),
  ];

  return (
    <>
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
        <span style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }} />
      </div>
      <ol className="steps">
        {STEPS.map((k, i) => (
          <li key={k} className={i === step ? "current" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
            <span className="dot">{i < step ? "✓" : i + 1}</span><span className="lbl">{w(`steps.${k}`)}</span>
          </li>
        ))}
      </ol>
      <p className="muted small">{w("requiredNote")}</p>

      <section className="panel step-enter" key={step}>
        <h2>{w("stepOf", { n: step + 1, total: STEPS.length, name: w(`steps.${STEPS[step]}`) })}</h2>

        {errors.length > 0 && (
          <div className="flash error" role="alert" tabIndex={-1}>
            <strong>{w("fix")}</strong>
            <ul>{errors.map((k) => <li key={k}>{w(`err.${k}`)}</li>)}</ul>
          </div>
        )}

        {step === 0 && <StudentStep f={f} setF={setF} errors={errors} />}
        {step === 1 && <ContactStep f={f} setF={setF} />}
        {step === 2 && <GuardiansStep guardians={guardians} setGuardians={setGuardians} />}
        {step === 3 && <PreviousStep f={f} setF={setF} />}
        {step === 4 && (
          <>
            <DocumentsBlock f={f} setF={setF} />
            <fieldset className="checks">
              <label className="inline"><input type="checkbox" checked={enroll.on} onChange={(e) => setEnroll((x) => ({ ...x, on: e.target.checked }))} /> <strong>{w("enrollNow")}</strong></label>
            </fieldset>
            {enroll.on && (
              <div className="formgrid">
                <div>
                  <label htmlFor="e_year">{w("enrollYear")}</label>
                  <select id="e_year" value={enroll.yearId} onChange={(e) => setEnroll((x) => ({ ...x, yearId: e.target.value, sectionId: "" }))}>
                    {years.filter((y) => !y.is_closed).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="e_grade">{w("enrollGrade")} *</label>
                  <select id="e_grade" value={enroll.gradeId} onChange={(e) => pickGrade(e.target.value)}>
                    <option value="">—</option>
                    {grades.map((g) => <option key={g.id} value={g.id}>{pick(g, lang)}</option>)}
                  </select>
                </div>
                {grade && grade.number >= 11 && (
                  <div>
                    <label htmlFor="e_stream">{w("enrollStream")} *</label>
                    <select id="e_stream" value={enroll.streamId} onChange={(e) => setEnroll((x) => ({ ...x, streamId: e.target.value, sectionId: "" }))}>
                      <option value="">—</option>
                      {streamChoices.map((s) => <option key={s.id} value={s.id}>{pick(s, lang)}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="e_status">{w("enrollStatus")}</label>
                  <select id="e_status" value={enroll.status} onChange={(e) => setEnroll((x) => ({ ...x, status: e.target.value }))}>
                    {["new", "promoted", "repeater", "transfer_in"].map((k) => <option key={k} value={k}>{t(`students.enrollStatuses.${k}`)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="e_section">{w("enrollSection")}</label>
                  <select id="e_section" value={enroll.sectionId} onChange={(e) => setEnroll((x) => ({ ...x, sectionId: e.target.value }))}>
                    <option value="">{w("noSection")}</option>
                    {sectionOptions.map((s) => <option key={s.id} value={s.id}>{s.name} · {t(`sections.shifts.${s.shift}`)}</option>)}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
        {step === 5 && (
          <>
            <h3>{w("reviewTitle")}</h3>
            {aw && <p className="flash warn" role="status">{w("ageWarning", { age: aw.age, grade: grade.number, min: aw.min, max: aw.max })}</p>}
            {dups.length > 0 && (
              <div className="flash warn" role="alert">
                <strong>{w("dupTitle")}</strong>
                <ul>
                  {dups.map((d) => (
                    <li key={d.id}>{d.first_name} {d.father_name} {d.grandfather_name} · {d.student_code} · <Link to={`/${lang}/students/${d.id}`}>{w("dupOpen")}</Link></li>
                  ))}
                </ul>
                <label className="inline"><input type="checkbox" checked={dupOk} onChange={(e) => setDupOk(e.target.checked)} /> {w("dupConfirm")}</label>
              </div>
            )}
            {saveError && <p className="flash error" role="alert">{t("common.saveFailed", { detail: saveError })}</p>}
            <dl className="review">
              {reviewRows.filter(([, v]) => v).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
            </dl>
          </>
        )}

        <div className="row-actions wizard-actions">
          {step > 0 && <button type="button" className="btn-small secondary" onClick={() => { setErrors([]); setStep((s) => s - 1); }}>{w("back")}</button>}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-small" onClick={next}>{w("next")}</button>
          ) : (
            <button type="button" className="btn-small" onClick={save} disabled={saving || (dups.length > 0 && !dupOk)} aria-busy={saving}>
              {saving ? w("saving") : w("save")}
            </button>
          )}
        </div>
      </section>
      {step === 4 && aw && <p className="flash warn" role="status">{w("ageWarning", { age: aw.age, grade: grade.number, min: aw.min, max: aw.max })}</p>}
    </>
  );
}
