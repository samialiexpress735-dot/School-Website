import { test } from "node:test";
import assert from "node:assert/strict";
import { changedIds } from "../src/lib/rowflash.js";

test("first load flashes nothing", () => {
  const { ids, next } = changedIds(null, [{ id: "a", n: 1 }, { id: "b", n: 2 }]);
  assert.equal(ids.size, 0);
  assert.equal(next.size, 2);
});

test("an added row and a changed row flash; an unchanged row does not", () => {
  const first = changedIds(null, [{ id: "a", n: 1 }, { id: "b", n: 2 }]).next;
  const { ids } = changedIds(first, [{ id: "a", n: 1 }, { id: "b", n: 3 }, { id: "c", n: 9 }]);
  assert.deepEqual([...ids].sort(), ["b", "c"]);
});

test("a removed row does not flash anything; same data twice flashes nothing", () => {
  const first = changedIds(null, [{ id: "a", n: 1 }, { id: "b", n: 2 }]).next;
  assert.equal(changedIds(first, [{ id: "a", n: 1 }]).ids.size, 0);
  assert.equal(changedIds(first, [{ id: "a", n: 1 }, { id: "b", n: 2 }]).ids.size, 0);
});

test("starting from an empty list, the first added row flashes", () => {
  const first = changedIds(null, []).next;
  assert.deepEqual([...changedIds(first, [{ id: "x", n: 1 }]).ids], ["x"]);
});

test("a custom key works", () => {
  const first = changedIds(null, [{ k: 1, v: "a" }], (r) => r.k).next;
  assert.deepEqual([...changedIds(first, [{ k: 1, v: "b" }], (r) => r.k).ids], [1]);
});
