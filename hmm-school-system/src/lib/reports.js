// Step 7: pure helpers for rosters, report cards and promotion. No database access here, so they are easy to test.
import { averagePercent, computeSemester, computeYearly, effectiveStream, isPass, pickStructure } from "./marksEngine.js";

const keyOf = (enrollmentId, componentId) => `${enrollmentId}|${componentId}`;

// The marks of ONE student as { componentId: score } for the engine (same format as marksData.scoresForStudent).
function scoresFor(marks, enrollmentId, structure) {
  const out = {};
  for (const g of structure?.groups || []) {
    for (const c of g.components) {
      const v = marks.get(keyOf(enrollmentId, c.id));
      if (v !== undefined) out[c.id] = v;
    }
  }
  return out;
}

// Result of one student in one subject: each semester, and the yearly average.
export function subjectYear({ structures, marks, sems, gradeId, stream, places }, enrollmentId, subjectId) {
  const perSem = sems.map((s) => {
    const st = pickStructure(structures, { semesterId: s.id, gradeId, streamId: stream, subjectId });
    if (!st) return null;
    const c = computeSemester(st, scoresFor(marks, enrollmentId, st));
    if (c.formulaError) return null;
    const total = c.groups.reduce((n, g) => n + g.count, 0);
    return { result: c.result, max: c.max, complete: c.complete, none: c.missing === total };
  });
  const shown = perSem.map((r) => (r && !r.none ? r : null));
  return { perSem: shown, yearly: computeYearly(shown, places) };
}

// Ranking with ties: 1, 2, 2, 4. Students without an overall average get no rank.
export function rankValues(values) {
  const sorted = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => b - a);
  return values.map((v) => (v === null || v === undefined || !Number.isFinite(v) ? null : sorted.findIndex((x) => x === v) + 1));
}

// One row per student: every subject, the overall average, whether everything is complete, and the rank.
export function buildReport({ structures, marks, enrollments, subjects, sems, gradeId, stream, places, passMark }) {
  const ctx = { structures, marks, sems, gradeId, stream, places };
  const rows = enrollments.map((enrollment) => {
    const results = subjects.map((subject) => ({ subject, ...subjectYear(ctx, enrollment.id, subject.id) }));
    const overall = averagePercent(results.map((r) => r.yearly.average), places);
    // A subject with no structure or no marks makes the student "incomplete": missing is never counted as zero silently.
    const complete = subjects.length > 0 && results.every((r) => r.yearly.complete);
    return { enrollment, results, overall, complete, passed: overall !== null && isPass(overall, 100, passMark) };
  });
  const ranks = rankValues(rows.map((r) => r.overall));
  rows.forEach((r, i) => (r.rank = ranks[i]));
  const classAverages = subjects.map((_, i) => averagePercent(rows.map((r) => r.results[i].yearly.average), places));
  return { rows, classAverages, classOverall: averagePercent(rows.map((r) => r.overall), places) };
}

// Suggested year-end decision (the director confirms it). Rule decided by the school:
// the overall yearly average must be at or above the pass mark. Incomplete results get no suggestion.
export function suggestDecision({ overall, complete, gradeNumber, passMark }) {
  if (overall === null || !complete) return null;
  if (!isPass(overall, 100, passMark)) return "repeat";
  return gradeNumber >= 12 ? "graduate" : "promote";
}

// Does this decision need the director to choose a stream? Only when moving from Grade 10 to Grade 11
// (a Grade 11 student keeps the stream; Grades 9 and 10 have none).
export const needsStream = (decision, gradeNumber) => decision === "promote" && gradeNumber === 10;

export const effectiveStreamOf = (streamId, streams) => effectiveStream(streamId, streams);
