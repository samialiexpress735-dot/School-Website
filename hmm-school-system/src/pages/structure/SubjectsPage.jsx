import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, pick } from "../../lib/ui.jsx";
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
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");

  const ref = useQuery(async () => {
    const [g, s] = await Promise.all([
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*").order("code"),
    ]);
    return g.error ? g : s.error ? s : { data: { grades: g.data, streams: s.data } };
  }, []);

  const grade = ref.data?.grades.find((g) => g.id === gradeId) || ref.data?.grades[0];
  const streamOptions = !ref.data || !grade
    ? []
    : ref.data.streams.filter((s) => (grade.number <= 10 ? s.code === "general" : s.code !== "general"));
  const stream = streamOptions.find((s) => s.id === streamId) || streamOptions[0];

  const links = useQuery(
    () => (grade && stream ? supabase.from("grade_subjects").select("*").eq("grade_id", grade.id).eq("stream_id", stream.id) : { data: [] }),
    [grade?.id, stream?.id]
  );

  async function toggle(subject, existing) {
    const q = existing
      ? supabase.from("grade_subjects").delete().eq("id", existing.id)
      : supabase.from("grade_subjects").insert({ grade_id: grade.id, stream_id: stream.id, subject_id: subject.id, periods_per_week: 3 });
    const { error } = await q;
    error ? notice.fail(error) : (notice.ok(), links.reload());
  }
  async function setPeriods(existing, value) {
    const n = value === "" ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 20)) return;
    const { error } = await supabase.from("grade_subjects").update({ periods_per_week: n }).eq("id", existing.id);
    error ? notice.fail(error) : notice.ok();
  }

  if (ref.loading) return <p>{t("common.loading")}</p>;
  if (ref.error) return <LoadError />;

  return (
    <section className="panel">
      <h2>{t("subjects.perGrade")}</h2>
      <p className="muted">{t("subjects.perGradeHelp")}</p>
      <div className="formgrid">
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

      {subjects.length === 0 ? <p>{t("subjects.noneActive")}</p> : links.loading ? <p>{t("common.loading")}</p> : links.error ? <LoadError /> : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>{t("subjects.taught")}</th><th>{t("common.name")}</th><th>{t("subjects.periods")}</th></tr></thead>
            <tbody>
              {subjects.filter((s) => s.is_active).map((s) => {
                const existing = links.data.find((l) => l.subject_id === s.id);
                return (
                  <tr key={s.id}>
                    <td><input type="checkbox" aria-label={pick(s, lang)} checked={Boolean(existing)} disabled={!editable} onChange={() => toggle(s, existing)} /></td>
                    <td>{pick(s, lang)}</td>
                    <td>
                      {existing && (
                        <input type="number" min="1" max="20" className="narrow" aria-label={t("subjects.periods")} defaultValue={existing.periods_per_week ?? ""}
                          disabled={!editable} onBlur={(e) => setPeriods(existing, e.target.value)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

  if (subjects.loading) return <p>{t("common.loading")}</p>;
  if (subjects.error) return <LoadError />;

  return (
    <>
      <p className="muted">{t("subjects.draftNote")}</p>
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
