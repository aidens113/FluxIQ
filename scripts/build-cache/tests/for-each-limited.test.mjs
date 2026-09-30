// The bounded pool a restore copies with: every item once, never more than
// the limit at a time, and after a failure nothing new starts while the jobs
// already running are awaited before the first error is thrown.

import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { forEachLimited } from "../index.mjs";

test("runs every item exactly once, never more than the limit at a time", async () => {
  const items = Array.from({ length: 50 }, (_, index) => index);
  const seen = [];
  let running = 0;
  let peak = 0;
  await forEachLimited(items, 16, async (item, index) => {
    assert.equal(item, index);
    running += 1;
    peak = Math.max(peak, running);
    await delay(item % 5);
    seen.push(item);
    running -= 1;
  });
  assert.deepEqual(seen.sort((a, b) => a - b), items);
  assert.equal(peak, 16);
});

test("after a failure no new job starts, running ones finish, and the first error is thrown", async () => {
  const started = [];
  let running = 0;
  const failure = new Error("first");
  await assert.rejects(
    forEachLimited(Array.from({ length: 40 }, (_, index) => index), 4, async (item) => {
      started.push(item);
      running += 1;
      await delay(item === 2 ? 1 : 10);
      running -= 1;
      if (item === 2) throw failure;
      if (item === 3) throw new Error("second");
    }),
    (error) => error === failure
  );
  assert.equal(running, 0, "nothing was still running when the error was thrown");
  assert.deepEqual(started.sort((a, b) => a - b), [0, 1, 2, 3]);
});

test("an empty list does nothing, and a limit below one is refused", async () => {
  await forEachLimited([], 16, async () => assert.fail("no job for an empty list"));
  await assert.rejects(forEachLimited([1], 0, async () => {}), RangeError);
});
