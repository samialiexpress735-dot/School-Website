// Run with:  npm test      (uses Node's built-in test runner, nothing to install)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roundTo, computeSemester, computeYearly, isPass, parseScore, pickStructure, effectiveStream,
  assembleStructures, groupOutMax, groupsOutMax, structureBalanced, hasFinalExam,
  parseFormula, evalFormula, checkFormula, FormulaError, averagePercent,
} from "../src/lib/marksEngine.js";

// ---- helpers to build structures the short way ----
let n = 0;
const comp = (raw_max, extra = {}) => ({ id: `c${++n}`, raw_max, ...extra });
const group = (code, comps, extra = {}) => ({ id: `g${++n}`, code, scale_to: null, factor: 1, components: comps, ...extra });
const structure = (groups, extra = {}) => ({ id: `s${++n}`, final_max: 100, rounding_places: 0, formula: null, groups, ...extra });
const scoresOf = (struct, values) => {
  const ids = struct.groups.flatMap((g) => g.components.map((c) => c.id));
  return Object.fromEntries(ids.map((id, i) => [id, values[i]]).filter(([, v]) => v !== undefined));
};

// ---------- The three examples of blueprint 4.6 ----------

test("Example A (Biology): continuous 10+15+15 = 40, final 60, result 100", () => {
  const s = structure([group("CA", [comp(10), comp(15), comp(15)]), group("FINAL", [comp(60, { is_final_exam: true })])]);
  assert.equal(groupsOutMax(s), 100);
  assert.ok(structureBalanced(s));
  const r = computeSemester(s, scoresOf(s, [8, 12, 13, 50]));
  assert.equal(r.groups[0].out, 33);
  assert.equal(r.groups[1].out, 50);
  assert.equal(r.result, 83);
  assert.equal(r.max, 100);
  assert.ok(r.complete);
  assert.equal(r.missing, 0);
  const full = computeSemester(s, scoresOf(s, [10, 15, 15, 60]));
  assert.equal(full.result, 100);
});

test("Example B (HPE): continuous 20+20+20+10 = 70, final 30, result 100", () => {
  const s = structure([group("CA", [comp(20), comp(20), comp(20), comp(10)]), group("FINAL", [comp(30, { is_final_exam: true })])]);
  assert.equal(groupsOutMax(s), 100);
  const r = computeSemester(s, scoresOf(s, [15, 18, 16, 9, 25]));
  assert.equal(r.groups[0].out, 58);
  assert.equal(r.result, 83);
});

test("Example C: 5 x 10 raw 50 converted to 40; final raw 40 scaled by 1.5 to 60", () => {
  const s = structure([
    group("CA", [comp(10), comp(10), comp(10), comp(10), comp(10)], { scale_to: 40 }),
    group("FINAL", [comp(40, { is_final_exam: true })], { factor: 1.5 }),
  ]);
  assert.equal(groupOutMax(s.groups[0]), 40);
  assert.equal(groupOutMax(s.groups[1]), 60);
  assert.ok(structureBalanced(s));
  const r = computeSemester(s, scoresOf(s, [9, 9, 9, 9, 9, 30]));
  assert.equal(r.groups[0].raw, 45);
  assert.equal(r.groups[0].out, 36); // 45 / 50 * 40
  assert.equal(r.groups[1].out, 45); // 30 * 1.5
  assert.equal(r.result, 81);
});

// ---------- Rounding ----------

test("rounding is half up and applied once at the end", () => {
  assert.equal(roundTo(83.5, 0), 84);
  assert.equal(roundTo(83.4, 0), 83);
  assert.equal(roundTo(1.005, 2), 1.01);
  assert.equal(roundTo(2.675, 2), 2.68);
  assert.equal(roundTo(0.5, 0), 1);
  assert.equal(roundTo(-0.5, 0), -1);
  assert.equal(roundTo(12.345, 1), 12.3);
  // 33.4 + 50.4 = 83.8 -> 84, not 33 + 50 = 83
  const s = structure([group("CA", [comp(40)]), group("FINAL", [comp(60)])]);
  assert.equal(computeSemester(s, scoresOf(s, [33.4, 50.4])).result, 84);
  assert.equal(computeSemester({ ...s, rounding_places: 1 }, scoresOf(s, [33.4, 50.4])).result, 83.8);
});

// ---------- Missing marks ----------

test("a missing mark is counted, the result is flagged incomplete", () => {
  const s = structure([group("CA", [comp(40)]), group("FINAL", [comp(60, { is_final_exam: true })])]);
  const r = computeSemester(s, scoresOf(s, [30, undefined]));
  assert.equal(r.missing, 1);
  assert.equal(r.complete, false);
  assert.equal(r.groups[1].complete, false);
  assert.equal(r.result, 30);
  assert.equal(computeSemester(s, {}).missing, 2);
  assert.equal(computeSemester(s, new Map([[s.groups[0].components[0].id, 20], [s.groups[1].components[0].id, 40]])).result, 60);
  // a zero is a real mark, not a missing one
  assert.equal(computeSemester(s, scoresOf(s, [0, 0])).complete, true);
});

test("a structure without a final exam is detected", () => {
  const withFinal = structure([group("CA", [comp(40)]), group("FINAL", [comp(60, { is_final_exam: true })])]);
  const without = structure([group("CA", [comp(40)]), group("OTHER", [comp(60)])]);
  assert.ok(hasFinalExam(withFinal));
  assert.equal(hasFinalExam(without), false);
});

test("a structure that does not add up is reported", () => {
  const s = structure([group("CA", [comp(40)]), group("FINAL", [comp(50)])]);
  assert.equal(structureBalanced(s), false);
  assert.ok(structureBalanced({ ...s, final_max: 90 }));
  assert.ok(structureBalanced({ ...s, formula: "CA + FINAL" })); // not checked when a formula is set
});

// ---------- Typed marks ----------

test("parseScore reads what a teacher types", () => {
  assert.deepEqual(parseScore("", 15), { empty: true, ok: true, value: null });
  assert.deepEqual(parseScore("  ", 15), { empty: true, ok: true, value: null });
  assert.deepEqual(parseScore("12", 15), { ok: true, value: 12 });
  assert.deepEqual(parseScore("12.5", 15), { ok: true, value: 12.5 });
  assert.deepEqual(parseScore("12,5", 15), { ok: true, value: 12.5 });
  assert.deepEqual(parseScore("15", 15), { ok: true, value: 15 });
  assert.deepEqual(parseScore("0", 15), { ok: true, value: 0 });
  assert.equal(parseScore("15.01", 15).error, "over");
  assert.equal(parseScore("16", 15).error, "over");
  assert.equal(parseScore("-1", 15).error, "negative");
  assert.equal(parseScore("abc", 15).error, "invalid");
  assert.equal(parseScore("1e2", 150).error, "invalid");
  assert.equal(parseScore("1.234", 15).error, "decimals");
  assert.equal(parseScore("--1", 15).error, "invalid");
});

// ---------- Custom formulas ----------

test("custom formula uses group values and raw totals", () => {
  const s = structure(
    [group("CA", [comp(10), comp(10)]), group("FINAL", [comp(40, { is_final_exam: true })], { factor: 1.5 })],
    { formula: "CA + FINAL" }
  );
  const r = computeSemester(s, scoresOf(s, [8, 9, 30]));
  assert.equal(r.result, 62); // 17 + 45
  assert.equal(r.formulaError, null);

  const m = { ...s, formula: "MAX(CA * 3, FINAL) + MIN(CA_RAW, 10)" };
  assert.equal(computeSemester(m, scoresOf(m, [8, 9, 30])).result, 61); // MAX(51, 45) + MIN(17, 10) = 61
  assert.equal(computeSemester({ ...s, formula: "(CA + FINAL) / 2" }, scoresOf(s, [8, 9, 30])).result, 31); // 62 / 2
  assert.equal(computeSemester({ ...s, formula: "-CA + 100" }, scoresOf(s, [8, 9, 30])).result, 83);
  assert.equal(computeSemester({ ...s, formula: "ca + final" }, scoresOf(s, [8, 9, 30])).result, 62); // not case sensitive
});

test("formulas are checked and never run as code", () => {
  const s = structure([group("CA", [comp(40)]), group("FINAL", [comp(60)])]);
  const bad = (formula) => checkFormula({ ...s, formula });
  assert.equal(bad("CA + FINAL"), null);
  assert.equal(bad(""), null);
  assert.equal(bad("CA + NOPE").code, "unknownName");
  assert.equal(bad("SQRT(CA)").code, "unknownFunction");
  assert.equal(bad("CA +").code, "syntax");
  assert.equal(bad("(CA + FINAL").code, "syntax");
  assert.equal(bad("CA FINAL").code, "syntax");
  assert.equal(bad("MIN()").code, "syntax");
  assert.equal(bad("CA; alert(1)").code, "syntax");
  assert.equal(bad("constructor").code, "unknownName");
  assert.equal(bad("__proto__").code, "unknownName");
  assert.equal(bad("CA.toString()").code, "syntax");
  assert.equal(bad("process.exit(1)").code, "syntax");
  assert.throws(() => evalFormula(parseFormula("1 / 0"), {}), (e) => e instanceof FormulaError && e.code === "divideByZero");

  // a broken formula gives no result instead of a wrong one
  const r = computeSemester({ ...s, formula: "CA / (FINAL - FINAL)" }, scoresOf(s, [10, 10]));
  assert.equal(r.result, null);
  assert.equal(r.formulaError.code, "divideByZero");
});

// ---------- Pass / fail and yearly average ----------

test("pass mark is a percent of the final maximum", () => {
  assert.ok(isPass(50, 100, 50));
  assert.equal(isPass(49, 100, 50), false);
  assert.ok(isPass(25, 50, 50));
  assert.equal(isPass(24, 50, 50), false);
  assert.equal(isPass(null, 100, 50), false);
  assert.ok(isPass(49.5, 100, 49.5));
});

test("yearly average is the mean of the two semester results", () => {
  const sem = (result, extra = {}) => ({ result, max: 100, complete: true, ...extra });
  assert.deepEqual(computeYearly([sem(80), sem(90)]), { average: 85, complete: true, semesters: 2 });
  assert.equal(computeYearly([sem(71), sem(72)], 1).average, 71.5);
  assert.equal(computeYearly([sem(71), sem(72)], 0).average, 72);
  // only one semester so far: the average is that semester, flagged as not complete
  assert.deepEqual(computeYearly([sem(80), null]), { average: 80, complete: false, semesters: 1 });
  assert.equal(computeYearly([sem(80), sem(90, { complete: false })]).complete, false);
  assert.deepEqual(computeYearly([null, null]), { average: null, complete: false, semesters: 0 });
  // different maximums are compared as percents: 40/50 = 80, 90/100 = 90
  assert.equal(computeYearly([{ result: 40, max: 50, complete: true }, sem(90)]).average, 85);
  assert.equal(averagePercent([80, 90, null, 70]), 80);
  assert.equal(averagePercent([]), null);
});

// ---------- Choosing and assembling structures ----------

test("a structure for the stream wins over the all-streams one", () => {
  const base = { semester_id: "S1", grade_id: "G11", subject_id: "MATH" };
  const all = { id: "all", ...base, stream_id: null };
  const nat = { id: "nat", ...base, stream_id: "NAT" };
  const other = { id: "other", ...base, subject_id: "ENG", stream_id: null };
  const wrongSem = { id: "sem2", ...base, semester_id: "S2", stream_id: null };
  const pool = [all, nat, other, wrongSem];
  assert.equal(pickStructure(pool, { ...camel(base), streamId: "NAT" }).id, "nat");
  assert.equal(pickStructure(pool, { ...camel(base), streamId: "SOC" }).id, "all");
  assert.equal(pickStructure(pool, { ...camel(base), streamId: null }).id, "all");
  assert.equal(pickStructure([nat], { ...camel(base), streamId: "SOC" }), null);
  assert.equal(pickStructure(pool, { semesterId: "S2", gradeId: "G11", subjectId: "MATH" }).id, "sem2");
  assert.equal(pickStructure([], { ...camel(base) }), null);
});
function camel(b) { return { semesterId: b.semester_id, gradeId: b.grade_id, subjectId: b.subject_id }; }

test("the general stream counts as no stream", () => {
  const streams = [{ id: "GEN", code: "general" }, { id: "NAT", code: "natural" }];
  assert.equal(effectiveStream("GEN", streams), null);
  assert.equal(effectiveStream("NAT", streams), "NAT");
  assert.equal(effectiveStream(null, streams), null);
});

test("assembleStructures nests groups and components in order", () => {
  const structures = [{ id: "s1" }, { id: "s2" }];
  const groups = [
    { id: "gb", structure_id: "s1", code: "FINAL", sort_order: 2 },
    { id: "ga", structure_id: "s1", code: "CA", sort_order: 1 },
  ];
  const components = [
    { id: "c3", group_id: "gb", structure_id: "s1", sort_order: 1, raw_max: 60 },
    { id: "c2", group_id: "ga", structure_id: "s1", sort_order: 2, raw_max: 15 },
    { id: "c1", group_id: "ga", structure_id: "s1", sort_order: 1, raw_max: 25 },
  ];
  const [a, b] = assembleStructures(structures, groups, components);
  assert.deepEqual(a.groups.map((g) => g.code), ["CA", "FINAL"]);
  assert.deepEqual(a.groups[0].components.map((c) => c.id), ["c1", "c2"]);
  assert.deepEqual(b.groups, []);
  assert.equal(groupsOutMax(a), 100);
});
