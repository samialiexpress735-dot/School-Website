import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, pick, Loading } from "../../lib/ui.jsx";
import { can, STRUCTURE_EDITORS } from "../../lib/roles.js";

function SubjectRow({ subject, editable, onDone, notice }) {
  const { t } = useLang();
  const [code, setCode] = useState(subject.code);
  const [name, setName] = useState(subject.name);
  const [nameAm, setNameAm] = useState(subject.name_am || "");
  const [active, setActive] = useState(subject.is_active);

  async function save() {
    const { error } = await supabase
      .from("subjects")
      .update({ code: code.trim().toUpperCase(), name: name.trim(), name_am: nameAm.trim() || null, is_active: active })
      .eq("id", subject.id);
    error ? notice.fail(error) : (notice.ok(), onDone());
  }

  return (
    <tr>
      <td><input aria-label={t("common.code")} value={code} onChange={(e) => setCode(e.target.value)} disabled={!editable} className="narrow" /></td>
      <td><input aria-label={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} /></td>
      <td><input aria-label={t("common.nameAm")} value={nameAm} onChange={(e) => setNameAm(e.target.value)} disabled={!editable} lang="am" /></td>
      <td>
        <label className="inline">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={!editable} /> {t("common.active")}
        </label>
      </td>
      <td className="row-actions">{editable && <button type="button" className="btn-small" onClick={save}>{t("common.save")}</button>}</td>
    </tr>
  );
}

function GradeSubjects({ subjects, editable, notice }) {
  const { t, lang } = useLang();
  const [yearId, setYearId] = useState("");
  const [copyYear, setCopyYear] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");

  const ref = useQuery(async () => {
    const [y, g, s] = await Promise.all([
      supabase.from("academic_years").select("id,label,is_current,is_closed,year_ec").order("year_ec", { ascending: false }),
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*").order("code"),
    ]);
    const bad = [y, g, s].find((r) => r.error);
    return bad || { data: { years: y.data, grades: g.data, streams: s.data } };
  }, []);

  const year = ref.data ? ref.data.years.find((y) => y.id === yearId) || ref.data.years.find((y) => y.is_current) || ref.data.years[0] : undefined;
  const canEdit = editable && Boolean(year) && !year.is_closed;
  const grade = ref.data?.grades.find((g) => g.id === gradeId) || ref.data?.grades[0];
  const streamOptions = !ref.data || !grade
    ? []
    : ref.data.streams.filter((s) => (grade.number <= 10 ? s.code === "general" : s.code !== "general"));
  const stream = streamOptions.find((s) => s.id === streamId) || streamOptions[0];

  const links = useQuery(
    () => (year && grade && stream ? supabase.from("grade_subjects").select("*").eq("academic_year_id", year.id).eq("grade_id", grade.id).eq("stream_id", stream.id) : { data: [] }),
    [year?.id, grade?.id, stream?.id]
  );

  async function toggle(subject, existing) {
    const q = existing
      ? supabase.from("grade_subjects").delete().eq("id", existing.id)
      : supabase.from("grade_subjects").insert({ academic_year_id: year.id, grade_id: grade.id, stream_id: stream.id, subject_id: subject.id, periods_per_week: 3 });
    const { error } = await q;
    error ? notice.fail(error) : (notice.ok(), links.reload());
  }
  async function setPeriods(existing, value) {
    const n = value === "" ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 20)) return;
    const { error } = await supabase.from("grade_subjects").update({ periods_per_week: n }).eq("id", existing.id);
    error ? notice.fail(error) : notice.ok();
  }

  // Copies the subject lists of another year into this year (what is already set here is kept).
  async function copyFromYear() {
    if (!copyYear || !year || copyYear === year.id) return;
    const [src, cur] = await Promise.all([
      supabase.from("grade_subjects").select("*").eq("academic_year_id", copyYear),
      supabase.from("grade_subjects").select("*").eq("academic_year_id", year.id),
    ]);
    if (src.error || cur.error) return notice.fail(src.error || cur.error);
    const key = (r) => `${r.grade_id}|${r.stream_id || ""}|${r.subject_id}`;
    const have = new Set(cur.data.map(key));
    const rows = src.data
      .filter((r) => !have.has(key(r)))
      .map((r) => ({ academic_year_id: year.id, grade_id: r.grade_id, stream_id: r.stream_id, subject_id: r.subject_id, periods_per_week: r.periods_per_week }));
    if (rows.length) {
      const ins = await supabase.from("grade_subjects").insert(rows);
      if (ins.error) return notice.fail(ins.error);
    }
    notice.setNotice({ type: "ok", text: t("subjects.copied", { n: rows.length }) });
    links.reload();
  }

  if (ref.loading) return <Loading />;
  if (ref.error) return <LoadError />;

  const visibleSubjects = subjects.filter((s) => s.is_active || (links.data || []).some((l) => l.subject_id === s.id));

  return (
    <section className="panel">
      <h2>{t("subjects.perGrade")}</h2>
      <p className="muted">{t("subjects.perGradeHelp")}</p>
      {year?.is_closed && <p className="muted">{t("subjects.closedYear")}</p>}
      <div className="formgrid">
        <div>
          <label htmlFor="gsy">{t("common.academicYear")}</label>
          <select id="gsy" value={year?.id || ""} onChange={(e) => { setYearId(e.target.value); setCopyYear(""); }}>
            {ref.data.years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="gsg">{t("common.grade")}</label>
          <select id="gsg" value={grade?.id || ""} onChange={(e) => { setGradeId(e.target.value); setStreamId(""); }}>
            {ref.data.grades.map((g) => <option key={g.id} value={g.id}>{pick(g, lang)}</option>)}
          </select>
        </div>
        {streamOptions.length > 1 && (
          <div>
            <label htmlFor="gss">{t("common.stream")}</label>
            <select id="gss" value={stream?.id || ""} onChange={(e) => setStreamId(e.target.value)}>
              {streamOptions.map((s) => <option key={s.id} value={s.id}>{pick(s, lang)}</option>)}
            </select>
          </div>
        )}
      </div>

      {!year ? <p>{t("common.noData")}</p> : subjects.length === 0 ? <p>{t("subjects.noneActive")}</p> : links.loading ? <Loading /> : links.error ? <LoadError /> : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>{t("subjects.taught")}</th><th>{t("common.name")}</th><th>{t("subjects.periods")}</th></tr></thead>
            <tbody>
              {visibleSubjects.map((s) => {
                const existing = links.data.find((l) => l.subject_id === s.id);
                return (
                  <tr key={s.id}>
                    <td><input type="checkbox" aria-label={pick(s, lang)} checked={Boolean(existing)} disabled={!canEdit} onChange={() => toggle(s, existing)} /></td>
                    <td>{pick(s, lang)}{!s.is_active && <> <span className="pill">{t("subjects.inactive")}</span></>}</td>
                    <td>
                      {existing && (
                        <input type="number" min="1" max="20" className="narrow" aria-label={t("subjects.periods")} defaultValue={existing.periods_per_week ?? ""}
                          disabled={!canEdit} onBlur={(e) => setPeriods(existing, e.target.value)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && ref.data.years.length > 1 && (
        <div className="formgrid" style={{ marginTop: "1rem" }}>
          <div>
            <label htmlFor="gscopy">{t("subjects.copyFrom")}</label>
            <select id="gscopy" value={copyYear} onChange={(e) => setCopyYear(e.target.value)}>
              <option value="">—</option>
              {ref.data.years.filter((y) => y.id !== year?.id).map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </div>
          <div className="formgrid-action"><button type="button" className="btn-small secondary" disabled={!copyYear} onClick={copyFromYear}>{t("subjects.copy")}</button></div>
        </div>
      )}
    </section>
  );
}

export default function SubjectsPage() {
  const { t } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, STRUCTURE_EDITORS);
  const notice = useNotice();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");

  const subjects = useQuery(() => supabase.from("subjects").select("*").order("name"), []);

  async function add(e) {
    e.preventDefault();
    notice.clear();
    const { error } = await supabase.from("subjects").insert({ code: code.trim().toUpperCase(), name: name.trim(), name_am: nameAm.trim() || null });
    if (error) return notice.fail(error);
    setCode(""); setName(""); setNameAm("");
    notice.ok();
    subjects.reload();
  }

  if (subjects.loading) return <Loading />;
  if (subjects.error) return <LoadError />;

  return (
    <>
      <p className="muted">{t("subjects.intro")}</p>
      {!editable && <p className="muted">{t("common.readOnly")}</p>}
      <Notice notice={notice.notice} />

      {editable && (
        <form className="panel formgrid" onSubmit={add}>
          <h2>{t("subjects.add")}</h2>
          <div><label htmlFor="sc">{t("common.code")}</label><input id="sc" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={10} /></div>
          <div><label htmlFor="sn">{t("common.name")}</label><input id="sn" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div><label htmlFor="sna">{t("common.nameAm")}</label><input id="sna" value={nameAm} onChange={(e) => setNameAm(e.target.value)} lang="am" /></div>
          <div className="formgrid-action"><button type="submit" className="btn-small">{t("common.add")}</button></div>
        </form>
      )}

      <div className="tablewrap">
        <table>
          <thead><tr><th>{t("common.code")}</th><th>{t("common.name")}</th><th>{t("common.nameAm")}</th><th>{t("common.active")}</th><th><span className="sr-only">{t("common.actions")}</span></th></tr></thead>
          <tbody>
            {subjects.data.map((s) => (
              <SubjectRow key={`${s.id}-${s.updated_at ?? ""}-${s.code}-${s.name}-${s.name_am}-${s.is_active}`} subject={s} editable={editable} onDone={subjects.reload} notice={notice} />
            ))}
          </tbody>
        </table>
      </div>

      <GradeSubjects subjects={subjects.data} editable={editable} notice={notice} />
    </>
  );
}
