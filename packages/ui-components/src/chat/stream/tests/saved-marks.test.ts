// A step is marked only as the attempt's own record says (`provenance`), and only where the
// kind changes. With no record nothing is marked, and the attempt's first message still
// carries the one line that says it used saved work.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeTaskOutcomes } from "../../../testing/index.ts";
import type { ChatTaskOutcome } from "../../ports/index.ts";
import { activityEvent, eventTime } from "../../tests/activity-fixture.ts";
import { buildChatStream } from "../stream-items.ts";
import type { StepMessage } from "../step/index.ts";

const NOW = eventTime(100);

const RECORD: NonNullable<ChatTaskOutcome["provenance"]> = { route: "use", startedFrom: "saved", steps: [
  { position: 1, label: "Open results", from: "saved", ran: true },
  { position: 2, label: "Reading the page", from: "worked_out", ran: true }
] };

function secondAttempt(path: ChatTaskOutcome["attempt"]["path"], ended: number | undefined, provenance: ChatTaskOutcome["provenance"] = RECORD): ChatTaskOutcome {
  const outcome = fakeTaskOutcomes().secondAttemptFromSaved;
  if (provenance !== undefined) outcome.provenance = provenance;
  const attempt = { ...outcome.attempt, path, startedAtMs: eventTime(10) };
  if (ended === undefined) delete (attempt as { endedAtMs?: number }).endedAtMs;
  else attempt.endedAtMs = ended;
  outcome.attempt = attempt;
  outcome.comparedTo = { ...outcome.comparedTo!, endedAtMs: eventTime(2) };
  return outcome;
}

const thought = (sequence: number, activityId = "build-1") =>
  activityEvent(sequence, { activityId, subject: { kind: "build", id: activityId, projectId: "project-1" }, detail: { kind: "thought", title: "Reading the page", text: "The list is below.", status: "succeeded" } });
const runStep = (sequence: number) =>
  activityEvent(sequence, { activityId: "run-1", subject: { kind: "run", id: "run-1", projectId: "project-1" }, phase: "running", step: { index: 1, count: 3, label: "Open results" }, detail: { kind: "step", title: "Open results", status: "succeeded" } });

function steps(outcomes: ChatTaskOutcome[]): StepMessage[] {
  const events = [thought(1), runStep(11), runStep(12), thought(13, "build-2")];
  return buildChatStream([], events, 1_000, outcomes, NOW).items.flatMap((item) => (item.kind === "step" ? [item.message] : []));
}

test("steps are marked as the record says, where the kind changes, and the first message says it is using what was saved", () => {
  const messages = steps([secondAttempt("run_flow_then_repair", eventTime(20))]);
  assert.equal(messages.length, 4);
  assert.deepEqual(messages.map((message) => message.origin), [undefined, "saved", undefined, "again"]);
  assert.deepEqual(messages.map((message) => message.usingSaved !== undefined), [false, true, false, false]);
  assert.match(messages[1]!.usingSaved ?? "", /^Using what I saved from /u);
});

test("an attempt that explored marks nothing, and neither does one with no saved state or earlier attempt", () => {
  assert.deepEqual(steps([secondAttempt("explore", eventTime(20))]).map((message) => message.origin), [undefined, undefined, undefined, undefined]);
  const alone = secondAttempt("run_flow", eventTime(20));
  delete alone.saved;
  delete alone.comparedTo;
  assert.deepEqual(steps([alone]).map((message) => message.usingSaved), [undefined, undefined, undefined, undefined]);
});

test("a working attempt marks everything after its start; one that ended stops at its end", () => {
  assert.deepEqual(steps([secondAttempt("run_flow", undefined)]).map((message) => message.origin), [undefined, "saved", undefined, "again"]);
  assert.deepEqual(steps([secondAttempt("run_flow", eventTime(12))]).map((message) => message.origin), [undefined, "saved", undefined, undefined]);
});

test("with no record nothing is marked, and the first message still says it used saved work", () => {
  const outcome = fakeTaskOutcomes().secondAttemptFromSaved;
  const attempt = { ...outcome.attempt, startedAtMs: eventTime(10), endedAtMs: eventTime(20) };
  const messages = steps([{ ...outcome, attempt, comparedTo: { ...outcome.comparedTo!, endedAtMs: eventTime(2) } }]);
  assert.deepEqual(messages.map((message) => message.origin), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(messages.map((message) => message.usingSaved !== undefined), [false, true, false, false]);
});

test("a step the record says never ran, or does not name, stays unmarked", () => {
  const notRan = secondAttempt("run_flow_then_repair", eventTime(20), { route: "use", startedFrom: "saved", steps: [
    { position: 1, label: "Open results", from: "saved", ran: false }
  ] });
  assert.deepEqual(steps([notRan]).map((message) => message.origin), [undefined, undefined, undefined, undefined]);
});

test("the stream is unchanged where nothing used saved work", () => {
  const plain = buildChatStream([], [thought(1), runStep(2)], 1_000, [fakeTaskOutcomes().rowsChecked], NOW);
  for (const item of plain.items) if (item.kind === "step") assert.deepEqual(Object.keys(item.message).filter((key) => key === "origin" || key === "usingSaved"), []);
});
