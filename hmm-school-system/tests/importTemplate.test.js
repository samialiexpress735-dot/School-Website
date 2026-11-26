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
  assert.equal(ok.payload.date_of_birth, "1985-04-12");
});

test("staff rows: missing names, bad sex, unknown department are reported", () => {
  const r = checkStaffRow({ first_name: "A", sex: "x", department: "Nope", _row: 2 }, { departments: [] });
  assert.deepEqual(r.errors.map((e) => e.key).sort(), ["badSex", "missingName", "noDepartment"]);
});

test("staff dates accept Excel date cells", () => {
  const r = checkStaffRow({ first_name: "A", father_name: "B", sex: "female", hire_date: new Date(2015, 8, 1), _row: 2 }, { departments: [] });
  assert.equal(r.payload.hire_date, "2015-09-01");
  assert.deepEqual(r.errors, []);
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
