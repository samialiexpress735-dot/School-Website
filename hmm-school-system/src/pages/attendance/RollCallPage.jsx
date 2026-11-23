import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, Loading, LoadError, useNudge, pick, fullName } from "../../lib/ui.jsx";
import { newlyFlagged } from "../../lib/motion.js";
import { formatEc } from "../../lib/ethiopian.js";
import { can, ATTENDANCE_ADMINS, ATTENDANCE_TAKERS } from "../../lib/roles.js";
import {
  STATUSES, DEFAULT_EDIT_DAYS, calendarMap, changedRows, dayProblem, inEditWindow, latestSchoolDay,
  missingNotes, stepSchoolDay, tally, todayIso,
} from "../../lib/attendance.js";
import { fetchAll } from "../../lib/marksData.js";
import { useMarksRef, useYearSemester, sectionLabel } from "../marks/MarksParts.jsx";
import { useVisibleSections, loadSectionStudents, semesterOfDate, byName, SemesterDatesNotice } from "./AttendanceParts.jsx";

export default function RollCallPage() {
  const refQ = useMarksRef();
  if (refQ.loading) return <Loading />;
  if (refQ.error) return <LoadError />;
  return <Inner refData={refQ.data} />;
}

function Inner({ refData }) {
  const { t, lang } = useLang();
  const ys = useYearSemester(refData);
  const { yearId } = ys;
  const vis = useVisibleSections(refData, yearId);
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState("");
  const today = todayIso();

  const calQ = useQuery(
    () => (yearId ? fetchAll(() => supabase.from("school_calendar").select("calendar_date,kind,name,name_am").eq("academic_year_id", yearId)) : { data: [] }),
    [yearId]
  );
  const setQ = useQuery(
    () => supabase.from("school_settings").select("key,value").in("key", ["absence_threshold", "attendance_edit_school_days"]),
    []
  );
  const calendar = useMemo(() => calendarMap(calQ.data), [calQ.data]);

  // Start on the most recent school day; start again when the year changes
  useEffect(() => { setDate(""); }, [yearId]);
  useEffect(() => {
    if (!date && !calQ.loading && !calQ.error && yearId) setDate(latestSchoolDay(today, calendar));
  }, [date, calQ.loading, calQ.error, calendar, yearId, today]);

  useEffect(() => {
    if (!vis.sections.find((s) => s.id === sectionId)) setSectionId(vis.sections[0]?.id || "");
  }, [vis.sections, sectionId]);

  if (vis.loading || calQ.loading || setQ.loading) return <Loading />;
  if (vis.error || calQ.error || setQ.error) return <LoadError />;
  if (!refData.years.length) return <p className="empty">{t("marks.noYear")}</p>;

  const setting = (key, fallback) => {
    const n = Number(setQ.data.find((s) => s.key === key)?.value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const editDays = setting("attendance_edit_school_days", DEFAULT_EDIT_DAYS);
  const defaultThreshold = setting("absence_threshold", 5);
  const year = refData.years.find((y) => y.id === yearId);
  const section = vis.sections.find((s) => s.id === sectionId) || null;
  const problem = date ? dayProblem(date, calendar, today) : null;

  return (
    <section className="panel">
      <p className="muted">{t("attendance.intro")}</p>
      <div className="toolbar">
        <label>
          <span className="small muted">{t("marks.year")}</span>
          <select value={yearId} onChange={(e) => ys.changeYear(e.target.value)}>
            {refData.years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </label>
        <label>
          <span className="small muted">{t("marks.section")}</span>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {vis.sections.map((s) => (
              <option key={s.id} value={s.id}>{sectionLabel(s, refData.grades, refData.streams, lang, pick)}</option>
            ))}
          </select>
        </label>
        <div className="datenav">
          <span className="small muted">{t("attendance.date")}</span>
          <div className="datenav-row">
            <button type="button" className="btn-small secondary" onClick={() => setDate(stepSchoolDay(date, -1, calendar))} aria-label={t("attendance.prevDay")} title={t("attendance.prevDay")}>‹</button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label={t("attendance.date")} />
            <button type="button" className="btn-small secondary" onClick={() => setDate(stepSchoolDay(date, 1, calendar, today))} disabled={date >= today} aria-label={t("attendance.nextDay")} title={t("attendance.nextDay")}>›</button>
          </div>
        </div>
      </div>
      {date && <p className="small ec-line">{formatEc(date, lang)}</p>}
      <SemesterDatesNotice semesters={refData.semesters} yearId={yearId} />

      {vis.sections.length === 0 ? (
        <p className="empty">{t("attendance.noSections")}</p>
      ) : problem ? (
        <p className="flash warn" role="status">
          {problem === "calendar"
            ? t("attendance.problems.calendar", { name: pick(calendar.get(date), lang) })
            : t(`attendance.problems.${problem}`)}
        </p>
      ) : section && date ? (
        <Sheet
          key={`${yearId}|${section.id}|${date}`}
          refData={refData}
          year={year}
          section={section}
          date={date}
          today={today}
          calendar={calendar}
          editDays={editDays}
          defaultThreshold={defaultThreshold}
          mine={vis.isMine(section)}
          homeroom={vis.homeroomOf(section)}
          onSectionChanged={vis.reload}
        />
      ) : (
        <Loading />
      )}
    </section>
  );
}

function Sheet({ refData, year, section, date, today, calendar, editDays, defaultThreshold, mine, homeroom, onSectionChanged }) {
  const { t } = useLang();
  const { profile } = useAuth();
  const notice = useNotice(); // lives here so "Saved." survives the reload that follows a save
  const semester = semesterOfDate(refData.semesters, year.id, date);
  const flaggedRef = useRef(null); // who was at the limit before the last reload (null = first load, nothing pulses)

  const q = useQuery(async () => {
    const st = await loadSectionStudents(section.id, year.id);
    if (st.error) return st;
    const [records, summary] = await Promise.all([
      fetchAll(() =>
        supabase
          .from("attendance")
          .select("enrollment_id,status,note,enrollments!inner(section_id)")
          .eq("attendance_date", date)
          .is("subject_id", null)
          .eq("enrollments.section_id", section.id)
      ),
      supabase.rpc("attendance_summary", { p_section: section.id, p_semester: semester?.id ?? null }),
    ]);
    const bad = [records, summary].find((r) => r.error);
    if (bad) return { data: null, error: bad.error };
    return { data: { students: st.data, records: records.data, summary: summary.data, stamp: Date.now() }, error: null };
  }, [section.id, year.id, date]);

  if (q.loading && !q.data) return <Loading shape="table" rows={8} />;
  if (q.error || !q.data) return <LoadError />;
  const { students, records, summary, stamp } = q.data;

  const isAdmin = can(profile, ATTENDANCE_ADMINS);
  const isTaker = can(profile, ATTENDANCE_TAKERS) && mine;
  const inWindow = inEditWindow(date, calendar, today, editDays);
  let readOnlyReason = null;
  if (year.is_closed) readOnlyReason = t("attendance.readOnly.closedYear");
  else if (isAdmin) readOnlyReason = null;
  else if (!isTaker) readOnlyReason = t("attendance.readOnly.role");
  else if (!inWindow) readOnlyReason = t("attendance.readOnly.window", { n: editDays });

  return (
    <Body
      key={stamp}
      year={year}
      section={section}
      date={date}
      students={students}
      records={records}
      summary={summary}
      flaggedRef={flaggedRef}
      notice={notice}
      readOnlyReason={readOnlyReason}
      canSetThreshold={!year.is_closed && (isAdmin || homeroom)}
      defaultThreshold={defaultThreshold}
      reload={q.reload}
      onSectionChanged={onSectionChanged}
    />
  );
}

function Body({ year, section, date, students, records, summary, flaggedRef, notice, readOnlyReason, canSetThreshold, defaultThreshold, reload, onSectionChanged }) {
  const { t, lang } = useLang();
  const taken = records.length > 0;
  const sorted = useMemo(() => [...students].sort(byName(lang, fullName)), [students, lang]);
  const initial = useMemo(() => {
    const m = {};
    for (const e of students) m[e.id] = { status: "present", note: "" };
    for (const r of records) if (m[r.enrollment_id]) m[r.enrollment_id] = { status: r.status, note: r.note || "" };
    return m;
  }, [students, records]);
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const readOnly = Boolean(readOnlyReason);
  const sumById = useMemo(() => new Map(summary.map((s) => [s.enrollment_id, s])), [summary]);
  const threshold = summary[0]?.threshold ?? section.absence_threshold ?? defaultThreshold;

  // One gentle pulse for a student who has just reached the limit (not for those already there when the page opened)
  const flaggedNow = useMemo(() => new Set(summary.filter((x) => x.flagged).map((x) => x.enrollment_id)), [summary]);
  const pulse = useMemo(() => newlyFlagged(flaggedRef.current, flaggedNow), [flaggedNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { flaggedRef.current = flaggedNow; }, [flaggedNow, flaggedRef]);

  const counts = tally(rows);
  const changes = changedRows(rows, initial, taken);
  const dirty = changes.length > 0;

  const setStatus = (id, status) => setRows((r) => ({ ...r, [id]: { ...r[id], status } }));
  const setNote = (id, note) => setRows((r) => ({ ...r, [id]: { ...r[id], note } }));
  const markAllPresent = () => setRows((r) => Object.fromEntries(Object.entries(r).map(([id, v]) => [id, { status: "present", note: "" }])));

  async function save() {
    notice.clear();
    if (missingNotes(rows).length) return notice.fail(null, t("attendance.needNote"));
    setBusy(true);
    const { data, error } = await supabase.rpc("save_daily_attendance", { p_section: section.id, p_date: date, p_rows: changes });
    setBusy(false);
    if (error) return notice.fail(error, t("attendance.saveFailed", { detail: error.message }));
    notice.setNotice({ type: "ok", text: t("attendance.savedN", { n: data }) });
    reload();
  }

  if (students.length === 0) return <p className="empty">{t("attendance.noStudents")}</p>;

  return (
    <>
      {canSetThreshold && (
        <ThresholdBox section={section} threshold={threshold} defaultThreshold={defaultThreshold} onChanged={() => { onSectionChanged(); reload(); }} />
      )}

      <Notice notice={notice.notice} />
      {readOnlyReason && <p className="flash warn" role="status">{readOnlyReason}</p>}
      {!readOnly && !taken && <p className="flash warn" role="status">{t("attendance.notTaken")}</p>}
      {taken && !dirty && <p className="small muted">{t("attendance.taken")}</p>}

      <div className="mark-bar">
        <p className="roll-counts" aria-live="polite">
          {STATUSES.map((s) => (
            <CountPill key={s} tone={s === "present" ? "ok" : s === "absent" ? "warn" : s === "late" ? "gold" : "info"} n={counts[s]} label={t(`attendance.status.${s}`)} />
          ))}
        </p>
        {!readOnly && (
          <button type="button" className="btn-small secondary" onClick={markAllPresent}>{t("attendance.markAllPresent")}</button>
        )}
      </div>

      <ul className="roll">
        {sorted.map((e) => {
          const r = rows[e.id];
          const s = sumById.get(e.id);
          const flagged = Boolean(s?.flagged);
          return (
            <li key={e.id} className={`roll-row${flagged ? " flagged" : ""}${pulse.has(e.id) ? " pulse" : ""}`}>
              <div className="roll-who">
                <span className="nm">{fullName(e.students, lang)}</span>
                <span className="small muted code-small">{e.students.student_code}</span>
                {s && (
                  <span className={`pill ${flagged ? "warn" : ""}`}>
                    {t("attendance.absencesOf", { n: s.absent, max: s.threshold })}
                    {flagged ? ` · ${t("attendance.atLimit")}` : ""}
                  </span>
                )}
              </div>
              <div className="seg" role="radiogroup" aria-label={fullName(e.students, lang)}>
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="radio"
                    aria-checked={r.status === st}
                    className={`seg-btn seg-${st}${r.status === st ? " on" : ""}`}
                    disabled={readOnly}
                    onClick={() => setStatus(e.id, st)}
                  >
                    {t(`attendance.status.${st}`)}
                  </button>
                ))}
              </div>
              {(r.status === "excused" || (r.note && r.status !== "present")) && (
                <input
                  type="text"
                  className="roll-note"
                  value={r.note}
                  maxLength={200}
                  disabled={readOnly}
                  placeholder={t(r.status === "excused" ? "attendance.noteRequired" : "attendance.noteOptional")}
                  aria-label={t("attendance.note")}
                  onChange={(ev) => setNote(e.id, ev.target.value)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <div className="panel approve-bar">
          <p>{dirty || !taken ? t("attendance.unsaved") : t("attendance.upToDate")}</p>
          <button type="button" className="btn-small" onClick={save} disabled={busy || (taken && !dirty)} aria-busy={busy}>
            {t("attendance.save")}
          </button>
        </div>
      )}
    </>
  );
}

// A status count that gives a small nudge when its number changes (not when the sheet first opens).
function CountPill({ tone, n, label }) {
  const nudge = useNudge(n);
  return <span key={nudge.key} className={`pill ${tone} ${nudge.className}`}>{label}: {n}</span>;
}

function ThresholdBox({ section, threshold, defaultThreshold, onChanged }) {
  const { t } = useLang();
  const notice = useNotice();
  const [value, setValue] = useState(String(section.absence_threshold ?? ""));
  const [busy, setBusy] = useState(false);

  async function apply(next) {
    notice.clear();
    setBusy(true);
    const { error } = await supabase.rpc("set_section_absence_threshold", { p_section: section.id, p_value: next });
    setBusy(false);
    if (error) return notice.fail(error, t("attendance.saveFailed", { detail: error.message }));
    notice.setNotice({ type: "ok", text: t("attendance.threshold.saved") });
    if (next === null) setValue("");
    onChanged();
  }
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 100;

  return (
    <details className="subpanel">
      <summary>{t("attendance.threshold.title", { n: threshold })}</summary>
      <p className="small muted">{t("attendance.threshold.help", { n: defaultThreshold })}</p>
      <Notice notice={notice.notice} />
      <div className="toolbar">
        <label>
          <span className="small muted">{t("attendance.threshold.label")}</span>
          <input className="narrow" type="number" min="1" max="100" value={value} placeholder={String(defaultThreshold)} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button type="button" className="btn-small" disabled={busy || !valid} onClick={() => apply(n)}>{t("attendance.threshold.save")}</button>
        <button type="button" className="btn-small secondary" disabled={busy || section.absence_threshold == null} onClick={() => apply(null)}>{t("attendance.threshold.reset")}</button>
      </div>
    </details>
  );
}
