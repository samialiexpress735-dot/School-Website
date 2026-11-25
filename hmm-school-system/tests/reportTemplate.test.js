import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPrintItems, cellText, emptyLayout, fieldText, fitWidth, layoutProblems, numText, nudged,
  pickTemplate, roundPct, spreadRows, templateWarnings, hasWarnings, normRect, isClick, tableRows,
} from "../src/lib/reportTemplate.js";

const ctx = { places: 2, passMark: 50, passText: "Pass", failText: "Fail", studentName: "Abebe Kebede", year: "2018" };
const subj = (id, s1, s2, avg, complete = true) => ({
  subject: { id },
  perSem: [s1 && { result: s1[0], max: s1[1], complete: s1[2] ?? true }, s2 && { result: s2[0], max: s2[1], complete: s2[2] ?? true }],
  yearly: { average: avg, complete },
});

test("numbers read like the built-in card, and nothing is printed for a missing value", () => {
  assert.equal(numText(12), "12");
  assert.equal(numText(12.5), "12.5");
  assert.equal(numText(12.345, 2), "12.35");
  assert.equal(numText(null), "");
  assert.equal(numText(undefined), "");
  assert.equal(numText(NaN), "");
  assert.equal(numText(0), "0"); // a real zero is printed; a missing mark never becomes one
});

test("semester cells are a percent of the semester maximum", () => {
  assert.equal(cellText("sem1", subj("m", [45, 50], null, null), ctx), "90");
  assert.equal(cellText("sem1", subj("m", [76, 100], null, null), ctx), "76");
});

test("a missing or incomplete semester leaves the box blank", () => {
  assert.equal(cellText("sem2", subj("m", [45, 50], null, null), ctx), "");
  assert.equal(cellText("sem1", subj("m", [30, 50, false], null, null), ctx), "");
  assert.equal(cellText("sem1", subj("m", [0, 0], null, null), ctx), "");
  assert.equal(cellText("sem1", undefined, ctx), "");
});

test("yearly average and pass/fail need a complete year", () => {
  assert.equal(cellText("average", subj("m", [50, 100], [70, 100], 60), ctx), "60");
  assert.equal(cellText("result", subj("m", [50, 100], [70, 100], 60), ctx), "Pass");
  assert.equal(cellText("result", subj("m", [40, 100], [50, 100], 45), ctx), "Fail");
  assert.equal(cellText("average", subj("m", [50, 100], null, 50, false), ctx), "");
  assert.equal(cellText("result", subj("m", [50, 100], null, null, false), ctx), "");
});

test("fields: overall, rank and verdict are blank until the student is complete", () => {
  const done = { overall: 71.5, complete: true, passed: true, rank: 3 };
  assert.equal(fieldText("overall", done, ctx), "71.5");
  assert.equal(fieldText("rank", done, ctx), "3");
  assert.equal(fieldText("verdict", done, ctx), "Pass");
  const open = { overall: 40, complete: false, passed: false, rank: null };
  assert.equal(fieldText("overall", open, ctx), "");
  assert.equal(fieldText("verdict", open, ctx), "");
  assert.equal(fieldText("rank", open, ctx), "");
  assert.equal(fieldText("studentName", done, ctx), "Abebe Kebede");
  assert.equal(fieldText("homeroom", done, ctx), "");
});

test("print items: each row crosses each column on the same page, blanks are left out", () => {
  const layout = {
    ...emptyLayout([{ path: "t/a.jpg", w: 1, h: 1 }, { path: "t/b.jpg", w: 1, h: 1 }]),
    columns: [{ id: "c1", page: 0, kind: "sem1", x: 50, w: 8 }, { id: "c2", page: 0, kind: "average", x: 60, w: 8 }, { id: "c3", page: 1, kind: "average", x: 60, w: 8 }],
    rows: [{ id: "r1", page: 0, subjectId: "m", y: 30, h: 3 }, { id: "r2", page: 0, subjectId: "e", y: 34, h: 3 }],
    fields: [{ id: "f1", page: 0, key: "studentName", x: 20, y: 20, w: 40 }, { id: "f2", page: 1, key: "rank", x: 20, y: 20, w: 10 }],
  };
  const row = { overall: 60, complete: true, passed: true, rank: null, results: [subj("m", [45, 50], null, null, false), subj("e", [80, 100], [60, 100], 70)] };
  const items = buildPrintItems(layout, row, ctx);
  const byId = Object.fromEntries(items.map((i) => [i.id, i.text]));
  assert.equal(byId["r1:c1"], "90");
  assert.equal(byId["r1:c2"], undefined); // average of an incomplete year: blank
  assert.equal(byId["r2:c1"], "80");
  assert.equal(byId["r2:c2"], "70");
  assert.equal(byId["f1"], "Abebe Kebede");
  assert.equal(byId["f2"], undefined);   // no rank yet
  assert.ok(!items.some((i) => i.id.endsWith(":c3"))); // the page-2 column does not cross page-1 rows
});

test("warnings: subjects without a row, unknown subjects, unassigned and duplicate rows", () => {
  const layout = { ...emptyLayout([{ path: "p", w: 1, h: 1 }]), columns: [{ id: "c", page: 0, kind: "sem1", x: 1, w: 1 }], rows: [
    { id: "1", subjectId: "m" }, { id: "2", subjectId: "m" }, { id: "3", subjectId: "x" }, { id: "4", subjectId: "" },
  ] };
  const w = templateWarnings(layout, ["m", "e"]);
  assert.deepEqual(w.missing, ["e"]);
  assert.deepEqual(w.unknown, ["x"]);
  assert.equal(w.unassigned, 1);
  assert.deepEqual(w.duplicates, ["m"]);
  assert.equal(hasWarnings(w), true);
  const ok = templateWarnings({ ...emptyLayout([{}]), columns: [{ id: "c" }], rows: [{ id: "1", subjectId: "m" }, { id: "2", subjectId: "e" }] }, ["m", "e"]);
  assert.equal(hasWarnings(ok), false);
  assert.equal(templateWarnings({ ...emptyLayout([{}]), rows: [{ id: "1", subjectId: "m" }] }, ["m"]).noColumns, true);
});

test("spreading rows puts the first and last on the clicked lines and the rest evenly between", () => {
  const rows = spreadRows(["a", "b", "c", "d", "e"], 30, 70);
  assert.deepEqual(rows.map((r) => r.y), [30, 40, 50, 60, 70]);
  assert.deepEqual(rows.map((r) => r.subjectId), ["a", "b", "c", "d", "e"]);
  assert.equal(spreadRows(["a"], 30, 70)[0].y, 30);
  assert.deepEqual(spreadRows([], 1, 2), []);
  assert.equal(new Set(spreadRows(["a", "b", "c"], 1, 2).map((r) => r.id)).size, 3);
});

test("the right template: grade, stream, kind, active, saved; stream-specific beats general; then newest", () => {
  const base = { is_active: true, current_version_id: "v", kind: "yearly", stream_ids: [], updated_at: "2026-01-01" };
  const general = { ...base, id: "g", grade_ids: ["g9", "g10"] };
  const newer = { ...base, id: "n", grade_ids: ["g9"], updated_at: "2026-06-01" };
  const natural = { ...base, id: "s", grade_ids: ["g11"], stream_ids: ["nat"] };
  const generic11 = { ...base, id: "g11", grade_ids: ["g11"] };
  assert.equal(pickTemplate([general, newer], { gradeId: "g9" }).id, "n");
  assert.equal(pickTemplate([general], { gradeId: "g10" }).id, "g");
  assert.equal(pickTemplate([general], { gradeId: "g12" }), null);
  assert.equal(pickTemplate([natural, generic11], { gradeId: "g11", streamId: "nat" }).id, "s");
  assert.equal(pickTemplate([natural, generic11], { gradeId: "g11", streamId: "soc" }).id, "g11");
  assert.equal(pickTemplate([natural], { gradeId: "g11", streamId: null }), null);
  assert.equal(pickTemplate([{ ...general, is_active: false }], { gradeId: "g9" }), null);
  assert.equal(pickTemplate([{ ...general, current_version_id: null }], { gradeId: "g9" }), null);
  assert.equal(pickTemplate([general], { gradeId: "g9", kind: "semester1" }), null);
});

test("layout problems mirror the database rules", () => {
  const ok = { ...emptyLayout([{ path: "t/a.jpg", w: 10, h: 10 }]), columns: [{ id: "c", page: 0, kind: "sem1", x: 50, w: 8 }] };
  assert.deepEqual(layoutProblems(ok), []);
  assert.ok(layoutProblems({ ...ok, columns: [{ id: "c", page: 0, x: 250, w: 8 }] }).includes("columns.x"));
  assert.ok(layoutProblems({ ...ok, pages: [] }).includes("pages"));
  assert.ok(layoutProblems({ ...ok, pages: [{}, {}, {}] }).includes("pages"));
  assert.ok(layoutProblems({ ...ok, columns: [{ id: "c", page: 1, x: 1, w: 1 }] }).includes("columns.page"));
  assert.ok(layoutProblems({ ...ok, version: 2 }).includes("version"));
  assert.ok(layoutProblems(null).length > 0);
});

test("positions stay on the page and keyboard nudges are small", () => {
  assert.equal(roundPct(12.345), 12.3);
  assert.equal(roundPct(-50), -5);
  assert.equal(roundPct(500), 105);
  assert.equal(nudged(10, 1, false), 10.1);
  assert.equal(nudged(10, -1, true), 9);
  assert.equal(nudged(104.95, 1, true), 105);
});

test("scans are only ever made smaller", () => {
  assert.deepEqual(fitWidth(3308, 4678, 1654), { w: 1654, h: 2339 });
  assert.deepEqual(fitWidth(800, 1000, 1654), { w: 800, h: 1000 });
  assert.deepEqual(fitWidth(0, 0), { w: 0, h: 0 });
});

test("a rectangle is the same whichever way it is dragged, and stays on the page", () => {
  assert.deepEqual(normRect({ x: 10, y: 20 }, { x: 40, y: 50 }), { x: 10, y: 20, w: 30, h: 30 });
  assert.deepEqual(normRect({ x: 40, y: 50 }, { x: 10, y: 20 }), { x: 10, y: 20, w: 30, h: 30 });
  assert.deepEqual(normRect({ x: 40, y: 20 }, { x: 10, y: 50 }), { x: 10, y: 20, w: 30, h: 30 });
  assert.deepEqual(normRect({ x: -5, y: 90 }, { x: 120, y: 130 }), { x: 0, y: 90, w: 100, h: 10 });
});

test("a press and release without dragging is a click", () => {
  assert.equal(isClick(normRect({ x: 10, y: 10 }, { x: 10.2, y: 10.3 })), true);
  assert.equal(isClick(normRect({ x: 10, y: 10 }, { x: 12, y: 10.3 })), false);
  assert.equal(isClick(normRect({ x: 10, y: 10 }, { x: 10.2, y: 15 })), false);
});

test("a table rectangle is divided evenly into one row per subject", () => {
  const rows = tableRows(["a", "b", "c", "d"], { x: 12, y: 30, w: 70, h: 40 }, 1);
  assert.deepEqual(rows.map((r) => r.y), [30, 40, 50, 60]);
  assert.ok(rows.every((r) => r.h === 10 && r.x === 12 && r.w === 70 && r.page === 1));
  assert.deepEqual(rows.map((r) => r.subjectId), ["a", "b", "c", "d"]);
  assert.equal(tableRows(["a"], { x: 0, y: 30, w: 50, h: 5 })[0].h, 5);
  assert.deepEqual(tableRows([], { x: 0, y: 0, w: 1, h: 1 }), []);
});

test("a field keeps the height of the rectangle it was drawn with", () => {
  const layout = { ...emptyLayout([{ path: "t/a.jpg", w: 1, h: 1 }]), fields: [{ id: "f", page: 0, key: "studentName", x: 10, y: 10, w: 40, h: 6 }, { id: "g", page: 0, key: "year", x: 10, y: 20, w: 20 }] };
  const items = buildPrintItems(layout, { results: [] }, { studentName: "Abebe", year: "2018" });
  assert.equal(items.find((i) => i.id === "f").h, 6);
  assert.equal(items.find((i) => i.id === "g").h, 3);
});
