import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, Loading, LoadError, pick, fullName } from "../../lib/ui.jsx";
import { can, REGISTRARS } from "../../lib/roles.js";
import { downloadExport } from "../../lib/exporter.js";
import { looksLikeStudentCode, isValidStudentCode } from "../../lib/studentCode.js";

const PAGE = 50;
// characters that would break a PostgREST filter
const safe = (s) => s.replace(/[,()%*\\]/g, " ").trim();

export default function StudentListPage() {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const writer = can(profile, REGISTRARS);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [yearId, setYearId] = useState("");      // "" = current year (set after load), "all" = all years
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [sectionId, setSectionId] = useState(""); // "none" = not placed
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => { setQ(safe(search)); setPage(0); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const ref = useQuery(async () => {
    const [y, g, s, sec] = await Promise.all([
      supabase.from("academic_years").select("id,label,is_current,year_ec").order("year_ec", { ascending: false }),
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*").order("code"),
      supabase.from("sections").select("id,name,shift,grade_id,academic_year_id"),
    ]);
    const bad = [y, g, s, sec].find((r) => r.error);
    return bad || { data: { years: y.data, grades: g.data, streams: s.data, sections: sec.data } };
  }, []);

  useEffect(() => {
    if (ref.data && !yearId) setYearId((ref.data.years.find((y) => y.is_current) || ref.data.years[0])?.id || "all");
  }, [ref.data]); // eslint-disable-line

  // the filters of the toolbar, used by the list and by the Excel export so both show the same students
  function filtered(select, countOpt) {
    const byYear = yearId !== "all";
    let query = supabase.from("students").select(select(byYear), countOpt);
    if (byYear) {
      query = query.eq("enrollments.academic_year_id", yearId);
      if (gradeId) query = query.eq("enrollments.grade_id", gradeId);
      if (streamId) query = query.eq("enrollments.stream_id", streamId);
      if (sectionId === "none") query = query.is("enrollments.section_id", null);
      else if (sectionId) query = query.eq("enrollments.section_id", sectionId);
    }
    if (status) query = query.eq("status", status);
    for (const token of q.split(/\s+/).filter(Boolean)) {
      query = query.or(
        ["student_code", "first_name", "father_name", "grandfather_name", "first_name_am", "father_name_am", "grandfather_name_am"]
          .map((c) => `${c}.ilike.%${token}%`).join(",")
      );
    }
    return query;
  }

  const list = useQuery(async () => {
    if (!yearId) return { data: { rows: [], count: 0 } };
    const query = filtered((byYear) => (byYear
      ? "*, enrollments!inner(id, grade_id, section_id, stream_id, status, academic_year_id, sections(name, shift))"
      : "*, enrollments(id, grade_id, section_id, stream_id, status, academic_year_id, sections(name, shift), academic_years(year_ec))"), { count: "exact" });
    const { data, error, count } = await query.order("first_name").order("father_name").range(page * PAGE, page * PAGE + PAGE - 1);
    return error ? { error } : { data: { rows: data, count: count ?? data.length } };
  }, [yearId, gradeId, streamId, sectionId, status, q, page]);

  if (ref.loading || !yearId) return <Loading />;
  if (ref.error) return <LoadError />;
  const { years, grades, streams, sections } = ref.data;

  const sectionChoices = sections.filter((s) => s.academic_year_id === yearId && (!gradeId || s.grade_id === gradeId));
  const badId = looksLikeStudentCode(search) && !isValidStudentCode(search);
  const total = list.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const enrollmentOf = (s) => {
    const list2 = [...(s.enrollments || [])];
    if (yearId === "all") list2.sort((a, b) => (b.academic_years?.year_ec || 0) - (a.academic_years?.year_ec || 0));
    return list2[0] || null;
  };

  // every student that matches the toolbar filters (not just the 50 on this page), with the main guardian
  async function exportFile(format) {
    setExporting(true); setExportFailed(false);
    try {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await filtered((byYear) => (byYear
          ? "*, enrollments!inner(grade_id, stream_id, status, academic_year_id, sections(name, shift)), student_guardians(relationship, is_primary, guardians(full_name, phone))"
          : "*, enrollments(grade_id, stream_id, status, academic_year_id, sections(name, shift), academic_years(year_ec)), student_guardians(relationship, is_primary, guardians(full_name, phone))"))
          .order("first_name").order("father_name").order("student_code").range(from, from + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      const guardianOf = (s) => { const g = [...(s.student_guardians || [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0]; return g ? { ...g.guardians, relationship: g.relationship } : {}; };
      const gradeNo = (s) => grades.find((x) => x.id === enrollmentOf(s)?.grade_id)?.number;
      const streamOf = (s) => { const st = streams.find((x) => x.id === enrollmentOf(s)?.stream_id); return st && st.code !== "general" ? pick(st, lang) : ""; };
      const col = (label, get, width) => ({ label, get, width });
      await downloadExport("students", {
        sheetName: t("students.title"),
        rows: all,
        columns: [
          col(t("students.list.id"), (s) => s.student_code, 14),
          col(t("export.cols.firstName"), (s) => s.first_name), col(t("export.cols.fatherName"), (s) => s.father_name), col(t("export.cols.grandfatherName"), (s) => s.grandfather_name),
          col(t("export.cols.firstNameAm"), (s) => s.first_name_am), col(t("export.cols.fatherNameAm"), (s) => s.father_name_am), col(t("export.cols.grandfatherNameAm"), (s) => s.grandfather_name_am),
          col(t("students.wizard.sex"), (s) => t(`students.sexes.${s.sex}`), 10),
          col(t("export.cols.dobEc"), (s) => s.date_of_birth_ec, 14), col(t("export.cols.dob"), (s) => s.date_of_birth, 14),
          col(t("students.list.grade"), gradeNo, 8), col(t("common.stream"), streamOf, 14),
          col(t("students.list.section"), (s) => enrollmentOf(s)?.sections?.name, 10),
          col(t("export.cols.shift"), (s) => { const sh = enrollmentOf(s)?.sections?.shift; return sh ? t(`sections.shifts.${sh}`) : ""; }, 12),
          col(t("export.cols.enrollStatus"), (s) => { const e = enrollmentOf(s); return e ? t(`students.enrollStatuses.${e.status}`) : ""; }, 14),
          col(t("common.status"), (s) => t(`students.statuses.${s.status}`), 14),
          col(t("export.cols.phone"), (s) => s.phone, 16),
          col(t("export.cols.region"), (s) => s.region), col(t("export.cols.zone"), (s) => s.zone), col(t("export.cols.woreda"), (s) => s.woreda), col(t("export.cols.kebele"), (s) => s.kebele, 10),
          col(t("export.cols.guardian"), (s) => guardianOf(s).full_name, 22), col(t("export.cols.guardianRelationship"), (s) => guardianOf(s).relationship, 14), col(t("export.cols.guardianPhone"), (s) => guardianOf(s).phone, 16),
          col(t("export.cols.previousSchool"), (s) => s.previous_school, 24),
        ],
      }, format);
    } catch { setExportFailed(true); }
    setExporting(false);
  }

  return (
    <>
      <div className="toolbar">
        <input type="search" aria-label={t("students.list.search")} placeholder={t("students.list.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t("common.academicYear")} value={yearId} onChange={(e) => { setYearId(e.target.value); setSectionId(""); setPage(0); }}>
          {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
          <option value="all">{t("students.list.allYears")}</option>
        </select>
        {yearId !== "all" && (
          <>
            <select aria-label={t("common.grade")} value={gradeId} onChange={(e) => { setGradeId(e.target.value); setSectionId(""); setPage(0); }}>
              <option value="">{t("students.list.allGrades")}</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{pick(g, lang)}</option>)}
            </select>
            <select aria-label={t("common.stream")} value={streamId} onChange={(e) => { setStreamId(e.target.value); setPage(0); }}>
              <option value="">{t("students.list.allStreams")}</option>
              {streams.map((s) => <option key={s.id} value={s.id}>{pick(s, lang)}</option>)}
            </select>
            <select aria-label={t("students.list.section")} value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(0); }}>
              <option value="">{t("students.list.allSections")}</option>
              <option value="none">{t("students.list.notPlaced")}</option>
              {sectionChoices.map((s) => <option key={s.id} value={s.id}>{pick(grades.find((g) => g.id === s.grade_id), lang)} · {s.name} · {t(`sections.shifts.${s.shift}`)}</option>)}
            </select>
          </>
        )}
        <select aria-label={t("common.status")} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">{t("students.list.allStatuses")}</option>
          {["active", "transferred_out", "withdrawn", "graduated"].map((k) => <option key={k} value={k}>{t(`students.statuses.${k}`)}</option>)}
        </select>
        {writer && <Link className="btn-small linkbtn" to={`/${lang}/students/new`}>{t("students.tabs.register")}</Link>}
        <button type="button" className="btn-small secondary" disabled={exporting || total === 0} aria-busy={exporting} onClick={() => exportFile("xlsx")}>{exporting ? t("export.working") : t("export.button")}</button>
        <button type="button" className="btn-small secondary" disabled={exporting || total === 0} onClick={() => exportFile("csv")}>{t("export.csv")}</button>
      </div>
      {exportFailed && <p className="flash error" role="alert">{t("export.failed")}</p>}
      {badId && <p className="flash warn" role="status">{t("students.list.badId")}</p>}

      {list.loading ? <Loading shape="table" rows={8} /> : list.error ? <LoadError /> : list.data.rows.length === 0 ? (
        <div className="empty">
          <p>{q || gradeId || sectionId || status ? t("students.list.empty") : t("students.list.emptyFirst")}</p>
          {writer && !q && <Link className="btn-small linkbtn" to={`/${lang}/students/new`}>{t("students.tabs.register")}</Link>}
        </div>
      ) : (
        <>
          <p className="muted small" aria-live="polite">{t("students.list.count", { n: total })}</p>
          <div className="tablewrap">
            <table className="stack">
              <thead>
                <tr>
                  <th>{t("students.list.id")}</th><th>{t("students.list.name")}</th><th>{t("students.wizard.sex")}</th>
                  <th>{t("students.list.grade")}</th><th>{t("students.list.section")}</th><th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.rows.map((s) => {
                  const e = enrollmentOf(s);
                  const g = grades.find((x) => x.id === e?.grade_id);
                  const st = streams.find((x) => x.id === e?.stream_id);
                  return (
                    <tr key={s.id}>
                      <td data-label={t("students.list.id")}><code>{s.student_code}</code></td>
                      <th scope="row" data-label={t("students.list.name")}><Link to={`/${lang}/students/${s.id}`}>{fullName(s, lang)}</Link></th>
                      <td data-label={t("students.wizard.sex")}>{t(`students.sexes.${s.sex}`)}</td>
                      <td data-label={t("students.list.grade")}>{g ? `${pick(g, lang)}${st && st.code !== "general" ? ` · ${pick(st, lang)}` : ""}` : <span className="muted">{t("students.list.notEnrolled")}</span>}</td>
                      <td data-label={t("students.list.section")}>{e ? (e.sections ? `${e.sections.name} · ${t(`sections.shifts.${e.sections.shift}`)}` : <span className="muted">{t("students.list.notPlaced")}</span>) : "—"}</td>
                      <td data-label={t("common.status")}><span className={`pill${s.status === "active" ? "" : " warn"}`}>{t(`students.statuses.${s.status}`)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="pager">
              <button type="button" className="btn-small secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("students.list.prev")}</button>
              <span>{t("students.list.page", { p: page + 1, n: pages })}</span>
              <button type="button" className="btn-small secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{t("students.list.next")}</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
