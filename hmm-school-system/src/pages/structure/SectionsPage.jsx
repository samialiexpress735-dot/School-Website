import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, pick, fullName, Loading } from "../../lib/ui.jsx";
import { can, SECTION_EDITORS } from "../../lib/roles.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB ... so there is no fixed limit on the number of sections.
function sectionName(index) {
  let n = index;
  let out = "";
  do {
    out = LETTERS[n % 26] + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
const byName = (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name);
const MANY = 30; // only a "did you mean this?" question above this number, never a limit

export default function SectionsPage() {
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, SECTION_EDITORS);
  const notice = useNotice();
  const [yearId, setYearId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [shift, setShift] = useState("morning");
  const [count, setCount] = useState(1);
  const [capacity, setCapacity] = useState("");

  const ref = useQuery(async () => {
    const [y, g, s, st] = await Promise.all([
      supabase.from("academic_years").select("id,label,is_current,year_ec").order("year_ec", { ascending: false }),
      supabase.from("grades").select("*").order("number"),
      supabase.from("streams").select("*").order("code"),
      supabase.from("staff").select("id,first_name,father_name,grandfather_name,first_name_am,father_name_am,grandfather_name_am"),
    ]);
    const bad = [y, g, s, st].find((r) => r.error);
    if (bad) return bad;
    return { data: { years: y.data, grades: g.data, streams: s.data, staff: st.data } };
  }, []);

  useEffect(() => {
    if (ref.data && !yearId) setYearId((ref.data.years.find((y) => y.is_current) || ref.data.years[0])?.id || "");
  }, [ref.data, yearId]);

  const sections = useQuery(
    () => (yearId ? supabase.from("sections").select("*").eq("academic_year_id", yearId) : { data: [] }),
    [yearId]
  );

  if (ref.loading) return <Loading />;
  if (ref.error) return <LoadError />;

  const { years, grades, streams, staff } = ref.data;
  const grade = grades.find((g) => g.id === gradeId) || grades[0];
  const streamOptions = grade ? streams.filter((s) => (grade.number <= 10 ? s.code === "general" : s.code !== "general")) : [];
  const stream = streamOptions.find((s) => s.id === streamId) || streamOptions[0];

  async function add(e) {
    e.preventDefault();
    notice.clear();
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) return notice.fail(null, t("sections.invalidCount"));
    if (n > MANY && !window.confirm(t("sections.manyConfirm", { n }))) return;
    const used = new Set(
      (sections.data || []).filter((s) => s.grade_id === grade.id && s.stream_id === stream.id && s.shift === shift).map((s) => s.name)
    );
    const names = [];
    for (let i = 0; names.length < n; i += 1) {
      const name = sectionName(i);
      if (!used.has(name)) names.push(name);
    }
    const rows = names.map((name) => ({
      academic_year_id: yearId, grade_id: grade.id, stream_id: stream.id, shift, name, capacity: Number(capacity) || null,
    }));
    const { error } = await supabase.from("sections").insert(rows);
    error ? notice.fail(error) : (notice.ok(), sections.reload());
  }

  async function saveCapacity(id, value) {
    const n = value === "" ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < 1)) return;
    const { error } = await supabase.from("sections").update({ capacity: n }).eq("id", id);
    error ? notice.fail(error) : notice.ok();
  }

  async function remove(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    const { error } = await supabase.from("sections").delete().eq("id", id);
    if (error) return notice.fail(error, error.message?.includes("has students") ? t("sections.blocked") : undefined);
    notice.ok();
    sections.reload();
  }

  const gradeNo = (id) => grades.find((g) => g.id === id)?.number ?? 0;
  const sorted = [...(sections.data || [])].sort(
    (a, b) => gradeNo(a.grade_id) - gradeNo(b.grade_id) || (a.stream_id || "").localeCompare(b.stream_id || "") || a.shift.localeCompare(b.shift) || byName(a, b)
  );

  return (
    <>
      {!editable && <p className="muted">{t("common.readOnly")}</p>}
      <Notice notice={notice.notice} />

      <div className="panel">
        <label htmlFor="sy">{t("common.academicYear")}</label>
        <select id="sy" value={yearId} onChange={(e) => setYearId(e.target.value)}>
          {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
      </div>

      {editable && yearId && (
        <form className="panel formgrid" onSubmit={add}>
          <h2>{t("sections.add")}</h2>
          <div>
            <label htmlFor="sg">{t("common.grade")}</label>
            <select id="sg" value={grade?.id || ""} onChange={(e) => { setGradeId(e.target.value); setStreamId(""); }}>
              {grades.map((g) => <option key={g.id} value={g.id}>{pick(g, lang)}</option>)}
            </select>
          </div>
          {streamOptions.length > 1 && (
            <div>
              <label htmlFor="ss">{t("common.stream")}</label>
              <select id="ss" value={stream?.id || ""} onChange={(e) => setStreamId(e.target.value)}>
                {streamOptions.map((s) => <option key={s.id} value={s.id}>{pick(s, lang)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="sh">{t("sections.shift")}</label>
            <select id="sh" value={shift} onChange={(e) => setShift(e.target.value)}>
              {["morning", "afternoon"].map((s) => <option key={s} value={s}>{t(`sections.shifts.${s}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sc">{t("sections.count")}</label>
            <input id="sc" type="number" min="1" step="1" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="scap">{t("sections.capacityOptional")}</label>
            <input id="scap" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
          <div className="formgrid-action"><button type="submit" className="btn-small">{t("common.add")}</button></div>
          <p className="muted small full">{t("sections.naming")}</p>
        </form>
      )}

      {sections.error ? <LoadError /> : sections.loading ? <Loading /> : sorted.length === 0 ? <p>{t("common.noData")}</p> : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.grade")}</th><th>{t("common.stream")}</th><th>{t("sections.shift")}</th><th>{t("sections.section")}</th>
                <th>{t("sections.capacity")}</th><th>{t("sections.homeroom")}</th><th><span className="sr-only">{t("common.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id}>
                  <td>{pick(grades.find((g) => g.id === s.grade_id), lang)}</td>
                  <td>{pick(streams.find((x) => x.id === s.stream_id), lang)}</td>
                  <td>{t(`sections.shifts.${s.shift}`)}</td>
                  <th scope="row">{s.name}</th>
                  <td><input type="number" min="1" className="narrow" aria-label={t("sections.capacity")} defaultValue={s.capacity ?? ""} disabled={!editable} onBlur={(e) => saveCapacity(s.id, e.target.value)} /></td>
                  <td>{fullName(staff.find((x) => x.id === s.homeroom_staff_id), lang) || <span className="muted">—</span>}</td>
                  <td className="row-actions">{editable && <button type="button" className="btn-small danger" onClick={() => remove(s.id)}>{t("common.delete")}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
