// The turn clock: Core's own time when a turn has one; otherwise first-read
// turns are history and later ones take the time they were first seen; a turn
// keeps its time, and thread order always holds.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { CoreTurn } from "../../conversation/index.ts";
import { createTurnClock } from "../turn-clock.ts";

function turn(turnId: string): CoreTurn {
  return { turnId, author: "person", text: turnId, ask: null };
}

test("history keeps its place and new turns take the time they were first seen", () => {
  const clock = createTurnClock();
  const history = clock.stamp([turn("a"), turn("b")], Number.NEGATIVE_INFINITY);
  assert.deepEqual(history.map((entry) => entry.at), [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]);
  const later = clock.stamp([turn("a"), turn("b"), turn("c")], 1_000);
  assert.deepEqual(later.map((entry) => entry.at), [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, 1_000]);
  const again = clock.stamp([turn("a"), turn("b"), turn("c"), turn("d")], 2_000);
  assert.deepEqual(again.map((entry) => entry.at), [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, 1_000, 2_000]);
});

test("a turn is never earlier than the one before it", () => {
  const clock = createTurnClock();
  clock.stamp([turn("late")], 5_000);
  const stamped = clock.stamp([turn("late"), turn("new")], 3_000);
  assert.deepEqual(stamped.map((entry) => entry.at), [5_000, 5_000]);
});

test("a turn that left the window is forgotten, and comes back as new", () => {
  const clock = createTurnClock();
  clock.stamp([turn("a")], 1_000);
  clock.stamp([turn("b")], 2_000);
  assert.deepEqual(clock.stamp([turn("a"), turn("b")], 3_000).map((entry) => entry.at), [3_000, 3_000]);
});

test("a turn Core stamped takes Core's time, still never before the turn above it", () => {
  const clock = createTurnClock();
  const stamped = clock.stamp([{ ...turn("a"), createdAt: 4_000 }, turn("b"), { ...turn("c"), createdAt: 1_000 }], Number.NEGATIVE_INFINITY);
  assert.deepEqual(stamped.map((entry) => entry.at), [4_000, 4_000, 4_000]);
  assert.deepEqual(clock.stamp([{ ...turn("d"), createdAt: 9_000 }], 5_000).map((entry) => entry.at), [9_000]);
});
