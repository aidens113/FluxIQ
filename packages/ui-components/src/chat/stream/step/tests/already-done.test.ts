// A run step Core skipped because this run had already done its act for that
// row (Core's `executor/step-loop/already-done.ts`, t411) is its own short
// step message whose card reads "Already done — not repeated" for the row (its row names no act it could press): never a failure,
// never a step done again, never a retry that worked.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { activityEvent } from "../../../tests/activity-fixture.ts";
import { isAlreadyDoneStep } from "../already-done.ts";
import { cardWords } from "../card-words.ts";
import { stepMessages } from "../messages.ts";

const run = (sequence: number, fields: Partial<ClientGatewayActivity>) => activityEvent(sequence, { activityId: "run:r1", subject: { kind: "run", id: "r1", projectId: "p" }, ...fields });
/** Core's "Running step N" row for a confirm on `row`. */
const confirm = (sequence: number, index: number, row: string) => run(sequence, {
  phase: "running",
  label: `Running step ${index} of 6: Clicking “Confirm”`,
  step: { index, count: 6, nodeId: "n4.confirm", label: "Confirm", row },
  detail: { kind: "step", title: "Clicking “Confirm”", status: "started", ref: "n4.confirm", text: "Node: web.click" }
});
/** Core's row for the same confirm skipped as already done, as `already-done.ts` in a Core from before t416 emits it: no `skipped` field. */
const olderAlreadyDone = (sequence: number, index: number, row: string | undefined) => run(sequence, {
  phase: "running",
  label: row ? `Already done for ${row}` : "Already done: Confirm",
  step: { index, count: 6, nodeId: "n4.confirm", label: "Confirm", ...(row ? { row } : {}) },
  detail: { kind: "step", title: row ? `Already done for ${row}` : "Already done: Confirm", status: "succeeded", ref: "n4.confirm" }
});
/** The same row as Core emits it since t416, with the closed `skipped` field. */
const alreadyDone = (sequence: number, index: number, row: string | undefined) => {
  const event = olderAlreadyDone(sequence, index, row);
  return { ...event, detail: { ...event.detail!, skipped: { reason: "already_done" as const, subject: row ?? "Confirm" } } };
};
const failedConfirm = (sequence: number) => run(sequence, {
  phase: "repairing",
  label: "Recovering from a failed step: Confirm",
  detail: { kind: "step", title: "Confirm", status: "failed", ref: "n4.confirm", text: "Result: web.action.rate_limited · Node: web.click" }
});

test("only Core's already-done row is read as one: a started step, a recovery row and a run's end are not", () => {
  assert.equal(isAlreadyDoneStep(alreadyDone(1, 4, "Lin Zhao")), true);
  assert.equal(isAlreadyDoneStep(confirm(1, 4, "Lin Zhao")), false);
  assert.equal(isAlreadyDoneStep(failedConfirm(1)), false);
  // A finished step that names the node it ran is a step that ran.
  assert.equal(isAlreadyDoneStep(run(1, { phase: "running", step: { index: 4, count: 6, nodeId: "n4.confirm" }, detail: { kind: "step", title: "Confirm", status: "succeeded", ref: "n4.confirm", text: "Node: web.click" } })), false);
  assert.equal(isAlreadyDoneStep(run(1, { phase: "done", final: true, detail: { kind: "step", title: "Run finished", status: "succeeded" } })), false);
  assert.equal(isAlreadyDoneStep(run(1, { phase: "running", detail: { kind: "step", title: "Recovered", status: "succeeded", ref: "n4.confirm", recovery: { kind: "route", subject: "Requests", outcome: "succeeded" } } })), false);
});

test("the skipped field decides, not the row's shape: an older Core's row without it still reads by its shape", () => {
  assert.equal(isAlreadyDoneStep(olderAlreadyDone(1, 4, "Lin Zhao")), true);
  assert.equal(isAlreadyDoneStep(olderAlreadyDone(1, 4, undefined)), true);
  const now = alreadyDone(1, 4, "Lin Zhao");
  // A field that says already done wins even where the shape would not.
  assert.equal(isAlreadyDoneStep({ ...now, detail: { ...now.detail, text: "Node: web.click" } }), true);
  // Another reason, or a value outside the contract, is never taken for already done from the shape.
  assert.equal(isAlreadyDoneStep({ ...now, detail: { ...now.detail, skipped: { reason: "state_routed" } } }), false);
  assert.equal(isAlreadyDoneStep({ ...now, detail: { ...now.detail, skipped: { reason: "guessed" } } } as unknown as ClientGatewayActivity), false);
});

test("an older Core's already-done rows still give Already done cards", () => {
  const messages = stepMessages([confirm(1, 4, "Lin Zhao"), olderAlreadyDone(2, 4, "Lin Zhao")], 100);
  assert.deepEqual(messages.map((message) => cardWords(message.actions[0]!, false).outcome), ["Done", "Already done — not repeated"]);
});

test("an already-done step is a short step message whose card says Already done for its row, after the steps that did the work", () => {
  const events = [
    confirm(1, 4, "Amara Osei"),
    confirm(2, 4, "Lin Zhao"),
    alreadyDone(3, 4, "Amara Osei"),
    alreadyDone(4, 4, "Lin Zhao"),
    run(5, { phase: "done", final: true, detail: { kind: "step", title: "Run finished", status: "succeeded" } })
  ];
  const messages = stepMessages(events, 100).filter((message) => message.title !== "Run finished");
  assert.deepEqual(messages.map((message) => message.title), ["Step 4: Confirm", "Step 4: Confirm", "Step 4: Confirm", "Step 4: Confirm"]);
  const words = messages.map((message) => cardWords(message.actions[0]!, false));
  assert.deepEqual(words.map((card) => [card.target, card.state, card.outcome]), [
    ["Confirm · Amara Osei", "done", "Done"],
    ["Confirm · Lin Zhao", "done", "Done"],
    ["Confirm · Amara Osei", "done", "Already done — not repeated"],
    ["Confirm · Lin Zhao", "done", "Already done — not repeated"]
  ]);
  for (const card of words) assert.doesNotMatch(card.label, /Didn't work|already_done|executor\./u);
  assert.deepEqual(messages.map((message) => message.actions[0]!.again), [undefined, undefined, undefined, undefined], "nothing is folded as done again");
});

// Live run `run-mwbadi79-d928f922`, attempt 2: the saved Flow's run found its Post already done by
// attempt 1 and pressed nothing, yet its card read "Click · Post — Done". That skip is Core's
// answer-first run gate (`answer-first/run-acts/run-gate.ts`, t861), which decides inside the node's
// executor, so it comes after the step was announced, names the announced node, and numbers no step
// of its own -- unlike the engine's own skip, which comes in place of the step.
const attemptRow = (sequence: number, kind: "build" | "run", fields: Partial<ClientGatewayActivity>) =>
  activityEvent(sequence, { activityId: `${kind}:a2`, subject: { kind, id: "a2", projectId: "p" }, conversationId: "c1", ...fields });
const replayedPost = (kind: "build" | "run") => [
  attemptRow(1, kind, { phase: kind === "build" ? "building" : "running", label: "Working on your task" }),
  attemptRow(2, kind, {
    phase: "running",
    label: "Running step 7 of 7: Clicking “Post”",
    step: { index: 7, count: 7, nodeId: "node.main.s7", label: "Post" },
    detail: { kind: "step", title: "Clicking “Post”", status: "started", ref: "node.main.s7", text: "Node: web.output.dom-click" }
  }),
  // The run gate's row (`told` in run-gate.ts): no `step`, the node as `ref`.
  attemptRow(3, kind, {
    phase: "running",
    label: "Already done: Post",
    detail: { kind: "step", title: "Already done: Post", status: "succeeded", ref: "node.main.s7", skipped: { reason: "already_done", subject: "Post" } }
  }),
  attemptRow(4, kind, { phase: "running", label: "Checking the result", detail: { kind: "check", title: "Checking the result", status: "started" } })
];

for (const kind of ["build", "run"] as const) {
  test(`a step the run found already done after announcing it says so on its one card, never Done (${kind})`, () => {
    const messages = stepMessages(replayedPost(kind), 100);
    const posts = messages.filter((message) => message.actions.some((card) => card.target?.includes("Post")) || message.title.includes("Post"));
    assert.equal(posts.length, 1, "the skip row is no second message for the same step");
    const card = posts[0]!.actions[0]!;
    assert.equal(card.already, true);
    const words = cardWords(card, false);
    assert.deepEqual([words.state, words.outcome], ["done", "Already done — not pressed again"]);
    assert.doesNotMatch(words.label, /: Done$/u);
  });
}

test("an engine already-done row for the step announced before it keeps its own card, and the earlier pass stays Done", () => {
  // The engine numbers its own skip (`step`), and it comes in place of a later pass of the same step.
  const messages = stepMessages([confirm(1, 4, "Lin Zhao"), alreadyDone(2, 4, "Lin Zhao")], 100);
  assert.deepEqual(messages.map((message) => cardWords(message.actions[0]!, false).outcome), ["Done", "Already done — not repeated"]);
});

test("an already-done step after a failed one is no retry that worked, and a step with no row still says Already done", () => {
  const events = [
    confirm(1, 4, "Lin Zhao"),
    failedConfirm(2),
    alreadyDone(3, 4, "Lin Zhao"),
    alreadyDone(4, 5, undefined)
  ];
  const messages = stepMessages(events, 100);
  const cards = messages.map((message) => message.actions[0]!);
  assert.deepEqual(cards.map((card) => [card.outcome, card.retried === undefined]), [["failed", true], ["done", true], ["done", true]]);
  assert.equal(cardWords(cards[1]!, false).outcome, "Already done — not repeated");
  assert.equal(cardWords(cards[2]!, false).outcome, "Already done — not repeated");
  assert.equal(messages[2]!.title, "Step 5: Confirm");
});
