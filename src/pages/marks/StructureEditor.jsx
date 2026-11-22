import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n/index.jsx";
import { useNotice, Notice, pick } from "../../lib/ui.jsx";
import en from "../../i18n/en.js";
import am from "../../i18n/am.js";
import { checkFormula, formulaNames, groupOutMax, groupRawMax, groupsOutMax } from "../../lib/marksEngine.js";
import { fmt } from "../../lib/marksData.js";

let seq = 0;
const key = () => `k${++seq}`;
const N = en.marks.names;
const NA = am.marks.names;
const G = en.marks.groupNames;
const GA = am.marks.groupNames;

const comp = (name, name_am, raw_max, is_final_exam = false) => ({ key: key(), id: null, name, name_am, raw_max: String(raw_max), is_final_exam });
const group = (code, name, name_am, comps, extra = {}) => ({ key: key(), id: null, code, name, name_am, scale_to: "", factor: "1", components: comps, ...extra });
const ca = (comps, extra) => group("CA", G.ca, GA.ca, comps, extra);
const fin = (max, extra) => group("FINAL", G.final, GA.final, [comp(N.finalExam, NA.finalExam, max, true)], extra);

// The starting points offered for a new structure. The three examples of the blueprint plus an empty one.
export const PRESETS = {
  ca40: () => ({ final_max: "100", groups: [ca([comp(N.test, NA.test, 10), comp(N.assignment, NA.assignment, 15), comp(N.midExam, NA.midExam, 15)]), fin(60)] }),
  ca70: () => ({ final_max: "100", groups: [ca([comp(N.test, NA.test, 20), comp(N.assignment, NA.assignment, 20), comp(N.classwork, NA.classwork, 20), comp(N.midExam, NA.midExam, 10)]), fin(30)] }),
  converted: () => ({
    final_max: "100",
    groups: [
      ca([1, 2, 3, 4, 5].map((i) => comp(en.marks.names.assessment.replace("{n}", i), am.marks.names.assessment.replace("{n}", i), 10)), { scale_to: "40" }),
      fin(40, { factor: "1.5" }),
    ],
  }),
  blank: () => ({ final_max: "100", groups: [ca([comp("", "", "")]), fin("")] }),
};

// Turns a saved structure (with groups and components) into editable form state.
export function toDraft(s) {
  return {
    id: s.id,
    final_max: String(Number(s.final_max)),
    rounding_places: String(s.rounding_places ?? 0),
    formula: s.formula || "",
    groups: s.groups.map((g) => ({
      key: key(), id: g.id, code: g.code, name: g.name, name_am: g.name_am || "",
      scale_to: g.scale_to === null || g.scale_to === undefined ? "" : String(Number(g.scale_to)),
      factor: String(Number(g.factor)),
      components: g.components.map((c) => ({ key: key(), id: c.id, name: c.name, name_am: c.name_am || "", raw_max: String(Number(c.raw_max)), is_final_exam: c.is_final_exam })),
    })),
  };
}

const num = (v) => (String(v).trim() === "" ? NaN : Number(String(v).replace(",", ".")));
const decimals = (v) => /^\d+(\.\d{1,2})?$/.test(String(v).trim().replace(",", "."));
const CODE = /^[A-Z][A-Z0-9_]{0,15}$/;

// Numeric view of the draft for live totals.
function numeric(d) {
  return {
    final_max: num(d.final_max),
    formula: d.formula,
    groups: d.groups.map((g) => ({
      code: g.code,
      scale_to: String(g.scale_to).trim() === "" ? null : num(g.scale_to),
      factor: num(g.factor),
      components: g.components.map((c) => ({ raw_max: num(c.raw_max) })),
    })),
  };
}

// Returns a list of error keys (empty when the draft is fine).
export function validate(d) {
  const errs = new Set();
  const n = numeric(d);
  if (!(n.final_max > 0)) errs.add("finalMax");
  if (d.groups.length === 0) errs.add("noGroups");
  const codes = new Set();
  for (const g of d.groups) {
    const code = String(g.code).trim().toUpperCase();
    if (!CODE.test(code) || code === "MIN" || code === "MAX" || code.endsWith("_RAW") || codes.has(code)) errs.add("groupCode");
    codes.add(code);
    if (!String(g.name).trim()) errs.add("groupName");
    if (!(num(g.factor) > 0)) errs.add("factor");
    if (String(g.scale_to).trim() !== "" && !(num(g.scale_to) > 0)) errs.add("scale");
    if (g.components.length === 0) errs.add("noComponents");
    for (const c of g.components) {
      if (!String(c.name).trim()) errs.add("compName");
      const v = num(c.raw_max);
      if (!(v > 0) || v >= 10000 || !decimals(c.raw_max)) errs.add("compMax");
    }
  }
  return [...errs];
}

// What decides a result, ignoring names and order. Used to tell whether saving changes the results of students.
function calcSignature(d) {
  const groups = d.groups.map((g) => `${String(g.code).trim().toUpperCase()}|${String(g.scale_to).trim() === "" ? "-" : num(g.scale_to)}|${num(g.factor)}`).sort();
  const comps = d.groups
    .flatMap((g) => g.components.map((c) => `${String(g.code).trim().toUpperCase()}|${c.id || c.key}|${num(c.raw_max)}|${c.is_final_exam ? 1 : 0}`))
    .sort();
  return JSON.stringify({ fm: num(d.final_max), r: Number(d.rounding_places) || 0, f: String(d.formula || "").trim(), groups, comps });
}

export default function StructureEditor({ draft: initial, title, scopeText, context, readOnly, isAdmin, refData, subjectsForCopy, onClose, onSaved }) {
  const { t, lang } = useLang();
  const notice = useNotice();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [showAdv, setShowAdv] = useState(Boolean(initial.formula));
  const [status, setStatus] = useState(null); // answer of the database: ok, finalized, semester_locked, not_assigned ...
  const [counts, setCounts] = useState(null); // marks already entered for this structure (all sections)

  // Ask the database whether this person may change the structure now, and how many marks it already has.
  // The database makes the final decision; this only shows the reason on screen.
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await supabase.rpc("structure_edit_status", {
        p_year: context.academic_year_id, p_grade: context.grade_id, p_stream: context.stream_id || null,
        p_subject: context.subject_id, p_semester: context.semester_id,
      });
      if (!alive) return;
      const st = r.error ? "error" : r.data;
      setStatus(st);
      if (initial.id && st === "ok") {
        const c = await supabase.rpc("structure_mark_counts", { p_structure: initial.id });
        if (alive && !c.error) setCounts(c.data);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const blocked = status !== null && status !== "ok" && !readOnly;
  const ro = readOnly || blocked;

  const setGroup = (gi, patch) => setD((x) => ({ ...x, groups: x.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) }));
  const setComp = (gi, ci, patch) =>
    setD((x) => ({ ...x, groups: x.groups.map((g, i) => (i !== gi ? g : { ...g, components: g.components.map((c, j) => (j === ci ? { ...c, ...patch } : c)) })) }));
  const move = (list, i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  const n = useMemo(() => numeric(d), [d]);
  const sum = groupsOutMax(n);
  const hasFormula = d.formula.trim() !== "";
  const errors = validate(d);
  const finalOk = d.groups.some((g) => g.components.some((c) => c.is_final_exam));
  const sumOk = hasFormula || (Number.isFinite(sum) && Math.abs(sum - n.final_max) < 0.005);
  const formulaErr = hasFormula ? checkFormula({ ...n, groups: d.groups.map((g, i) => ({ ...n.groups[i], code: String(g.code).trim().toUpperCase() })) }) : null;
  const valid = errors.length === 0 && finalOk && sumOk && !formulaErr;

  // Assessments of the saved structure that are no longer in the draft (removed one by one or with their group).
  const removedIds = () => {
    const now = new Set(d.groups.flatMap((g) => g.components.map((c) => c.id).filter(Boolean)));
    return initial.groups.flatMap((g) => g.components.map((c) => c.id)).filter((id) => id && !now.has(id));
  };

  async function save() {
    if (!valid || ro || status !== "ok") return;
    setBusy(true);
    notice.clear();

    // Ask before anything with marks changes. Nothing changes until the person confirms.
    let confirmDelete = false;
    if (d.id) {
      const gone = removedIds();
      const c = await supabase.rpc("structure_mark_counts", { p_structure: d.id, p_components: gone.length ? gone : null });
      if (c.error) { setBusy(false); return notice.fail(c.error); }
      const lines = [];
      if (gone.length && c.data.selected?.marks > 0) {
        lines.push(t("marks.editor.confirmRemoveMarks", { marks: c.data.selected.marks, students: c.data.selected.students }));
        confirmDelete = true;
      }
      if (c.data.marks > 0 && calcSignature(d) !== calcSignature(initial)) {
        lines.push(t("marks.editor.confirmRecalc", { students: c.data.students }));
      }
      if (lines.length && !window.confirm([...lines, "", t("marks.editor.confirmAsk")].join("\n"))) { setBusy(false); return; }
    }

    const payload = {
      confirm_delete_marks: confirmDelete,
      id: d.id || undefined,
      ...context,
      final_max: num(d.final_max),
      rounding_places: Number(d.rounding_places) || 0,
      formula: d.formula.trim(),
      groups: d.groups.map((g) => ({
        id: g.id || undefined,
        code: String(g.code).trim().toUpperCase(),
        name: g.name, name_am: g.name_am,
        scale_to: String(g.scale_to).trim() === "" ? null : num(g.scale_to),
        factor: num(g.factor),
        components: g.components.map((c) => ({ id: c.id || undefined, name: c.name, name_am: c.name_am, raw_max: num(c.raw_max), is_final_exam: c.is_final_exam })),
      })),
    };
    const r = await supabase.rpc("save_assessment_structure", { p: payload });
    setBusy(false);
    if (r.error) return notice.fail(r.error);
    onSaved();
  }

  async function remove() {
    if (!d.id || ro) return;
    setBusy(true);
    notice.clear();
    const c = await supabase.rpc("structure_mark_counts", { p_structure: d.id });
    if (c.error) { setBusy(false); return notice.fail(c.error); }
    const withMarks = c.data.marks > 0;
    const text = withMarks ? t("marks.editor.confirmDeleteMarks", { marks: c.data.marks, students: c.data.students }) : t("marks.editor.confirmDelete");
    if (!window.confirm(withMarks ? `${text}\n\n${t("marks.editor.confirmAsk")}` : text)) { setBusy(false); return; }
    const r = await supabase.rpc("delete_assessment_structure", { p_id: d.id, p_confirm_delete_marks: withMarks });
    setBusy(false);
    if (r.error) return notice.fail(r.error);
    onSaved();
  }

  const names = formulaNames({ groups: d.groups.map((g) => ({ code: String(g.code).trim().toUpperCase() })) })
    .filter((x) => !x.endsWith("_RAW")).join(", ");

  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head">
        <h2>{title}</h2>
        <button className="btn-small secondary" onClick={onClose}>{t("marks.editor.close")}</button>
      </div>
      <p className="small muted">{scopeText}</p>
      <Notice notice={notice.notice} />
      {blocked && <p className="flash warn" role="alert">{t(`marks.editor.blocked.${status}`)}</p>}
      {counts?.marks > 0 && !ro && <p className="flash warn">{t("marks.editor.hasMarks", { marks: counts.marks, students: counts.students })}</p>}
      {!isAdmin && !ro && <p className="small muted">{t("marks.editor.sharedNote")}</p>}
      <fieldset disabled={ro || busy} className="plain">
        <div className="formgrid">
          <label>
            {t("marks.editor.finalMax")}
            <input inputMode="decimal" value={d.final_max} onChange={(e) => setD({ ...d, final_max: e.target.value })} />
          </label>
          <label>
            {t("marks.editor.rounding")}
            <select value={d.rounding_places} onChange={(e) => setD({ ...d, rounding_places: e.target.value })}>
              {[0, 1, 2].map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </label>
        </div>

        <h3>{t("marks.editor.groups")}</h3>
        <p className="small muted">{t("marks.editor.groupsHelp")}</p>
        {d.groups.map((g, gi) => (
          <div className="subpanel" key={g.key}>
            <div className="formgrid">
              <label>{t("marks.editor.groupCode")}<input value={g.code} maxLength={16} onChange={(e) => setGroup(gi, { code: e.target.value.toUpperCase() })} /></label>
              <label>{t("marks.editor.groupName")}<input value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value })} /></label>
              <label>{t("marks.editor.groupNameAm")}<input value={g.name_am} onChange={(e) => setGroup(gi, { name_am: e.target.value })} /></label>
              <label>{t("marks.editor.convertTo")}<input inputMode="decimal" value={g.scale_to} onChange={(e) => setGroup(gi, { scale_to: e.target.value })} /><span className="small muted">{t("marks.editor.convertHelp")}</span></label>
              <label>{t("marks.editor.factor")}<input inputMode="decimal" value={g.factor} onChange={(e) => setGroup(gi, { factor: e.target.value })} /></label>
            </div>
            <p className="small muted">
              {t("marks.editor.rawTotal", { n: fmt(groupRawMax(n.groups[gi])) })} · {t("marks.editor.worth", { n: fmt(groupOutMax(n.groups[gi]), 3) })}
            </p>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>{t("marks.editor.component")}</th><th>{t("marks.editor.componentAm")}</th><th>{t("marks.editor.rawMax")}</th><th>{t("marks.editor.finalExam")}</th><th /></tr>
                </thead>
                <tbody>
                  {g.components.map((c, ci) => (
                    <tr key={c.key}>
                      <td><input value={c.name} onChange={(e) => setComp(gi, ci, { name: e.target.value })} aria-label={t("marks.editor.component")} /></td>
                      <td><input value={c.name_am} onChange={(e) => setComp(gi, ci, { name_am: e.target.value })} aria-label={t("marks.editor.componentAm")} /></td>
                      <td><input size={6} inputMode="decimal" value={c.raw_max} onChange={(e) => setComp(gi, ci, { raw_max: e.target.value })} aria-label={t("marks.editor.rawMax")} /></td>
                      <td className="center"><input type="checkbox" checked={c.is_final_exam} onChange={(e) => setComp(gi, ci, { is_final_exam: e.target.checked })} aria-label={t("marks.editor.finalExam")} /></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn-small secondary" title={t("marks.editor.moveUp")} aria-label={t("marks.editor.moveUp")} onClick={() => setGroup(gi, { components: move(g.components, ci, -1) })}>↑</button>
                          <button type="button" className="btn-small secondary" title={t("marks.editor.moveDown")} aria-label={t("marks.editor.moveDown")} onClick={() => setGroup(gi, { components: move(g.components, ci, 1) })}>↓</button>
                          <button type="button" className="btn-small danger" onClick={() => setGroup(gi, { components: g.components.filter((_, j) => j !== ci) })}>{t("marks.editor.remove")}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-actions">
              <button type="button" className="btn-small secondary" onClick={() => setGroup(gi, { components: [...g.components, comp("", "", "")] })}>{t("marks.editor.addComponent")}</button>
              <button type="button" className="btn-small secondary" aria-label={t("marks.editor.moveUp")} onClick={() => setD((x) => ({ ...x, groups: move(x.groups, gi, -1) }))}>↑</button>
              <button type="button" className="btn-small secondary" aria-label={t("marks.editor.moveDown")} onClick={() => setD((x) => ({ ...x, groups: move(x.groups, gi, 1) }))}>↓</button>
              <button type="button" className="btn-small danger" onClick={() => setD((x) => ({ ...x, groups: x.groups.filter((_, i) => i !== gi) }))}>{t("marks.editor.remove")}</button>
            </div>
          </div>
        ))}
        <p>
          <button type="button" className="btn-small secondary" onClick={() => setD((x) => ({ ...x, groups: [...x.groups, group("", "", "", [comp("", "", "")])] }))}>{t("marks.editor.addGroup")}</button>
        </p>

        <p>
          <button type="button" className="linkbtn" onClick={() => setShowAdv((v) => !v)}>{t("marks.editor.advanced")}</button>
        </p>
        {showAdv && (
          <label className="full">
            {t("marks.editor.formula")}
            <input value={d.formula} onChange={(e) => setD({ ...d, formula: e.target.value })} placeholder="MAX(CA, FINAL) + 5" />
            <span className="small muted">{t("marks.editor.formulaHelp", { names })}</span>
          </label>
        )}
      </fieldset>

      <div aria-live="polite">
        {errors.map((e) => (<p key={e} className="msg-err">{t(`marks.editor.errors.${e}`)}</p>))}
        {!finalOk && <p className="msg-err">{t("marks.editor.noFinalExam")}</p>}
        {formulaErr && <p className="msg-err">{t(`marks.editor.formulaErr.${formulaErr.code}`, { detail: formulaErr.detail })}</p>}
        {!hasFormula && errors.length === 0 && (sumOk
          ? <p className="msg-ok small">{t("marks.editor.sumOk", { sum: fmt(sum, 3), max: fmt(n.final_max) })}</p>
          : <p className="msg-err">{t("marks.editor.sumMismatch", { sum: fmt(sum, 3), max: fmt(n.final_max) })}</p>)}
      </div>

      {!ro && (
        <div className="row-actions">
          <button className="btn" disabled={!valid || busy || status !== "ok"} aria-busy={busy} onClick={save}>{t("marks.editor.save")}</button>
          {d.id && <button className="btn-small danger" disabled={busy} onClick={remove}>{t("marks.editor.delete")}</button>}
        </div>
      )}

      {d.id && !ro && isAdmin && <CopyTo sourceId={d.id} context={context} refData={refData} subjects={subjectsForCopy} lang={lang} />}
    </section>
  );
}

function CopyTo({ sourceId, context, refData, subjects, lang }) {
  const { t } = useLang();
  const notice = useNotice();
  const sems = refData.semesters.filter((s) => s.academic_year_id === context.academic_year_id);
  const [semIds, setSemIds] = useState([]);
  const [subIds, setSubIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const flip = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function run() {
    if (semIds.length === 0 || subIds.length === 0) return notice.setNotice({ type: "error", text: t("marks.editor.copyTo.none") });
    const targets = semIds.flatMap((semester_id) =>
      subIds.map((subject_id) => ({ semester_id, grade_id: context.grade_id, stream_id: context.stream_id || null, subject_id }))
    );
    setBusy(true);
    const r = await supabase.rpc("copy_assessment_structure", { p_source: sourceId, p_targets: targets });
    setBusy(false);
    if (r.error) return notice.fail(r.error);
    notice.setNotice({ type: "ok", text: t("marks.editor.copyTo.done", { n: r.data }) });
  }

  return (
    <div className="subpanel mt">
      <h3>{t("marks.editor.copyTo.title")}</h3>
      <Notice notice={notice.notice} />
      <fieldset className="checks">
        <legend>{t("marks.editor.copyTo.semesters")}</legend>
        {sems.map((s) => (
          <label key={s.id}><input type="checkbox" checked={semIds.includes(s.id)} onChange={() => setSemIds(flip(semIds, s.id))} /> {t("marks.semesterN", { n: s.number })}</label>
        ))}
      </fieldset>
      <fieldset className="checks">
        <legend>
          {t("marks.editor.copyTo.subjects")}{" "}
          <button type="button" className="linkbtn" onClick={() => setSubIds(subIds.length === subjects.length ? [] : subjects.map((s) => s.id))}>{t("marks.editor.copyTo.all")}</button>
        </legend>
        {subjects.map((s) => (
          <label key={s.id}><input type="checkbox" checked={subIds.includes(s.id)} onChange={() => setSubIds(flip(subIds, s.id))} /> {pick(s, lang)}</label>
        ))}
      </fieldset>
      <button className="btn-small" disabled={busy} onClick={run}>{t("marks.editor.copyTo.run")}</button>
    </div>
  );
}
