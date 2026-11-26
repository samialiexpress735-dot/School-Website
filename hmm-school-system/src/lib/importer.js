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

export const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// The file starts with a byte-order mark so Excel opens Amharic text correctly.
export function templateCsv() {
  return `\uFEFF${TEMPLATE_COLUMNS.join(",")}\r\n${TEMPLATE_COLUMNS.map((c) => csvCell(TEMPLATE_EXAMPLE[c])).join(",")}\r\n`;
}

// ---- Excel (.xlsx) templates ----
// Header cells are bold and shaded; the first sheet holds the header row plus one example row, the second sheet
// ("Instructions") explains every column. Text-only columns (dates, phone numbers, codes) are written as TEXT cells so
// Excel never turns 02/09/2002 into a date or drops the leading zero of a phone number.
const HEAD_STYLE = { fontWeight: "bold", backgroundColor: "#DCE6F2", wrap: true };

const colLetter = (i) => { let n = i + 1, s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const xmlEsc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LAST_ROW = 1001; // dropdowns cover the first 1000 data rows

// Adds Excel dropdown lists (data validation) to the first sheet. The library cannot write them, so the finished .xlsx is
// opened (it is a zip), <dataValidations> is added after <sheetData> in the first sheet, and the zip is closed again.
// rules: [{ col: 0-based column index, items?: string[], ref?: "Lists!$A$2:$A$9", title, message }]
async function addDropdowns(blob, rules) {
  if (!rules.length) return blob;
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const path = "xl/worksheets/sheet1.xml";
  const body = rules.map((r) => {
    const formula = r.ref ? r.ref : `"${xmlEsc(r.items.join(","))}"`;
    const L = colLetter(r.col);
    return `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="${xmlEsc(r.title)}" error="${xmlEsc(r.message)}" sqref="${L}2:${L}${LAST_ROW}"><formula1>${formula}</formula1></dataValidation>`;
  }).join("");
  const xml = strFromU8(files[path]).replace("</sheetData>", `</sheetData><dataValidations count="${rules.length}">${body}</dataValidations>`);
  files[path] = strToU8(xml);
  return new Blob([zipSync(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// dropdowns: { column_name: ["a","b"] | { list: <index in lists> } }
// lists: [{ title, values: [] }] become columns of a "Lists" sheet (reference tables and dropdown sources).
export async function buildTemplateXlsx({ sheetName, columns, example, help, textColumns = [], dropdowns = {}, lists = [] }) {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const text = new Set(textColumns);
  const head = columns.map((c) => ({ value: c, ...HEAD_STYLE }));
  const sample = columns.map((c) => {
    const v = example[c];
    if (v === "" || v == null) return null;
    return text.has(c) || typeof v === "string" ? { value: String(v), type: String } : v;
  });
  const helpRows = [
    [{ value: "Column", ...HEAD_STYLE }, { value: "Required?", ...HEAD_STYLE }, { value: "What to write", ...HEAD_STYLE }],
    ...columns.map((c) => [{ value: c, fontWeight: "bold" }, help[c]?.[0] || "No", help[c]?.[1] || ""]),
  ];
  const sheets = [
    { data: [head, sample], sheet: sheetName, columns: columns.map((c) => ({ width: Math.max(14, c.length + 4) })), stickyRowsCount: 1 },
    { data: helpRows, sheet: "Instructions", columns: [{ width: 26 }, { width: 12 }, { width: 90 }] },
  ];
  const usable = lists.filter((l) => l.values.length);
  if (usable.length) {
    const height = Math.max(...usable.map((l) => l.values.length));
    const data = [usable.map((l) => ({ value: l.title, ...HEAD_STYLE }))];
    for (let i = 0; i < height; i += 1) data.push(usable.map((l) => (l.values[i] == null || l.values[i] === "" ? null : { value: String(l.values[i]), type: String })));
    sheets.push({ data, sheet: "Lists", columns: usable.map((l) => ({ width: Math.max(16, l.title.length + 4) })) });
  }
  const rules = [];
  columns.forEach((c, col) => {
    const d = dropdowns[c];
    if (!d) return;
    const label = c.replace(/_/g, " ");
    if (Array.isArray(d)) rules.push({ col, items: d, title: label, message: `Choose one of: ${d.join(", ")}` });
    else {
      const li = usable.indexOf(lists[d.list]);
      if (li < 0) return;
      const L = colLetter(li);
      rules.push({ col, ref: `Lists!$${L}$2:$${L}$${usable[li].values.length + 1}`, title: label, message: "Choose a value from the list (see the Lists sheet)." });
    }
  });
  return addDropdowns(await writeXlsxFile(sheets).toBlob(), rules);
}

const STUDENT_HELP = {
  first_name: ["Yes", "Student's own name."],
  father_name: ["Yes", "Father's name."],
  grandfather_name: ["Yes", "Grandfather's name."],
  first_name_am: ["No", "Own name in Amharic."],
  father_name_am: ["No", "Father's name in Amharic."],
  grandfather_name_am: ["No", "Grandfather's name in Amharic."],
  sex: ["Yes", "male or female."],
  dob_ec: ["Yes", "Date of birth in the Ethiopian calendar, written dd/mm/yyyy (for example 02/09/2002). Keep the column as Text."],
  place_of_birth: ["No", ""],
  mother_full_name: ["No", ""],
  health_condition: ["No", "Leave empty if none."],
  region: ["No", ""], zone: ["No", ""], woreda: ["No", ""], kebele: ["No", ""], house_number: ["No", ""],
  phone: ["No", "Student's phone number."],
  guardian_name: ["Yes", "Full name of the main guardian."],
  guardian_relationship: ["Yes", "For example father, mother, uncle."],
  guardian_phone: ["Yes*", "*At least one guardian must have a phone number."],
  guardian_occupation: ["No", ""],
  guardian2_name: ["No", "Second guardian (optional)."],
  guardian2_relationship: ["No", "Required if a second guardian name is given."],
  guardian2_phone: ["No", ""],
  previous_school: ["Yes*", "*Required for new Grade 9 students."],
  previous_grade: ["Yes*", "*Required for transfer_in students."],
  transfer_certificate_no: ["Yes*", "*Required for transfer_in students."],
  grade8_exam_result: ["Yes*", "*Required for new Grade 9 students. A number from 0 to 100."],
  grade: ["Yes", "9, 10, 11 or 12."],
  stream: ["Yes*", "*Grades 11 and 12 only: natural or social. Leave empty for Grades 9 and 10."],
  shift: ["No", "morning or afternoon. Empty means morning."],
  section: ["No", "Section letter or name (for example A). It must already exist for this grade, stream, shift and year. Leave empty to place the student later."],
  enrollment_status: ["No", "new, promoted, repeater or transfer_in. Empty means new for Grade 9 and promoted for other grades."],
};

// ctx (optional): { grades, streams, sections } of the chosen academic year. With sections, the template gets a Section
// dropdown and a Lists sheet that shows which grade / stream / shift / section combinations exist.
export function studentTemplateXlsx(ctx = {}) {
  const grades = ctx.grades || [], streams = ctx.streams || [];
  const secs = (ctx.sections || []).map((x) => ({
    grade: grades.find((g) => g.id === x.grade_id)?.number ?? "",
    stream: streams.find((st) => st.id === x.stream_id && st.code !== "general")?.code || "",
    shift: x.shift, name: x.name,
  })).sort((a, b) => a.grade - b.grade || a.stream.localeCompare(b.stream) || a.shift.localeCompare(b.shift) || a.name.localeCompare(b.name));
  const names = [...new Set(secs.map((x) => x.name))].sort();
  const lists = [
    { title: "section (names that exist)", values: names },
    { title: "grade", values: secs.map((x) => x.grade) },
    { title: "stream", values: secs.map((x) => x.stream) },
    { title: "shift", values: secs.map((x) => x.shift) },
    { title: "section", values: secs.map((x) => x.name) },
  ];
  return buildTemplateXlsx({
    sheetName: "Students", columns: TEMPLATE_COLUMNS, example: TEMPLATE_EXAMPLE, help: STUDENT_HELP,
    textColumns: ["dob_ec", "phone", "guardian_phone", "guardian2_phone", "kebele", "house_number", "previous_grade", "transfer_certificate_no", "section"],
    lists,
    dropdowns: {
      sex: ["male", "female"], grade: ["9", "10", "11", "12"], stream: ["natural", "social"], shift: ["morning", "afternoon"],
      enrollment_status: ["new", "promoted", "repeater", "transfer_in"],
      ...(names.length ? { section: { list: 0 } } : {}),
    },
  });
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function resultsCsv(rows, idLabel = "student_id") {
  const head = ["row", "name", idLabel, "result"];
  return `\uFEFF${head.join(",")}\r\n${rows.map((r) => [r.row, r.name, r.code || "", r.error || "OK"].map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function downloadText(filename, text) {
  downloadBlob(filename, new Blob([text], { type: "text/csv;charset=utf-8" }));
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

export function normSex(v) {
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
export function normPhone(v) {
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
