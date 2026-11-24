import test from "node:test";
import assert from "node:assert/strict";
import en from "../src/i18n/en.js";
import am from "../src/i18n/am.js";

const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const text = (o, key) => key.split(".").reduce((x, k) => x?.[k], o);

test("every English text has an Amharic text, and the other way round", () => {
  const e = new Set(flat(en)), a = new Set(flat(am));
  assert.deepEqual([...e].filter((k) => !a.has(k)), []);
  assert.deepEqual([...a].filter((k) => !e.has(k)), []);
});

test("placeholders such as {n} are the same in both languages", () => {
  const bad = [];
  for (const k of flat(en)) {
    const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    if (ph(text(en, k)) !== ph(text(am, k))) bad.push(k);
  }
  assert.deepEqual(bad, []);
});
