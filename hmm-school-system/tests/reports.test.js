import { test } from "node:test";
import assert from "node:assert/strict";
import { rankValues, buildReport, suggestDecision, needsStream, subjectYear } from "../src/lib/reports.js";

// A tiny structure: one CA group (max 40) and one FINAL group (max 60) = 100.
const structure = (id, semesterId, subjectId) => ({
  id, semester_id: semesterId, grade_id: "g9", stream_id: null, subject_id: subjectId,
  final_max: 100, rounding_places: 0, formula: null,
  groups: [
    { id: `${id}-ca`, code: "CA", convert_to: null, multiplier: 1, components: [{ id: `${id}-q`, raw_max: 40, is_final_exam: false }] },
    { id: `${id}-fi`, code: "FINAL", convert_to: null, multiplier: 1, components: [{ id: `${id}-f`, raw_max: 60, is_final_exam: true }] },
  ],
});

test("ranking gives tied students the same rank and skips the next", () => {
  assert.deepEqual(rankValues([90, 80, 80, 70]), [1, 2, 2, 4]);
  assert.deepEqual(rankValues([null, 50, 60]), [null, 2, 1]);
});

test("suggested decision follows the pass mark and the grade", () => {
  assert.equal(suggestDecision({ overall: 62, complete: true, gradeNumber: 9, passMark: 50 }), "promote");
  assert.equal(suggestDecision({ overall: 50, complete: true, gradeNumber: 10, passMark: 50 }), "promote");
  assert.equal(suggestDecision({ overall: 49.9, complete: true, gradeNumber: 10, passMark: 50 }), "repeat");
  assert.equal(suggestDecision({ overall: 70, complete: true, gradeNumber: 12, passMark: 50 }), "graduate");
  assert.equal(suggestDecision({ overall: 40, complete: true, gradeNumber: 12, passMark: 50 }), "repeat");
  assert.equal(suggestDecision({ overall: 80, complete: false, gradeNumber: 9, passMark: 50 }), null);
  assert.equal(suggestDecision({ overall: null, complete: true, gradeNumber: 9, passMark: 50 }), null);
});

test("only Grade 10 to 11 needs a stream choice", () => {
  assert.equal(needsStream("promote", 10), true);
  assert.equal(needsStream("promote", 9), false);
  assert.equal(needsStream("promote", 11), false);
  assert.equal(needsStream("repeat", 10), false);
});

test("report: yearly average, overall, rank and incomplete students", () => {
  const sems = [{ id: "s1", number: 1 }, { id: "s2", number: 2 }];
  const structures = [structure("a1", "s1", "math"), structure("a2", "s2", "math")];
  const marks = new Map([
    ["e1|a1-q", 30], ["e1|a1-f", 50], ["e1|a2-q", 30], ["e1|a2-f", 50], // e1: 80 and 80
    ["e2|a1-q", 20], ["e2|a1-f", 30], ["e2|a2-q", 20], ["e2|a2-f", 30], // e2: 50 and 50
    ["e3|a1-q", 40], ["e3|a1-f", 60],                                   // e3: only semester 1 (100) -> incomplete
  ]);
  const enrollments = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];
  const rep = buildReport({
    structures, marks, enrollments, subjects: [{ id: "math" }], sems, gradeId: "g9", stream: null, places: 1, passMark: 50,
  });
  const [r1, r2, r3] = rep.rows;
  assert.equal(r1.overall, 80);
  assert.equal(r1.complete, true);
  assert.equal(r2.overall, 50);
  assert.equal(r2.passed, true);
  assert.equal(r3.overall, 100);
  assert.equal(r3.complete, false); // one semester missing is never treated as zero, and never complete
  assert.deepEqual(rep.rows.map((r) => r.rank), [2, 3, 1]);
  assert.equal(rep.classAverages[0], 76.7);
});

test("a subject without a structure makes the student incomplete", () => {
  const sems = [{ id: "s1", number: 1 }];
  const rep = buildReport({ structures: [], marks: new Map(), enrollments: [{ id: "e1" }], subjects: [{ id: "math" }], sems, gradeId: "g9", stream: null, places: 1, passMark: 50 });
  assert.equal(rep.rows[0].overall, null);
  assert.equal(rep.rows[0].complete, false);
  assert.equal(rep.rows[0].rank, null);
});

test("subjectYear returns nothing for a subject with no marks", () => {
  const sems = [{ id: "s1", number: 1 }];
  const r = subjectYear({ structures: [structure("a1", "s1", "math")], marks: new Map(), sems, gradeId: "g9", stream: null, places: 1 }, "e1", "math");
  assert.equal(r.yearly.average, null);
});
