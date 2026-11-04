// A step run in an answer-first attempt is never "Testing" (t869): an attempt does the task, and a Flow
// it runs forward is the work. Every other kind of unit reads as it always did, byte for byte.

import assert from "node:assert/strict";
import { test } from "vitest";
import { ACTIVITY_ATTEMPT_WORDS } from "fluxiq/ui";
import { activityEvent } from "../../../tests/activity-fixture.ts";
import { cardWords } from "../card-words.ts";
import { stepMessages } from "../messages.ts";

const TITLE = 'Clicking “Accept” for “Ximena Ruiz”';

/** A forward run's step under the unit's own activity, as Core emits it: the `verifying` phase. */
const forwardStep = (opening: string) => [
  activityEvent(1, { phase: "building", label: opening, detail: { kind: "step", title: "Started", status: "started" } }),
  activityEvent(2, { phase: "verifying", detail: { kind: "tool", title: TITLE, ref: "core.run_node", status: "started", text: "Node: web.output.dom-click" } }),
  activityEvent(3, { phase: "verifying", detail: { kind: "tool", title: TITLE, ref: "core.run_node", status: "succeeded", text: "Result: core.replay.replayed · Node: web.output.dom-click" } })
];

const cardOf = (opening: string) => stepMessages(forwardStep(opening), 100).flatMap((message) => message.actions)[0]!;

test("a forward run's step in an answer-first attempt reads as the work, not as a test", () => {
  const card = cardOf(ACTIVITY_ATTEMPT_WORDS.working);
  assert.equal(card.testing, undefined);
  const words = cardWords(card, false);
  assert.equal(words.name.startsWith("Testing"), false);
  assert.equal(words.name, "Click");
});

test("the same step in a candidate build still reads as a test", () => {
  const card = cardOf("Building the Flow");
  assert.equal(card.testing, true);
  assert.equal(cardWords(card, false).name, "Testing: Click");
});
