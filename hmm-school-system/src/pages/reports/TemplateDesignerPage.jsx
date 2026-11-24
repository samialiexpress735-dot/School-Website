import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, Loading, LoadError, pick, fullName } from "../../lib/ui.jsx";
import { can, PROMOTION_DECIDERS } from "../../lib/roles.js";
import { fetchAll, sortSections, subjectsOfGrade } from "../../lib/marksData.js";
import { fileToPages, imagesReady, signedUrls, uploadPages, FormError } from "../../lib/formImages.js";
import {
  COLUMN_KINDS, FIELD_KEYS, buildPrintItems, clamp, emptyLayout, hasWarnings, layoutProblems, newId, nudged, roundPct,
  spreadRows, templateWarnings,
} from "../../lib/reportTemplate.js";
import { loadReport } from "../../lib/reportsData.js";
import { sectionLabel, useMarksRef } from "../marks/MarksParts.jsx";
import { buildFormCtx, loadAttendance, loadForm, loadHomeroom } from "./formData.js";
import FormSheet from "./FormSheet.jsx";

const LIST = { row: "rows", column: "columns", field: "fields" };

export default function TemplateDesignerPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { t, lang } = useLang();
  const refQ = useMarksRef();
  const tplQ = useQuery(async () => {
    const r = await supabase.from("report_templates").select("*").eq("id", id).maybeSingle();
    if (r.error || !r.data) return r;
    if (!r.data.current_version_id) return { data: { template: r.data, form: null }, error: null };
    const form = await loadForm(r.data.current_version_id);
    return form.error ? { data: null, error: form.error } : { data: { template: r.data, form: form.data }, error: null };
  }, [id]);
  if (!can(profile, PROMOTION_DECIDERS)) return null;
  if (refQ.loading || tplQ.loading) return <Loading />;
  if (refQ.error || tplQ.error) return <LoadError />;
  if (!tplQ.data) return <p className="empty">{t("reports.designer.notFound")}</p>;
  return (
    <section className="panel designer">
      <p className="no-print"><Link to={`/${lang}/reports/templates`}>← {t("reports.designer.back")}</Link></p>
      <Designer key={id} template={tplQ.data.template} initial={tplQ.data.form} refData={refQ.data} />
    </section>
  );
}

function Designer({ template, initial, refData }) {
  const { t, lang } = useLang();
  const notice = useNotice();
  const stageRef = useRef(null);
  const drag = useRef(null);

  // ----- the layout being edited -----
  const [layout, setLayout] = useState(initial?.layout ?? emptyLayout());
  const [urls, setUrls] = useState(initial?.urls ?? new Map());
  const [saved, setSaved] = useState(JSON.stringify(initial?.layout ?? null));
  const [versionNo, setVersionNo] = useState(initial?.versionNo ?? null);
  const [pageIdx, setPageIdx] = useState(0);
  const [tool, setTool] = useState("select");
  const [firstY, setFirstY] = useState(null);
  const [sel, setSel] = useState(null); // { type: "row" | "column" | "field", id }
  const [busy, setBusy] = useState("");
  const [fileError, setFileError] = useState("");
  const dirty = JSON.stringify(layout) !== saved;
  const hasPages = layout.pages.length > 0;

  // ----- which subjects the rows are for -----
  const [yearId, setYearId] = useState((refData.years.find((y) => y.is_current) || refData.years[0])?.id ?? "");
  const [gradeId, setGradeId] = useState(template.grade_ids[0] ?? refData.grades[0]?.id ?? "");
  const grade = refData.grades.find((g) => g.id === gradeId);
  const streamChoices = grade && grade.number >= 11
    ? refData.streams.filter((s) => s.code !== "general" && (template.stream_ids.length === 0 || template.stream_ids.includes(s.id)))
    : [];
  const [streamId, setStreamId] = useState("");
  const effStream = streamChoices.length ? (streamChoices.find((s) => s.id === streamId) || streamChoices[0]).id : null;
  const gsQ = useQuery(() => fetchAll(() => supabase.from("grade_subjects").select("*").eq("academic_year_id", yearId)), [yearId]);
  const subjects = useMemo(
    () => (gsQ.data ? subjectsOfGrade(gsQ.data, refData.subjects, { yearId, gradeId, streamId: effStream, streams: refData.streams }) : []),
    [gsQ.data, yearId, gradeId, effStream, refData]
  );
  const warn = useMemo(() => (subjects.length ? templateWarnings(layout, subjects.map((s) => s.id)) : null), [layout, subjects]);

  // ----- preview with a real student -----
  const [sectionId, setSectionId] = useState("");
  const [whoId, setWhoId] = useState("");
  const secQ = useQuery(() => fetchAll(() => supabase.from("sections").select("*").eq("academic_year_id", yearId).eq("grade_id", gradeId)), [yearId, gradeId]);
  const sections = useMemo(() => sortSections(secQ.data || [], refData.grades), [secQ.data, refData.grades]);
  const section = sections.find((s) => s.id === sectionId) || null;
  const repQ = useQuery(
    () => (section && gsQ.data ? loadReport({ refData, gradeSubjects: gsQ.data, yearId, gradeId, sectionId: section.id }) : { data: null, error: null }),
    [section?.id, gsQ.data, yearId, gradeId]
  );
  const extraQ = useQuery(
    async () => (section ? { data: { att: await loadAttendance(section.id), hr: await loadHomeroom(section.homeroom_staff_id, lang) }, error: null } : { data: null, error: null }),
    [section?.id, lang]
  );
  const students = useMemo(() => {
    const g = repQ.data?.groups?.[0];
    return g ? [...g.report.rows].sort((a, b) => fullName(a.enrollment.students, "en").localeCompare(fullName(b.enrollment.students, "en"))) : [];
  }, [repQ.data]);
  const who = students.find((r) => r.enrollment.id === whoId) || null;
  const year = refData.years.find((y) => y.id === yearId);
  const realItems = useMemo(() => {
    if (!who || !section) return null;
    const ctx = buildFormCtx({ row: who, refData, year, section, lang, t, homeroom: extraQ.data?.hr ?? "", attendance: extraQ.data?.att ?? null });
    return buildPrintItems(layout, who, ctx);
  }, [who, section, layout, refData, year, lang, t, extraQ.data]);
  // A test print without a student: sample texts, so every place can be checked against the blank form
  const sampleItems = useMemo(() => {
    const out = [];
    for (const r of layout.rows) for (const c of layout.columns) if ((c.page ?? 0) === (r.page ?? 0)) out.push({ id: `${r.id}:${c.id}`, page: r.page ?? 0, x: c.x, y: r.y, w: c.w, h: r.h, text: "88.8", align: c.align ?? "center", size: c.size ?? 11 });
    for (const f of layout.fields) out.push({ id: f.id, page: f.page ?? 0, x: f.x, y: f.y, w: f.w, h: 3, text: t(`reports.designer.fieldKeys.${f.key}`), align: f.align ?? "start", size: f.size ?? 11 });
    return out;
  }, [layout, t]);
  const shownItems = realItems ?? [];
  const printItems = realItems ?? sampleItems;

  // ----- editing helpers -----
  const patch = useCallback((type, id, change) => {
    setLayout((l) => ({ ...l, [LIST[type]]: l[LIST[type]].map((it) => (it.id === id ? { ...it, ...change(it) } : it)) }));
  }, []);
  const remove = (type, id) => {
    setLayout((l) => ({ ...l, [LIST[type]]: l[LIST[type]].filter((it) => it.id !== id) }));
    setSel(null);
  };
  const find = (s) => (s ? layout[LIST[s.type]].find((it) => it.id === s.id) : null);
  const current = find(sel);
  const pos = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: roundPct(((e.clientX - r.left) / r.width) * 100), y: roundPct(((e.clientY - r.top) / r.height) * 100) };
  };

  // Clicking on the page with a placing tool
  const place = (e) => {
    const p = pos(e);
    if (tool === "rows") {
      if (firstY === null) { setFirstY(p.y); return; }
      if (!subjects.length) { setTool("select"); setFirstY(null); return; }
      const [a, b] = firstY <= p.y ? [firstY, p.y] : [p.y, firstY];
      const made = spreadRows(subjects.map((s) => s.id), roundPct(a - 1.5), roundPct(b - 1.5), pageIdx);
      const ids = new Set(subjects.map((s) => s.id));
      setLayout((l) => ({ ...l, rows: [...l.rows.filter((r) => !(r.page === pageIdx && ids.has(r.subjectId))), ...made] }));
      setFirstY(null); setTool("select"); setSel({ type: "row", id: made[0].id });
    } else if (tool === "column") {
      const used = new Set(layout.columns.filter((c) => c.page === pageIdx).map((c) => c.kind));
      const c = { id: newId("c"), page: pageIdx, kind: COLUMN_KINDS.find((k) => !used.has(k)) ?? "sem1", x: roundPct(p.x - 4), w: 8, align: "center", size: 11 };
      setLayout((l) => ({ ...l, columns: [...l.columns, c] }));
      setTool("select"); setSel({ type: "column", id: c.id });
    } else if (tool === "field") {
      const used = new Set(layout.fields.map((f) => f.key));
      const f = { id: newId("f"), page: pageIdx, key: FIELD_KEYS.find((k) => !used.has(k)) ?? "studentName", x: p.x, y: roundPct(p.y - 1.5), w: 30, align: "start", size: 11 };
      setLayout((l) => ({ ...l, fields: [...l.fields, f] }));
      setTool("select"); setSel({ type: "field", id: f.id });
    } else {
      setSel(null);
    }
  };

  // Dragging an item (rows move up and down, columns left and right, fields both ways)
  const down = (type, it) => (e) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSel({ type, id: it.id });
    stageRef.current?.focus({ preventScroll: true });
    drag.current = { type, id: it.id, start: pos(e), orig: { x: it.x, y: it.y } };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = pos(e);
    patch(d.type, d.id, () => ({
      ...(d.type !== "row" ? { x: roundPct(d.orig.x + p.x - d.start.x) } : {}),
      ...(d.type !== "column" ? { y: roundPct(d.orig.y + p.y - d.start.y) } : {}),
    }));
  };
  const up = () => { drag.current = null; };
  const key = (e) => {
    if (!sel || !current) return;
    const dirs = { ArrowLeft: ["x", -1], ArrowRight: ["x", 1], ArrowUp: ["y", -1], ArrowDown: ["y", 1] };
    const d = dirs[e.key];
    if (!d) return;
    if ((d[0] === "x" && sel.type === "row") || (d[0] === "y" && sel.type === "column")) return;
    e.preventDefault();
    patch(sel.type, sel.id, (it) => ({ [d[0]]: nudged(it[d[0]], d[1], e.shiftKey) }));
  };

  // ----- the blank form -----
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(""); setBusy("file");
    try {
      const pages = await uploadPages(template.id, await fileToPages(file));
      const map = await signedUrls(pages.map((p) => p.path));
      setUrls(map);
      setLayout((l) => {
        const last = pages.length - 1;
        const fix = (list) => list.map((it) => ({ ...it, page: Math.min(it.page ?? 0, last) }));
        return { ...l, pages, columns: fix(l.columns), rows: fix(l.rows), fields: fix(l.fields) };
      });
      setPageIdx(0);
    } catch (err) {
      setFileError(t(`reports.designer.errors.${err instanceof FormError ? err.code : "unreadable"}`));
    }
    setBusy("");
  };

  // ----- save as a new version -----
  const save = async () => {
    if (!hasPages) return notice.fail(null, t("reports.designer.needPages"));
    if (layoutProblems(layout).length) return notice.fail(null, t("reports.designer.problems"));
    setBusy("save");
    const { data, error } = await supabase.rpc("save_report_template_version", { p_template: template.id, p_layout: layout });
    if (error) { setBusy(""); return notice.fail(error, t("reports.designer.saveFailed")); }
    const v = await supabase.from("report_template_versions").select("version_no").eq("id", data).maybeSingle();
    const n = v.data?.version_no ?? (versionNo ?? 0) + 1;
    setVersionNo(n); setSaved(JSON.stringify(layout)); setBusy("");
    notice.setNotice({ type: "ok", text: t("reports.designer.saved", { n }) });
  };

  const printTest = async () => { await imagesReady(document.querySelector(".form-print")); window.print(); };

  // leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const pageRows = layout.rows.filter((r) => (r.page ?? 0) === pageIdx);
  const pageCols = layout.columns.filter((c) => (c.page ?? 0) === pageIdx);
  const pageFields = layout.fields.filter((f) => (f.page ?? 0) === pageIdx);
  const subjectName = (id) => { const s = refData.subjects.find((x) => x.id === id); return s ? pick(s, lang) : "—"; };
  const num = (v, lo, hi, fallback) => (Number.isFinite(parseFloat(v)) ? clamp(parseFloat(v), lo, hi) : fallback);
  const hint = tool === "rows" ? (firstY === null ? t("reports.designer.hints.rows1") : t("reports.designer.hints.rows2")) : t(`reports.designer.hints.${tool === "select" ? "select" : tool}`);

  return (
    <>
      <div className="no-print">
        <h2>{template.name}</h2>
        <Notice notice={notice.notice} />

        {/* 1. the blank form */}
        <h3>{t("reports.designer.sourceTitle")}</h3>
        <p className="muted">{t("reports.designer.sourceHelp")}</p>
        <p>
          <label className="btn-small file-btn">
            {busy === "file" ? t("reports.designer.working") : hasPages ? t("reports.designer.replace") : t("reports.designer.choose")}
            <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={onFile} disabled={busy !== ""} className="sr-only" />
          </label>
        </p>
        {fileError && <p className="field-error" role="alert">{fileError}</p>}

        {hasPages && (
          <>
            {/* 2. the layout */}
            <h3>{t("reports.designer.layoutTitle")}</h3>
            <p className="muted">{t("reports.designer.noSubjectsYear")}</p>
            <div className="toolbar">
              <label><span className="small muted">{t("reports.designer.year")}</span>
                <select value={yearId} onChange={(e) => { setYearId(e.target.value); setSectionId(""); setWhoId(""); }}>
                  {refData.years.map((y) => (<option key={y.id} value={y.id}>{y.label}</option>))}
                </select></label>
              <label><span className="small muted">{t("reports.designer.grade")}</span>
                <select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSectionId(""); setWhoId(""); }}>
                  {refData.grades.map((g) => (<option key={g.id} value={g.id}>{pick(g, lang)}</option>))}
                </select></label>
              {streamChoices.length > 0 && (
                <label><span className="small muted">{t("reports.designer.stream")}</span>
                  <select value={effStream ?? ""} onChange={(e) => setStreamId(e.target.value)}>
                    {streamChoices.map((s) => (<option key={s.id} value={s.id}>{pick(s, lang)}</option>))}
                  </select></label>
              )}
              {layout.pages.length > 1 && (
                <span className="seg" role="group" aria-label={t("reports.designer.pageOf", { n: pageIdx + 1, total: layout.pages.length })}>
                  {layout.pages.map((_, i) => (
                    <button key={i} type="button" className={i === pageIdx ? "seg-btn on" : "seg-btn"} aria-pressed={i === pageIdx} onClick={() => { setPageIdx(i); setSel(null); }}>{t("reports.designer.pageOf", { n: i + 1, total: layout.pages.length })}</button>
                  ))}
                </span>
              )}
            </div>
            <div className="toolbar" role="group" aria-label={t("reports.designer.layoutTitle")}>
              {["select", "rows", "column", "field"].map((k) => (
                <button key={k} type="button" className={tool === k ? "btn-small" : "btn-small secondary"} aria-pressed={tool === k} onClick={() => { setTool(k); setFirstY(null); }}>{t(`reports.designer.tools.${k}`)}</button>
              ))}
            </div>
            <p className="small muted" role="status">{tool === "rows" && !subjects.length ? t("reports.designer.rowsNeedSubjects") : hint}</p>
          </>
        )}
      </div>

      {hasPages && (
        <div className="designer-grid">
          <div className="no-print">
            <div
              ref={stageRef}
              className={`designer-stage${tool === "select" ? "" : " tool-place"}`}
              tabIndex={0}
              onKeyDown={key}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <FormSheet url={urls.get(layout.pages[pageIdx]?.path)} offsetMm={layout.offsetMm} items={shownItems.filter((it) => it.page === pageIdx)} className="on-screen">
                <div className="stage-hit" onPointerDown={place} />
                {pageRows.map((r) => (
                  <div key={r.id} className={`stage-item row${sel?.id === r.id ? " sel" : ""}${realItems ? " faint" : ""}`} style={{ left: 0, width: "100%", top: `${r.y}%`, height: `${r.h}%` }} onPointerDown={down("row", r)}>
                    <span className="tag">{subjectName(r.subjectId)}</span>
                  </div>
                ))}
                {pageCols.map((c) => (
                  <div key={c.id} className={`stage-item col${sel?.id === c.id ? " sel" : ""}${realItems ? " faint" : ""}`} style={{ top: 0, height: "100%", left: `${c.x}%`, width: `${c.w}%` }} onPointerDown={down("column", c)}>
                    <span className="tag">{t(`reports.designer.columnKinds.${c.kind}`)}</span>
                  </div>
                ))}
                {pageFields.map((f) => (
                  <div key={f.id} className={`stage-item fld${sel?.id === f.id ? " sel" : ""}${realItems ? " faint" : ""}`} style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: "3%" }} onPointerDown={down("field", f)}>
                    <span className="tag">{t(`reports.designer.fieldKeys.${f.key}`)}</span>
                  </div>
                ))}
              </FormSheet>
            </div>
          </div>

          <aside className="designer-panel no-print" aria-label={t("reports.designer.items")}>
            {current && (
              <div className="panel-box">
                <strong>{t(`reports.designer.${sel.type}`)}</strong>
                {sel.type === "row" && (
                  <>
                    <label><span className="small muted">{t("reports.designer.subject")}</span>
                      <select value={current.subjectId || ""} onChange={(e) => patch("row", current.id, () => ({ subjectId: e.target.value }))}>
                        <option value="">{t("reports.designer.unassigned")}</option>
                        {subjects.map((s) => (<option key={s.id} value={s.id}>{pick(s, lang)}</option>))}
                      </select></label>
                    <label><span className="small muted">{t("reports.designer.height")} %</span>
                      <input type="number" step="0.1" min="0.5" max="20" value={current.h} onChange={(e) => patch("row", current.id, () => ({ h: num(e.target.value, 0.5, 20, current.h) }))} /></label>
                  </>
                )}
                {sel.type === "column" && (
                  <label><span className="small muted">{t("reports.designer.column")}</span>
                    <select value={current.kind} onChange={(e) => patch("column", current.id, () => ({ kind: e.target.value }))}>
                      {COLUMN_KINDS.map((k) => (<option key={k} value={k}>{t(`reports.designer.columnKinds.${k}`)}</option>))}
                    </select></label>
                )}
                {sel.type === "field" && (
                  <label><span className="small muted">{t("reports.designer.field")}</span>
                    <select value={current.key} onChange={(e) => patch("field", current.id, () => ({ key: e.target.value }))}>
                      {FIELD_KEYS.map((k) => (<option key={k} value={k}>{t(`reports.designer.fieldKeys.${k}`)}</option>))}
                    </select></label>
                )}
                {sel.type !== "row" && (
                  <>
                    <label><span className="small muted">{t("reports.designer.width")} %</span>
                      <input type="number" step="0.1" min="1" max="100" value={current.w} onChange={(e) => patch(sel.type, current.id, () => ({ w: num(e.target.value, 1, 100, current.w) }))} /></label>
                    <label><span className="small muted">{t("reports.designer.align")}</span>
                      <select value={current.align || "start"} onChange={(e) => patch(sel.type, current.id, () => ({ align: e.target.value }))}>
                        {["start", "center", "end"].map((a) => (<option key={a} value={a}>{t(`reports.designer.aligns.${a}`)}</option>))}
                      </select></label>
                    <label><span className="small muted">{t("reports.designer.size")}</span>
                      <input type="number" step="0.5" min="6" max="24" value={current.size ?? 11} onChange={(e) => patch(sel.type, current.id, () => ({ size: num(e.target.value, 6, 24, current.size ?? 11) }))} /></label>
                  </>
                )}
                <button type="button" className="btn-small danger" onClick={() => remove(sel.type, current.id)}>{t("reports.designer.remove")}</button>
              </div>
            )}

            <div className="panel-box">
              <strong>{t("reports.designer.items")}</strong>
              {pageRows.length + pageCols.length + pageFields.length === 0 ? <p className="small muted">{t("reports.designer.noItems")}</p> : (
                <ul className="item-list">
                  {pageRows.map((r) => (<li key={r.id}><button type="button" className={sel?.id === r.id ? "on" : ""} onClick={() => setSel({ type: "row", id: r.id })}>{t("reports.designer.row")}: {subjectName(r.subjectId)}</button></li>))}
                  {pageCols.map((c) => (<li key={c.id}><button type="button" className={sel?.id === c.id ? "on" : ""} onClick={() => setSel({ type: "column", id: c.id })}>{t("reports.designer.column")}: {t(`reports.designer.columnKinds.${c.kind}`)}</button></li>))}
                  {pageFields.map((f) => (<li key={f.id}><button type="button" className={sel?.id === f.id ? "on" : ""} onClick={() => setSel({ type: "field", id: f.id })}>{t("reports.designer.field")}: {t(`reports.designer.fieldKeys.${f.key}`)}</button></li>))}
                </ul>
              )}
            </div>

            <div className="panel-box">
              <strong>{t("reports.designer.offsetTitle")}</strong>
              <p className="small muted">{t("reports.designer.offsetHelp")}</p>
              <label><span className="small muted">{t("reports.designer.offsetX")}</span>
                <input type="number" step="0.5" min="-20" max="20" value={layout.offsetMm?.x ?? 0} onChange={(e) => setLayout((l) => ({ ...l, offsetMm: { ...l.offsetMm, x: num(e.target.value, -20, 20, 0) } }))} /></label>
              <label><span className="small muted">{t("reports.designer.offsetY")}</span>
                <input type="number" step="0.5" min="-20" max="20" value={layout.offsetMm?.y ?? 0} onChange={(e) => setLayout((l) => ({ ...l, offsetMm: { ...l.offsetMm, y: num(e.target.value, -20, 20, 0) } }))} /></label>
            </div>
          </aside>
        </div>
      )}

      {hasPages && (
        <div className="no-print">
          {/* 3. check with a real student, then save */}
          <h3>{t("reports.designer.previewTitle")}</h3>
          <div className="toolbar">
            <label><span className="small muted">{t("reports.designer.previewSection")}</span>
              <select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setWhoId(""); }}>
                <option value="">{t("reports.designer.previewNone")}</option>
                {sections.map((s) => (<option key={s.id} value={s.id}>{sectionLabel(s, refData.grades, refData.streams, lang, pick)}</option>))}
              </select></label>
            {section && (
              <label><span className="small muted">{t("reports.designer.previewStudent")}</span>
                <select value={whoId} onChange={(e) => setWhoId(e.target.value)} disabled={repQ.loading}>
                  <option value="">{t("reports.designer.previewNone")}</option>
                  {students.map((r) => (<option key={r.enrollment.id} value={r.enrollment.id}>{fullName(r.enrollment.students, lang)}</option>))}
                </select></label>
            )}
            <button type="button" className="btn-small secondary" onClick={printTest}>{t("reports.designer.testPrint")}</button>
          </div>
          <p className="small muted">{t("reports.designer.testPrintHelp")}</p>

          {warn && hasWarnings(warn) && (
            <div className="flash error" role="alert">
              <div>
                <strong>{t("reports.designer.warnTitle")}</strong>
                <ul>
                  {warn.missing.length > 0 && <li>{t("reports.designer.warn.missing", { list: warn.missing.map(subjectName).join(", ") })}</li>}
                  {warn.unknown.length > 0 && <li>{t("reports.designer.warn.unknown", { list: warn.unknown.map(subjectName).join(", ") })}</li>}
                  {warn.unassigned > 0 && <li>{t("reports.designer.warn.unassigned", { n: warn.unassigned })}</li>}
                  {warn.duplicates.length > 0 && <li>{t("reports.designer.warn.duplicates", { list: warn.duplicates.map(subjectName).join(", ") })}</li>}
                  {warn.noColumns && <li>{t("reports.designer.warn.noColumns")}</li>}
                </ul>
              </div>
            </div>
          )}

          <div className="row-actions sticky-actions">
            <button type="button" onClick={save} disabled={busy !== "" || !dirty}>{busy === "save" ? t("reports.designer.saving") : t("reports.designer.save")}</button>
            <span className="small muted">{dirty ? t("reports.designer.unsaved") : versionNo ? t("reports.designer.versionNow", { n: versionNo }) : t("reports.designer.versionNone")}</span>
          </div>
        </div>
      )}

      {/* what is printed by "Print this page as a test": every page, at full size, nothing else */}
      {hasPages && (
        <div className="print-only form-print">
          <style>{"@media print { @page { size: A4 portrait; margin: 0; } }"}</style>
          {layout.pages.map((p, i) => (
            <FormSheet key={p.path} url={urls.get(p.path)} offsetMm={layout.offsetMm} items={printItems.filter((it) => it.page === i)} className="form-card-page" />
          ))}
        </div>
      )}
    </>
  );
}
