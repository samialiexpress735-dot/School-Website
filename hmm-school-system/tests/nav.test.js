import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleModules, breadcrumbParts, crumbKeys } from "../src/lib/nav.js";
import { addRecent, isRecentEntry } from "../src/lib/recent.js";

const keys = (role) => visibleModules(role).map((m) => m.key);

test("a teacher does not see Staff; the office roles do", () => {
  assert.ok(!keys("teacher").includes("staff"));
  for (const r of ["system_admin", "director", "vice_director", "unit_leader", "registrar"]) assert.ok(keys(r).includes("staff"), r);
});

test("every role sees the dashboard, marks, attendance and reports; unknown role sees nothing", () => {
  for (const r of ["system_admin", "director", "vice_director", "unit_leader", "registrar", "teacher"]) {
    for (const k of ["dashboard", "marks", "attendance", "reports"]) assert.ok(keys(r).includes(k), `${r} ${k}`);
  }
  assert.deepEqual(keys(undefined), []);
});

test("breadcrumb parts", () => {
  assert.equal(breadcrumbParts("/en/dashboard"), null);
  assert.equal(breadcrumbParts("/en/nowhere"), null);
  assert.deepEqual(breadcrumbParts("/en/students"), { module: "students", tab: "list" });
  assert.deepEqual(breadcrumbParts("/am/students/new"), { module: "students", tab: "register" });
  assert.deepEqual(breadcrumbParts("/en/students/import"), { module: "students", tab: "import" });
  assert.deepEqual(breadcrumbParts("/en/students/3f2a-uuid"), { module: "students", tab: "details" });
  assert.deepEqual(breadcrumbParts("/en/staff/new"), { module: "staff", tab: "new" });
  assert.deepEqual(breadcrumbParts("/en/marks"), { module: "marks", tab: "entry" });
  assert.deepEqual(breadcrumbParts("/en/reports/promotion"), { module: "reports", tab: "promotion" });
  assert.deepEqual(breadcrumbParts("/en/structure/calendar"), { module: "structure", tab: "calendar" });
});

test("crumb keys", () => {
  assert.deepEqual(crumbKeys({ module: "students", tab: "register" }), { module: "nav.students", tab: "students.tabs.register" });
  assert.deepEqual(crumbKeys({ module: "students", tab: "details" }), { module: "nav.students", tab: "nav.details" });
  assert.deepEqual(crumbKeys({ module: "staff", tab: "new" }), { module: "nav.staff", tab: "nav.new" });
});

test("recent pages: newest first, no repeats, limited", () => {
  let l = [];
  for (const p of ["marks", "marks/results", "attendance", "reports", "students", "staff"]) l = addRecent(l, { path: p, module: p.split("/")[0], tab: null });
  assert.deepEqual(l.map((x) => x.path), ["staff", "students", "reports", "attendance", "marks/results"]);
  l = addRecent(l, { path: "reports", module: "reports", tab: null });
  assert.deepEqual(l.map((x) => x.path), ["reports", "staff", "students", "attendance", "marks/results"]);
});

test("only plain page addresses are accepted as recent entries", () => {
  assert.equal(isRecentEntry({ path: "marks/results", module: "marks" }), true);
  assert.equal(isRecentEntry({ path: "students/3f2a-9b1c-uuid", module: "students" }), false); // never keep ids
  assert.equal(isRecentEntry({ path: "<script>", module: "x" }), false);
  assert.equal(isRecentEntry(null), false);
});
