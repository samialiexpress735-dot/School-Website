import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, Loading, pick } from "../../lib/ui.jsx";
import { can, MARK_STRUCTURE_ADMINS, MARK_STRUCTURE_EDITORS } from "../../lib/roles.js";
import { effectiveStream, hasFinalExam, pickStructure } from "../../lib/marksEngine.js";
import { fetchAll, loadStructures, subjectsOfGrade } from "../../lib/marksData.js";
import { useMarksRef } from "./MarksParts.jsx";
import StructureEditor, { PRESETS, toDraft } from "./StructureEditor.jsx";

export default function StructuresPage() {
  const refQ = useMarksRef();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  if (!refQ.data.years.length) return <p className="empty">{"—"}</p>;
  return <Inner refData={refQ.data} reloadRef={refQ.reload} />;
}

function Inner({ refData, reloadRef }) {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const admin = can(profile, MARK_STRUCTURE_ADMINS); // every structure, copy tools, school settings
  const isTeacher = !admin && profile?.role === "teacher"; // only the subjects they are assigned to
  const editor = can(profile, MARK_STRUCTURE_EDITORS);
  const [yearId, setYearId] = useState(() => (refData.years.find((y) => y.is_current) || refData.years[0]).id);
  const [gradeId, setGradeId] = useState(refData.grades[0]?.id || "");
  const [streamId, setStreamId] = useState("");
  const [open, setOpen] = useState(null); // { subject, semester, structure, preset }
  const year = refData.years.find((y) => y.id === yearId);
  const grade = refData.grades.find((g) => g.id === gradeId);
  const hasStreams = Boolean(grade && grade.number >= 11);
  const streamChoices = refData.streams.filter((s) => s.code !== "general");
  const general = refData.streams.find((s) => s.code === "general");

  useEffect(() => {
    if (!hasStreams) setStreamId("");
    else if (!streamChoices.find((s) => s.id === streamId)) setStreamId(streamChoices[0]?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStreams, gradeId]);

  const sems = refData.semesters.filter((s) => s.academic_year_id === yearId).sort((a, b) => a.number - b.number);
  const structQ = useQuery(() => loadStructures({ yearId, gradeId }), [yearId, gradeId]);
  const gsQ = useQuery(() => fetchAll(() => supabase.from("grade_subjects").select("*").eq("academic_year_id", yearId).eq("grade_id", gradeId)), [yearId, gradeId]);
  // A teacher sees and edits only the subjects they are assigned to (year, grade, stream).
  // The database enforces the same rule; this only keeps the screen short.
  const mineQ = useQuery(async () => {
    if (!isTeacher || !refData.myStaffId) return { data: [] };
    const r = await supabase
      .from("teacher_assignments")
      .select("subject_id, section:sections(grade_id, stream_id)")
      .eq("academic_year_id", yearId)
      .eq("staff_id", refData.myStaffId);
    if (r.error) return r;
    return { data: r.data.filter((x) => x.section).map((x) => ({ subject_id: x.subject_id, grade_id: x.section.grade_id, stream_id: x.section.stream_id })) };
  }, [yearId, isTeacher]);
  const mine = mineQ.data || [];
  const grades = isTeacher ? refData.grades.filter((g) => mine.some((m) => m.grade_id === g.id)) : refData.grades;

  useEffect(() => {
    if (isTeacher && !mineQ.loading && grades.length > 0 && !grades.find((g) => g.id === gradeId)) setGradeId(grades[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, mineQ.loading, yearId, grades.length]);

  const stream = hasStreams ? streamId : general?.id || "";
  const subjects = useMemo(() => {
    const all = subjectsOfGrade(gsQ.data || [], refData.subjects, { yearId, gradeId, streamId: stream, streams: refData.streams });
    if (!isTeacher) return all;
    return all.filter((sub) => mine.some((m) => m.subject_id === sub.id && m.grade_id === gradeId && (!hasStreams || m.stream_id === streamId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gsQ.data, refData, yearId, gradeId, stream, isTeacher, mineQ.data]);
  const eff = effectiveStream(stream, refData.streams);

  if (structQ.loading || gsQ.loading || mineQ.loading) return <Loading />;
  if (structQ.error || gsQ.error || mineQ.error) return <LoadError />;
  const structures = structQ.data;

  const find = (semester, subject) => pickStructure(structures, { semesterId: semester.id, gradeId, streamId: eff, subjectId: subject.id });
  const refresh = () => { setOpen(null); structQ.reload(); };

  const draftFor = (o) => (o.structure ? toDraft(o.structure) : { id: null, rounding_places: "0", formula: "", ...PRESETS[o.preset || "ca40"]() });
  const streamName = pick(refData.streams.find((s) => s.id === eff), lang);
  const scopeFor = (o) => {
    if (o.structure) return o.structure.stream_id ? t("marks.editor.scopeStream", { stream: pick(refData.streams.find((s) => s.id === o.structure.stream_id), lang) }) : hasStreams ? t("marks.editor.scopeAll") : "";
    return hasStreams ? t("marks.editor.scopeAll") : "";
  };

  return (
    <>
      <section className="panel">
        <p className="muted">{t("marks.structures.intro")}</p>
        {isTeacher && <p className="small muted">{t("marks.structures.teacherIntro")}</p>}
        {year.is_closed && <p className="flash warn">{t("marks.structures.closedYear")}</p>}
        <div className="toolbar">
          <label>
            <span className="small muted">{t("marks.year")}</span>
            <select value={yearId} onChange={(e) => { setYearId(e.target.value); setOpen(null); }}>
              {refData.years.map((y) => (<option key={y.id} value={y.id}>{y.label}</option>))}
            </select>
          </label>
          <label>
            <span className="small muted">{t("marks.grade")}</span>
            <select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setOpen(null); }}>
              {grades.map((g) => (<option key={g.id} value={g.id}>{pick(g, lang)}</option>))}
            </select>
          </label>
          {hasStreams && (
            <label>
              <span className="small muted">{t("marks.stream")}</span>
              <select value={streamId} onChange={(e) => { setStreamId(e.target.value); setOpen(null); }}>
                {streamChoices.map((s) => (<option key={s.id} value={s.id}>{pick(s, lang)}</option>))}
              </select>
            </label>
          )}
        </div>

        {subjects.length === 0 ? (
          <p className="empty">{isTeacher ? t("marks.structures.noneAssigned") : t("marks.structures.noSubjects")}</p>
        ) : (
          <>
            <p className="small muted">
              {sems.map((s) => t("marks.structures.setCount", { n: subjects.filter((sub) => find(s, sub)).length, total: subjects.length })).join(" · ")}
            </p>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("marks.structures.colSubject")}</th>
                    {sems.map((s) => (<th key={s.id}>{t("marks.semesterN", { n: s.number })}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((sub) => (
                    <tr key={sub.id}>
                      <td>{pick(sub, lang)}</td>
                      {sems.map((sem) => {
                        const st = find(sem, sub);
                        const status = st ? (st.stream_id || !hasStreams ? "own" : "all") : "none";
                        return (
                          <td key={sem.id}>
                            <span className={st ? "pill ok" : "pill warn"}>{t(`marks.structures.status.${status}`)}</span>{" "}
                            {st && !hasFinalExam(st) && <span className="pill warn">{t("marks.structures.missingFinal")}</span>}{" "}
                            {(editor || st) && (
                              <button
                                className="btn-small secondary"
                                onClick={() => setOpen({ subject: sub, semester: sem, structure: st, preset: "ca40", n: Date.now() })}
                              >
                                {st ? (editor && !year.is_closed ? t("marks.structures.edit") : t("marks.structures.view")) : t("marks.structures.setUp")}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {open && (
        <>
          {!open.structure && editor && (
            <section className="panel">
              <label>
                {t("marks.editor.startFrom")}{" "}
                <select value={open.preset} onChange={(e) => setOpen({ ...open, preset: e.target.value, n: Date.now() })}>
                  {Object.keys(PRESETS).map((p) => (<option key={p} value={p}>{t(`marks.editor.presets.${p}`)}</option>))}
                </select>
              </label>
              {hasStreams && !open.structure && (
                <p className="small muted">{t("marks.editor.scope")}: {t("marks.editor.scopeAll")}. {streamName && `(${streamName})`}</p>
              )}
            </section>
          )}
          <StructureEditor
            key={`${open.subject.id}|${open.semester.id}|${open.structure?.id || open.preset}|${open.n}`}
            draft={draftFor(open)}
            title={t("marks.editor.title", { subject: pick(open.subject, lang), semester: t("marks.semesterN", { n: open.semester.number }) })}
            scopeText={scopeFor(open)}
            context={{
              academic_year_id: yearId,
              semester_id: open.semester.id,
              grade_id: gradeId,
              stream_id: open.structure ? open.structure.stream_id : null,
              subject_id: open.subject.id,
            }}
            readOnly={!editor || year.is_closed}
            isAdmin={admin}
            refData={refData}
            subjectsForCopy={subjects}
            onClose={() => setOpen(null)}
            onSaved={refresh}
          />
        </>
      )}

      {admin && <Tools refData={refData} year={year} onDone={() => { setOpen(null); structQ.reload(); }} onSettings={reloadRef} />}
    </>
  );
}

function Tools({ refData, year, onDone, onSettings }) {
  const { t } = useLang();
  const n1 = useNotice();
  const n2 = useNotice();
  const others = refData.years.filter((y) => y.id !== year.id);
  const [from, setFrom] = useState(others[0]?.id || "");
  const [pass, setPass] = useState(String(refData.passMark));
  const [places, setPlaces] = useState(String(refData.yearlyPlaces));
  const [busy, setBusy] = useState(false);

  async function copy() {
    if (!from) return;
    setBusy(true);
    const r = await supabase.rpc("copy_structures_from_year", { p_from: from, p_to: year.id });
    setBusy(false);
    if (r.error) return n1.fail(r.error);
    n1.setNotice({ type: "ok", text: t("marks.structures.tools.copied", { n: r.data }) });
    onDone();
  }
  async function saveSettings(e) {
    e.preventDefault();
    const p = Number(String(pass).replace(",", "."));
    if (!(p >= 1 && p <= 100)) return n2.setNotice({ type: "error", text: t("marks.structures.settings.invalidPass") });
    setBusy(true);
    const stamp = new Date().toISOString();
    const r = await supabase.from("school_settings").upsert([
      { key: "pass_mark", value: p, updated_at: stamp },
      { key: "yearly_rounding_places", value: Number(places), updated_at: stamp },
    ]);
    setBusy(false);
    if (r.error) return n2.fail(r.error);
    n2.ok();
    onSettings();
  }

  return (
    <>
      {others.length > 0 && !year.is_closed && (
        <section className="panel">
          <h2>{t("marks.structures.tools.title")}</h2>
          <p className="small muted">{t("marks.structures.tools.help")}</p>
          <Notice notice={n1.notice} />
          <div className="toolbar">
            <label>
              <span className="small muted">{t("marks.structures.tools.from")}</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                {others.map((y) => (<option key={y.id} value={y.id}>{y.label}</option>))}
              </select>
            </label>
            <button className="btn-small" disabled={busy} onClick={copy}>{t("marks.structures.tools.run")}</button>
          </div>
        </section>
      )}
      <section className="panel">
        <h2>{t("marks.structures.settings.title")}</h2>
        <p className="small muted">{t("marks.structures.settings.help")}</p>
        <Notice notice={n2.notice} />
        <form className="formgrid" onSubmit={saveSettings}>
          <label>{t("marks.structures.settings.passMark")}<input inputMode="decimal" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
          <label>
            {t("marks.structures.settings.yearlyPlaces")}
            <select value={places} onChange={(e) => setPlaces(e.target.value)}>
              {[0, 1, 2].map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </label>
          <div className="formgrid-action"><button className="btn" disabled={busy}>{t("marks.structures.settings.save")}</button></div>
        </form>
      </section>
    </>
  );
}
