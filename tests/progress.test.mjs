import { test } from "node:test";
import assert from "node:assert/strict";
import { readProgress, activate, distanceToSegment } from "../src/progress.mjs";
test("corrupt or incompatible saves start a valid journey", () => {
  for (const bad of ["{broken", "null", '{"version":2}', null])
    assert.deepEqual(readProgress(bad), {
      version: 1,
      awakened: [],
      completed: false,
    });
});
test("tampered saves cannot skip the three gardens", () => {
  const p = readProgress(
    JSON.stringify({
      version: 1,
      awakened: ["dawn", "dawn", "fake"],
      completed: true,
    }),
  );
  assert.deepEqual(p, { version: 1, awakened: ["dawn"], completed: false });
});
test("home unlocks only after all three unique gardens and survives reload", () => {
  let p = readProgress(null);
  p = activate(p, "home");
  assert.equal(p.completed, false);
  for (const id of ["ember", "dawn", "dawn", "fern"]) p = activate(p, id);
  assert.equal(p.awakened.length, 3);
  assert.equal(p.completed, false);
  p = activate(p, "home");
  assert.equal(p.completed, true);
  assert.deepEqual(readProgress(JSON.stringify(p)), p);
});
test("bridge distance clamps to endpoints and supports all headings", () => {
  assert.equal(distanceToSegment(5, 2, 0, 0, 10, 0), 2);
  assert.equal(distanceToSegment(-3, 0, 0, 0, 10, 0), 3);
  assert.equal(distanceToSegment(4, 3, 0, 0, 0, 0), 5);
  assert.ok(distanceToSegment(-5, -5, 0, 0, -10, -10) < 1e-9);
});
