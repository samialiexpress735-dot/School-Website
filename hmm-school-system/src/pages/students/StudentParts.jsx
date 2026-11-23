import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useLang } from "../../i18n/index.jsx";
import EcDatePicker from "../../components/EcDatePicker.jsx";
import { dobToGc } from "../../lib/studentForm.js";

// error: a message shown right under the field (and read out with it); empty means no error.
export function TextField({ id, label, value, onChange, required, disabled, type = "text", inputMode, lang, placeholder, min, max, error }) {
  return (
    <div>
      <label htmlFor={id}>{label}{required ? " *" : ""}</label>
      <input id={id} type={type} inputMode={inputMode} lang={lang} value={value} placeholder={placeholder} min={min} max={max}
        onChange={(e) => onChange(e.target.value)} disabled={disabled} required={required}
        aria-invalid={error ? "true" : undefined} aria-describedby={error ? `${id}-err` : undefined} />
      {error && <p className="field-error" id={`${id}-err`}>{error}</p>}
    </div>
  );
}

// ---- Step 1: the student ----
export function StudentStep({ f, setF, disabled, errors = [] }) {
  const { t } = useLang();
  const w = (k) => t(`students.wizard.${k}`);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  // a message shows only while that field is still wrong, so it disappears as soon as it is fixed
  const nameErr = (v) => (errors.includes("names") && !String(v).trim() ? w("err.names") : "");
  const sexErr = errors.includes("sex") && !f.sex ? w("err.sex") : "";
  const dobErr = errors.includes("dob") && !dobToGc(f.dob) ? w("err.dob") : "";
  return (
    <div className="formgrid">
      <TextField id="s_fn" label={w("firstName")} required value={f.first_name} onChange={set("first_name")} disabled={disabled} error={nameErr(f.first_name)} />
      <TextField id="s_ln" label={w("fatherName")} required value={f.father_name} onChange={set("father_name")} disabled={disabled} error={nameErr(f.father_name)} />
      <TextField id="s_gn" label={w("grandfatherName")} required value={f.grandfather_name} onChange={set("grandfather_name")} disabled={disabled} error={nameErr(f.grandfather_name)} />
      <TextField id="s_fna" label={w("firstNameAm")} lang="am" value={f.first_name_am} onChange={set("first_name_am")} disabled={disabled} />
      <TextField id="s_lna" label={w("fatherNameAm")} lang="am" value={f.father_name_am} onChange={set("father_name_am")} disabled={disabled} />
      <TextField id="s_gna" label={w("grandfatherNameAm")} lang="am" value={f.grandfather_name_am} onChange={set("grandfather_name_am")} disabled={disabled} />
      <div>
        <label htmlFor="s_sex">{w("sex")} *</label>
        <select id="s_sex" value={f.sex} onChange={(e) => set("sex")(e.target.value)} disabled={disabled}
          aria-invalid={sexErr ? "true" : undefined} aria-describedby={sexErr ? "s_sex-err" : undefined}>
          <option value="">—</option>
          {["male", "female"].map((k) => <option key={k} value={k}>{t(`students.sexes.${k}`)}</option>)}
        </select>
        {sexErr && <p className="field-error" id="s_sex-err">{sexErr}</p>}
      </div>
      <div className="full">
        <EcDatePicker id="s_dob" legend={w("dob")} required value={f.dob} onChange={set("dob")} disabled={disabled} />
        {dobErr && <p className="field-error" id="s_dob-err" role="alert">{dobErr}</p>}
      </div>
      <TextField id="s_pob" label={w("placeOfBirth")} value={f.place_of_birth} onChange={set("place_of_birth")} disabled={disabled} />
      <TextField id="s_nat" label={w("nationality")} value={f.nationality} onChange={set("nationality")} disabled={disabled} />
      <TextField id="s_mom" label={w("motherName")} value={f.mother_full_name} onChange={set("mother_full_name")} disabled={disabled} />
      <TextField id="s_health" label={w("health")} value={f.health_condition} onChange={set("health_condition")} disabled={disabled} />
    </div>
  );
}

// ---- Step 2: address and contact ----
export function ContactStep({ f, setF, disabled }) {
  const { t } = useLang();
  const w = (k) => t(`students.wizard.${k}`);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="formgrid">
      <TextField id="c_region" label={w("region")} value={f.region} onChange={set("region")} disabled={disabled} />
      <TextField id="c_zone" label={w("zone")} value={f.zone} onChange={set("zone")} disabled={disabled} />
      <TextField id="c_woreda" label={w("woreda")} value={f.woreda} onChange={set("woreda")} disabled={disabled} />
      <TextField id="c_kebele" label={w("kebele")} value={f.kebele} onChange={set("kebele")} disabled={disabled} />
      <TextField id="c_house" label={w("houseNumber")} value={f.house_number} onChange={set("house_number")} disabled={disabled} />
      <TextField id="c_phone" label={w("phone")} type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} disabled={disabled} />
    </div>
  );
}

// ---- Step 4: previous education ----
export function PreviousStep({ f, setF, disabled }) {
  const { t } = useLang();
  const w = (k) => t(`students.wizard.${k}`);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="formgrid">
      <TextField id="p_school" label={w("previousSchool")} value={f.previous_school} onChange={set("previous_school")} disabled={disabled} />
      <TextField id="p_grade" label={w("previousGrade")} value={f.previous_grade} onChange={set("previous_grade")} disabled={disabled} />
      <TextField id="p_cert" label={w("certificate")} value={f.transfer_certificate_no} onChange={set("transfer_certificate_no")} disabled={disabled} />
      <TextField id="p_g8" label={w("grade8")} type="number" inputMode="decimal" min="0" max="100" value={f.grade8_exam_result} onChange={set("grade8_exam_result")} disabled={disabled} />
    </div>
  );
}

// ---- documents checklist ----
export function DocumentsBlock({ f, setF, disabled }) {
  const { t } = useLang();
  const toggle = (k) => (e) => setF((x) => ({ ...x, documents: { ...x.documents, [k]: e.target.checked } }));
  return (
    <fieldset className="checks">
      <legend>{t("students.wizard.documents")}</legend>
      <label className="inline"><input type="checkbox" checked={Boolean(f.documents.birth_certificate)} onChange={toggle("birth_certificate")} disabled={disabled} /> {t("students.wizard.docBirth")}</label>
      <label className="inline"><input type="checkbox" checked={Boolean(f.documents.transfer_letter)} onChange={toggle("transfer_letter")} disabled={disabled} /> {t("students.wizard.docTransfer")}</label>
    </fieldset>
  );
}

// ---- guardians (registration form) ----
const REL = ["father", "mother", "brother", "sister", "uncle", "aunt", "grandparent", "other"];

export function RelationshipSelect({ id, value, onChange, disabled }) {
  const { t } = useLang();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">—</option>
      {REL.map((k) => <option key={k} value={k}>{t(`students.relationships.${k}`)}</option>)}
      {value && !REL.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}

function GuardianCard({ index, g, onChange, onRemove, canRemove }) {
  const { t } = useLang();
  const w = (k) => t(`students.wizard.${k}`);
  const [found, setFound] = useState(null);
  const set = (k) => (v) => onChange({ ...g, [k]: v });

  async function find() {
    const phone = g.phone.trim();
    if (!phone) return;
    const { data } = await supabase.from("guardians").select("*").eq("phone", phone).limit(5);
    setFound(data || []);
  }
  const use = (row) => {
    onChange({ ...g, id: row.id, full_name: row.full_name, phone: row.phone || "", occupation: row.occupation || "", address: row.address || "" });
    setFound(null);
  };
  const locked = Boolean(g.id);

  return (
    <section className="subpanel" aria-label={w("guardianN").replace("{n}", index + 1)}>
      <div className="panel-head">
        <h3>{t("students.wizard.guardianN", { n: index + 1 })}</h3>
        {canRemove && <button type="button" className="btn-small danger" onClick={onRemove}>{w("removeGuardian")}</button>}
      </div>
      {locked && (
        <p className="muted small">
          {w("usingExisting")} <button type="button" className="linklike" onClick={() => onChange({ ...g, id: null })}>×</button>
        </p>
      )}
      <div className="formgrid">
        <TextField id={`g${index}_name`} label={w("guardianName")} required value={g.full_name} onChange={set("full_name")} disabled={locked} />
        <div>
          <label htmlFor={`g${index}_rel`}>{w("relationship")} *</label>
          <RelationshipSelect id={`g${index}_rel`} value={g.relationship} onChange={set("relationship")} />
        </div>
        <TextField id={`g${index}_phone`} label={w("guardianPhone")} type="tel" inputMode="tel" value={g.phone} onChange={set("phone")} disabled={locked} />
        <TextField id={`g${index}_job`} label={w("occupation")} value={g.occupation} onChange={set("occupation")} disabled={locked} />
        <TextField id={`g${index}_addr`} label={w("address")} value={g.address} onChange={set("address")} disabled={locked} />
        <div className="checks">
          <label className="inline"><input type="checkbox" checked={g.is_primary} onChange={(e) => onChange({ ...g, is_primary: e.target.checked })} /> {w("primary")}</label>
          <label className="inline"><input type="checkbox" checked={g.is_emergency_contact} onChange={(e) => onChange({ ...g, is_emergency_contact: e.target.checked })} /> {w("emergency")}</label>
        </div>
      </div>
      {!locked && (
        <div className="row-actions">
          <button type="button" className="btn-small secondary" onClick={find} disabled={!g.phone.trim()}>{w("findByPhone")}</button>
        </div>
      )}
      {found && (found.length === 0 ? <p className="muted small">{w("noGuardianFound")}</p> : (
        <ul className="picklist">
          {found.map((row) => (
            <li key={row.id}>
              <span>{row.full_name} · {row.phone}</span>
              <button type="button" className="btn-small" onClick={() => use(row)}>{w("useThis")}</button>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

export function GuardiansStep({ guardians, setGuardians }) {
  const { t } = useLang();
  const update = (i, g) => setGuardians((list) => list.map((x, j) => {
    if (j === i) return g;
    // only one primary guardian
    return g.is_primary && !list[i].is_primary ? { ...x, is_primary: false } : x;
  }));
  return (
    <>
      {guardians.map((g, i) => (
        <GuardianCard key={i} index={i} g={g} onChange={(next) => update(i, next)} canRemove={guardians.length > 1}
          onRemove={() => setGuardians((list) => list.filter((_, j) => j !== i))} />
      ))}
      <button type="button" className="btn-small secondary" onClick={() => setGuardians((l) => [...l, { id: null, full_name: "", relationship: "", phone: "", occupation: "", address: "", is_primary: false, is_emergency_contact: false }])}>
        + {t("students.wizard.addGuardian")}
      </button>
    </>
  );
}
