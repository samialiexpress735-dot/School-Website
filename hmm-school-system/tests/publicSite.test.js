import test from "node:test";
import assert from "node:assert/strict";
import { en, am } from "../src/public/texts.js";
import { validateApplication, validateContact } from "../src/public/validate.js";
import { pick } from "../src/public/siteInfo.js";

const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const text = (o, key) => key.split(".").reduce((x, k) => x?.[k], o);
const TODAY = new Date("2026-11-25T00:00:00Z");
const good = { childName: "Abebe Kebede", dob: { d: "4", m: "3", y: "2005" }, grade: "9", previousSchool: "", guardianName: "Kebede Alemu", phone: "+251 911 000 000", trap: "" };

test("public site: every English text has an Amharic text and the other way round", () => {
  const e = new Set(flat(en)), a = new Set(flat(am));
  assert.deepEqual([...e].filter((k) => !a.has(k)), []);
  assert.deepEqual([...a].filter((k) => !e.has(k)), []);
});

test("public site: placeholders such as {n} match in both languages and no text is empty", () => {
  const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const k of flat(en)) {
    assert.equal(ph(text(en, k)), ph(text(am, k)), k);
    assert.ok(String(text(am, k)).trim().length > 0, `empty Amharic text: ${k}`);
  }
});

test("application: a correct form passes and converts the Ethiopian birth date", () => {
  const { errors, args } = validateApplication(good, TODAY);
  assert.deepEqual(errors, {});
  assert.equal(args.p_date_of_birth, "2012-11-13");
  assert.equal(args.p_grade, 9);
  assert.equal(args.p_child_name, "Abebe Kebede");
});

test("application: bad name, phone, grade and dates are refused", () => {
  const bad = (patch) => validateApplication({ ...good, ...patch }, TODAY).errors;
  assert.ok(bad({ childName: "A" }).childName);
  assert.ok(bad({ guardianName: "  " }).guardianName);
  assert.ok(bad({ phone: "abc" }).phone);
  assert.ok(bad({ phone: "12345" }).phone);
  assert.ok(bad({ grade: "8" }).grade);
  assert.ok(bad({ grade: "" }).grade);
  assert.ok(bad({ dob: { d: "6", m: "13", y: "2005" } }).dob);   // Pagume has 5 days in 2005
  assert.ok(bad({ dob: { d: "", m: "", y: "" } }).dob);
  assert.ok(bad({ dob: { d: "1", m: "1", y: "2018" } }).dob);    // far too young
  assert.ok(bad({ dob: { d: "1", m: "1", y: "1980" } }).dob);    // far too old
});

test("application: Pagume 6 is accepted in an Ethiopian leap year", () => {
  const { errors } = validateApplication({ ...good, dob: { d: "6", m: "13", y: "2003" } }, TODAY);
  assert.equal(errors.dob, undefined);
});

test("forms: the hidden trap value is passed on so the database can discard robots", () => {
  assert.equal(validateApplication({ ...good, trap: "http://spam" }, TODAY).args.p_trap, "http://spam");
  assert.equal(validateContact({ name: "Sara", contact: "sara@example.com", message: "Hello, when does it open?", trap: "x" }).args.p_trap, "x");
});

test("contact: short name, contact or message is refused, a correct one passes", () => {
  assert.deepEqual(validateContact({ name: "Sara T", contact: "0911000000", message: "Hello, when does it open?" }).errors, {});
  const e = validateContact({ name: "S", contact: "x", message: "hi" }).errors;
  assert.ok(e.name && e.contact && e.message);
  assert.ok(validateContact({ name: "Sara", contact: "0911000000", message: "x".repeat(2001) }).errors.message);
});

test("site info: a missing text is hidden and the other language is used when one is empty", () => {
  assert.equal(pick(null, "en"), null);
  assert.equal(pick({ en: "Hello", am: null }, "am"), "Hello");
  assert.equal(pick({ en: "Hello", am: "ሰላም" }, "am"), "ሰላም");
});
