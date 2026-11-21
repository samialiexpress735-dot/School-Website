import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError } from "../../lib/ui.jsx";
import { can, STRUCTURE_EDITORS } from "../../lib/roles.js";
import EcDate from "../../components/EcDate.jsx";

function SemesterRow({ sem, editable, onDone, notice }) {
  const { t } = useLang();
  const [start, setStart] = useState(sem.start_date || "");
  const [end, setEnd] = useState(sem.end_date || "");

  async function save() {
    if (start && end && end < start) return notice.fail(null, t("years.invalidDates"));
    const { error } = await supabase.from("semesters").update({ start_date: start || null, end_date: end || null }).eq("id", sem.id);
    error ? notice.fail(error) : (notice.ok(), onDone());
  }
  async function toggleLock() {
    const { error } = await supabase.from("semesters").update({ is_locked: !sem.is_locked }).eq("id", sem.id);
    error ? notice.fail(error) : (notice.ok(), onDone());
  }

  return (
    <tr>
      <th scope="row">
        {t("years.semester", { n: sem.number })} {sem.is_locked && <span className="pill">{t("common.locked")}</span>}
      </th>
      <td>
        <input type="date" aria-label={t("common.start")} value={start} onChange={(e) => setStart(e.target.value)} disabled={!editable} />
        <EcDate value={start} />
      </td>
      <td>
        <input type="date" aria-label={t("common.end")} value={end} onChange={(e) => setEnd(e.target.value)} disabled={!editable} />
        <EcDate value={end} />
      </td>
      <td className="row-actions">
        {editable && (
          <>
            <button type="button" className="btn-small" onClick={save}>{t("common.save")}</button>
            <button type="button" className="btn-small secondary" onClick={toggleLock}>
              {sem.is_locked ? t("years.unlock") : t("years.lock")}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

export default function YearsPage() {
  const { t } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, STRUCTURE_EDITORS);
  const notice = useNotice();
  const [yearEc, setYearEc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, error, loading, reload } = useQuery(async () => {
    const [y, s] = await Promise.all([
      supabase.from("academic_years").select("*").order("year_ec", { ascending: false }),
      supabase.from("semesters").select("*").order("number"),
    ]);
    if (y.error) return y;
    if (s.error) return s;
    return { data: { years: y.data, semesters: s.data } };
  }, []);

  async function addYear(e) {
    e.preventDefault();
    notice.clear();
    const n = Number(yearEc);
    if (!Number.isInteger(n) || n < 1990 || n > 2100) return notice.fail(null, t("years.invalidYear"));
    if (startDate && endDate && endDate < startDate) return notice.fail(null, t("years.invalidDates"));
    const { data: created, error: err } = await supabase
      .from("academic_years")
      .insert({ year_ec: n, label: `${n} E.C.`, gc_start_year: n + 7, start_date: startDate || null, end_date: endDate || null })
      .select("id")
      .single();
    if (err) return notice.fail(err);
    const { error: err2 } = await supabase.from("semesters").insert([
      { academic_year_id: created.id, number: 1 },
      { academic_year_id: created.id, number: 2 },
    ]);
    if (err2) return notice.fail(err2);
    setYearEc(""); setStartDate(""); setEndDate("");
    notice.ok();
    reload();
  }

  async function run(promise) {
    const { error: err } = await promise;
    err ? notice.fail(err) : (notice.ok(), reload());
  }
  const setCurrent = (id) => run(supabase.rpc("set_current_year", { p_year: id }));
  const toggleClosed = (y) => {
    if (!y.is_closed && !window.confirm(t("years.confirmClose"))) return;
    run(supabase.from("academic_years").update({ is_closed: !y.is_closed }).eq("id", y.id));
  };

  if (loading) return <p>{t("common.loading")}</p>;
  if (error) return <LoadError />;

  return (
    <>
      {!editable && <p className="muted">{t("common.readOnly")}</p>}
      <Notice notice={notice.notice} />

      {editable && (
        <form className="panel formgrid" onSubmit={addYear}>
          <h2>{t("years.add")}</h2>
          <div>
            <label htmlFor="yearEc">{t("years.yearEc")}</label>
            <input id="yearEc" type="number" inputMode="numeric" value={yearEc} onChange={(e) => setYearEc(e.target.value)} placeholder={t("years.yearEcHelp")} required />
          </div>
          <div>
            <label htmlFor="ystart">{t("common.start")}</label>
            <input id="ystart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <EcDate value={startDate} />
          </div>
          <div>
            <label htmlFor="yend">{t("common.end")}</label>
            <input id="yend" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <EcDate value={endDate} />
          </div>
          <div className="formgrid-action"><button type="submit" className="btn-small">{t("common.add")}</button></div>
          <p className="muted small full">{t("years.dateNote")}</p>
        </form>
      )}

      {data.years.length === 0 && <p>{t("common.noData")}</p>}
      {data.years.map((y) => (
        <section key={y.id} className="panel">
          <div className="panel-head">
            <h2>
              {y.label} {y.is_current && <span className="pill gold">{t("common.current")}</span>}{" "}
              {y.is_closed && <span className="pill">{t("common.closed")}</span>}
            </h2>
            {editable && (
              <div className="row-actions">
                {!y.is_current && <button type="button" className="btn-small" onClick={() => setCurrent(y.id)}>{t("years.setCurrent")}</button>}
                <button type="button" className="btn-small secondary" onClick={() => toggleClosed(y)}>
                  {y.is_closed ? t("years.reopen") : t("years.close")}
                </button>
              </div>
            )}
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th></th><th>{t("common.start")}</th><th>{t("common.end")}</th><th><span className="sr-only">{t("common.actions")}</span></th></tr>
              </thead>
              <tbody>
                {data.semesters.filter((s) => s.academic_year_id === y.id).map((s) => (
                  <SemesterRow key={`${s.id}-${s.start_date}-${s.end_date}-${s.is_locked}`} sem={s} editable={editable} onDone={reload} notice={notice} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
