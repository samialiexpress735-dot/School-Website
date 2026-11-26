import { useEffect, useState } from "react";
import { useLang } from "../i18n/index.jsx";
import { EC_MONTH_NAMES, ecMonthDays } from "../lib/ethiopian.js";
import { partsOf, readEcParts } from "../lib/ecDateParts.js";

// A date typed in the Ethiopian calendar (day, month with Pagume, year). The value that goes in and comes out is the
// standard (Gregorian) date "YYYY-MM-DD", which is what the database stores, and that standard date is shown underneath
// as soon as the Ethiopian date is valid. onChange(iso, status): iso is "" until the date is complete and valid.
export default function EcDateInput({ id, label, value, onChange, min, max, disabled, required, compact }) {
  const { t, lang } = useLang();
  const [parts, setParts] = useState(() => partsOf(value));
  const current = readEcParts(parts, min, max);

  // follow changes made by the page (previous/next day buttons, form reset, record loaded)
  useEffect(() => {
    const own = readEcParts(parts).iso;
    if (value && value !== own) setParts(partsOf(value));
    else if (!value && own) setParts({ d: "", m: "", y: "" });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const months = EC_MONTH_NAMES[lang === "am" ? "am" : "en"];
  const y = Number(parts.y);
  const maxDay = parts.m ? ecMonthDays(Number.isInteger(y) && y > 0 ? y : 2003, Number(parts.m)) || 30 : 30;

  function set(k, v) {
    const next = { ...parts, [k]: v };
    // a day that does not exist in the new month (30 in Pagume) is cleared instead of silently shifting
    if (next.d && next.m && Number(next.d) > (ecMonthDays(Number(next.y) > 0 ? Number(next.y) : 2003, Number(next.m)) || 30)) next.d = "";
    setParts(next);
    const r = readEcParts(next, min, max);
    onChange(r.iso, r.status);
  }

  const shown = current.status === "ok" ? current.iso : current.status === "range" ? current.gc : "";
  return (
    <fieldset className={`datepick${compact ? " datepick-compact" : ""}`}>
      <legend className={compact ? "sr-only" : undefined}>{label}{required && !compact ? " *" : ""}</legend>
      <div className="datepick-row">
        <select id={`${id}-d`} aria-label={`${label} – ${t("students.wizard.day")}`} value={parts.d} onChange={(e) => set("d", e.target.value)} disabled={disabled}>
          <option value="">{t("students.wizard.day")}</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select id={`${id}-m`} aria-label={`${label} – ${t("students.wizard.month")}`} value={parts.m} onChange={(e) => set("m", e.target.value)} disabled={disabled}>
          <option value="">{t("students.wizard.month")}</option>
          {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
        <input id={`${id}-y`} type="number" inputMode="numeric" min="1900" max="2200" placeholder={t("students.wizard.year")} aria-label={`${label} – ${t("students.wizard.year")}`} value={parts.y} onChange={(e) => set("y", e.target.value)} disabled={disabled} />
      </div>
      {shown && <p className="ec small">{t("date.standard", { date: shown })}</p>}
      {current.status === "invalid" && <p className="small msg-err" role="alert">{t("date.invalid")}</p>}
      {current.status === "range" && <p className="small msg-err" role="alert">{t("date.outOfRange")}</p>}
    </fieldset>
  );
}
