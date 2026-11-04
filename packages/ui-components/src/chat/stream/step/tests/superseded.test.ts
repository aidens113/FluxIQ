// A failed step of a test that a later passed check got past is no red failure
// (`superseded.ts`): A 19 of the answer-first study showed "Didn't work: it
// didn't do the same when the test tried it again" in red directly above
// "Passed" and a Flow that is ready.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ActionCard } from "../action-card.ts";
import { cardWords } from "../card-words.ts";
import type { StepMessage } from "../messages.ts";
import { calmSupersededFailures } from "../superseded.ts";

const base = { target: null, why: null, said: undefined, answer: undefined, check: false } as const;
const failedStep = (sequence: number, activityId = "build-1"): ActionCard => ({ ...base, kind: "navigate", name: "Next page", outcome: "failed", why: "it didn't do the same when the test tried it again", testing: true, key: `action:${activityId}#${sequence}` });
const passedCheck = (sequence: number, activityId = "build-1"): ActionCard => ({ ...base, kind: "result_check", outcome: "done", check: true, said: "10 rows would be stored.", key: `action:${activityId}#${sequence}` });
const unconfirmedCheck = (sequence: number): ActionCard => ({ ...base, kind: "result_check", outcome: "failed", check: true, unconfirmed: true, key: `action:build-1#${sequence}` });
const message = (sequence: number, card: ActionCard, activityId = "build-1"): StepMessage => ({ key: `step:${activityId}#${sequence}`, activityId, kind: "step", title: "Testing", text: undefined, actions: [card], at: sequence * 1_000, sequence, latest: false });

test("a failed test step is neutral once a later check of its build passed, and keeps its words", () => {
  const [step] = calmSupersededFailures([message(1, failedStep(2)), message(3, passedCheck(4))]);
  const card = step!.actions[0]!;
  assert.equal(card.superseded, true);
  const words = cardWords(card, false);
  assert.equal(words.state, "settled");
  assert.equal(words.outcome, "Didn't work: it didn't do the same when the test tried it again");
});

test("it stays red with no later pass, after an unconfirmed result, for another unit, or when the pass came first", () => {
  assert.equal(cardWords(calmSupersededFailures([message(1, failedStep(2))])[0]!.actions[0]!, false).state, "failed");
  assert.equal(cardWords(calmSupersededFailures([message(1, failedStep(2)), message(3, unconfirmedCheck(4))])[0]!.actions[0]!, false).state, "failed");
  assert.equal(cardWords(calmSupersededFailures([message(1, failedStep(2)), message(3, passedCheck(4, "build-2"), "build-2")])[0]!.actions[0]!, false).state, "failed");
  assert.equal(cardWords(calmSupersededFailures([message(1, passedCheck(2)), message(3, failedStep(4))])[1]!.actions[0]!, false).state, "failed");
});

test("a run's own step failure is never calmed, only a test's", () => {
  const { testing: _test, ...run } = failedStep(2);
  assert.equal(cardWords(calmSupersededFailures([message(1, run), message(3, passedCheck(4))])[0]!.actions[0]!, false).state, "failed");
});
