// Coverage of fan-out-gate.ts: a request after a quiet interval runs at once,
// a burst runs once more at the interval's end, and never faster.

import { expect, test } from "vitest";

import { ACTIVITY_FAN_OUT_INTERVAL_MS, FanOutGate } from "../fan-out-gate.ts";
import { FakeClock } from "./fake-clock.ts";

test("the first request runs at once; a burst inside the interval runs once, at its end", () => {
  const clock = new FakeClock(0);
  const runs: number[] = [];
  const gate = new FanOutGate(clock, () => runs.push(clock.now()));
  gate.request();
  for (let at = 10; at < ACTIVITY_FAN_OUT_INTERVAL_MS; at += 10) {
    clock.advanceTo(at);
    gate.request();
  }
  expect(runs).toStrictEqual([0]);
  clock.advanceTo(ACTIVITY_FAN_OUT_INTERVAL_MS);
  expect(runs).toStrictEqual([0, ACTIVITY_FAN_OUT_INTERVAL_MS]);
  clock.advance(10_000);
  expect(runs, "nothing runs without a request").toStrictEqual([0, ACTIVITY_FAN_OUT_INTERVAL_MS]);
});

test("a request every millisecond for ten seconds runs at most four times a second", () => {
  const clock = new FakeClock(0);
  const runs: number[] = [];
  const gate = new FanOutGate(clock, () => runs.push(clock.now()));
  for (let at = 0; at < 10_000; at += 1) {
    clock.advanceTo(at);
    gate.request();
  }
  clock.advance(1_000);
  for (let start = 0; start < 10_000; start += 1) {
    expect(runs.filter((at) => at >= start && at < start + 1_000).length <= 4, `window at ${start}`).toBeTruthy();
  }
  expect(runs.length >= 39, "and it keeps up: one run per interval").toBeTruthy();
});
