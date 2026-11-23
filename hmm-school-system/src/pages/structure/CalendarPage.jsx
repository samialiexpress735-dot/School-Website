import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useLang } from "../../i18n/index.jsx";
import { useQuery, useNotice, Notice, LoadError, pick, Loading, useRowFlash } from "../../lib/ui.jsx";
import { can, STRUCTURE_EDITORS } from "../../lib/roles.js";
import EcDate from "../../components/EcDate.jsx";
import { useConfirm } from "../../components/Dialogs.jsx";

// All Monday-Friday dates from "from" to "to" (inclusive), as YYYY-MM-DD.
function weekdaysBetween(from, to) {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  while (d <= last) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export default function CalendarPage() {
  const confirm = useConfirm();
  const { t, lang } = useLang();
  const { profile } = useAuth();
  const editable = can(profile, STRUCTURE_EDITORS);
  const notice = useNotice();
  const [yearId, setYearId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState("holiday");
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");

  const years = useQuery(() => supabase.from("academic_years").select("id,label,is_current,year_ec").order("year_ec", { ascending: false }), []);
  useEffect(() => {
    if (years.data && !yearId) setYearId((years.data.find((y) => y.is_current) || years.data[0])?.id || "");
  }, [years.data, yearId]);

  const days = useQuery(
    () => (yearId ? supabase.from("school_calendar").select("*").eq("academic_year_id", yearId).order("calendar_date") : { data: [] }),
    [yearId]
  );
  const flash = useRowFlash(days.data, yearId);

  async function add(e) {
    e.preventDefault();
    notice.clear();
    const last = to || from;
    if (last < from) return notice.fail(null, t("calendar.badRange"));
    const dates = weekdaysBetween(from, last);
    if (dates.length === 0) return notice.fail(null, t("calendar.nothingToAdd"));
    if (dates.length > 60) return notice.fail(null, t("calendar.tooLong"));
    const rows = dates.map((d) => ({ academic_year_id: yearId, calendar_date: d, kind, name: name.trim(), name_am: nameAm.trim() || null }));
    const { error } = await supabase.from("school_calendar").upsert(rows, { onConflict: "academic_year_id,calendar_date" });
    if (error) return notice.fail(error);
    setFrom(""); setTo(""); setName(""); setNameAm("");
    notice.ok();
    days.reload();
  }

  async function remove(id) {
    if (!(await confirm({ title: t("dialog.deleteCalendar.title"), body: t("dialog.deleteCalendar.body"), confirmLabel: t("dialog.deleteCalendar.confirm"), tone: "danger" }))) return;
    const { error } = await supabase.from("school_calendar").delete().eq("id", id);
    error ? notice.fail(error) : (notice.ok(), days.reload());
  }

  if (years.loading) return <Loading />;
  if (years.error) return <LoadError />;

  return (
    <>
      <p className="muted">{t("calendar.intro")}</p>
      {!editable && <p className="muted">{t("common.readOnly")}</p>}
      <Notice notice={notice.notice} />

      <div className="panel">
        <label htmlFor="cy">{t("common.academicYear")}</label>
        <select id="cy" value={yearId} onChange={(e) => setYearId(e.target.value)}>
          {years.data.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
      </div>

      {editable && yearId && (
        <form className="panel formgrid" onSubmit={add}>
          <h2>{t("calendar.add")}</h2>
          <div>
            <label htmlFor="cf">{t("calendar.from")}</label>
            <input id="cf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            <EcDate value={from} />
          </div>
          <div>
            <label htmlFor="ct">{t("calendar.to")}</label>
            <input id="ct" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            <EcDate value={to} />
          </div>
          <div>
            <label htmlFor="ck">{t("calendar.kind")}</label>
            <select id="ck" value={kind} onChange={(e) => setKind(e.target.value)}>
              {["holiday", "exam", "break"].map((k) => <option key={k} value={k}>{t(`calendar.kinds.${k}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cn">{t("common.name")}</label>
            <input id="cn" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="cna">{t("common.nameAm")}</label>
            <input id="cna" value={nameAm} onChange={(e) => setNameAm(e.target.value)} lang="am" />
          </div>
          <div className="formgrid-action"><button type="submit" className="btn-small">{t("common.add")}</button></div>
          <p className="muted small full">{t("calendar.weekdaysOnly")}</p>
        </form>
      )}

      {days.error ? <LoadError /> : days.loading ? <Loading /> : days.data.length === 0 ? (
        <p>{t("calendar.none")}</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>{t("calendar.date")}</th><th>{t("calendar.kind")}</th><th>{t("common.name")}</th><th><span className="sr-only">{t("common.actions")}</span></th></tr>
            </thead>
            <tbody>
              {days.data.map((d) => (
                <tr key={d.id} className={flash(d.id)}>
                  <td>{d.calendar_date}<EcDate value={d.calendar_date} /></td>
                  <td>{t(`calendar.kinds.${d.kind}`)}</td>
                  <td>{pick(d, lang)}</td>
                  <td className="row-actions">
                    {editable && <button type="button" className="btn-small danger" onClick={() => remove(d.id)}>{t("common.delete")}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
