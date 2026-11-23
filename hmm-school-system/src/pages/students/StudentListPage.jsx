import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, Loading, LoadError, pick, fullName } from "../../lib/ui.jsx";
import { can, REGISTRARS } from "../../lib/roles.js";
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

  const list = useQuery(async () => {
    if (!yearId) return { data: { rows: [], count: 0 } };
    const byYear = yearId !== "all";
    let query = supabase
      .from("students")
      .select(
        byYear
          ? "*, enrollments!inner(id, grade_id, section_id, stream_id, status, academic_year_id, sections(name, shift))"
          : "*, enrollments(id, grade_id, section_id, stream_id, status, academic_year_id, sections(name, shift), academic_years(year_ec))",
        { count: "exact" }
      );
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
      </div>
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
