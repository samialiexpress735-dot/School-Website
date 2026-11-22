import { useLang } from "../i18n/index.jsx";
import { EC_MONTH_NAMES, ecMonthDays } from "../lib/ethiopian.js";
import { dobToGc } from "../lib/studentForm.js";

// Date entered in the Ethiopian calendar (day, month with Pagume, year).
// The standard (Gregorian) date is shown underneath once the date is valid.
export default function EcDatePicker({ id, legend, value, onChange, disabled, required }) {
  const { t, lang } = useLang();
  const months = EC_MONTH_NAMES[lang === "am" ? "am" : "en"];
  const y = Number(value.y);
  const m = Number(value.m);
  const maxDay = m ? ecMonthDays(Number.isInteger(y) && y > 0 ? y : 2003, m) || 30 : 30;
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const valid = dobToGc(value);

  return (
    <fieldset className="datepick">
      <legend>{legend}{required ? " *" : ""}</legend>
      <div className="datepick-row">
        <div>
          <label htmlFor={`${id}-d`}>{t("students.wizard.day")}</label>
          <select id={`${id}-d`} value={value.d} onChange={set("d")} disabled={disabled}>
            <option value="">—</option>
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-m`}>{t("students.wizard.month")}</label>
          <select id={`${id}-m`} value={value.m} onChange={set("m")} disabled={disabled}>
            <option value="">—</option>
            {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-y`}>{t("students.wizard.year")}</label>
          <input id={`${id}-y`} type="number" inputMode="numeric" min="1950" max="2100" value={value.y} onChange={set("y")} disabled={disabled} />
        </div>
      </div>
      {valid && <p className="ec small">{t("students.wizard.standardDate", { date: valid.gc })}</p>}
    </fieldset>
  );
}
