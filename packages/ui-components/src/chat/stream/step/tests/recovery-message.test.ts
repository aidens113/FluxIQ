// Coverage of recovery-message.ts, recovery-words.ts and their place in
// messages.ts and retried.ts: each recovery Core reports on a run step (the
// rows Core's `emitAutomationStudioActivityStepRecovery` sends) is its own
// message with its reasoning and a card, per kind, event and outcome, in plain
// words; a retry or a planned way round never reads as a failure; a recovery
// in the middle of a retry leaves "Done on the 2nd try" whole; and a step row
// with no recovery keeps today's reading.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { activityEvent } from "../../../tests/activity-fixture.ts";
import { cardWords } from "../card-words.ts";
import { stepMessages, type StepMessage } from "../messages.ts";
import { recoveryWords } from "../recovery-words.ts";

type Detail = NonNullable<ClientGatewayActivity["detail"]>;
type Recovery = { kind: string; subject: string; outcome: "succeeded" | "failed" | "refused"; event?: string; targetId?: string };

const RUN = { activityId: "run:r1", subject: { kind: "run" as const, id: "r1", projectId: "p" } };
const LABELS = { succeeded: "Recovered", failed: "Recovery did not work", refused: "Recovery not tried" } as const;

/** A run step starting, as Core sends it. */
const playStep = (sequence: number, index: number, node: string, label: string) => activityEvent(sequence, {
  ...RUN,
  phase: "running",
  label: `Running step ${index} of 3: ${label}`,
  step: { index, count: 3, nodeId: node, label },
  detail: { kind: "step", title: label, status: "started", ref: node, text: "Node: builtin.policy.action" }
});

/** A recovery row on `node`, as Core's step-recovery emitter sends it. */
const recoveryRow = (sequence: number, node: string, recovery: Recovery, fields: Partial<ClientGatewayActivity> = RUN) => activityEvent(sequence, {
  ...fields,
  phase: recovery.outcome === "succeeded" ? "running" : "repairing",
  label: `${LABELS[recovery.outcome]}: ${recovery.subject}`,
  detail: { kind: "step", title: recovery.subject, status: recovery.outcome === "succeeded" ? "succeeded" : "failed", ref: node, recovery } as Detail
});

/** Core's row that settles a failed step as its recovery opens. */
const recovering = (sequence: number, node: string, label: string) => activityEvent(sequence, {
  ...RUN,
  phase: "repairing",
  label: `Recovering from a failed step: ${label}`,
  detail: { kind: "step", title: label, status: "failed", ref: node, text: "Result: web.action.rate_limited · Node: builtin.policy.action" }
});

const retryThought = (sequence: number, node: string) => activityEvent(sequence, {
  ...RUN,
  phase: "repairing",
  label: "Trying the step again",
  detail: { kind: "thought", title: "Trying the step again", text: "The page said it was busy, so I'm trying the press again.", status: "succeeded", ref: node }
});

/** What a person reads of a message: its kind, title, reasoning, and its card's head and outcome. */
function read(message: StepMessage): [string, string, string | undefined, string, string | null, string, string | null] {
  const words = cardWords(message.actions[0]!, false);
  return [message.kind, message.title, message.text, words.name, words.target, words.state, words.outcome];
}

/** The recovery message for `recovery` on the step "Add the kettle", after that step started. */
function recoveryAfterStep(recovery: Recovery): StepMessage {
  const messages = stepMessages([playStep(1, 2, "n2.add", "Add the kettle"), recoveryRow(2, "n2.add", recovery)], 100);
  assert.equal(messages.length, 2, "the step and the recovery are a message each");
  return messages[1]!;
}

test("an extra step that worked reads by when it ran, names the step it was for, and is never a failure", () => {
  const close = (event: string) => recoveryAfterStep({ kind: "handler", subject: "Close the sign-up box", outcome: "succeeded", event, targetId: "handler.signup" });
  const card = ["Extra step", "Close the sign-up box", "done", "Done"] as const;
  assert.deepEqual(read(close("before")), ["recovery", "Cleared the way first", "Did this before “Add the kettle”, then carried on.", ...card]);
  assert.deepEqual(read(close("start")), ["recovery", "Got things ready first", "Did this before starting.", ...card]);
  assert.deepEqual(read(close("retry")), ["recovery", "Got ready to try again", "Did this before trying “Add the kettle” again.", ...card]);
  assert.deepEqual(read(close("fail")), ["recovery", "Took the planned way round", "The plan for when “Add the kettle” can't be done is to do this. Did it, then carried on.", ...card]);
  assert.deepEqual(read(close("before_next")), ["recovery", "Tidied up before moving on", "Did this after “Add the kettle”, then carried on.", ...card]);
  for (const event of ["before", "start", "retry", "fail", "before_next"]) {
    const message = close(event);
    assert.doesNotMatch(`${message.title} ${message.text}`, /didn't work|failed|step \d|handler|n2\.add/iu, `${event} says no failure, step number or id`);
    assert.equal(message.actions[0]!.kind, "click", "closing a box is pressing its button: the click icon");
  }
});

test("an extra step that didn't work, or was held back, says so plainly", () => {
  assert.deepEqual(read(recoveryAfterStep({ kind: "handler", subject: "Close the offer", outcome: "failed", event: "before" })), ["recovery", "That extra step didn't work", "Tried it for “Add the kettle”, and it didn't work.", "Extra step", "Close the offer", "failed", "Didn't work"]);
  assert.deepEqual(read(recoveryAfterStep({ kind: "handler", subject: "Close the offer", outcome: "refused", event: "retry" })), ["recovery", "Didn't do the extra step", "It was held back before it ran, so nothing was done.", "Extra step", "Close the offer", "refused", "Not done: it was held back before it ran"]);
});

test("a start further along reads per outcome", () => {
  const entry = (outcome: Recovery["outcome"]) => read(recoveryAfterStep({ kind: "entry", subject: "Pick a time", outcome, targetId: "entry.time" }));
  assert.deepEqual(entry("succeeded"), ["recovery", "Started further along", "What comes before this was already done, so started from here.", "Start from", "Pick a time", "done", "Done"]);
  assert.deepEqual(entry("failed"), ["recovery", "Couldn't start further along", "Starting from here didn't work.", "Start from", "Pick a time", "failed", "Didn't work"]);
  assert.deepEqual(entry("refused"), ["recovery", "Didn't start further along", "Starting here could have skipped something the run needs or repeated something already done, so it wasn't used.", "Start from", "Pick a time", "refused", "Not done: it could have skipped something the run needs or repeated something already done"]);
});

test("a route reads per outcome", () => {
  const route = (outcome: Recovery["outcome"]) => read(recoveryAfterStep({ kind: "route", subject: "Basket", outcome, event: "fail", targetId: "checkpoint.basket" }));
  assert.deepEqual(route("succeeded"), ["recovery", "Carried on from where the page is", "The page was already at this point, so carried on from here.", "Carry on from", "Basket", "done", "Done"]);
  assert.deepEqual(route("failed"), ["recovery", "Couldn't carry on from there", "Going to this point didn't work.", "Carry on from", "Basket", "failed", "Didn't work"]);
  assert.deepEqual(route("refused"), ["recovery", "Stayed on course", "Going to this point could have skipped something the run needs or repeated something already done, so it didn't.", "Carry on from", "Basket", "refused", "Not done: it could have skipped something the run needs or repeated something already done"]);
});

test("another way reads per outcome", () => {
  const other = (outcome: Recovery["outcome"]) => read(recoveryAfterStep({ kind: "alternative", subject: "The basket link in the menu", outcome }));
  assert.deepEqual(other("succeeded"), ["recovery", "Used another way", "The usual way didn't work, so used this one instead, and it worked.", "Other way", "The basket link in the menu", "done", "Done"]);
  assert.deepEqual(other("failed"), ["recovery", "The other way didn't work either", "Tried this way instead, and it didn't work.", "Other way", "The basket link in the menu", "failed", "Didn't work"]);
  assert.deepEqual(other("refused"), ["recovery", "Didn't try another way", "It was held back before it ran, so nothing was done.", "Other way", "The basket link in the menu", "refused", "Not done: it was held back before it ran"]);
});

test("each card's icon names what it acted on: an act its words open with, a path through the Flow, else a step of its own", () => {
  const icon = (kind: Recovery["kind"], subject: string) => recoveryAfterStep({ kind, subject, outcome: "succeeded" }).actions[0]!.kind;
  assert.equal(icon("handler", "Wait for the page to settle"), "wait");
  assert.equal(icon("handler", "Dismiss the cookie notice"), "click");
  assert.equal(icon("handler", "Scroll back to the top"), "other");
  assert.equal(icon("handler", "Something unusual"), "other");
  for (const kind of ["entry", "route", "alternative"]) assert.equal(icon(kind, "Basket"), "branch");
});

test("without the step's label, the words still read whole; a recovery in a build is shown too", () => {
  const alone = stepMessages([recoveryRow(1, "n2.add", { kind: "handler", subject: "Close the sign-up box", outcome: "succeeded", event: "before" })], 100);
  assert.deepEqual(alone.map((message) => [message.kind, message.title, message.text]), [["recovery", "Cleared the way first", "Did this first, then carried on."]]);
  const build = { activityId: "build-1", subject: { kind: "build" as const, id: "build-1", projectId: "project-1" } };
  const inBuild = stepMessages([recoveryRow(1, "n2.add", { kind: "route", subject: "Basket", outcome: "succeeded" }, build)], 100);
  assert.deepEqual(inBuild.map((message) => message.kind), ["recovery"], "not mistaken for a build's start or finish marker");
});

test("a recovery that failed or was held back is its own message, not the row that settles a failed step", () => {
  const messages = stepMessages([playStep(1, 2, "n2.add", "Add the kettle"), recoveryRow(2, "n2.add", { kind: "alternative", subject: "The basket link", outcome: "failed" })], 100);
  assert.deepEqual(messages.map((message) => message.kind), ["step", "recovery"]);
  assert.equal(messages[0]!.actions[0]!.outcome, "working", "a recovery does not end the step it was done around");
});

test("a recovery does not end the step it was done around; the row after it does", () => {
  const messages = stepMessages([
    playStep(1, 2, "n2.add", "Add the kettle"),
    recoveryRow(2, "n2.add", { kind: "handler", subject: "Close the sign-up box", outcome: "succeeded", event: "before" }),
    playStep(3, 3, "n3.pay", "Pay")
  ], 100);
  assert.deepEqual(messages.map((message) => [message.kind, message.actions[0]!.outcome]), [["step", "done"], ["recovery", "done"], ["step", "working"]]);
});

test("an extra step done before trying again leaves the retry one card: done on the 2nd try", () => {
  const messages = stepMessages([
    playStep(1, 1, "n1.open", "Open the item"),
    playStep(2, 2, "n3.coupon", "Get coupons"),
    recovering(3, "n3.coupon", "Get coupons"),
    retryThought(4, "n3.coupon"),
    recoveryRow(5, "n3.coupon", { kind: "handler", subject: "Close the offer", outcome: "succeeded", event: "retry" }),
    playStep(6, 2, "n3.coupon", "Get coupons"),
    playStep(7, 3, "n4.cart", "Add to cart")
  ], 100);
  assert.deepEqual(messages.map((message) => [message.kind, message.title]), [
    ["step", "Step 1: Open the item"],
    ["repair", "Trying the step again"],
    ["recovery", "Got ready to try again"],
    ["step", "Step 2: Get coupons"],
    ["step", "Step 3: Add to cart"]
  ]);
  assert.equal(messages[2]!.text, "Did this before trying “Get coupons” again.");
  const retried = messages[3]!.actions[0]!;
  assert.equal(retried.retried?.tries, 2);
  assert.match(cardWords(retried, false).outcome ?? "", /^Done on the 2nd try\. The first try didn't work: /u);
  assert.equal(messages.flatMap((message) => message.actions).filter((card) => card.outcome === "failed").length, 0, "no red card is left");
});

test("an extra step that didn't work twice in a row is one card that says how many times", () => {
  const offer = { kind: "handler", subject: "Close the offer", outcome: "failed", event: "before" } as const;
  const messages = stepMessages([playStep(1, 2, "n2.add", "Add the kettle"), recoveryRow(2, "n2.add", offer), recoveryRow(3, "n2.add", offer)], 100);
  assert.deepEqual(messages.map((message) => message.kind), ["step", "recovery"]);
  assert.equal(cardWords(messages[1]!.actions[0]!, false).outcome, "Didn't work");
});

test("a step row with no recovery and no step of its own (an older Core's route) keeps today's reading: Core's sentence, no card", () => {
  const route = activityEvent(2, { ...RUN, phase: "running", label: "Went to the step the page is at", detail: { kind: "step", title: "Went to the step the page is at", status: "succeeded", ref: "n3.pay" } });
  const messages = stepMessages([playStep(1, 2, "n2.add", "Add the kettle"), route], 100);
  assert.deepEqual(messages.map((message) => [message.kind, message.title, message.actions.length]), [["step", "Step 2: Add the kettle", 1], ["step", "Went to the step the page is at", 0]]);
  const malformed = recoveryRow(3, "n3.pay", { kind: "teleport", subject: "Basket", outcome: "succeeded" });
  assert.deepEqual(stepMessages([malformed], 100).map((message) => [message.kind, message.actions.length]), [["step", 0]], "a recovery outside the contract reads as a plain step");
});

test("the in-run fix still to come has its named words: Fixing a step", () => {
  const fixed = recoveryWords({ kind: "fixing", subject: "Add the kettle", outcome: "succeeded" }, "Add the kettle");
  assert.deepEqual([fixed.title, fixed.text, fixed.icon, fixed.name, fixed.because], ["Fixing a step", "It didn't work however it was tried, so it was fixed here and the run carried on.", "repair", "Fix step", undefined]);
  assert.equal(recoveryWords({ kind: "fixing", subject: "Add the kettle", outcome: "failed" }, undefined).title, "Fixing a step");
});

test("a notice the page put in the way, closed, is its own message in Core's words with a card that is never a failure", () => {
  const cleared = recoveryAfterStep({ kind: "interference", subject: "Closed 2 notices the page put in the way", outcome: "succeeded" });
  assert.deepEqual(read(cleared), ["recovery", "Closed 2 notices the page put in the way", "It was covering the page, so it was closed and the step went on.", "Clear the page", null, "done", "Done"]);
  assert.equal(cleared.actions[0]!.kind, "click", "closing a notice is pressing its button");
  const stuck = recoveryAfterStep({ kind: "interference", subject: "Closed a notice the page put in the way", outcome: "failed" });
  assert.deepEqual(read(stuck).slice(3), ["Clear the page", null, "refused", "Not done: it was still in the way"], "no failure's colour or words");
  const one = { kind: "interference", subject: "Closed a notice the page put in the way", outcome: "succeeded" } as const;
  const twice = stepMessages([playStep(1, 2, "n2.add", "Add the kettle"), recoveryRow(2, "n2.add", one), recoveryRow(3, "n2.add", one)], 100);
  assert.deepEqual(twice.map((message) => message.kind), ["step", "recovery", "recovery"], "the same notice closed on two attempts is two steps, each shown");
  assert.equal(cardWords(twice[1]!.actions[0]!, false).outcome, "Done");
});

test("an item found again after the page changed reads as found, and one that is gone says so without a failure's words", () => {
  const found = recoveryAfterStep({ kind: "reacquire", subject: "Found the item from “Read the posts” again", outcome: "succeeded" });
  assert.deepEqual(read(found), ["recovery", "Found it again after the page changed", "The page changed, so it looked again and found the same one from “Add the kettle”, then tried it there.", "Found again", "Found the item from “Read the posts” again", "done", "Done"]);
  const gone = recoveryAfterStep({ kind: "reacquire", subject: "The item from “Read the posts” is gone", outcome: "failed" });
  assert.deepEqual(read(gone).slice(0, 3), ["recovery", "It is no longer on the page", "The page changed, and the item from “Add the kettle” is gone, so there was nothing to try again."]);
  assert.deepEqual(read(gone).slice(5), ["refused", "Not done: it is no longer on the page"], "never Didn't work");
  const held = recoveryWords({ kind: "reacquire", subject: "x", outcome: "refused" }, "Read the posts");
  assert.equal(held.title, "Didn't look for it again");
  assert.equal(held.because, "it was held back before it ran");
  assert.match(recoveryWords({ kind: "reacquire", subject: "x", outcome: "succeeded" }, "Read the posts").text, /found the same one from “Read the posts”, then tried it there\./);
});
