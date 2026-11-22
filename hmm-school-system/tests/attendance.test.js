// Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, isoWeekday, isSchoolDay, dayProblem, schoolDaysSince, inEditWindow, latestSchoolDay, stepSchoolDay,
  tally, changedRows, missingNotes, calendarMap,
} from "../src/lib/attendance.js";

const none = calendarMap([]);
// 2026-11-20 is a Friday, 21 Saturday, 22 Sunday, 23 Monday
test("weekdays", () => {
  assert.equal(isoWeekday("2026-11-20"), 5);
  assert.equal(isoWeekday("2026-11-21"), 6);
  assert.equal(isoWeekday("2026-11-22"), 7);
  assert.equal(isoWeekday("2026-11-23"), 1);
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("school days skip weekends and calendar days", () => {
  const cal = calendarMap([{ calendar_date: "2026-11-19", kind: "holiday", name: "x" }]);
  assert.equal(isSchoolDay("2026-11-20", cal), true);
  assert.equal(isSchoolDay("2026-11-21", cal), false);
  assert.equal(isSchoolDay("2026-11-19", cal), false);
  assert.equal(dayProblem("2026-11-19", cal, "2026-11-22"), "calendar");
  assert.equal(dayProblem("2026-11-21", cal, "2026-11-22"), "weekend");
  assert.equal(dayProblem("2026-11-23", cal, "2026-11-22"), "future");
  assert.equal(dayProblem("2026-11-18", cal, "2026-11-22"), null);
});

test("latest school day and stepping", () => {
  assert.equal(latestSchoolDay("2026-11-22", none), "2026-11-20");
  assert.equal(latestSchoolDay("2026-11-23", none), "2026-11-23");
  assert.equal(stepSchoolDay("2026-11-20", 1, none, "2026-11-22"), "2026-11-20"); // nothing later yet
  assert.equal(stepSchoolDay("2026-11-23", -1, none), "2026-11-20");
  assert.equal(stepSchoolDay("2026-11-20", 1, none, "2026-11-30"), "2026-11-23");
  const cal = calendarMap([{ calendar_date: "2026-11-23", kind: "holiday", name: "x" }]);
  assert.equal(stepSchoolDay("2026-11-20", 1, cal, "2026-11-30"), "2026-11-24");
});

test("teachers can edit only the last 3 school days (matches the database test)", () => {
  const today = "2026-11-22"; // Sunday: school days back are Fri 20, Thu 19, Wed 18, Tue 17
  assert.equal(schoolDaysSince("2026-11-20", none, today), 0);
  assert.equal(inEditWindow("2026-11-20", none, today), true);
  assert.equal(inEditWindow("2026-11-19", none, today), true);
  assert.equal(inEditWindow("2026-11-18", none, today), true);
  assert.equal(inEditWindow("2026-11-17", none, today), false);
  assert.equal(inEditWindow("2026-11-23", none, today), false);
  // a holiday does not use up one of the three days
  const cal = calendarMap([{ calendar_date: "2026-11-19", kind: "holiday", name: "x" }]);
  assert.equal(inEditWindow("2026-11-17", cal, today), true);
  assert.equal(inEditWindow("2026-11-16", cal, today), false);
});

test("tally, changed rows and notes", () => {
  const cur = { a: { status: "present" }, b: { status: "absent" }, c: { status: "excused", note: "" }, d: { status: "late" } };
  assert.deepEqual(tally(cur), { present: 1, absent: 1, late: 1, excused: 1 });
  assert.deepEqual(missingNotes(cur), ["c"]);
  const init = { a: { status: "present" }, b: { status: "present" }, c: { status: "excused", note: "sick" }, d: { status: "late", note: "" } };
  assert.deepEqual(changedRows(cur, init, true).map((r) => r.enrollment_id), ["b", "c"]);
  assert.equal(changedRows(cur, {}, false).length, 4);
});
