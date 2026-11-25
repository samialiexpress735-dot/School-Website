import { test } from "node:test";
import assert from "node:assert/strict";
import { shortcutsFor, tilesFor, emptyStateFor } from "../src/lib/dashboard.js";

const ROUTES = new Set(["attendance", "marks", "attendance/flags", "marks/results", "staff/assignments", "students/new", "students/allocation", "students/import", "reports/promotion", "reports", "staff", "structure/years", "attendance/summary", "structure/sections", "students"]);

test("every role has shortcuts and each one points at an existing screen", () => {
  for (const r of ["teacher", "unit_leader", "registrar", "director", "vice_director", "system_admin"]) {
    const list = shortcutsFor(r);
    assert.ok(list.length >= 3, r);
    for (const s of list) assert.ok(ROUTES.has(s.to), `${r} ${s.key} -> ${s.to}`);
  }
  assert.deepEqual(shortcutsFor("nobody"), []);
});

test("role shortcuts match the plan", () => {
  const keys = (r) => shortcutsFor(r).map((s) => s.key);
  assert.ok(keys("teacher").includes("rollCall") && keys("teacher").includes("enterMarks"));
  assert.ok(!keys("teacher").includes("promotion"));
  assert.ok(keys("registrar").includes("registerStudent") && keys("registrar").includes("allocation"));
  assert.ok(keys("director").includes("promotion"));
  assert.ok(keys("unit_leader").includes("finalizeMarks"));
});

test("tiles: a teacher sees own figures; missing figures are left out; only the admin sees accounts without a role", () => {
  const s = { students: 400, sections: 12, mySections: 3, staff: 40, absentToday: 7 };
  assert.deepEqual(tilesFor("teacher", s).map((t) => t.key), ["myStudents", "mySections", "absentToday"]);
  assert.deepEqual(tilesFor("registrar", s).map((t) => t.key), ["students", "sections", "staff", "absentToday"]);
  assert.deepEqual(tilesFor("system_admin", s).map((t) => t.key), ["students", "sections", "staff", "absentToday"]);
  assert.deepEqual(tilesFor("director", { students: 0, sections: null, staff: null, absentToday: 0 }).map((t) => t.key), ["students", "absentToday"]);
});

test("empty states", () => {
  assert.equal(emptyStateFor("director", { year: null }), "noYear");
  assert.equal(emptyStateFor("registrar", { year: { id: 1 }, students: 0 }), "noStudents");
  assert.equal(emptyStateFor("director", { year: { id: 1 }, students: 0 }), null);
  assert.equal(emptyStateFor("teacher", { year: { id: 1 }, mySections: 0 }), "noSections");
  assert.equal(emptyStateFor("teacher", { year: { id: 1 }, mySections: 2 }), null);
  assert.equal(emptyStateFor("teacher", null), null);
});
