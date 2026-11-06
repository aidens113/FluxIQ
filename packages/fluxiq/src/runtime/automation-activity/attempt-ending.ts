// The attempt's closing row, said when its answer is stored.
//
// A build's own closing row (`./build.ts`) comes when the whole build call returns, which is after the
// attempt stored its answer: for those seconds the answer card said it was done while the toast and the
// header still said "Working" (t869, `strip-and-limits.md`). So the attempt says its ending itself, the
// moment its answer is stored, and the build, told that it did, does not say it again.
//
// The tracker is per build call, carried along its async work, so an attempt outside a build says
// nothing and one build never marks another.

import { AsyncLocalStorage } from "node:async_hooks";
import { answeredEnding, emitAnsweredEnding } from "./answered-ending.ts";

type Tracker = { ended: boolean };

const trackers = new AsyncLocalStorage<Tracker>();

/** Runs `fn` as one build's work, and says whether the attempt inside it already said its ending. */
export async function runWithAttemptEndingTracked<T>(fn: () => Promise<T>): Promise<{ value: T; ended: boolean }> {
  const tracker: Tracker = { ended: false };
  const value = await trackers.run(tracker, fn);
  return { value, ended: tracker.ended };
}

/** Says the ending of an answered attempt, once per build. Nothing outside a build, and nothing for an answer with no ending of its own. */
export function emitAutomationStudioAttemptEnded(answer: unknown): void {
  const tracker = trackers.getStore();
  const ending = answeredEnding(answer);
  if (!tracker || tracker.ended || !ending) return;
  tracker.ended = true;
  emitAnsweredEnding(ending);
}
