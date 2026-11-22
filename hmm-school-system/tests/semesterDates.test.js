// Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { semesterDatesStatus } from "../src/lib/attendance.js";

const full = (id, n) => ({ id, academic_year_id: "y1", number: n, start_date: "2026-09-11", end_date: "2027-01-31" });
const empty = (id, n) => ({ id, academic_year_id: "y1", number: n, start_date: null, end_date: null });

test("both semesters have dates: no warning", () => {
  const list = [full("s1", 1), full("s2", 2)];
  assert.equal(semesterDatesStatus(list, "y1"), null);
  assert.equal(semesterDatesStatus(list, "y1", "s1"), null);
});
test("empty dates warn for the semester and for the year", () => {
  const list = [empty("s1", 1), empty("s2", 2)];
  assert.equal(semesterDatesStatus(list, "y1", "s1"), "semester");
  assert.equal(semesterDatesStatus(list, "y1"), "year");
});
test("only one semester has dates", () => {
  const list = [full("s1", 1), empty("s2", 2)];
  assert.equal(semesterDatesStatus(list, "y1", "s1"), null);
  assert.equal(semesterDatesStatus(list, "y1", "s2"), "semester");
  assert.equal(semesterDatesStatus(list, "y1"), "year");
});
test("a start date without an end date counts as missing", () => {
  assert.equal(semesterDatesStatus([{ id: "s1", academic_year_id: "y1", start_date: "2026-09-11", end_date: null }], "y1", "s1"), "semester");
});
test("other years and unknown ids are ignored", () => {
  const list = [{ ...empty("s9", 1), academic_year_id: "y2" }];
  assert.equal(semesterDatesStatus(list, "y1"), null);
  assert.equal(semesterDatesStatus(list, "y1", "nope"), null);
});
