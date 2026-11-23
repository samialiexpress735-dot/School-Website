import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, Loading, LoadError, CountTo, useGlide, pick, fullName } from "../../lib/ui.jsx";
import { newlyFlagged, unbalancedKeys } from "../../lib/motion.js";
import { proposeAllocation, sectionStats, suggestSectionCount } from "../../lib/allocation.js";
import { nextSectionNames } from "../../lib/sectionNames.js";

// The "general" stream (Grades 9-10) counts the same as no stream.
const NONE = []; // a stable empty list, so hooks do not re-run on every render
const key = (streams, id) => streams.find((x) => x.id === id && x.code !== "general")?.id || null;

export default function AllocationPage() {
  const { t, lang } = useLang();
  const notice = useNotice();
  const [yearId, setYearId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [shift, setShift] = useState("morning");
  const [count, setCount] = useState("");
  const [target, setTarget] = useState("");
  const [keepPlaced, setKeepPlaced] = useState(true);
  const [placement, setPlacement] = useState({});
  const [orig, setOrig] = useState({});
  const [newSections, setNewSections] = useState([]);
  const [leftover, setLeftover] = useState(0);
  const [over, setOver] = useState(undefined);
  const [saving, setSaving] = useState(false);

  const ref = useQuery(async () => {
    const [y, g, s] = await Promise.all([
      supabase.from("academic_years").select("id,label,is_current,year_ec").order("year_ec", { ascending: false }),
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*").order("code"),
    ]);
    const bad = [y, g, s].find((r) => r.error);
    return bad || { data: { years: y.data, grades: g.data, streams: s.data } };
  }, []);
  useEffect(() => {
    if (ref.data && !yearId) {
      setYearId((ref.data.years.find((y) => y.is_current) || ref.data.years[0])?.id || "");
      setGradeId(ref.data.grades[0]?.id || "");
    }
  }, [ref.data]); // eslint-disable-line

  const grade = ref.data?.grades.find((g) => g.id === gradeId);
  const streams = ref.data?.streams || NONE;
  const streamChoices = streams.filter((s) => s.code !== "general");
  const streamSel = grade && grade.number >= 11 ? (streamChoices.find((s) => s.id === streamId) || streamChoices[0]) : null;

  const data = useQuery(async () => {
    if (!yearId || !gradeId) return { data: { sections: [], students: [] } };
    const [s, e] = await Promise.all([
      supabase.from("sections").select("*").eq("academic_year_id", yearId).eq("grade_id", gradeId),
      supabase.from("enrollments")
        .select("id, section_id, stream_id, status, students(first_name,father_name,grandfather_name,first_name_am,father_name_am,grandfather_name_am,sex,grade8_exam_result,student_code)")
        .eq("academic_year_id", yearId).eq("grade_id", gradeId).neq("status", "withdrawn"),
    ]);
    return s.error ? s : e.error ? e : { data: { sections: s.data, students: e.data } };
  }, [yearId, gradeId, shift, streamSel?.id]);

  const wantKey = key(streams, streamSel?.id);
  const sections = useMemo(
    () => (data.data?.sections || []).filter((s) => s.shift === shift && key(streams, s.stream_id) === wantKey).sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name)),
    [data.data, shift, wantKey, streams]
  );
  const students = useMemo(() => {
    const otherShift = new Set((data.data?.sections || []).filter((s) => s.shift !== shift).map((s) => s.id));
    return (data.data?.students || [])
      .filter((e) => key(streams, e.stream_id) === wantKey && !otherShift.has(e.section_id))
      .map((e) => ({ id: e.id, sex: e.students.sex, result: e.students.grade8_exam_result == null ? null : Number(e.students.grade8_exam_result), row: e.students, sectionKey: e.section_id }));
  }, [data.data, shift, wantKey, streams]);

  // start the board from what is saved
  useEffect(() => {
    const m = {};
    students.forEach((s) => { m[s.id] = s.sectionKey || null; });
    setPlacement(m); setOrig(m); setNewSections([]); setLeftover(0); setCount(String(sections.length || ""));
  }, [data.data, shift, wantKey]); // eslint-disable-line

  // Motion: cards glide to their new column, and a column that has just become unbalanced pulses once.
  const boardRef = useRef(null);
  useGlide(boardRef, placement);
  const prevUnbal = useRef(null);
  const unbalNow = useMemo(() => {
    const totals = new Map([...sections.map((s) => s.id), ...newSections.map((n) => n.key)].map((k) => [k, 0]));
    students.forEach((s) => { const k = placement[s.id] ?? null; if (totals.has(k)) totals.set(k, totals.get(k) + 1); });
    return unbalancedKeys(totals);
  }, [students, sections, newSections, placement]);
  const ready = students.length > 0 && Object.keys(placement).length === students.length;
  const pulsing = useMemo(() => (ready ? newlyFlagged(prevUnbal.current, unbalNow) : new Set()), [unbalNow, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { prevUnbal.current = ready ? unbalNow : null; }, [unbalNow, ready]);

  if (ref.loading) return <Loading />;
  if (ref.error) return <LoadError />;
  const { years, grades } = ref.data;

  const current = students.map((s) => ({ ...s, sectionKey: placement[s.id] ?? null }));
  const columns = [{ key: null, title: t("allocation.unplaced") }, ...sections.map((s) => ({ key: s.id, title: `${s.name}`, capacity: s.capacity })), ...newSections.map((n) => ({ key: n.key, title: t("allocation.newSection", { name: n.name }), isNew: true }))];
  const moves = students.filter((s) => (placement[s.id] ?? null) !== (orig[s.id] ?? null));
  const usedNew = newSections.filter((n) => current.some((s) => s.sectionKey === n.key));
  const suggested = suggestSectionCount(students.length, Number(target));
  const totalSections = sections.length + newSections.length;
  const tooSmall = totalSections >= 2 && students.length > 0 && students.length / totalSections < 3;

  function propose() {
    notice.clear();
    const wanted = Math.max(Number(count) || 0, sections.length, 1);
    const extra = nextSectionNames(sections.map((s) => s.name), wanted - sections.length).map((name) => ({ key: `new:${name}`, name }));
    const list = [...sections.map((s) => ({ key: s.id, capacity: s.capacity })), ...extra.map((n) => ({ key: n.key, capacity: null }))];
    const { assign, leftover: left } = proposeAllocation({
      students: students.map((s) => ({ id: s.id, sex: s.sex, result: s.result, sectionKey: orig[s.id] ?? null })),
      sections: list, keepPlaced,
    });
    const m = {};
    students.forEach((s) => { m[s.id] = assign.get(s.id) ?? null; });
    setPlacement(m); setNewSections(extra); setLeftover(left.length);
  }
  const move = (id, to) => setPlacement((p) => ({ ...p, [id]: to || null }));

  async function approve() {
    setSaving(true);
    const streamForNew = grade.number <= 10 ? streams.find((s) => s.code === "general")?.id : streamSel?.id;
    const { error } = await supabase.rpc("apply_section_allocation", {
      p_new_sections: usedNew.map((n) => ({ key: n.key, academic_year_id: yearId, grade_id: gradeId, stream_id: streamForNew || null, shift, name: n.name, capacity: null })),
      p_moves: moves.map((s) => {
        const to = placement[s.id] ?? null;
        return to && to.startsWith("new:") ? { enrollment_id: s.id, section_key: to } : { enrollment_id: s.id, section_id: to };
      }),
    });
    setSaving(false);
    if (error) return notice.fail(error);
    notice.setNotice({ type: "ok", text: t("allocation.saved") });
    data.reload();
  }

  const reset = () => { setPlacement(orig); setNewSections([]); setLeftover(0); };

  return (
    <>
      <p className="muted">{t("allocation.intro")}</p>
      <Notice notice={notice.notice} />

      <section className="panel formgrid">
        <div>
          <label htmlFor="al_year">{t("allocation.year")}</label>
          <select id="al_year" value={yearId} onChange={(e) => setYearId(e.target.value)}>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>
        </div>
        <div>
          <label htmlFor="al_grade">{t("allocation.grade")}</label>
          <select id="al_grade" value={gradeId} onChange={(e) => { setGradeId(e.target.value); setStreamId(""); }}>{grades.map((g) => <option key={g.id} value={g.id}>{pick(g, lang)}</option>)}</select>
        </div>
        {grade && grade.number >= 11 && (
          <div>
            <label htmlFor="al_stream">{t("allocation.stream")}</label>
            <select id="al_stream" value={streamSel?.id || ""} onChange={(e) => setStreamId(e.target.value)}>{streamChoices.map((s) => <option key={s.id} value={s.id}>{pick(s, lang)}</option>)}</select>
          </div>
        )}
        <div>
          <label htmlFor="al_shift">{t("allocation.shift")}</label>
          <select id="al_shift" value={shift} onChange={(e) => setShift(e.target.value)}>{["morning", "afternoon"].map((k) => <option key={k} value={k}>{t(`sections.shifts.${k}`)}</option>)}</select>
        </div>
        <p className="muted small full">{t("allocation.shiftNote")}</p>
      </section>

      {data.loading ? <Loading shape="cards" rows={6} /> : data.error ? <LoadError /> : students.length === 0 ? <p className="empty">{t("allocation.empty")}</p> : (
        <>
          <section className="panel formgrid">
            <div>
              <label htmlFor="al_target">{t("allocation.targetSize")}</label>
              <input id="al_target" type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} />
              {suggested && <p className="small muted">{t("allocation.suggestion", { n: suggested })}</p>}
            </div>
            <div>
              <label htmlFor="al_count">{t("allocation.sectionsCount")}</label>
              <input id="al_count" type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div className="checks"><label className="inline"><input type="checkbox" checked={keepPlaced} onChange={(e) => setKeepPlaced(e.target.checked)} /> {t("allocation.keepPlaced")}</label></div>
            <div className="formgrid-action"><button type="button" className="btn-small" onClick={propose}>{t("allocation.propose")}</button></div>
          </section>

          {tooSmall && <p className="flash warn" role="status">{t("allocation.tooSmall")}</p>}
          {leftover > 0 && <p className="flash error" role="alert">{t("allocation.leftover", { n: leftover })}</p>}
          <p className="muted small">{t("allocation.dragHint")}</p>

          <div className="board" role="list" ref={boardRef}>
            {columns.map((c) => {
              const stats = sectionStats(current, c.key);
              const list = current.filter((s) => s.sectionKey === c.key).sort((a, b) => fullName(a.row, "en").localeCompare(fullName(b.row, "en")));
              const full = c.capacity != null && stats.total >= c.capacity;
              return (
                <section key={String(c.key)} role="listitem" className={`col${over === c.key ? " over" : ""}${c.isNew ? " is-new" : ""}${c.key === null ? " col-unplaced" : ""}${pulsing.has(c.key) ? " pulse" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setOver(c.key); }} onDragLeave={() => setOver(undefined)}
                  onDrop={(e) => { e.preventDefault(); setOver(undefined); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, c.key); }}
                  aria-label={c.title}>
                  <header className="col-head">
                    <h3>{c.title}</h3>
                    <p className="small"><strong><Count text={t("allocation.students", { n: "{n}" })} n={stats.total} /></strong>{c.capacity != null && <> · {t("allocation.capacity", { n: c.capacity })}{full && <span className="pill warn">{t("allocation.full")}</span>}</>}</p>
                    {c.key !== null && stats.total > 0 && (
                      <p className="small muted">{t("allocation.split", { f: stats.female, m: stats.male })}<br />{t("allocation.avg", { avg: stats.avg == null ? t("allocation.noResult") : stats.avg.toFixed(1) })}</p>
                    )}
                  </header>
                  <ul className="cards">
                    {list.map((s) => (
                      <li key={s.id} data-glide={s.id} className={`card-student${(placement[s.id] ?? null) !== (orig[s.id] ?? null) ? " moved" : ""}`} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}>
                        <span className="nm">{fullName(s.row, lang)}</span>
                        <span className="meta small muted">{t(`students.sexes.${s.sex}`)}{s.result != null ? ` · ${s.result}` : ""}</span>
                        <select aria-label={t("allocation.moveLabel", { name: fullName(s.row, lang) })} value={s.sectionKey || ""} onChange={(e) => move(s.id, e.target.value)}>
                          <option value="">{t("allocation.unplaced")}</option>
                          {columns.filter((x) => x.key !== null).map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}
                        </select>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <section className="panel approve-bar">
            <p role="status">{moves.length ? t("allocation.changes", { moves: moves.length, sections: usedNew.length }) : t("allocation.noChanges")}</p>
            <div className="row-actions">
              <button type="button" className="btn-small" disabled={!moves.length || saving} aria-busy={saving} onClick={approve}>{t("allocation.approve")}</button>
              <button type="button" className="btn-small secondary" disabled={!moves.length && !newSections.length} onClick={reset}>{t("allocation.discard")}</button>
            </div>
          </section>
        </>
      )}
    </>
  );
}

// "12 students" where the number counts up or down to its new value. `text` still holds the {n} placeholder.
function Count({ text, n }) {
  const [pre, post] = text.split("{n}");
  return <>{pre}<CountTo value={n} />{post ?? ""}</>;
}
