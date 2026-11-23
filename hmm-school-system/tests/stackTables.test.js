import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Tables that turn into cards on phones show each cell with its column name (data-label) in front of it.
// A cell without one would be a bare value on the card, so every <td> of such a table must say what it is
// (data-label, even an empty one on purpose), be the card title (stack-title), span columns, or be empty.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk("src/pages").filter((f) => f.endsWith(".jsx"));

test("every cell of a card-on-phone table has a label or is the card title", () => {
  let checked = 0;
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    if (!s.includes('table className="stack"')) continue;
    for (const m of s.matchAll(/<td\b[^>]*>/g)) {
      const tag = m[0];
      checked += 1;
      assert.ok(/data-label|stack-title|colSpan|\/>$/.test(tag), `${f}: ${tag}`);
    }
  }
  assert.ok(checked > 20);
});

test("the staff list, assignments and results tables are card tables", () => {
  for (const f of ["src/pages/staff/StaffListPage.jsx", "src/pages/staff/AssignmentsPage.jsx", "src/pages/marks/ResultsPage.jsx"]) {
    assert.ok(fs.readFileSync(f, "utf8").includes('table className="stack"'), f);
  }
});
