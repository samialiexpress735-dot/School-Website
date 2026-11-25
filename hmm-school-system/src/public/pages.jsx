import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePub } from "./i18n.jsx";
import { SITE_INFO, pick } from "./siteInfo.js";
import { getAnnouncements, getCalendar, getAcademics, sendApplication, sendContact } from "./api.js";
import { validateApplication, validateContact } from "./validate.js";
import { EC_MONTH_NAMES, ecMonthDays, formatEc } from "../lib/ethiopian.js";

// Loads something once and tells the page if it is loading, ready or failed.
function useLoad(fn) {
  const [s, setS] = useState({ state: "loading", data: null, error: null });
  useEffect(() => {
    let live = true;
    fn().then((data) => live && setS({ state: "ok", data, error: null }))
      .catch((error) => live && setS({ state: "error", data: null, error }));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

function Status({ s, children }) {
  const { t } = usePub();
  if (s.state === "loading") return <p className="pub-muted" role="status">{t("common.loading")}</p>;
  if (s.state === "error") return <p className="pub-note" role="alert">{s.error?.message === "not-configured" ? t("common.notReady") : t("common.failed")}</p>;
  return children(s.data);
}

const Field = ({ id, label, error, children, required }) => {
  const { t } = usePub();
  return (
    <div className="pub-field">
      <label htmlFor={id}>{label}{required ? <span className="pub-req"> *<span className="pub-sr"> {t("common.required")}</span></span> : null}</label>
      {children}
      {error ? <p className="pub-err" id={`${id}-err`}>{t(error)}</p> : null}
    </div>
  );
};

// Hidden field that only robots fill in. People never see it (see .pub-trap in the style sheet).
const Trap = ({ value, onChange }) => (
  <div className="pub-trap" aria-hidden="true">
    <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} /></label>
  </div>
);

export function HomePage() {
  const { t, lang } = usePub();
  const news = useLoad(getAnnouncements);
  return (
    <>
      <section className="pub-hero">
        <h1>{t("home.welcome")}</h1>
        <p>{t("home.intro")}</p>
      </section>
      <section className="pub-section" aria-labelledby="ann">
        <h2 id="ann">{t("home.announcements")}</h2>
        <Status s={news}>
          {(rows) => rows.length === 0 ? <p className="pub-muted">{t("home.noAnnouncements")}</p> : (
            <ul className="pub-list">
              {rows.map((a) => {
                const title = a[`title_${lang}`] || a.title_en || a.title_am;
                const body = a[`body_${lang}`] || a.body_en || a.body_am;
                return (
                  <li key={a.id} className="pub-card">
                    <h3>{title}</h3>
                    {body ? <p>{body}</p> : null}
                    {a.ends_on ? <p className="pub-muted">{t("home.until", { date: formatEc(a.ends_on, lang) })}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Status>
      </section>
      <section className="pub-section pub-cards">
        {[["academics", "cardAcademics"], ["admissions", "cardAdmissions"], ["contact", "cardContact"]].map(([to, k]) => (
          <Link key={to} className="pub-card pub-link-card" to={`/${lang}/${to}`}>
            <h3>{t(`home.${k}`)}</h3>
            <p>{t(`home.${k}Text`)}</p>
          </Link>
        ))}
      </section>
    </>
  );
}

export function AboutPage() {
  const { t, lang } = usePub();
  const block = (key, titleKey) => (
    <section className="pub-section">
      <h2>{t(titleKey)}</h2>
      <p>{pick(SITE_INFO.about[key], lang) || <span className="pub-muted">{t("about.soon")}</span>}</p>
    </section>
  );
  return (
    <>
      <h1>{t("about.title")}</h1>
      <p className="pub-lead">{t("about.intro")}</p>
      {block("history", "about.history")}
      {block("mission", "about.mission")}
      {block("directorMessage", "about.director")}
      {(pick(SITE_INFO.address, lang) || SITE_INFO.mapUrl) && (
        <section className="pub-section">
          <h2>{t("about.find")}</h2>
          {pick(SITE_INFO.address, lang) ? <p>{pick(SITE_INFO.address, lang)}</p> : null}
          {SITE_INFO.mapUrl ? <p><a href={SITE_INFO.mapUrl} target="_blank" rel="noopener noreferrer">{t("about.openMap")}</a></p> : null}
        </section>
      )}
    </>
  );
}

function Calendar({ cal }) {
  const { t, lang } = usePub();
  if (!cal) return <p className="pub-muted">{t("academics.noCalendar")}</p>;
  return (
    <>
      <p className="pub-muted">{t("academics.year", { year: cal.year_label })}</p>
      <ul className="pub-list">
        {cal.semesters.filter((s) => s.start_date && s.end_date).map((s) => (
          <li key={s.number} className="pub-row">
            <strong>{t("academics.semester", { n: s.number })}</strong>
            <span>{formatEc(s.start_date, lang)} {t("academics.to")} {formatEc(s.end_date, lang)}</span>
          </li>
        ))}
      </ul>
      {cal.events.length > 0 && (
        <>
          <h3>{t("academics.days")}</h3>
          <ul className="pub-list">
            {cal.events.map((e) => (
              <li key={e.date} className="pub-row">
                <span>{formatEc(e.date, lang)}</span>
                <span>{(lang === "am" && e.name_am) || e.name} <em className="pub-tag">{t(`academics.kind.${e.kind}`)}</em></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function AcademicsPage() {
  const { t, lang } = usePub();
  const acad = useLoad(getAcademics);
  const cal = useLoad(getCalendar);
  const nm = (o) => (lang === "am" && o.name_am) || o.name;
  return (
    <>
      <h1>{t("academics.title")}</h1>
      <Status s={acad}>
        {(a) => (
          <>
            <section className="pub-section">
              <h2>{t("academics.grades")}</h2>
              <p>{t("academics.gradesText")}</p>
              <p className="pub-chips">{a.grades.map((g) => <span key={g.number} className="pub-chip">{nm(g)}</span>)}</p>
              {a.streams.length > 0 && (
                <>
                  <h3>{t("academics.streams")}</h3>
                  <p className="pub-chips">{a.streams.map((s) => <span key={s.code} className="pub-chip">{nm(s)}</span>)}</p>
                </>
              )}
            </section>
            <section className="pub-section">
              <h2>{t("academics.subjects")}</h2>
              {a.subjects.length === 0 ? <p className="pub-muted">{t("academics.noSubjects")}</p> : a.grades.map((g) => {
                const rows = a.subjects.filter((s) => s.grade === g.number);
                if (rows.length === 0) return null;
                const groups = [...new Set(rows.map((r) => r.stream || ""))];
                return (
                  <details key={g.number} className="pub-details">
                    <summary>{t("academics.subjectsFor", { n: g.number })}</summary>
                    {groups.map((code) => {
                      const st = a.streams.find((s) => s.code === code);
                      return (
                        <div key={code}>
                          {groups.length > 1 ? <h4>{code ? t("academics.stream", { name: nm(st || { name: code }) }) : t("academics.allStreams")}</h4> : null}
                          <ul className="pub-plain">{rows.filter((r) => (r.stream || "") === code).map((r) => <li key={r.name}>{nm(r)}</li>)}</ul>
                        </div>
                      );
                    })}
                  </details>
                );
              })}
            </section>
          </>
        )}
      </Status>
      <section className="pub-section">
        <h2>{t("academics.calendar")}</h2>
        <Status s={cal}>{(c) => <Calendar cal={c} />}</Status>
      </section>
    </>
  );
}

const emptyApp = { childName: "", dob: { d: "", m: "", y: "" }, grade: "", previousSchool: "", guardianName: "", phone: "", trap: "" };

export function AdmissionsPage() {
  const { t, lang } = usePub();
  const [f, setF] = useState(emptyApp);
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("form"); // form | sending | done | fail | limit
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setDob = (k) => (e) => setF((p) => ({ ...p, dob: { ...p.dob, [k]: e.target.value } }));
  const months = EC_MONTH_NAMES[lang === "am" ? "am" : "en"];
  const maxDay = f.dob.m ? ecMonthDays(Number(f.dob.y) > 0 ? Number(f.dob.y) : 2003, Number(f.dob.m)) || 30 : 30;

  async function submit(e) {
    e.preventDefault();
    const { errors: errs, args } = validateApplication(f);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPhase("sending");
    try { await sendApplication(args); setPhase("done"); setF(emptyApp); }
    catch (err) { setPhase(/too many/i.test(err?.message || "") ? "limit" : "fail"); }
  }

  const info = (key, titleKey) => (
    <section className="pub-section">
      <h2>{t(titleKey)}</h2>
      <p>{pick(SITE_INFO.admissions[key], lang) || <span className="pub-muted">{t("admissions.ask")}</span>}</p>
    </section>
  );

  return (
    <>
      <h1>{t("admissions.title")}</h1>
      <p className="pub-lead">{t("admissions.intro")}</p>
      {info("requirements", "admissions.requirements")}
      {info("dates", "admissions.dates")}
      {info("fees", "admissions.fees")}
      <section className="pub-section" aria-labelledby="appform">
        <h2 id="appform">{t("admissions.form")}</h2>
        {phase === "done" ? (
          <div className="pub-ok" role="status">
            <p>{t("admissions.thanks")}</p>
            <button type="button" className="pub-btn pub-btn-quiet" onClick={() => setPhase("form")}>{t("admissions.another")}</button>
          </div>
        ) : (
          <form className="pub-form" onSubmit={submit} noValidate>
            <Field id="a-name" label={t("admissions.childName")} error={errors.childName} required>
              <input id="a-name" value={f.childName} onChange={set("childName")} maxLength={120} autoComplete="off" aria-describedby={errors.childName ? "a-name-err" : undefined} />
            </Field>
            <fieldset className="pub-fieldset">
              <legend>{t("admissions.dob")} <span className="pub-req">*</span></legend>
              <div className="pub-dob">
                <div><label htmlFor="a-d">{t("admissions.day")}</label>
                  <select id="a-d" value={f.dob.d} onChange={setDob("d")}><option value="">—</option>{Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
                <div><label htmlFor="a-m">{t("admissions.month")}</label>
                  <select id="a-m" value={f.dob.m} onChange={setDob("m")}><option value="">—</option>{months.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></div>
                <div><label htmlFor="a-y">{t("admissions.year")}</label>
                  <input id="a-y" type="number" inputMode="numeric" min="1980" max="2100" value={f.dob.y} onChange={setDob("y")} /></div>
              </div>
              {errors.dob ? <p className="pub-err">{t(errors.dob)}</p> : null}
            </fieldset>
            <Field id="a-grade" label={t("admissions.gradeApplied")} error={errors.grade} required>
              <select id="a-grade" value={f.grade} onChange={set("grade")}><option value="">—</option>{[9, 10, 11, 12].map((g) => <option key={g} value={g}>{t("common.grade", { n: g })}</option>)}</select>
            </Field>
            <Field id="a-prev" label={t("admissions.previousSchool")} error={errors.previousSchool}>
              <input id="a-prev" value={f.previousSchool} onChange={set("previousSchool")} maxLength={160} />
            </Field>
            <Field id="a-guardian" label={t("admissions.guardianName")} error={errors.guardianName} required>
              <input id="a-guardian" value={f.guardianName} onChange={set("guardianName")} maxLength={120} autoComplete="name" />
            </Field>
            <Field id="a-phone" label={t("admissions.phone")} error={errors.phone} required>
              <input id="a-phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} maxLength={20} autoComplete="tel" />
            </Field>
            <Trap value={f.trap} onChange={(v) => setF((p) => ({ ...p, trap: v }))} />
            <p className="pub-muted">{t("admissions.privacy")}</p>
            {phase === "fail" ? <p className="pub-err" role="alert">{t("admissions.errorSend")}</p> : null}
            {phase === "limit" ? <p className="pub-err" role="alert">{t("admissions.limit")}</p> : null}
            <button type="submit" className="pub-btn" disabled={phase === "sending"}>{phase === "sending" ? t("common.sending") : t("common.send")}</button>
          </form>
        )}
      </section>
    </>
  );
}

const emptyMsg = { name: "", contact: "", message: "", trap: "" };

export function ContactPage() {
  const { t, lang } = usePub();
  const [f, setF] = useState(emptyMsg);
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("form");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const { errors: errs, args } = validateContact(f);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPhase("sending");
    try { await sendContact(args); setPhase("done"); setF(emptyMsg); }
    catch (err) { setPhase(/too many/i.test(err?.message || "") ? "limit" : "fail"); }
  }

  const rows = [
    ["phone", SITE_INFO.phone ? <a href={`tel:${SITE_INFO.phone.replace(/\s/g, "")}`}>{SITE_INFO.phone}</a> : null],
    ["email", SITE_INFO.email ? <a href={`mailto:${SITE_INFO.email}`}>{SITE_INFO.email}</a> : null],
    ["address", pick(SITE_INFO.address, lang)],
    ["hours", pick(SITE_INFO.officeHours, lang)],
  ].filter(([, v]) => v);

  return (
    <>
      <h1>{t("contact.title")}</h1>
      <p className="pub-lead">{t("contact.intro")}</p>
      {rows.length > 0 && (
        <dl className="pub-dl">{rows.map(([k, v]) => <div key={k}><dt>{t(`contact.${k}`)}</dt><dd>{v}</dd></div>)}</dl>
      )}
      <section className="pub-section" aria-labelledby="msgform">
        <h2 id="msgform">{t("contact.form")}</h2>
        {phase === "done" ? (
          <div className="pub-ok" role="status"><p>{t("contact.thanks")}</p></div>
        ) : (
          <form className="pub-form" onSubmit={submit} noValidate>
            <Field id="c-name" label={t("contact.name")} error={errors.name} required>
              <input id="c-name" value={f.name} onChange={set("name")} maxLength={120} autoComplete="name" />
            </Field>
            <Field id="c-how" label={t("contact.how")} error={errors.contact} required>
              <input id="c-how" value={f.contact} onChange={set("contact")} maxLength={120} autoComplete="email" />
            </Field>
            <Field id="c-msg" label={t("contact.message")} error={errors.message} required>
              <textarea id="c-msg" rows={6} value={f.message} onChange={set("message")} maxLength={2000} />
            </Field>
            <Trap value={f.trap} onChange={(v) => setF((p) => ({ ...p, trap: v }))} />
            {phase === "fail" ? <p className="pub-err" role="alert">{t("contact.errorSend")}</p> : null}
            {phase === "limit" ? <p className="pub-err" role="alert">{t("contact.limit")}</p> : null}
            <button type="submit" className="pub-btn" disabled={phase === "sending"}>{phase === "sending" ? t("common.sending") : t("common.send")}</button>
          </form>
        )}
      </section>
    </>
  );
}
