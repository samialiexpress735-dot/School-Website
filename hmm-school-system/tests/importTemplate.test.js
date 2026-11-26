import test from "node:test";
import assert from "node:assert/strict";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import { TEMPLATE_COLUMNS, studentTemplateXlsx, rowsToObjects, checkRow } from "../src/lib/importer.js";
import { STAFF_COLUMNS, staffTemplateXlsx, checkStaffRow } from "../src/lib/staffImporter.js";

const toBuffer = async (blob) => Buffer.from(await blob.arrayBuffer());

test("student template is an Excel file: header row, example row, instructions sheet", async () => {
  const buf = await toBuffer(await studentTemplateXlsx());
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  const rows = await readXlsxFile(buf);
  assert.deepEqual(rows[0], TEMPLATE_COLUMNS);
  const obj = rowsToObjects(rows)[0];
  assert.equal(obj.first_name, "Meron");
  assert.equal(obj.dob_ec, "02/09/2002");
  assert.equal(obj.guardian_phone, "0911223344");
});

test("staff template round-trips and its example row passes the checks", async () => {
  const buf = await toBuffer(await staffTemplateXlsx());
  const rows = await readXlsxFile(buf);
  assert.deepEqual(rows[0], STAFF_COLUMNS);
  const obj = rowsToObjects(rows)[0];
  const ok = checkStaffRow(obj, { departments: [{ id: "d1", name: "Natural Science", name_am: null }] });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.payload.department_id, "d1");
  assert.equal(ok.payload.date_of_birth, "1985-04-12"); // typed as Ethiopian 04/08/1977
  assert.equal(ok.payload.hire_date, "2012-09-01");
});

test("staff rows: missing names, bad sex, unknown department are reported", () => {
  const r = checkStaffRow({ first_name: "A", sex: "x", department: "Nope", _row: 2 }, { departments: [] });
  assert.deepEqual(r.errors.map((e) => e.key).sort(), ["badSex", "missingName", "noDepartment"]);
});

test("staff dates are Ethiopian text; real date cells and impossible dates are refused", () => {
  const base = { first_name: "A", father_name: "B", sex: "female", _row: 2 };
  const ctx = { departments: [] };
  assert.equal(checkStaffRow({ ...base, hire_date: "01/01/2008" }, ctx).payload.hire_date, "2015-09-12");
  assert.deepEqual(checkStaffRow({ ...base, hire_date: new Date(2015, 8, 1) }, ctx).errors.map((e) => e.key), ["dateAsText"]);
  assert.deepEqual(checkStaffRow({ ...base, date_of_birth: "06/13/2004" }, ctx).errors.map((e) => e.key), ["badDob"]); // Pagume has 5 days in 2004
  assert.equal(checkStaffRow({ ...base, date_of_birth: "06/13/2003" }, ctx).errors.length, 0); // 2003 is an Ethiopian leap year
});

test("templates carry dropdown lists and a Lists sheet built from the school's data", async () => {
  const { unzipSync, strFromU8 } = await import("fflate");
  const grades = [{ id: "g9", number: 9 }], streams = [{ id: "s0", code: "general" }];
  const blob = await studentTemplateXlsx({ grades, streams, sections: [{ grade_id: "g9", stream_id: "s0", shift: "morning", name: "A" }] });
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const sheet1 = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheet1, /<dataValidations count="6">/);
  assert.match(sheet1, /<formula1>"male,female"<\/formula1>/);
  assert.match(sheet1, /Lists!\$A\$2:\$A\$2/);
  assert.deepEqual((await readXlsxFile(await toBuffer(blob)))[0], TEMPLATE_COLUMNS); // still readable by the importer

  const staff = await staffTemplateXlsx([{ name: "Natural Science" }, { name: "Languages" }]);
  const s1 = strFromU8(unzipSync(new Uint8Array(await staff.arrayBuffer()))["xl/worksheets/sheet1.xml"]);
  assert.match(s1, /Lists!\$A\$2:\$A\$3/);
  assert.match(s1, /teaching,non_teaching/);
  // no departments yet: no department dropdown, no Lists sheet
  const bare = await readXlsxFile(await toBuffer(await staffTemplateXlsx([])));
  assert.deepEqual(bare[0], STAFF_COLUMNS);
});

test("Excel export keeps text cells and numbers, with a header row", async () => {
  const { buildExportXlsx } = await import("../src/lib/exporter.js");
  const blob = await buildExportXlsx({
    sheetName: "Staff",
    columns: [{ label: "Name", get: (r) => r.n }, { label: "Phone", get: (r) => r.p }, { label: "Grade", get: (r) => r.g }],
    rows: [{ n: "Abebe", p: "0911223344", g: 9 }, { n: "Meron", p: null, g: null }],
  });
  const rows = await readXlsxFile(await toBuffer(blob));
  assert.deepEqual(rows[0], ["Name", "Phone", "Grade"]);
  assert.deepEqual(rows[1], ["Abebe", "0911223344", 9]);
  assert.deepEqual(rows[2], ["Meron", null, null]);
});

test("CSV templates and exports start with a BOM and import back through the same reader", async () => {
  const { staffTemplateCsv } = await import("../src/lib/staffImporter.js");
  const { buildExportCsv } = await import("../src/lib/exporter.js");
  const { parseCsv, templateCsv } = await import("../src/lib/importer.js");
  const staff = staffTemplateCsv();
  assert.equal(staff.charCodeAt(0), 0xfeff);
  assert.deepEqual(parseCsv(staff)[0], STAFF_COLUMNS);
  assert.deepEqual(parseCsv(templateCsv())[0], TEMPLATE_COLUMNS);
  const csv = buildExportCsv({ columns: [{ label: "Name", get: (r) => r.n }, { label: "Note", get: (r) => r.x }], rows: [{ n: "አበበ", x: 'say "hi", ok' }] });
  assert.deepEqual(parseCsv(csv), [["Name", "Note"], ["አበበ", 'say "hi", ok']]);
});

test("Ethiopian date boxes: every day converts to a standard date and back, bad input is named", async () => {
  const { readEcParts, partsOf } = await import("../src/lib/ecDateParts.js");
  const { ecMonthDays } = await import("../src/lib/ethiopian.js");
  for (let y = 1990; y <= 2030; y += 1) {
    for (let m = 1; m <= 13; m += 1) {
      for (let d = 1; d <= ecMonthDays(y, m); d += 1) {
        const r = readEcParts({ d: String(d), m: String(m), y: String(y) });
        assert.equal(r.status, "ok");
        assert.deepEqual(partsOf(r.iso), { d: String(d), m: String(m), y: String(y) });
      }
    }
  }
  assert.equal(readEcParts({ d: "1", m: "1", y: "2018" }).iso, "2025-09-11");
  assert.equal(readEcParts({ d: "", m: "", y: "" }).status, "empty");
  assert.equal(readEcParts({ d: "5", m: "", y: "2017" }).status, "incomplete");
  assert.equal(readEcParts({ d: "6", m: "13", y: "2017" }).status, "invalid");
  assert.equal(readEcParts({ d: "30", m: "2", y: "2017" }, "2026-01-01").status, "range");
  assert.equal(readEcParts({ d: "1", m: "1", y: "2019" }, undefined, "2026-01-01").status, "range");
});
