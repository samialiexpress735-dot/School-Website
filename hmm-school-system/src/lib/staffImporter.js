import { buildTemplateXlsx, normSex, normPhone } from "./importer.js";

// Columns of the staff import template, in order. Dates are written yyyy-mm-dd (the same calendar the staff form uses).
export const STAFF_COLUMNS = [
  "employee_id", "staff_type", "position",
  "first_name", "father_name", "grandfather_name", "first_name_am", "father_name_am", "grandfather_name_am",
  "sex", "date_of_birth", "phone", "email", "address",
  "department", "qualification", "field_of_study", "hire_date", "employment_status",
];

export const STAFF_EXAMPLE = {
  employee_id: "T-001", staff_type: "teaching", position: "Mathematics teacher",
  first_name: "Abebe", father_name: "Kebede", grandfather_name: "Tesfaye", first_name_am: "አበበ", father_name_am: "ከበደ", grandfather_name_am: "ተስፋዬ",
  sex: "male", date_of_birth: "1985-04-12", phone: "0911223344", email: "abebe@example.com", address: "Debre Birhan, Kebele 03",
  department: "Natural Science", qualification: "BSc", field_of_study: "Mathematics", hire_date: "2012-09-01", employment_status: "active",
};

const STAFF_HELP = {
  employee_id: ["No", "Unique staff number. Leave empty if there is none. Two people cannot share one."],
  staff_type: ["No", "teaching or non_teaching. Empty means teaching."],
  position: ["No", "Job title, for example Librarian or Mathematics teacher."],
  first_name: ["Yes", "Own name."],
  father_name: ["Yes", "Father's name."],
  grandfather_name: ["No", "Grandfather's name."],
  first_name_am: ["No", "Own name in Amharic."],
  father_name_am: ["No", "Father's name in Amharic."],
  grandfather_name_am: ["No", "Grandfather's name in Amharic."],
  sex: ["Yes", "male or female."],
  date_of_birth: ["No", "yyyy-mm-dd, for example 1985-04-12. A real Excel date also works."],
  phone: ["No", "Phone number. Keep the column as Text so the leading 0 stays."],
  email: ["No", "Email address."],
  address: ["No", ""],
  department: ["No", "Name of an existing department (English or Amharic name). Create departments first in Staff > Departments."],
  qualification: ["No", "For example Diploma, BA, BSc, MA."],
  field_of_study: ["No", ""],
  hire_date: ["No", "yyyy-mm-dd. A real Excel date also works."],
  employment_status: ["No", "active, on_leave, transferred, resigned or retired. Empty means active."],
};

// departments (optional): [{ name }] from the database. With them, the template gets a Department dropdown and a Lists sheet.
export const staffTemplateXlsx = (departments = []) => buildTemplateXlsx({
  sheetName: "Staff", columns: STAFF_COLUMNS, example: STAFF_EXAMPLE, help: STAFF_HELP,
  textColumns: ["employee_id", "phone", "date_of_birth", "hire_date"],
  lists: [{ title: "department", values: departments.map((d) => d.name).filter(Boolean).sort() }],
  dropdowns: {
    staff_type: ["teaching", "non_teaching"], sex: ["male", "female"],
    employment_status: ["active", "on_leave", "transferred", "resigned", "retired"],
    ...(departments.some((d) => d.name) ? { department: { list: 0 } } : {}),
  },
});

const clean = (v) => (v == null ? "" : String(v).trim());
const err = (key, params = {}) => ({ key, params });
const pad = (n) => String(n).padStart(2, "0");

// An Excel date cell arrives as a Date made in the local time zone; text must be yyyy-mm-dd (or dd/mm/yyyy).
function readDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = clean(v);
  let y, m, d;
  let hit = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (hit) [, y, m, d] = hit;
  else if ((hit = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [, d, m, y] = hit;
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function normType(v) {
  const s = clean(v).toLowerCase().replace(/[\s-]+/g, "_");
  if (!s || ["teaching", "teacher"].includes(s)) return "teaching";
  if (["non_teaching", "nonteaching", "non_teacher", "admin", "support"].includes(s)) return "non_teaching";
  return null;
}
function normStatus(v) {
  const s = clean(v).toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return "active";
  return ["active", "on_leave", "transferred", "resigned", "retired"].includes(s) ? s : null;
}

export const staffNameKey = (r) => [r.first_name, r.father_name, r.grandfather_name].map((x) => clean(x).toLowerCase()).join("|");

// ctx: { departments: [{ id, name, name_am }] }
// returns { payload, errors:[{key,params}], warnings:[], name, row }
export function checkStaffRow(raw, ctx) {
  const errors = [];
  const warnings = [];
  const r = (k) => clean(raw[k]);
  const name = [r("first_name"), r("father_name"), r("grandfather_name")].filter(Boolean).join(" ");

  if (!r("first_name") || !r("father_name")) errors.push(err("missingName"));
  const sex = normSex(raw.sex);
  if (!sex) errors.push(err("badSex"));
  const staffType = normType(raw.staff_type);
  if (!staffType) errors.push(err("badType"));
  const status = normStatus(raw.employment_status);
  if (!status) errors.push(err("badStatus"));

  let dob = null;
  if (r("date_of_birth") || raw.date_of_birth instanceof Date) {
    dob = readDate(raw.date_of_birth);
    if (!dob || dob > new Date().toISOString().slice(0, 10) || dob < "1900-01-01") { errors.push(err("badDob")); dob = null; }
  }
  let hire = null;
  if (r("hire_date") || raw.hire_date instanceof Date) {
    hire = readDate(raw.hire_date);
    if (!hire) errors.push(err("badHire"));
  }
  if (r("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r("email"))) errors.push(err("badEmail"));

  let departmentId = null;
  if (r("department")) {
    const q = r("department").toLowerCase();
    const d = ctx.departments.find((x) => x.name?.toLowerCase() === q || x.name_am?.toLowerCase() === q);
    if (!d) errors.push(err("noDepartment", { department: r("department") }));
    else departmentId = d.id;
  }

  const payload = {
    employee_id: r("employee_id") || null,
    staff_type: staffType || "teaching",
    position: r("position") || null,
    first_name: r("first_name"), father_name: r("father_name"), grandfather_name: r("grandfather_name") || null,
    first_name_am: r("first_name_am") || null, father_name_am: r("father_name_am") || null, grandfather_name_am: r("grandfather_name_am") || null,
    sex, date_of_birth: dob, phone: normPhone(raw.phone) || null, email: r("email") || null, address: r("address") || null,
    department_id: departmentId, qualification: r("qualification") || null, field_of_study: r("field_of_study") || null,
    hire_date: hire, employment_status: status || "active",
  };
  return { payload, errors, warnings, name, row: raw._row };
}
