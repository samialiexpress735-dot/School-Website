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
  COLUMN_KINDS, FIELD_KEYS, buildPrintItems, clamp, emptyLayout, hasWarnings, isClick, layoutProblems, newId, normRect, nudged,
  roundPct, tableRows, templateWarnings,
} from "../../lib/reportTemplate.js";
import { loadReport } from "../../lib/reportsData.js";
import { sectionLabel, useMarksRef } from "../marks/MarksParts.jsx";
import { buildFormCtx, loadAttendance, loadForm, loadHomeroom, loadLocks } from "./formData.js";
import FormSheet from "./FormSheet.jsx";

const LIST = { row: "rows", column: "columns", field: "fields" };

const Ico = ({ children }) => (
  <svg className="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const TOOLS = [
  { k: "select", key: "V", icon: <path d="M5 3l14 8-6 2-2 6z" /> },
  { k: "table", key: "T", icon: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 10h18M3 15h18M10 4v16" /></> },
  { k: "column", key: "C", icon: <rect x="8" y="3" width="8" height="18" rx="1.5" /> },
];

export default function TemplateDesignerPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const { t } = useLang();
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
  const [draft, setDraft] = useState(null); // the rectangle being drawn right now
  const [armed, setArmed] = useState(null); // what the next click on the form places: { type: "subject", id } or { type: "field", key }
  const [sel, setSel] = useState(null); // { type: "row" | "column" | "field", id }
  const [busy, setBusy] = useState("");
  const [fileError, setFileError] = useState("");
  const [colKind, setColKind] = useState("sem1"); // what the next drawn column is: semester 1, semester 2, yearly average or pass / fail
  const [zoom, setZoom] = useState(1);
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
    async () => (section ? { data: { att: await loadAttendance(section.id), hr: await loadHomeroom(section.homeroom_staff_id, lang), locks: await loadLocks(section.id) }, error: null } : { data: null, error: null }),
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
    const ctx = buildFormCtx({ row: who, refData, year, section, lang, t, homeroom: extraQ.data?.hr ?? "", attendance: extraQ.data?.att ?? null, locks: extraQ.data?.locks ?? null });
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

  // ----- undo / redo: the layout is kept before each change (a drag counts as one change, typing in one box as one) -----
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const past = useRef([]);
  const future = useRef([]);
  const lastEdit = useRef({ tag: "", at: 0 });
  const [, setTick] = useState(0);
  const remember = (tag = "") => {
    const now = Date.now();
    if (tag && lastEdit.current.tag === tag && now - lastEdit.current.at < 900) { lastEdit.current.at = now; return; }
    lastEdit.current = { tag, at: now };
    past.current = [...past.current.slice(-79), layoutRef.current];
    future.current = [];
    setTick((n) => n + 1);
  };
  const clearHistory = () => { past.current = []; future.current = []; lastEdit.current = { tag: "", at: 0 }; setTick((n) => n + 1); };
  const undo = () => {
    if (!past.current.length) return;
    future.current = [...future.current, layoutRef.current];
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    lastEdit.current = { tag: "", at: 0 };
    setLayout(prev); setTick((n) => n + 1);
  };
  const redo = () => {
    if (!future.current.length) return;
    past.current = [...past.current, layoutRef.current];
    const next = future.current[future.current.length - 1];
    future.current = future.current.slice(0, -1);
    lastEdit.current = { tag: "", at: 0 };
    setLayout(next); setTick((n) => n + 1);
  };
  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  // ----- editing helpers -----
  const patch = useCallback((type, id, change) => {
    setLayout((l) => ({ ...l, [LIST[type]]: l[LIST[type]].map((it) => (it.id === id ? { ...it, ...change(it) } : it)) }));
  }, []);
  const edit = (type, id, change, tag) => { remember(tag); patch(type, id, change); };
  const remove = (type, id) => {
    remember();
    setLayout((l) => ({ ...l, [LIST[type]]: l[LIST[type]].filter((it) => it.id !== id) }));
    setSel((s) => (s?.id === id ? null : s));
  };
  const find = (s) => (s ? layout[LIST[s.type]].find((it) => it.id === s.id) : null);
  const current = find(sel);
  const pos = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: roundPct(((e.clientX - r.left) / r.width) * 100), y: roundPct(((e.clientY - r.top) / r.height) * 100) };
  };

  // Drawing, like the rectangle tool in Paint: press where the rectangle starts, drag, release. A plain click (no dragging)
  // places the item with a normal size. The rectangle drawn is the position and size of the item.
  const drawStart = (e) => {
    if (tool === "select") { setSel(null); return; }
    if (tool === "place" && !armed) return;
    drag.current = { mode: "draw", start: pos(e) };
    setDraft({ ...pos(e), w: 0, h: 0 });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const commit = (rect, point) => {
    const click = isClick(rect);
    const placedIds = new Set(layout.rows.map((r) => r.subjectId));
    const lastH = layout.rows[layout.rows.length - 1]?.h ?? 3;
    if (tool === "table") {
      // One rectangle over the subjects table: the subjects without a row are divided evenly inside it
      const todo = subjects.filter((x) => !placedIds.has(x.id));
      if (click || !todo.length) return;
      const made = tableRows(todo.map((x) => x.id), rect, pageIdx);
      remember();
      setLayout((l) => ({ ...l, rows: [...l.rows, ...made] }));
      setTool("select"); setSel({ type: "row", id: made[0].id });
    } else if (tool === "place" && armed?.type === "subject") {
      const r = click
        ? { id: newId("r"), page: pageIdx, subjectId: armed.id, x: 0, w: 100, y: roundPct(point.y - lastH / 2), h: lastH }
        : { id: newId("r"), page: pageIdx, subjectId: armed.id, x: rect.x, w: rect.w, y: rect.y, h: rect.h };
      remember();
      setLayout((l) => ({ ...l, rows: [...l.rows, r] }));
      setSel({ type: "row", id: r.id });
      const next = subjects.find((x) => x.id !== armed.id && !placedIds.has(x.id));
      if (next) setArmed({ type: "subject", id: next.id }); else { setArmed(null); setTool("select"); }
    } else if (tool === "place" && armed?.type === "field") {
      const f = click
        ? { id: newId("f"), page: pageIdx, key: armed.key, x: point.x, y: roundPct(point.y - 1.5), w: 30, h: 3, align: "start", size: 11 }
        : { id: newId("f"), page: pageIdx, key: armed.key, x: rect.x, y: rect.y, w: rect.w, h: rect.h, align: "start", size: 11 };
      remember();
      setLayout((l) => ({ ...l, fields: [...l.fields, f] }));
      setArmed(null); setTool("select"); setSel({ type: "field", id: f.id });
    } else if (tool === "column") {
      // The type of the column is the one chosen next to the tool. Afterwards the next type that is not on the page yet
      // is ready, so semester 1, semester 2, average and result can be drawn one after the other without changing anything.
      const kind = colKind;
      const c = click
        ? { id: newId("c"), page: pageIdx, kind, x: roundPct(point.x - 4), w: 8, y: 0, h: 100, align: "center", size: 11 }
        : { id: newId("c"), page: pageIdx, kind, x: rect.x, w: rect.w, y: rect.y, h: rect.h, align: "center", size: 11 };
      remember();
      setLayout((l) => ({ ...l, columns: [...l.columns, c] }));
      setSel({ type: "column", id: c.id });
      const used = new Set([...layout.columns.filter((x) => (x.page ?? 0) === pageIdx).map((x) => x.kind), kind]);
      const next = COLUMN_KINDS.find((k) => !used.has(k));
      if (next) setColKind(next); else setTool("select");
    }
  };

  // Moving an item by dragging it; its corner resizes it (width and height), like a rectangle in Paint
  const down = (type, it) => (e) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSel({ type, id: it.id });
    stageRef.current?.focus({ preventScroll: true });
    drag.current = { mode: "move", type, id: it.id, start: pos(e), orig: { x: it.x ?? 0, y: it.y ?? 0 }, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const startResize = (type, it) => (e) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSel({ type, id: it.id });
    drag.current = { mode: "resize", type, id: it.id, start: pos(e), orig: { w: it.w ?? 100, h: it.h ?? (type === "column" ? 100 : 3) }, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = pos(e);
    if (d.mode === "draw") { setDraft(normRect(d.start, p)); return; }
    if (!d.moved) { d.moved = true; remember(); } // one undo step for the whole drag
    if (d.mode === "resize") {
      patch(d.type, d.id, () => ({ w: roundPct(clamp(d.orig.w + p.x - d.start.x, 1, 100)), h: roundPct(clamp(d.orig.h + p.y - d.start.y, 0.5, 100)) }));
      return;
    }
    patch(d.type, d.id, () => ({ x: roundPct(d.orig.x + p.x - d.start.x), y: roundPct(d.orig.y + p.y - d.start.y) }));
  };
  const up = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "draw") {
      const p = pos(e);
      setDraft(null);
      commit(normRect(d.start, p), d.start);
    }
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
      clearHistory(); // earlier steps belong to the old pages
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
  const kindLabel = (k) => t(`reports.designer.columnKinds.${k}`);
  const kindShort = (k) => t(`reports.designer.columnShort.${k}`);
  const usedKinds = new Set(pageCols.map((c) => c.kind));
  const placedSubjects = new Set(layout.rows.map((r) => r.subjectId));
  const placedCount = subjects.filter((s) => placedSubjects.has(s.id)).length;
  const armedName = armed?.type === "subject" ? subjectName(armed.id) : armed?.type === "field" ? t(`reports.designer.fieldKeys.${armed.key}`) : "";
  const draftLabel = tool === "column" ? kindShort(colKind) : tool === "place" ? armedName : "";
  const hint = tool === "place" && armed
    ? t(armed.type === "subject" ? "reports.designer.palette.hintSubject" : "reports.designer.palette.hintField", { name: armedName })
    : tool === "column" ? t("reports.designer.hints.column", { kind: kindLabel(colKind) })
    : tool === "table" ? (subjects.length ? t("reports.designer.hints.table") : t("reports.designer.rowsNeedSubjects"))
    : t("reports.designer.hints.select");

  // Choosing a tool. The column tool starts with a type that is not on the page yet.
  const chooseTool = (k) => {
    setArmed(null); setDraft(null); drag.current = null;
    if (k === "column" && usedKinds.has(colKind)) {
      const free = COLUMN_KINDS.find((x) => !usedKinds.has(x));
      if (free) setColKind(free);
    }
    setTool(k);
  };

  // Keyboard: V / T / C tools, Delete removes the selected item, arrows move it, Esc stops, Ctrl+Z / Ctrl+Y undo and redo.
  // Nothing happens while a box, a list or a text field has the focus.
  useEffect(() => {
    if (!hasPages) return undefined;
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (mod && !e.altKey && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && !e.altKey && (k === "y" || k === "Y")) { e.preventDefault(); redo(); return; }
      if (mod || e.altKey) return;
      if (k === "Escape") {
        if (drag.current?.mode === "draw") { drag.current = null; setDraft(null); }
        if (tool !== "select") { setTool("select"); setArmed(null); } else setSel(null);
        return;
      }
      if (k === "Delete" || k === "Backspace") { if (current) { e.preventDefault(); remove(sel.type, sel.id); } return; }
      if (k.startsWith("Arrow") && current) {
        const dirs = { ArrowLeft: ["x", -1], ArrowRight: ["x", 1], ArrowUp: ["y", -1], ArrowDown: ["y", 1] };
        const d = dirs[k];
        e.preventDefault();
        edit(sel.type, sel.id, (it) => ({ [d[0]]: nudged(it[d[0]] ?? 0, d[1], e.shiftKey) }), `nudge:${sel.id}`);
        return;
      }
      const letter = k.length === 1 ? k.toUpperCase() : "";
      const t2 = TOOLS.find((x) => x.key === letter);
      if (t2) chooseTool(t2.k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const fileButton = (cls) => (
    <label className={`${cls} file-btn`}>
      {busy === "file" ? t("reports.designer.working") : hasPages ? t("reports.designer.replace") : t("reports.designer.choose")}
      <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={onFile} disabled={busy !== ""} className="sr-only" />
    </label>
  );
  const removeLabel = (name) => `${t("reports.designer.remove")}: ${name}`;
  const itemTitle = (type, it) => (type === "row" ? subjectName(it.subjectId) : type === "column" ? kindLabel(it.kind) : t(`reports.designer.fieldKeys.${it.key}`));
  const status = dirty ? { cls: "pill gold", text: t("reports.designer.unsaved") }
    : versionNo ? { cls: "pill ok", text: t("reports.designer.versionNow", { n: versionNo }) }
    : { cls: "pill", text: t("reports.designer.versionNone") };
  const checksBad = !!(warn && hasWarnings(warn));
  const delBtn = (type, it) => (sel?.id === it.id && tool === "select" ? (
    <button type="button" className="stage-del" aria-label={removeLabel(itemTitle(type, it))} title={`${t("reports.designer.remove")} (Del)`}
      onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(type, it.id)}>✕</button>
  ) : null);

  return (
    <>
      <div className="studio no-print">
        {/* top bar: always in view while the page scrolls */}
        <header className="studio-bar">
          <div className="studio-row">
            <div className="studio-id">
              <Link className="studio-back" to={`/${lang}/reports/templates`} title={t("reports.designer.back")} aria-label={t("reports.designer.back")}>←</Link>
              <h2 className="studio-title">{template.name}</h2>
              <span className={status.cls} role="status">{status.text}</span>
            </div>

            {hasPages && (
              <div className="studio-tools" role="group" aria-label={t("reports.designer.layoutTitle")}>
                <span className="tool-seg">
                  {TOOLS.map((x) => (
                    <button key={x.k} type="button" className={`tool-btn${tool === x.k ? " on" : ""}`} aria-pressed={tool === x.k}
                      title={`${t(`reports.designer.tools.${x.k}`)} (${x.key})`} onClick={() => chooseTool(x.k)}>
                      <Ico>{x.icon}</Ico><span>{t(`reports.designer.toolsShort.${x.k}`)}</span><kbd>{x.key}</kbd>
                    </button>
                  ))}
                  {/* the type of the column to draw: one list instead of four tools */}
                  <select className={`kind-select k-${colKind}${tool === "column" ? " active" : ""}`} value={colKind} aria-label={t("reports.designer.columnType")}
                    title={t("reports.designer.columnType")} onChange={(e) => { setColKind(e.target.value); setTool("column"); setArmed(null); e.target.blur(); }}>
                    {COLUMN_KINDS.map((k) => (<option key={k} value={k}>{usedKinds.has(k) ? "✓ " : ""}{kindLabel(k)}</option>))}
                  </select>
                </span>
                {layout.pages.length > 1 && (
                  <span className="tool-seg" role="group" aria-label={t("reports.designer.pageOf", { n: pageIdx + 1, total: layout.pages.length })}>
                    {layout.pages.map((_, i) => (
                      <button key={i} type="button" className={`tool-btn num${i === pageIdx ? " on" : ""}`} aria-pressed={i === pageIdx}
                        title={t("reports.designer.pageOf", { n: i + 1, total: layout.pages.length })} onClick={() => { setPageIdx(i); setSel(null); }}>{i + 1}</button>
                    ))}
                  </span>
                )}
              </div>
            )}

            <div className="studio-actions">
              {hasPages && (
                <>
                  <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title={`${t("reports.designer.undo")} (Ctrl+Z)`} aria-label={t("reports.designer.undo")}>
                    <Ico><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></Ico></button>
                  <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title={`${t("reports.designer.redo")} (Ctrl+Y)`} aria-label={t("reports.designer.redo")}>
                    <Ico><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></Ico></button>
                  <button type="button" className="btn-small secondary" onClick={printTest} title={t("reports.designer.testPrintHelp")}>
                    <Ico><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="1.5" /><path d="M7 14h10v7H7z" /></Ico>{t("reports.designer.testPrint")}</button>
                  {fileButton("btn-small secondary")}
                  <button type="button" className="btn-small" onClick={save} disabled={busy !== "" || !dirty}>{busy === "save" ? t("reports.designer.saving") : t("reports.designer.save")}</button>
                </>
              )}
            </div>
          </div>
          {hasPages && <p className="studio-hint" role="status">{hint}</p>}
        </header>

        <Notice notice={notice.notice} />
        {fileError && <p className="field-error" role="alert">{fileError}</p>}

        {/* no form yet: the first step */}
        {!hasPages && (
          <div className="studio-drop">
            <h3>{t("reports.designer.sourceTitle")}</h3>
            <p className="muted">{t("reports.designer.sourceHelp")}</p>
            {fileButton("btn-small")}
          </div>
        )}

        {/* which subjects, and which real student to look at: at the top, not below the form */}
        {hasPages && (
          <section className="studio-context" aria-label={t("reports.designer.layoutTitle")}>
            <div className="ctx-group">
              <span className="ctx-title">{t("reports.designer.gradeFor")}</span>
              <label className="ctx-field"><span>{t("reports.designer.year")}</span>
                <select value={yearId} onChange={(e) => { setYearId(e.target.value); setSectionId(""); setWhoId(""); }}>
                  {refData.years.map((y) => (<option key={y.id} value={y.id}>{y.label}</option>))}
                </select></label>
              <label className="ctx-field"><span>{t("reports.designer.grade")}</span>
                <select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSectionId(""); setWhoId(""); }}>
                  {refData.grades.map((g) => (<option key={g.id} value={g.id}>{pick(g, lang)}</option>))}
                </select></label>
              {streamChoices.length > 0 && (
                <label className="ctx-field"><span>{t("reports.designer.stream")}</span>
                  <select value={effStream ?? ""} onChange={(e) => setStreamId(e.target.value)}>
                    {streamChoices.map((s) => (<option key={s.id} value={s.id}>{pick(s, lang)}</option>))}
                  </select></label>
              )}
            </div>
            <div className="ctx-group">
              <span className="ctx-title">{t("reports.designer.previewWho")}</span>
              <label className="ctx-field"><span>{t("reports.designer.previewSection")}</span>
                <select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setWhoId(""); }}>
                  <option value="">{t("reports.designer.previewNone")}</option>
                  {sections.map((s) => (<option key={s.id} value={s.id}>{sectionLabel(s, refData.grades, refData.streams, lang, pick)}</option>))}
                </select></label>
              {section && (
                <label className="ctx-field"><span>{t("reports.designer.previewStudent")}</span>
                  <select value={whoId} onChange={(e) => setWhoId(e.target.value)} disabled={repQ.loading}>
                    <option value="">{t("reports.designer.previewNone")}</option>
                    {students.map((r) => (<option key={r.enrollment.id} value={r.enrollment.id}>{fullName(r.enrollment.students, lang)}</option>))}
                  </select></label>
              )}
            </div>
            {section && <p className="ctx-note small muted">{t("reports.designer.previewFinalNote")}</p>}
          </section>
        )}

        {hasPages && (
          <div className="studio-body">
            {/* left: what can be placed */}
            <aside className="studio-side" aria-label={t("reports.designer.palette.title")}>
              <div className="panel-box">
                <div className="box-head">
                  <strong>{t("reports.designer.palette.subjects")}</strong>
                  {subjects.length > 0 && <span className="small muted">{t("reports.designer.placedCount", { n: placedCount, total: subjects.length })}</span>}
                </div>
                {subjects.length > 0 && <div className="meter" aria-hidden="true"><span style={{ width: `${Math.round((placedCount / subjects.length) * 100)}%` }} /></div>}
                {subjects.length === 0 ? <p className="small muted">{t("reports.designer.rowsNeedSubjects")}</p> : (
                  <ul className="item-list palette">
                    {subjects.map((x) => {
                      const row = layout.rows.find((r) => r.subjectId === x.id);
                      const on = armed?.type === "subject" && armed.id === x.id;
                      return (
                        <li key={x.id} className={row ? "placed" : ""}>
                          <button type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => {
                            if (row) { setPageIdx(row.page ?? 0); setSel({ type: "row", id: row.id }); setTool("select"); setArmed(null); }
                            else { setTool("place"); setArmed({ type: "subject", id: x.id }); setSel(null); }
                          }}>
                            <span aria-hidden="true">{row ? "✓" : "○"}</span><span className="grow">{pick(x, lang)}</span>
                            <span className="sr-only"> {row ? t("reports.designer.palette.placed") : t("reports.designer.palette.notPlaced")}</span>
                          </button>
                          {row && <button type="button" className="x-btn" aria-label={removeLabel(pick(x, lang))} title={t("reports.designer.remove")} onClick={() => remove("row", row.id)}>✕</button>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="panel-box">
                <strong>{t("reports.designer.palette.info")}</strong>
                <ul className="item-list palette">
                  {FIELD_KEYS.map((k) => {
                    const f = layout.fields.find((x) => x.key === k);
                    const on = armed?.type === "field" && armed.key === k;
                    return (
                      <li key={k} className={f ? "placed" : ""}>
                        <button type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => {
                          if (f) { setPageIdx(f.page ?? 0); setSel({ type: "field", id: f.id }); setTool("select"); setArmed(null); }
                          else { setTool("place"); setArmed({ type: "field", key: k }); setSel(null); }
                        }}>
                          <span aria-hidden="true">{f ? "✓" : "○"}</span><span className="grow">{t(`reports.designer.fieldKeys.${k}`)}</span>
                          <span className="sr-only"> {f ? t("reports.designer.palette.placed") : t("reports.designer.palette.notPlaced")}</span>
                        </button>
                        {f && <button type="button" className="x-btn" aria-label={removeLabel(t(`reports.designer.fieldKeys.${k}`))} title={t("reports.designer.remove")} onClick={() => remove("field", f.id)}>✕</button>}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <p className="small muted shortcuts">{t("reports.designer.shortcuts")}</p>
            </aside>

            {/* middle: the form */}
            <div className="studio-canvas">
              <div className="canvas-head">
                <span className="small muted">{layout.pages.length > 1 ? t("reports.designer.pageOf", { n: pageIdx + 1, total: layout.pages.length }) : ""}</span>
                <div className="zoom" role="group" aria-label={t("reports.designer.zoom")}>
                  <button type="button" className="icon-btn" onClick={() => setZoom((z) => clamp(Math.round((z - 0.1) * 10) / 10, 0.6, 1.8))} disabled={zoom <= 0.6} aria-label={t("reports.designer.zoomOut")}>−</button>
                  <button type="button" className="zoom-val" onClick={() => setZoom(1)} title={t("reports.designer.zoomFit")}>{Math.round(zoom * 100)}%</button>
                  <button type="button" className="icon-btn" onClick={() => setZoom((z) => clamp(Math.round((z + 0.1) * 10) / 10, 0.6, 1.8))} disabled={zoom >= 1.8} aria-label={t("reports.designer.zoomIn")}>+</button>
                </div>
              </div>
              <div className="canvas-scroll">
                <div
                  ref={stageRef}
                  className={`designer-stage${tool === "select" ? "" : " tool-place"}`}
                  style={{ width: `${46 * zoom}rem`, maxWidth: zoom <= 1 ? "100%" : "none" }}
                  tabIndex={0}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                >
                  <FormSheet url={urls.get(layout.pages[pageIdx]?.path)} offsetMm={layout.offsetMm} items={shownItems.filter((it) => it.page === pageIdx)} className="on-screen">
                    <div className="stage-hit" onPointerDown={drawStart} />
                    {draft && (
                      <div className={`stage-draft${tool === "column" ? ` k-${colKind}` : ""}`} style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%` }}>
                        {draftLabel && <span className="tag">{draftLabel}</span>}
                      </div>
                    )}
                    {pageRows.map((r) => (
                      <div key={r.id} className={`stage-item row${sel?.id === r.id ? " sel" : ""}${realItems ? " faint" : ""}`} style={{ left: `${r.x ?? 0}%`, width: `${r.w ?? 100}%`, top: `${r.y}%`, height: `${r.h}%` }} onPointerDown={down("row", r)}>
                        <span className="tag">{subjectName(r.subjectId)}</span>
                        <span className="handle h-corner" onPointerDown={startResize("row", r)} />
                        {delBtn("row", r)}
                      </div>
                    ))}
                    {pageCols.map((c) => (
                      <div key={c.id} className={`stage-item col k-${c.kind}${sel?.id === c.id ? " sel" : ""}${realItems ? " faint" : ""}`} style={{ top: `${c.y ?? 0}%`, height: `${c.h ?? 100}%`, left: `${c.x}%`, width: `${c.w}%` }} onPointerDown={down("column", c)}>
                        <span className="tag" title={kindLabel(c.kind)}>{kindShort(c.kind)}</span>
                        <span className="handle h-corner" onPointerDown={startResize("column", c)} />
                        {delBtn("column", c)}
                      </div>
                    ))}
                    {pageFields.map((f) => (
                      <div key={f.id} className={`stage-item fld${sel?.id === f.id ? " sel" : ""}${realItems ? " faint" : ""}`} style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h ?? 3}%` }} onPointerDown={down("field", f)}>
                        <span className="tag">{t(`reports.designer.fieldKeys.${f.key}`)}</span>
                        <span className="handle h-corner" onPointerDown={startResize("field", f)} />
                        {delBtn("field", f)}
                      </div>
                    ))}
                  </FormSheet>
                </div>
              </div>
            </div>

            {/* right: the selected item, checks, everything placed */}
            <aside className="studio-side" aria-label={t("reports.designer.items")}>
              {current ? (
                <div className="panel-box inspector">
                  <div className="box-head">
                    <strong>{t(`reports.designer.${sel.type}`)}</strong>
                    <button type="button" className="btn-small danger" onClick={() => remove(sel.type, current.id)} title="Del">✕ {t("reports.designer.removeShort")}</button>
                  </div>
                  {sel.type === "row" && (
                    <label><span className="small muted">{t("reports.designer.subject")}</span>
                      <select value={current.subjectId || ""} onChange={(e) => edit("row", current.id, () => ({ subjectId: e.target.value }), `${current.id}:subject`)}>
                        <option value="">{t("reports.designer.unassigned")}</option>
                        {subjects.map((s) => (<option key={s.id} value={s.id}>{pick(s, lang)}</option>))}
                      </select></label>
                  )}
                  {sel.type === "column" && (
                    <label><span className="small muted">{t("reports.designer.columnType")}</span>
                      <select className={`kind-select k-${current.kind}`} value={current.kind} onChange={(e) => edit("column", current.id, () => ({ kind: e.target.value }), `${current.id}:kind`)}>
                        {COLUMN_KINDS.map((k) => (<option key={k} value={k}>{kindLabel(k)}</option>))}
                      </select></label>
                  )}
                  {sel.type === "field" && (
                    <label><span className="small muted">{t("reports.designer.field")}</span>
                      <select value={current.key} onChange={(e) => edit("field", current.id, () => ({ key: e.target.value }), `${current.id}:key`)}>
                        {FIELD_KEYS.map((k) => (<option key={k} value={k}>{t(`reports.designer.fieldKeys.${k}`)}</option>))}
                      </select></label>
                  )}
                  <div className="two">
                    <label><span className="small muted">{t("reports.designer.width")} %</span>
                      <input type="number" step="0.1" min="1" max="100" value={current.w ?? 100} onChange={(e) => edit(sel.type, current.id, () => ({ w: num(e.target.value, 1, 100, current.w ?? 100) }), `${current.id}:w`)} /></label>
                    <label><span className="small muted">{t("reports.designer.height")} %</span>
                      <input type="number" step="0.1" min="0.5" max="100" value={current.h ?? (sel.type === "column" ? 100 : 3)} onChange={(e) => edit(sel.type, current.id, () => ({ h: num(e.target.value, 0.5, 100, current.h ?? 3) }), `${current.id}:h`)} /></label>
                  </div>
                  {sel.type !== "row" && (
                    <div className="two">
                      <label><span className="small muted">{t("reports.designer.align")}</span>
                        <select value={current.align || "start"} onChange={(e) => edit(sel.type, current.id, () => ({ align: e.target.value }), `${current.id}:align`)}>
                          {["start", "center", "end"].map((a) => (<option key={a} value={a}>{t(`reports.designer.aligns.${a}`)}</option>))}
                        </select></label>
                      <label><span className="small muted">{t("reports.designer.size")}</span>
                        <input type="number" step="0.5" min="6" max="24" value={current.size ?? 11} onChange={(e) => edit(sel.type, current.id, () => ({ size: num(e.target.value, 6, 24, current.size ?? 11) }), `${current.id}:size`)} /></label>
                    </div>
                  )}
                </div>
              ) : (
                <div className="panel-box inspector empty"><p className="small muted">{t("reports.designer.inspectorEmpty")}</p></div>
              )}

              {warn && (
                <div className={`panel-box checks ${checksBad ? "bad" : "ok"}`} role={checksBad ? "alert" : "status"}>
                  <strong>{checksBad ? `⚠ ${t("reports.designer.warnTitle")}` : `✓ ${t("reports.designer.checksOk")}`}</strong>
                  {checksBad && (
                    <ul>
                      {warn.missing.length > 0 && <li>{t("reports.designer.warn.missing", { list: warn.missing.map(subjectName).join(", ") })}</li>}
                      {warn.unknown.length > 0 && <li>{t("reports.designer.warn.unknown", { list: warn.unknown.map(subjectName).join(", ") })}</li>}
                      {warn.unassigned > 0 && <li>{t("reports.designer.warn.unassigned", { n: warn.unassigned })}</li>}
                      {warn.duplicates.length > 0 && <li>{t("reports.designer.warn.duplicates", { list: warn.duplicates.map(subjectName).join(", ") })}</li>}
                      {warn.noColumns && <li>{t("reports.designer.warn.noColumns")}</li>}
                    </ul>
                  )}
                </div>
              )}

              <div className="panel-box">
                <strong>{t("reports.designer.items")}</strong>
                {pageRows.length + pageCols.length + pageFields.length === 0 ? <p className="small muted">{t("reports.designer.noItems")}</p> : (
                  <ul className="item-list">
                    {[["row", pageRows], ["column", pageCols], ["field", pageFields]].flatMap(([type, list]) => list.map((it) => (
                      <li key={it.id}>
                        <button type="button" className={sel?.id === it.id ? "on" : ""} onClick={() => setSel({ type, id: it.id })}>
                          {type === "column" && <i className={`dot k-${it.kind}`} aria-hidden="true" />}
                          <span className="grow">{t(`reports.designer.${type}`)}: {itemTitle(type, it)}</span>
                        </button>
                        <button type="button" className="x-btn" aria-label={removeLabel(itemTitle(type, it))} title={t("reports.designer.remove")} onClick={() => remove(type, it.id)}>✕</button>
                      </li>
                    )))}
                  </ul>
                )}
              </div>

              <details className="panel-box offset">
                <summary><strong>{t("reports.designer.offsetTitle")}</strong></summary>
                <p className="small muted">{t("reports.designer.offsetHelp")}</p>
                <div className="two">
                  <label><span className="small muted">{t("reports.designer.offsetX")}</span>
                    <input type="number" step="0.5" min="-20" max="20" value={layout.offsetMm?.x ?? 0} onChange={(e) => { remember("offset:x"); setLayout((l) => ({ ...l, offsetMm: { ...l.offsetMm, x: num(e.target.value, -20, 20, 0) } })); }} /></label>
                  <label><span className="small muted">{t("reports.designer.offsetY")}</span>
                    <input type="number" step="0.5" min="-20" max="20" value={layout.offsetMm?.y ?? 0} onChange={(e) => { remember("offset:y"); setLayout((l) => ({ ...l, offsetMm: { ...l.offsetMm, y: num(e.target.value, -20, 20, 0) } })); }} /></label>
                </div>
              </details>
            </aside>
          </div>
        )}
      </div>

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
