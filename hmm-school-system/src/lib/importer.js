import { parseEcText, ecToGc, formatEcText } from "./ethiopian.js";
import { ageOn, ageWarning } from "./age.js";

// Columns of the import template, in order. Dates of birth are Ethiopian dd/mm/yyyy (write the column as TEXT in Excel).
export const TEMPLATE_COLUMNS = [
  "first_name", "father_name", "grandfather_name", "first_name_am", "father_name_am", "grandfather_name_am",
  "sex", "dob_ec", "place_of_birth", "mother_full_name", "health_condition",
  "region", "zone", "woreda", "kebele", "house_number", "phone",
  "guardian_name", "guardian_relationship", "guardian_phone", "guardian_occupation",
  "guardian2_name", "guardian2_relationship", "guardian2_phone",
  "previous_school", "previous_grade", "transfer_certificate_no", "grade8_exam_result",
  "grade", "stream", "shift", "section", "enrollment_status",
];

export const TEMPLATE_EXAMPLE = {
  first_name: "Meron", father_name: "Tadesse", grandfather_name: "Bekele", first_name_am: "ሜሮን", father_name_am: "ታደሰ", grandfather_name_am: "በቀለ",
  sex: "female", dob_ec: "02/09/2002", place_of_birth: "Debre Birhan", mother_full_name: "Almaz Haile", health_condition: "",
  region: "Amhara", zone: "North Shewa", woreda: "Debre Birhan", kebele: "05", house_number: "123", phone: "",
  guardian_name: "Tadesse Bekele", guardian_relationship: "father", guardian_phone: "0911223344", guardian_occupation: "Farmer",
  guardian2_name: "", guardian2_relationship: "", guardian2_phone: "",
  previous_school: "Kebele 05 Primary School", previous_grade: "8", transfer_certificate_no: "", grade8_exam_result: "78",
  grade: "9", stream: "", shift: "morning", section: "A", enrollment_status: "new",
};

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// The file starts with a byte-order mark so Excel opens Amharic text correctly.
export function templateCsv() {
  return `\uFEFF${TEMPLATE_COLUMNS.join(",")}\r\n${TEMPLATE_COLUMNS.map((c) => csvCell(TEMPLATE_EXAMPLE[c])).join(",")}\r\n`;
}

export function resultsCsv(rows) {
  const head = ["row", "name", "student_id", "result"];
  return `\uFEFF${head.join(",")}\r\n${rows.map((r) => [r.row, r.name, r.code || "", r.error || "OK"].map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- reading files ----
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const headerKey = (h) => String(h ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

export function rowsToObjects(table) {
  if (!table.length) return [];
  const heads = table[0].map(headerKey);
  return table.slice(1).map((cells, i) => {
    const o = { _row: i + 2 };
    heads.forEach((h, j) => { if (h) o[h] = cells[j] == null ? "" : cells[j] instanceof Date ? cells[j] : String(cells[j]).trim(); });
    return o;
  });
}

export async function readImportFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { default: readXlsxFile } = await import("read-excel-file");
    return rowsToObjects(await readXlsxFile(file));
  }
  return rowsToObjects(parseCsv(await file.text()));
}

// ---- checking one row ----
const clean = (v) => (v == null ? "" : String(v).trim());
const err = (key, params = {}) => ({ key, params });

function normSex(v) {
  const s = clean(v).toLowerCase();
  if (["male", "m", "ወንድ"].includes(s)) return "male";
  if (["female", "f", "ሴት"].includes(s)) return "female";
  return null;
}
function normStream(v) {
  const s = clean(v).toLowerCase();
  if (s.startsWith("nat") || s.startsWith("ተፈጥሮ")) return "natural";
  if (s.startsWith("soc") || s.startsWith("ማኅበራዊ") || s.startsWith("ማህበራዊ")) return "social";
  return null;
}
function normPhone(v) {
  let s = clean(v).replace(/[\s-]/g, "");
  if (/^\d{9}$/.test(s) && /^[79]/.test(s)) s = `0${s}`; // Excel drops a leading zero from numbers
  return s;
}
export const nameKey = (r) => [r.first_name, r.father_name, r.grandfather_name, r.dob].map((x) => clean(x).toLowerCase()).join("|");

// ctx: { yearId, yearStart (ISO date), grades:[{id,number}], streams:[{id,code}], sections:[{id,grade_id,stream_id,shift,name}], ageLimits }
// returns { payload, errors:[{key,params}], warnings:[{key,params}], name, dob }
export function checkRow(raw, ctx) {
  const errors = [];
  const warnings = [];
  const r = (k) => clean(raw[k]);
  const name = [r("first_name"), r("father_name"), r("grandfather_name")].filter(Boolean).join(" ");

  if (!r("first_name") || !r("father_name") || !r("grandfather_name")) errors.push(err("missingName"));
  const sex = normSex(raw.sex);
  if (!sex) errors.push(err("badSex"));

  let dob = null;
  if (raw.dob_ec instanceof Date) errors.push(err("dateAsText"));
  else {
    const ec = parseEcText(raw.dob_ec);
    if (!ec) errors.push(err("badDob"));
    else {
      dob = ecToGc(ec.y, ec.m, ec.d);
      if (!dob || dob > new Date().toISOString().slice(0, 10) || dob < "1970-01-01") { errors.push(err("badDob")); dob = null; }
    }
  }

  const guardians = [];
  const g1 = { full_name: r("guardian_name"), relationship: r("guardian_relationship"), phone: normPhone(raw.guardian_phone), occupation: r("guardian_occupation"), is_primary: true };
  const g2 = { full_name: r("guardian2_name"), relationship: r("guardian2_relationship"), phone: normPhone(raw.guardian2_phone) };
  if (!g1.full_name || !g1.relationship) errors.push(err("missingGuardian"));
  else guardians.push(g1);
  if (g2.full_name) {
    if (!g2.relationship) errors.push(err("missingGuardian"));
    else guardians.push(g2);
  }
  if (guardians.length && !guardians.some((g) => g.phone)) errors.push(err("missingGuardianPhone"));

  // grade, stream, section
  const gradeNo = Number(r("grade"));
  const grade = ctx.grades.find((g) => g.number === gradeNo);
  if (!grade) errors.push(err("badGrade"));
  let stream = null;
  if (grade) {
    if (grade.number <= 10) stream = ctx.streams.find((s) => s.code === "general") || null;
    else {
      const code = normStream(raw.stream);
      if (!code) errors.push(err(r("stream") ? "badStream" : "needStream"));
      else stream = ctx.streams.find((s) => s.code === code) || null;
    }
  }
  const status = r("enrollment_status").toLowerCase() || (grade?.number === 9 ? "new" : "promoted");
  if (!["new", "promoted", "repeater", "transfer_in"].includes(status)) errors.push(err("badStatus"));

  let sectionId = null;
  if (grade && r("section")) {
    const shift = (r("shift") || "morning").toLowerCase();
    const key = (id) => ctx.streams.find((s) => s.id === id && s.code !== "general")?.id || null;
    const sec = ctx.sections.find((s) => s.grade_id === grade.id && key(s.stream_id) === key(stream?.id) && s.shift === shift && s.name.toLowerCase() === r("section").toLowerCase());
    if (!sec) errors.push(err("noSection", { section: r("section"), shift }));
    else sectionId = sec.id;
  }

  // entry rules (the database enforces the same rules)
  if (grade?.number === 9 && status === "new") {
    if (!r("previous_school")) errors.push(err("needPrevSchool"));
    if (r("grade8_exam_result") === "") errors.push(err("needGrade8"));
  }
  if (r("grade8_exam_result") !== "") {
    const n = Number(r("grade8_exam_result"));
    if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(err("badGrade8"));
  }
  if (status === "transfer_in" && (!r("transfer_certificate_no") || !r("previous_grade"))) errors.push(err("needCert"));

  if (dob && grade && ctx.yearStart) {
    const w = ageWarning(grade.number, ageOn(dob, ctx.yearStart), ctx.ageLimits);
    if (w) warnings.push(err(w.kind === "young" ? "ageYoung" : "ageOld", { age: w.age, min: w.min, max: w.max }));
  }

  const payload = {
    student: {
      first_name: r("first_name"), father_name: r("father_name"), grandfather_name: r("grandfather_name"),
      first_name_am: r("first_name_am"), father_name_am: r("father_name_am"), grandfather_name_am: r("grandfather_name_am"),
      sex, date_of_birth: dob, date_of_birth_ec: dob ? formatEcText(parseEcText(raw.dob_ec)) : null,
      place_of_birth: r("place_of_birth"), mother_full_name: r("mother_full_name"), health_condition: r("health_condition"),
      region: r("region"), zone: r("zone"), woreda: r("woreda"), kebele: r("kebele"), house_number: r("house_number"), phone: normPhone(raw.phone),
      previous_school: r("previous_school"), previous_grade: r("previous_grade"), transfer_certificate_no: r("transfer_certificate_no"),
      grade8_exam_result: r("grade8_exam_result"),
    },
    guardians,
    enrollment: grade ? { academic_year_id: ctx.yearId, grade_id: grade.id, stream_id: stream?.id || null, section_id: sectionId, status } : null,
  };
  return { payload, errors, warnings, name, dob, row: raw._row };
}
