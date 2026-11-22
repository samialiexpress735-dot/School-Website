import { isValidEc, ecToGc, gcToEc, formatEcText } from "./ethiopian.js";

export const EMPTY_STUDENT = {
  first_name: "", father_name: "", grandfather_name: "",
  first_name_am: "", father_name_am: "", grandfather_name_am: "",
  sex: "", dob: { d: "", m: "", y: "" },
  place_of_birth: "", nationality: "Ethiopian", mother_full_name: "", health_condition: "",
  region: "", zone: "", woreda: "", kebele: "", house_number: "", phone: "",
  previous_school: "", previous_grade: "", transfer_certificate_no: "", grade8_exam_result: "",
  documents: { birth_certificate: false, transfer_letter: false },
};

export const EMPTY_GUARDIAN = { id: null, full_name: "", relationship: "", phone: "", occupation: "", address: "", is_primary: false, is_emergency_contact: false };

const num = (v) => (v === "" || v == null ? NaN : Number(v));

// Date of birth typed in the Ethiopian calendar -> { gc: "YYYY-MM-DD", ecText: "dd/mm/yyyy" } or null
export function dobToGc(dob) {
  const d = num(dob?.d), m = num(dob?.m), y = num(dob?.y);
  if (!isValidEc(y, m, d)) return null;
  const gc = ecToGc(y, m, d);
  if (!gc || gc > new Date().toISOString().slice(0, 10) || gc < "1970-01-01") return null;
  return { gc, ecText: formatEcText({ y, m, d }) };
}

export function gcToDob(gcIso) {
  const ec = gcToEc(gcIso);
  return ec ? { d: String(ec.day), m: String(ec.month), y: String(ec.year) } : { d: "", m: "", y: "" };
}

// Rows from the database -> form values
export function rowToForm(row) {
  const f = { ...EMPTY_STUDENT, documents: { ...EMPTY_STUDENT.documents, ...(row.documents || {}) } };
  for (const k of Object.keys(EMPTY_STUDENT)) {
    if (k === "dob" || k === "documents") continue;
    f[k] = row[k] == null ? "" : String(row[k]);
  }
  f.dob = gcToDob(row.date_of_birth);
  return f;
}

// enroll: { on, yearId, gradeNo, streamCode, status }
// Returns the list of error keys for one step (0 student, 2 guardians, 3 previous education, 4 enrollment)
export function validateStep(step, { f, guardians, enroll }) {
  const errs = [];
  if (step === 0) {
    if (!f.first_name.trim() || !f.father_name.trim() || !f.grandfather_name.trim()) errs.push("names");
    if (!f.sex) errs.push("sex");
    if (!dobToGc(f.dob)) errs.push("dob");
  }
  if (step === 2) {
    const list = guardians.filter((g) => g.full_name.trim() || g.relationship.trim() || g.phone.trim());
    if (!list.length || list.some((g) => !g.full_name.trim() || !g.relationship.trim())) errs.push("guardian");
    else if (!list.some((g) => g.phone.trim())) errs.push("guardianPhone");
  }
  if (step === 3) {
    if (f.grade8_exam_result !== "" && !(Number(f.grade8_exam_result) >= 0 && Number(f.grade8_exam_result) <= 100)) errs.push("grade8");
    if (enroll?.on && enroll.gradeNo === 9 && enroll.status === "new") {
      if (!f.previous_school.trim()) errs.push("previousSchool");
      if (f.grade8_exam_result === "" && !errs.includes("grade8")) errs.push("grade8");
    }
    if (enroll?.on && enroll.status === "transfer_in" && (!f.transfer_certificate_no.trim() || !f.previous_grade.trim())) errs.push("certificate");
  }
  if (step === 4 && enroll?.on) {
    if (!enroll.gradeNo) errs.push("grade");
    else if (enroll.gradeNo >= 11 && !["natural", "social"].includes(enroll.streamCode)) errs.push("stream");
  }
  return errs;
}

export const validateAll = (ctx) => [0, 2, 3, 4].flatMap((s) => validateStep(s, ctx).map((k) => ({ step: s, key: k })));

// Everything the register_student database function needs
export function buildPayload(f, guardians, enrollment) {
  const dob = dobToGc(f.dob);
  const student = {};
  for (const k of Object.keys(EMPTY_STUDENT)) {
    if (k === "dob") continue;
    student[k] = f[k];
  }
  student.date_of_birth = dob?.gc;
  student.date_of_birth_ec = dob?.ecText;
  const list = guardians.filter((g) => g.full_name.trim());
  if (list.length && !list.some((g) => g.is_primary)) list[0] = { ...list[0], is_primary: true };
  return { student, guardians: list, enrollment: enrollment || null };
}
