// Step 5: the assessment-calculation engine (blueprint 4.6).
//
// A STRUCTURE belongs to one semester of one subject (and grade, and optionally stream).
// It holds GROUPS, and each group holds COMPONENTS (quiz, test, final exam ...).
//
//   raw total of a group   = sum of the raw marks of its components
//   converted              = raw total / raw maximum * scale_to      (only when scale_to is set)
//   scaled                 = converted * factor                       (factor 1 = unchanged)
//   semester result        = sum of the scaled values of all groups, OR the custom formula
//   rounding               = once, at the end, half up, to rounding_places decimals
//
// The same file is used for live totals while typing and for the results screens.
// Nothing here talks to the database.

export class FormulaError extends Error {
  constructor(code, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code; // "empty" | "syntax" | "unknownName" | "unknownFunction" | "divideByZero"
    this.detail = detail;
  }
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toNum = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

// Round half up. "1.005" to 2 places gives 1.01 (plain Math.round would give 1).
export function roundTo(x, places = 0) {
  if (!isNum(x)) return x;
  const p = Math.max(0, Math.min(6, Number(places) || 0));
  const shifted = Number(`${Math.abs(x)}e${p}`);
  const rounded = Number(`${Math.round(shifted)}e-${p}`);
  return x < 0 ? -rounded : rounded;
}

// ---------- Reading the structure ----------

export const componentsOf = (group) => group?.components || [];
export const groupRawMax = (group) =>
  componentsOf(group).reduce((s, c) => {
    const v = toNum(c.raw_max);
    return isNum(v) ? s + v : s;
  }, 0);

// What a group is worth in the semester result (its highest possible scaled value).
export function groupOutMax(group) {
  const raw = groupRawMax(group);
  const converted = isNum(toNum(group.scale_to)) ? toNum(group.scale_to) : raw;
  const factor = isNum(toNum(group.factor)) ? toNum(group.factor) : 1;
  return converted * factor;
}

// Sum of what all groups are worth. Equals final_max when no custom formula is used.
export const groupsOutMax = (structure) => (structure?.groups || []).reduce((s, g) => s + groupOutMax(g), 0);

export const allComponents = (structure) => (structure?.groups || []).flatMap((g) => componentsOf(g));
export const hasFinalExam = (structure) => allComponents(structure).some((c) => c.is_final_exam);

// Does the structure add up? (Not applicable when a custom formula is set.)
export function structureBalanced(structure) {
  if (structure?.formula && String(structure.formula).trim()) return true;
  return Math.abs(groupsOutMax(structure) - toNum(structure?.final_max ?? 100)) < 0.005;
}

// Builds nested structures from the three flat tables.
export function assembleStructures(structures, groups, components) {
  const byGroup = new Map();
  for (const c of [...components].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!byGroup.has(c.group_id)) byGroup.set(c.group_id, []);
    byGroup.get(c.group_id).push(c);
  }
  const byStructure = new Map();
  for (const g of [...groups].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!byStructure.has(g.structure_id)) byStructure.set(g.structure_id, []);
    byStructure.get(g.structure_id).push({ ...g, components: byGroup.get(g.id) || [] });
  }
  return structures.map((s) => ({ ...s, groups: byStructure.get(s.id) || [] }));
}

// A stream-specific structure wins over the "all streams" one (stream_id null).
// "General" (Grades 9-10) counts as no stream.
export function effectiveStream(streamId, streams = []) {
  if (!streamId) return null;
  const st = streams.find((s) => s.id === streamId);
  return st && st.code === "general" ? null : streamId;
}

export function pickStructure(structures, { semesterId, gradeId, streamId = null, subjectId }) {
  const pool = structures.filter((s) => s.semester_id === semesterId && s.grade_id === gradeId && s.subject_id === subjectId);
  return pool.find((s) => streamId && s.stream_id === streamId) || pool.find((s) => !s.stream_id) || null;
}

// ---------- Typed marks ----------

// Reads what a teacher typed. Accepts "12", "12.5", "12,5". Returns
//   { empty: true }  for a blank cell,
//   { ok: true, value }  for a good mark,
//   { ok: false, error: "invalid" | "negative" | "decimals" | "over" }.
export function parseScore(text, rawMax) {
  const s = String(text ?? "").trim().replace(",", ".");
  if (s === "") return { empty: true, ok: true, value: null };
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, error: "invalid" };
  const v = Number(s);
  if (v < 0) return { ok: false, error: "negative" };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: "decimals" };
  if (v > toNum(rawMax) + 1e-9) return { ok: false, error: "over" };
  return { ok: true, value: v };
}

// ---------- Custom formulas ----------
// A tiny, safe expression language: numbers, + - * / ( ), MIN(...), MAX(...), and the names
//   <GROUP>      the scaled value of a group (what it adds to the result)
//   <GROUP>_RAW  the raw total of a group
// Example:  MAX(CA, FINAL) + MIN(CA_RAW, 20)
// Nothing else is allowed, and nothing is ever run as code.

function tokenize(text) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(.))/y;
  const src = String(text);
  let m;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) tokens.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: "id", v: m[2].toUpperCase() });
    else if (m[3] !== undefined && m[3].trim() !== "") tokens.push({ t: "op", v: m[3] });
  }
  return tokens;
}

export function parseFormula(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) throw new FormulaError("empty");
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const isOp = (v) => peek() && peek().t === "op" && peek().v === v;

  function expr() {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = take().v;
      left = { k: "bin", op, l: left, r: term() };
    }
    return left;
  }
  function term() {
    let left = unary();
    while (isOp("*") || isOp("/")) {
      const op = take().v;
      left = { k: "bin", op, l: left, r: unary() };
    }
    return left;
  }
  function unary() {
    if (isOp("-")) { take(); return { k: "neg", e: unary() }; }
    if (isOp("+")) { take(); return unary(); }
    return primary();
  }
  function primary() {
    const tk = take();
    if (!tk) throw new FormulaError("syntax", "end");
    if (tk.t === "num") return { k: "num", v: tk.v };
    if (tk.t === "id") {
      if (isOp("(")) {
        take();
        if (tk.v !== "MIN" && tk.v !== "MAX") throw new FormulaError("unknownFunction", tk.v);
        const args = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) { take(); args.push(expr()); }
        }
        if (!isOp(")")) throw new FormulaError("syntax", ")");
        take();
        if (args.length === 0) throw new FormulaError("syntax", tk.v);
        return { k: "fn", name: tk.v, args };
      }
      return { k: "var", name: tk.v };
    }
    if (tk.v === "(") {
      const e = expr();
      if (!isOp(")")) throw new FormulaError("syntax", ")");
      take();
      return e;
    }
    throw new FormulaError("syntax", tk.v);
  }

  const ast = expr();
  if (i < tokens.length) throw new FormulaError("syntax", String(tokens[i].v));
  return ast;
}

export function evalFormula(ast, vars) {
  switch (ast.k) {
    case "num": return ast.v;
    case "var":
      if (!Object.prototype.hasOwnProperty.call(vars, ast.name)) throw new FormulaError("unknownName", ast.name);
      return vars[ast.name];
    case "neg": return -evalFormula(ast.e, vars);
    case "fn": {
      const vals = ast.args.map((a) => evalFormula(a, vars));
      return ast.name === "MIN" ? Math.min(...vals) : Math.max(...vals);
    }
    case "bin": {
      const a = evalFormula(ast.l, vars);
      const b = evalFormula(ast.r, vars);
      if (ast.op === "+") return a + b;
      if (ast.op === "-") return a - b;
      if (ast.op === "*") return a * b;
      if (b === 0) throw new FormulaError("divideByZero");
      return a / b;
    }
    default:
      throw new FormulaError("syntax");
  }
}

// The names a formula may use for this structure.
export function formulaNames(structure) {
  const names = [];
  for (const g of structure?.groups || []) {
    const code = String(g.code || "").toUpperCase();
    if (code) names.push(code, `${code}_RAW`);
  }
  return names;
}

// Returns null when the formula is fine, otherwise a FormulaError.
export function checkFormula(structure) {
  const text = structure?.formula;
  if (!text || !String(text).trim()) return null;
  try {
    const ast = parseFormula(text);
    const vars = Object.fromEntries(formulaNames(structure).map((n) => [n, 1]));
    evalFormula(ast, vars);
    return null;
  } catch (e) {
    return e instanceof FormulaError ? e : new FormulaError("syntax", String(e?.message || e));
  }
}

// ---------- The semester calculation ----------

// scores: a Map or plain object of componentId -> number (missing = not entered yet)
export function computeSemester(structure, scores = {}) {
  const get = (id) => {
    const v = scores instanceof Map ? scores.get(id) : scores[id];
    return isNum(v) ? v : undefined;
  };
  const places = Number(structure?.rounding_places) || 0;
  let missing = 0;

  const groups = (structure?.groups || []).map((g) => {
    const comps = componentsOf(g);
    const rawMax = groupRawMax(g);
    let raw = 0;
    let entered = 0;
    for (const c of comps) {
      const v = get(c.id);
      if (v === undefined) missing += 1;
      else { raw += v; entered += 1; }
    }
    const converted = isNum(toNum(g.scale_to)) ? toNum(g.scale_to) : rawMax;
    const factor = isNum(toNum(g.factor)) ? toNum(g.factor) : 1;
    const out = rawMax > 0 ? (raw * converted * factor) / rawMax : 0;
    return { id: g.id, code: g.code, raw, rawMax, out, outMax: converted * factor, entered, count: comps.length, complete: entered === comps.length };
  });

  let total = groups.reduce((s, g) => s + g.out, 0);
  let formulaError = null;
  if (structure?.formula && String(structure.formula).trim()) {
    try {
      const vars = {};
      for (const g of groups) {
        const code = String(g.code || "").toUpperCase();
        vars[code] = g.out;
        vars[`${code}_RAW`] = g.raw;
      }
      total = evalFormula(parseFormula(structure.formula), vars);
    } catch (e) {
      formulaError = e instanceof FormulaError ? e : new FormulaError("syntax");
    }
  }

  const max = toNum(structure?.final_max ?? 100);
  return {
    groups,
    total,
    result: formulaError ? null : roundTo(total, places),
    max,
    missing,
    complete: missing === 0 && groups.length > 0,
    formulaError,
  };
}

// ---------- Pass or fail, yearly average ----------

// passMark is a percent of the final mark maximum (school setting "pass_mark").
export const isPass = (result, max, passMark) => isNum(result) && max > 0 && result * 100 >= passMark * max - 1e-9;

export const percent = (result, max) => (isNum(result) && max > 0 ? (result / max) * 100 : null);

// results: one entry per semester, each { result, max, complete } or null when there is no result.
// The yearly average is the mean of the semester results, each taken as a percent of its maximum,
// so semesters with different maximums still compare fairly.
// "complete" is true only when both semesters have a complete result.
export function computeYearly(results, places = 1) {
  const have = results.filter((r) => r && isNum(r.result) && r.max > 0);
  if (have.length === 0) return { average: null, complete: false, semesters: 0 };
  const avg = have.reduce((s, r) => s + percent(r.result, r.max), 0) / have.length;
  return {
    average: roundTo(avg, places),
    complete: results.length > 0 && results.every((r) => r && r.complete && isNum(r.result)),
    semesters: have.length,
  };
}

// Average of several subject results (each a percent), for the overall average of a student.
export function averagePercent(values, places = 1) {
  const v = values.filter(isNum);
  return v.length ? roundTo(v.reduce((s, x) => s + x, 0) / v.length, places) : null;
}
