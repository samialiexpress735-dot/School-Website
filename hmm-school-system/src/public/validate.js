import { ecToGc, isValidEc } from "../lib/ethiopian.js";

// Checks the pre-registration form before it is sent. The database checks the same things again.
// Returns { errors: { field: "messageKey" }, args } where args are the values for submit_application.
export function validateApplication(f, today = new Date()) {
  const errors = {};
  const name = (f.childName || "").trim();
  const guardian = (f.guardianName || "").trim();
  const phone = (f.phone || "").trim();
  if (name.length < 2 || name.length > 120) errors.childName = "val.name";
  if (guardian.length < 2 || guardian.length > 120) errors.guardianName = "val.name";
  if (!/^[0-9+() -]{7,20}$/.test(phone)) errors.phone = "val.phone";
  if (![9, 10, 11, 12].includes(Number(f.grade))) errors.grade = "val.grade";
  if ((f.previousSchool || "").length > 160) errors.previousSchool = "val.tooLong";

  const y = Number(f.dob?.y), m = Number(f.dob?.m), d = Number(f.dob?.d);
  let gc = null;
  if (isValidEc(y, m, d)) gc = ecToGc(y, m, d);
  if (!gc) errors.dob = "val.dob";
  else {
    const dob = new Date(`${gc}T00:00:00Z`);
    const years = (today - dob) / (365.25 * 24 * 3600 * 1000);
    if (years < 8 || years > 30) errors.dob = "val.dobRange";
  }
  return {
    errors,
    args: {
      p_child_name: name, p_date_of_birth: gc, p_grade: Number(f.grade),
      p_previous_school: (f.previousSchool || "").trim(), p_guardian_name: guardian,
      p_guardian_phone: phone, p_trap: f.trap || "",
    },
  };
}

export function validateContact(f) {
  const errors = {};
  if ((f.name || "").trim().length < 2) errors.name = "val.name";
  if ((f.contact || "").trim().length < 5) errors.contact = "val.contact";
  const len = (f.message || "").trim().length;
  if (len < 10 || len > 2000) errors.message = "val.message";
  return { errors, args: { p_name: (f.name || "").trim(), p_contact: (f.contact || "").trim(), p_message: (f.message || "").trim(), p_trap: f.trap || "" } };
}
