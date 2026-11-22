// Proposes how to spread students over sections. It never decides the number of sections:
// the registrar chooses it (existing sections plus any new ones proposed), and can move students afterwards.
//
// students: [{ id, sex: "male"|"female", result: number|null, sectionKey: string|null }]
// sections: [{ key, capacity: number|null }]
// keepPlaced: students who already have a section stay there and count toward the balance.
// Each student goes to the section with the fewest students, then the fewest of the same sex,
// then the lowest total of Grade 8 results. Students are dealt out from the highest result down,
// so every section gets a similar mix. Full sections (capacity) are skipped.
export function proposeAllocation({ students, sections, keepPlaced = true }) {
  const state = new Map(sections.map((s) => [s.key, { total: 0, male: 0, female: 0, sum: 0, cap: s.capacity ?? Infinity }]));
  const assign = new Map();
  const bump = (x, st) => {
    x.total += 1;
    x[st.sex === "female" ? "female" : "male"] += 1;
    x.sum += st.result ?? 0;
  };

  const toPlace = [];
  for (const st of students) {
    if (keepPlaced && st.sectionKey && state.has(st.sectionKey)) {
      bump(state.get(st.sectionKey), st);
      assign.set(st.id, st.sectionKey);
    } else {
      toPlace.push(st);
    }
  }
  toPlace.sort((a, b) => (b.result ?? -1) - (a.result ?? -1) || String(a.id).localeCompare(String(b.id)));

  const leftover = [];
  for (const st of toPlace) {
    const sexKey = st.sex === "female" ? "female" : "male";
    let best = null;
    let bestScore = null;
    for (const s of sections) {
      const x = state.get(s.key);
      if (x.total >= x.cap) continue;
      const score = [x.total, x[sexKey], x.sum];
      if (!best || score[0] < bestScore[0] || (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])))) {
        best = s;
        bestScore = score;
      }
    }
    if (!best) {
      leftover.push(st.id);
      assign.set(st.id, null);
    } else {
      bump(state.get(best.key), st);
      assign.set(st.id, best.key);
    }
  }
  return { assign, leftover };
}

export const suggestSectionCount = (students, target) => (target > 0 ? Math.max(1, Math.ceil(students / target)) : null);

// Summary numbers for one section column
export function sectionStats(students, key) {
  const list = students.filter((s) => s.sectionKey === key);
  const results = list.map((s) => s.result).filter((r) => r != null);
  return {
    total: list.length,
    female: list.filter((s) => s.sex === "female").length,
    male: list.filter((s) => s.sex !== "female").length,
    avg: results.length ? results.reduce((a, b) => a + b, 0) / results.length : null,
  };
}
