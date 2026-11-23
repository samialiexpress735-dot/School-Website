import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, Loading, pick, fullName } from "../../lib/ui.jsx";
import { formatEc } from "../../lib/ethiopian.js";
import { can, MARK_LOCKERS, MARK_UNLOCKERS } from "../../lib/roles.js";
import {
  allComponents, computeSemester, effectiveStream, hasFinalExam, parseScore, pickStructure,
} from "../../lib/marksEngine.js";
import {
  fetchAll, fmt, loadMarks, loadStructures, markKey, scoresForStudent, sortSections, subjectsOfGrade,
} from "../../lib/marksData.js";
import { useMarksRef, useYearSemester, YearSemesterPicker, sectionLabel } from "./MarksParts.jsx";
import { useConfirm } from "../../components/Dialogs.jsx";

export default function EntryPage() {
  const refQ = useMarksRef();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  return <EntryInner refData={refQ.data} />;
}

function EntryInner({ refData }) {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const ys = useYearSemester(refData);
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const seesAll = can(profile, MARK_LOCKERS);
  const isAdmin = profile?.role === "system_admin";
  const { yearId, semesterId } = ys;

  const sectionsQ = useQuery(
    () => (yearId ? fetchAll(() => supabase.from("sections").select("*").eq("academic_year_id", yearId)) : { data: [] }),
    [yearId]
  );
  const assignQ = useQuery(
    () =>
      yearId && refData.myStaffId
        ? supabase.from("teacher_assignments").select("section_id,subject_id").eq("academic_year_id", yearId).eq("staff_id", refData.myStaffId)
        : { data: [] },
    [yearId]
  );
  const gsQ = useQuery(
    () => (yearId ? fetchAll(() => supabase.from("grade_subjects").select("*").eq("academic_year_id", yearId)) : { data: [] }),
    [yearId]
  );

  const assigned = useMemo(() => new Set((assignQ.data || []).map((a) => `${a.section_id}|${a.subject_id}`)), [assignQ.data]);
  const homeroomOf = (s) => refData.myStaffId && s.homeroom_staff_id === refData.myStaffId;

  const sections = useMemo(() => {
    const all = sectionsQ.data || [];
    const mine = seesAll ? all : all.filter((s) => homeroomOf(s) || (assignQ.data || []).some((a) => a.section_id === s.id));
    return sortSections(mine, refData.grades);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsQ.data, assignQ.data, seesAll]);

  const section = sections.find((s) => s.id === sectionId) || null;
  useEffect(() => {
    if (!sections.find((s) => s.id === sectionId)) setSectionId(sections[0]?.id || "");
  }, [sections, sectionId]);

  const subjects = useMemo(() => {
    if (!section) return [];
    const all = subjectsOfGrade(gsQ.data || [], refData.subjects, { yearId, gradeId: section.grade_id, streamId: section.stream_id, streams: refData.streams });
    return seesAll || homeroomOf(section) ? all : all.filter((s) => assigned.has(`${section.id}|${s.id}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, gsQ.data, assigned, seesAll]);
  const subject = subjects.find((s) => s.id === subjectId) || null;
  useEffect(() => {
    if (!subjects.find((s) => s.id === subjectId)) setSubjectId(subjects[0]?.id || "");
  }, [subjects, subjectId]);

  if (sectionsQ.loading || assignQ.loading || gsQ.loading) return <Loading />;
  if (sectionsQ.error || assignQ.error || gsQ.error) return <LoadError />;
  if (!refData.years.length) return <p className="empty">{t("marks.noYear")}</p>;

  const year = refData.years.find((y) => y.id === yearId);
  const semester = refData.semesters.find((s) => s.id === semesterId);
  const canTeach = Boolean(section && subject && (isAdmin || assigned.has(`${section.id}|${subject.id}`)));

  return (
    <section className="panel">
      <p className="muted">{t("marks.entry.intro")}</p>
      <YearSemesterPicker
        refData={refData}
        state={ys}
        extra={
          <>
            <label>
              <span className="small muted">{t("marks.section")}</span>
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{sectionLabel(s, refData.grades, refData.streams, lang, pick)}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="small muted">{t("marks.subject")}</span>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{pick(s, lang)}</option>
                ))}
              </select>
            </label>
          </>
        }
      />
      {sections.length === 0 ? (
        <p className="empty">{seesAll ? t("marks.entry.noSections") : t("marks.entry.noSectionsTeacher")}</p>
      ) : section && subjects.length > 0 && (!subject || !year || !semester) ? (
        <Loading />
      ) : !section || subjects.length === 0 ? (
        <p className="empty">{t("marks.entry.noSubjects")}</p>
      ) : (
        <Grid
          key={`${yearId}|${semesterId}|${section.id}|${subject?.id}`}
          refData={refData}
          year={year}
          semester={semester}
          section={section}
          subject={subject}
          canTeach={canTeach}
          isAdmin={isAdmin}
        />
      )}
    </section>
  );
}

function Grid({ refData, year, semester, section, subject, canTeach, isAdmin }) {
  const { t } = useLang();
  const q = useQuery(async () => {
    const [st, en, lk] = await Promise.all([
      loadStructures({ yearId: year.id, gradeId: section.grade_id }),
      fetchAll(() =>
        supabase
          .from("enrollments")
          .select("id,status,students(first_name,father_name,grandfather_name,first_name_am,father_name_am,grandfather_name_am,student_code)")
          .eq("section_id", section.id)
          .eq("academic_year_id", year.id)
      ),
      supabase.from("mark_locks").select("*").eq("semester_id", semester.id).eq("section_id", section.id).eq("subject_id", subject.id).maybeSingle(),
    ]);
    const bad = [st, en, lk].find((r) => r.error);
    if (bad) return { data: null, error: bad.error };
    const structure = pickStructure(st.data, {
      semesterId: semester.id,
      gradeId: section.grade_id,
      streamId: effectiveStream(section.stream_id, refData.streams),
      subjectId: subject.id,
    });
    const enrollments = en.data.filter((e) => e.status !== "withdrawn");
    let marks = new Map();
    if (structure) {
      const m = await loadMarks(enrollments.map((e) => e.id), allComponents(structure).map((c) => c.id));
      if (m.error) return m;
      marks = m.data;
    }
    return { data: { structure, enrollments, lock: lk.data, marks, stamp: Date.now() }, error: null };
  }, [year.id, semester.id, section.id, subject.id]);

  if (q.loading) return <Loading />;
  if (q.error) return <LoadError />;
  const { structure, enrollments, lock, marks, stamp } = q.data;
  if (!structure) {
    return (
      <>
        <p className="empty">{t("marks.entry.noStructure")}</p>
      </>
    );
  }
  if (enrollments.length === 0) return <p className="empty">{t("marks.entry.noStudents")}</p>;
  return (
    <GridBody
      key={stamp}
      refData={refData}
      year={year}
      semester={semester}
      section={section}
      subject={subject}
      structure={structure}
      enrollments={enrollments}
      initialLock={lock}
      initialMarks={marks}
      canTeach={canTeach}
      isAdmin={isAdmin}
      reload={q.reload}
    />
  );
}

function GridBody({ refData, year, semester, section, subject, structure, enrollments, initialLock, initialMarks, canTeach, isAdmin, reload }) {
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const notice = useNotice();
  const [marks, setMarks] = useState(initialMarks);
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(0);
  const [justSaved, setJustSaved] = useState({}); // cells saved a moment ago
  const [busy, setBusy] = useState(false);
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const lock = initialLock;
  const canLock = can(profile, MARK_LOCKERS);
  const canUnlock = can(profile, MARK_UNLOCKERS);
  const locked = Boolean(lock);
  const blocked = year.is_closed ? "yearClosed" : !isAdmin && semester.is_locked ? "semesterLocked" : !isAdmin && locked ? "finalized" : null;
  const editable = canTeach && !blocked;

  const comps = useMemo(() => allComponents(structure), [structure]);
  const students = useMemo(
    () => [...enrollments].sort((a, b) => fullName(a.students, "en").localeCompare(fullName(b.students, "en"))),
    [enrollments]
  );

  const rows = students.map((e) => ({ e, calc: computeSemester(structure, scoresForStudent(marks, e.id, structure)) }));
  const total = enrollments.length * comps.length;
  const entered = comps.reduce((n, c) => n + enrollments.filter((e) => marks.has(markKey(e.id, c.id))).length, 0);
  const complete = rows.filter((r) => r.calc.result !== null && r.calc.complete);
  const classAvg = complete.length ? complete.reduce((s, r) => s + r.calc.result, 0) / complete.length : null;

  async function commit(enrollment, comp) {
    const key = markKey(enrollment.id, comp.id);
    const text = drafts[key];
    if (text === undefined) return;
    const parsed = parseScore(text, comp.raw_max);
    if (!parsed.ok) {
      setErrors((x) => ({ ...x, [key]: t(`marks.err.${parsed.error}`, { max: fmt(Number(comp.raw_max)) }) }));
      return;
    }
    const before = marksRef.current.get(key);
    const clearDraft = () => setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
    setErrors((x) => { const n = { ...x }; delete n[key]; return n; });
    if ((parsed.empty && before === undefined) || parsed.value === before) return clearDraft();
    setSaving((n) => n + 1);
    notice.clear();
    let failed = false;
    if (parsed.empty) {
      const r = await supabase.from("marks").delete().eq("enrollment_id", enrollment.id).eq("component_id", comp.id).select("enrollment_id");
      failed = Boolean(r.error) || (r.data || []).length === 0;
      if (!failed) setMarks((m) => { const n = new Map(m); n.delete(key); return n; });
    } else {
      const r = await supabase.from("marks").upsert({ enrollment_id: enrollment.id, component_id: comp.id, score: parsed.value }, { onConflict: "enrollment_id,component_id" });
      failed = Boolean(r.error);
      if (!failed) setMarks((m) => new Map(m).set(key, parsed.value));
    }
    setSaving((n) => n - 1);
    if (failed) setErrors((x) => ({ ...x, [key]: t("marks.entry.couldNotChange") }));
    else {
      clearDraft();
      setJustSaved((x) => ({ ...x, [key]: true }));
      setTimeout(() => setJustSaved((x) => { const n = { ...x }; delete n[key]; return n; }), 1500);
    }
  }

  function moveDown(ev, rowIdx, colIdx) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const next = document.querySelector(`[data-cell="${rowIdx + 1}-${colIdx}"]`);
    if (next) next.focus();
    else ev.currentTarget.blur();
  }

  async function finalize() {
    const missing = total - entered;
    const k = missing > 0 ? "finalizeMissing" : "finalize";
    if (!(await confirm({ title: t(`dialog.${k}.title`), body: t(`dialog.${k}.body`, { n: missing }), confirmLabel: t(`dialog.${k}.confirm`) }))) return;
    setBusy(true);
    const r = await supabase.from("mark_locks").insert({ semester_id: semester.id, section_id: section.id, subject_id: subject.id });
    setBusy(false);
    if (r.error) return notice.fail(r.error);
    reload();
  }
  async function reopen() {
    if (!(await confirm({ title: t("dialog.reopen.title"), body: t("dialog.reopen.body"), confirmLabel: t("dialog.reopen.confirm") }))) return;
    setBusy(true);
    const r = await supabase.from("mark_locks").delete().eq("id", lock.id);
    setBusy(false);
    if (r.error) return notice.fail(r.error);
    reload();
  }

  const colIndex = new Map(comps.map((c, i) => [c.id, i]));
  const hasErr = Object.keys(errors).length > 0;

  return (
    <>
      <Notice notice={notice.notice} />
      {!hasFinalExam(structure) && <p className="flash warn">{t("marks.entry.noFinalExam")}</p>}
      {!canTeach && <p className="flash warn">{t("marks.entry.notYours")}</p>}
      {blocked === "yearClosed" && <p className="flash warn">{t("marks.entry.yearClosed")}</p>}
      {blocked === "semesterLocked" && <p className="flash warn">{t("marks.entry.semesterLocked")}</p>}
      {locked && (
        <p className="flash warn">
          {t("marks.entry.finalized", { date: formatEc(String(lock.locked_at).slice(0, 10), lang) })}
        </p>
      )}
      <div className="mark-bar">
        <p className={hasErr ? "small msg-err" : "small"} role="status" aria-live="polite">
          {t("marks.entry.counts", { entered, total })} · {saving > 0 ? t("marks.entry.saving") : hasErr ? t("marks.entry.hasErrors") : t("marks.entry.allSaved")}
        </p>
        <div className="row-actions">
          {canLock && !locked && !year.is_closed && (
            <button className="btn-small" disabled={busy || saving > 0} onClick={finalize}>{t("marks.entry.finalize")}</button>
          )}
          {canUnlock && locked && !year.is_closed && (
            <button className="btn-small secondary" disabled={busy} onClick={reopen}>{t("marks.entry.reopen")}</button>
          )}
          <button className="btn-small secondary" onClick={reload} disabled={saving > 0}>{t("marks.reload")}</button>
        </div>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>{t("marks.student")}</th>
              {structure.groups.map((g) => (
                <th key={g.id} colSpan={g.components.length + 1} className="center">{pick(g, lang)}</th>
              ))}
              <th rowSpan={2}>{t("marks.result")}<br /><span className="small muted">{t("marks.outOf", { n: fmt(Number(structure.final_max)) })}</span></th>
            </tr>
            <tr>
              {structure.groups.flatMap((g) => [
                ...g.components.map((c) => (
                  <th key={c.id} className="center">
                    {pick(c, lang)}
                    <br /><span className="small muted">{t("marks.outOf", { n: fmt(Number(c.raw_max)) })}</span>
                  </th>
                )),
                <th key={`${g.id}-t`} className="center small muted">{t("marks.groupTotal")}</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, calc }, r) => (
              <tr key={e.id}>
                <td>{fullName(e.students, lang)}</td>
                {structure.groups.flatMap((g, gi) => [
                  ...g.components.map((c) => {
                    const key = markKey(e.id, c.id);
                    const cur = marks.get(key);
                    const err = errors[key];
                    return (
                      <td key={c.id} className="center">
                        <input
                          className={err ? "mark-input bad" : justSaved[key] ? "mark-input saved" : "mark-input"}
                          inputMode="decimal"
                          autoComplete="off"
                          size={5}
                          data-cell={`${r}-${colIndex.get(c.id)}`}
                          disabled={!editable}
                          value={drafts[key] ?? (cur === undefined ? "" : fmt(cur))}
                          aria-label={`${fullName(e.students, lang)} – ${pick(c, lang)}`}
                          aria-invalid={Boolean(err)}
                          title={err || undefined}
                          onChange={(ev) => setDrafts((d) => ({ ...d, [key]: ev.target.value }))}
                          onBlur={() => commit(e, c)}
                          onKeyDown={(ev) => moveDown(ev, r, colIndex.get(c.id))}
                        />
                        {err && <div className="msg-err small">{err}</div>}
                      </td>
                    );
                  }),
                  <td key={`${g.id}-t`} className="center muted">{calc.groups[gi].entered === 0 ? "—" : fmt(calc.groups[gi].out, 2)}</td>,
                ])}
                <td className={calc.complete ? "center" : "center muted"}><strong>{calc.formulaError || calc.missing === comps.length ? "—" : fmt(calc.result, structure.rounding_places)}</strong></td>
              </tr>
            ))}
          </tbody>
          {classAvg !== null && (
            <tfoot>
              <tr>
                <td colSpan={comps.length + structure.groups.length + 1}>{t("marks.classAverage")}</td>
                <td className="center"><strong>{fmt(classAvg, 1)}</strong></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
