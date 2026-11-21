import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, pick, fullName } from "../../lib/ui.jsx";
import { can, ASSIGNERS } from "../../lib/roles.js";

const sameStream = (a, b) => (a || null) === (b || null);

export default function AssignmentsPage() {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, ASSIGNERS);
  const notice = useNotice();
  const [yearId, setYearId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [copyYear, setCopyYear] = useState("");
  const [maxDraft, setMaxDraft] = useState("");

  const ref = useQuery(async () => {
    const [y, g, st, sub, gs, teachers, set] = await Promise.all([
      supabase.from("academic_years").select("id,label,is_current,year_ec").order("year_ec", { ascending: false }),
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*"),
      supabase.from("subjects").select("*"),
      supabase.from("grade_subjects").select("*"),
      supabase.from("staff").select("*").eq("staff_type", "teaching").eq("employment_status", "active").order("first_name"),
      supabase.from("school_settings").select("*").eq("key", "max_teacher_periods").maybeSingle(),
    ]);
    const bad = [y, g, st, sub, gs, teachers, set].find((r) => r.error);
    if (bad) return bad;
    return { data: { years: y.data, grades: g.data, streams: st.data, subjects: sub.data, gradeSubjects: gs.data, teachers: teachers.data, max: Number(set.data?.value ?? 25) } };
  }, []);

  useEffect(() => {
    if (ref.data) {
      if (!yearId) setYearId((ref.data.years.find((y) => y.is_current) || ref.data.years[0])?.id || "");
      setMaxDraft(String(ref.data.max));
    }
  }, [ref.data]); // eslint-disable-line

  const yd = useQuery(async () => {
    if (!yearId) return { data: { sections: [], assignments: [] } };
    const [s, a] = await Promise.all([
      supabase.from("sections").select("*").eq("academic_year_id", yearId),
      supabase.from("teacher_assignments").select("*").eq("academic_year_id", yearId),
    ]);
    return s.error ? s : a.error ? a : { data: { sections: s.data, assignments: a.data } };
  }, [yearId]);

  if (ref.loading) return <p>{t("common.loading")}</p>;
  if (ref.error) return <LoadError />;
  const { years, grades, streams, subjects, gradeSubjects, teachers, max } = ref.data;

  const sections = [...(yd.data?.sections || [])].sort((a, b) => {
    const ga = grades.find((g) => g.id === a.grade_id)?.number || 0;
    const gb = grades.find((g) => g.id === b.grade_id)?.number || 0;
    return ga - gb || a.shift.localeCompare(b.shift) || a.name.localeCompare(b.name);
  });
  const assignments = yd.data?.assignments || [];
  const section = sections.find((s) => s.id === sectionId) || sections[0];
  const sectionLabel = (s) =>
    `${pick(grades.find((g) => g.id === s.grade_id), lang)} · ${pick(streams.find((x) => x.id === s.stream_id), lang)} · ${t(`sections.shifts.${s.shift}`)} · ${s.name}`;

  const periodsFor = (sec, subjectId) =>
    gradeSubjects.find((gs) => gs.grade_id === sec.grade_id && sameStream(gs.stream_id, sec.stream_id) && gs.subject_id === subjectId)?.periods_per_week || 0;

  async function setTeacher(subjectId, staffId) {
    const existing = assignments.find((a) => a.section_id === section.id && a.subject_id === subjectId);
    let q;
    if (!staffId) q = supabase.from("teacher_assignments").delete().eq("id", existing.id);
    else if (existing) q = supabase.from("teacher_assignments").update({ staff_id: staffId }).eq("id", existing.id);
    else q = supabase.from("teacher_assignments").insert({ academic_year_id: yearId, section_id: section.id, subject_id: subjectId, staff_id: staffId });
    const { error } = await q;
    error ? notice.fail(error) : (notice.ok(), yd.reload());
  }
  async function setHomeroom(staffId) {
    const { error } = await supabase.from("sections").update({ homeroom_staff_id: staffId || null }).eq("id", section.id);
    error ? notice.fail(error) : (notice.ok(), yd.reload());
  }
  async function saveMax() {
    const n = Number(maxDraft);
    if (!Number.isInteger(n) || n < 1 || n > 60) return;
    const { error } = await supabase.from("school_settings").upsert({ key: "max_teacher_periods", value: n, updated_at: new Date().toISOString() });
    error ? notice.fail(error) : (notice.ok(), ref.reload());
  }

  async function copyFromYear() {
    if (!copyYear || copyYear === yearId) return;
    const [ss, aa] = await Promise.all([
      supabase.from("sections").select("*").eq("academic_year_id", copyYear),
      supabase.from("teacher_assignments").select("*").eq("academic_year_id", copyYear),
    ]);
    if (ss.error || aa.error) return notice.fail(ss.error || aa.error);
    const key = (s) => `${s.grade_id}|${s.stream_id || ""}|${s.shift}|${s.name}`;
    const target = new Map(sections.map((s) => [key(s), s]));
    const sourceById = new Map(ss.data.map((s) => [s.id, s]));
    const ok = new Set(teachers.map((x) => x.id));
    const have = new Set(assignments.map((a) => `${a.section_id}|${a.subject_id}`));

    const rows = [];
    for (const a of aa.data) {
      const tSec = target.get(key(sourceById.get(a.section_id) || {}));
      if (!tSec || !ok.has(a.staff_id) || have.has(`${tSec.id}|${a.subject_id}`)) continue;
      rows.push({ academic_year_id: yearId, section_id: tSec.id, subject_id: a.subject_id, staff_id: a.staff_id });
    }
    if (rows.length) {
      const r = await supabase.from("teacher_assignments").insert(rows);
      if (r.error) return notice.fail(r.error);
    }
    let homerooms = 0;
    for (const s of ss.data) {
      const tSec = target.get(key(s));
      if (tSec && !tSec.homeroom_staff_id && s.homeroom_staff_id && ok.has(s.homeroom_staff_id)) {
        const r = await supabase.from("sections").update({ homeroom_staff_id: s.homeroom_staff_id }).eq("id", tSec.id);
        if (!r.error) homerooms += 1;
      }
    }
    notice.setNotice({ type: "ok", text: t("assignments.copied", { n: rows.length, h: homerooms }) });
    yd.reload();
  }

  // Workload per teacher for the selected year
  const load = new Map();
  for (const a of assignments) {
    const sec = sections.find((s) => s.id === a.section_id);
    if (!sec) continue;
    const row = load.get(a.staff_id) || { periods: 0, sections: new Set() };
    row.periods += periodsFor(sec, a.subject_id);
    row.sections.add(sec.id);
    load.set(a.staff_id, row);
  }
  const workload = [...load.entries()]
    .map(([id, v]) => ({ teacher: teachers.find((x) => x.id === id), periods: v.periods, sections: v.sections.size }))
    .filter((w) => w.teacher)
    .sort((a, b) => b.periods - a.periods);

  const sectionSubjects = section
    ? gradeSubjects.filter((gs) => gs.grade_id === section.grade_id && sameStream(gs.stream_id, section.stream_id))
        .map((gs) => ({ gs, subject: subjects.find((s) => s.id === gs.subject_id) })).filter((x) => x.subject)
    : [];
  const homeroomElsewhere = (staffId) => staffId && sections.some((s) => s.id !== section?.id && s.homeroom_staff_id === staffId);

  return (
    <>
      <p className="muted">{t("assignments.intro")}</p>
      {!editable && <p className="muted">{t("common.readOnly")}</p>}
      <Notice notice={notice.notice} />

      <div className="panel formgrid">
        <div>
          <label htmlFor="ay">{t("common.academicYear")}</label>
          <select id="ay" value={yearId} onChange={(e) => { setYearId(e.target.value); setSectionId(""); }}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="asec">{t("assignments.section")}</label>
          <select id="asec" value={section?.id || ""} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
          </select>
        </div>
      </div>

      {yd.error ? <LoadError /> : yd.loading ? <p>{t("common.loading")}</p> : !section ? <p>{t("assignments.noSections")}</p> : (
        <section className="panel">
          <h2>{sectionLabel(section)}</h2>
          <p className="muted small">{t("assignments.inactiveNote")}</p>

          <label htmlFor="hr">{t("assignments.homeroom")}</label>
          <select id="hr" value={section.homeroom_staff_id || ""} disabled={!editable} onChange={(e) => setHomeroom(e.target.value)}>
            <option value="">{t("assignments.noTeacher")}</option>
            {teachers.map((x) => <option key={x.id} value={x.id}>{fullName(x, lang)}</option>)}
          </select>
          {homeroomElsewhere(section.homeroom_staff_id) && <p className="flash error">{t("assignments.alsoHomeroom")}</p>}

          {sectionSubjects.length === 0 ? <p>{t("assignments.noSubjects")}</p> : (
            <div className="tablewrap" style={{ marginTop: "1rem" }}>
              <table>
                <thead><tr><th>{t("assignments.subject")}</th><th>{t("assignments.periods")}</th><th>{t("assignments.teacher")}</th></tr></thead>
                <tbody>
                  {sectionSubjects.map(({ gs, subject }) => {
                    const a = assignments.find((x) => x.section_id === section.id && x.subject_id === subject.id);
                    return (
                      <tr key={subject.id}>
                        <th scope="row">{pick(subject, lang)}</th>
                        <td>{gs.periods_per_week ?? "—"}</td>
                        <td>
                          <select aria-label={`${pick(subject, lang)} – ${t("assignments.teacher")}`} value={a?.staff_id || ""} disabled={!editable} onChange={(e) => setTeacher(subject.id, e.target.value)}>
                            <option value="">{t("assignments.noTeacher")}</option>
                            {teachers.map((x) => <option key={x.id} value={x.id}>{fullName(x, lang)}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2>{t("assignments.workload")}</h2>
        {editable && (
          <div className="formgrid">
            <div>
              <label htmlFor="maxp">{t("assignments.maxPeriods")}</label>
              <input id="maxp" type="number" min="1" max="60" value={maxDraft} onChange={(e) => setMaxDraft(e.target.value)} />
            </div>
            <div className="formgrid-action"><button type="button" className="btn-small" onClick={saveMax}>{t("common.save")}</button></div>
          </div>
        )}
        {workload.length === 0 ? <p>{t("assignments.noWorkload")}</p> : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>{t("assignments.teacher")}</th><th>{t("assignments.sectionsCount")}</th><th>{t("assignments.totalPeriods")}</th></tr></thead>
              <tbody>
                {workload.map((w) => (
                  <tr key={w.teacher.id}>
                    <th scope="row">{fullName(w.teacher, lang)}</th>
                    <td>{w.sections}</td>
                    <td>{w.periods} {w.periods > max && <span className="pill warn">{t("assignments.overloaded")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editable && years.length > 1 && (
        <section className="panel formgrid">
          <h2>{t("assignments.copyTitle")}</h2>
          <div>
            <label htmlFor="cpy">{t("assignments.copyFrom")}</label>
            <select id="cpy" value={copyYear} onChange={(e) => setCopyYear(e.target.value)}>
              <option value="">—</option>
              {years.filter((y) => y.id !== yearId).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </div>
          <div className="formgrid-action"><button type="button" className="btn-small secondary" disabled={!copyYear} onClick={copyFromYear}>{t("assignments.copy")}</button></div>
        </section>
      )}
    </>
  );
}
