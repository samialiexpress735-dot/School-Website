import test from "node:test";
import assert from "node:assert/strict";
import { countStep, easeOutCubic, glideDeltas, newlyFlagged, unbalancedKeys } from "../src/lib/motion.js";

test("count step starts at the old value and ends exactly at the new one", () => {
  assert.equal(countStep(10, 20, 0), 10);
  assert.equal(countStep(10, 20, 1), 20);
  const mid = countStep(10, 20, 0.5);
  assert.ok(mid > 10 && mid < 20);
});

test("count step keeps whole numbers whole and keeps decimals when asked", () => {
  assert.equal(Number.isInteger(countStep(0, 7, 0.37, 0)), true);
  assert.equal(countStep(0, 1, 0.5, 2).toString().split(".")[1]?.length <= 2, true);
});

test("count step never invents a number when a value is missing", () => {
  assert.equal(countStep(NaN, 5, 0.3), 5);
  assert.ok(Number.isNaN(countStep(3, NaN, 0.3)));
});

test("easing is clamped to 0..1", () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(2), 1);
});

test("only students who newly reach the limit pulse", () => {
  assert.equal(newlyFlagged(null, new Set(["a"])).size, 0); // first load: nothing pulses
  const r = newlyFlagged(new Set(["a"]), new Set(["a", "b"]));
  assert.deepEqual([...r], ["b"]);
  assert.equal(newlyFlagged(new Set(["a", "b"]), new Set(["a"])).size, 0);
});

test("glide: only items that existed and moved get a delta", () => {
  const prev = new Map([["a", { left: 0, top: 0 }], ["b", { left: 100, top: 40 }], ["c", { left: 5, top: 5 }]]);
  const next = new Map([["a", { left: 0, top: 0 }], ["b", { left: 300, top: 10 }], ["c", { left: 5.4, top: 5 }], ["d", { left: 1, top: 1 }]]);
  const d = glideDeltas(prev, next);
  assert.deepEqual([...d.keys()], ["b"]);
  assert.deepEqual(d.get("b"), { dx: -200, dy: 30 });
});

test("unbalanced columns: far from the average by 25% and at least 2 students", () => {
  assert.equal(unbalancedKeys(new Map([["a", 30]])).size, 0);
  assert.equal(unbalancedKeys(new Map([["a", 30], ["b", 31]])).size, 0);
  assert.deepEqual([...unbalancedKeys(new Map([["a", 20], ["b", 40], ["c", 30]]))].sort(), ["a", "b"]);
  assert.equal(unbalancedKeys(new Map([["a", 1], ["b", 3]])).size, 0); // 1 vs 3: avg 2, differ by 1 only
});
