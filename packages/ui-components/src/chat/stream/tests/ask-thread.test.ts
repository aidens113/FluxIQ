// Where the work waiting on the person put its question: a build asks in its
// Flow's thread, a run in its own, whatever thread the work was started from.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ActivityDisplay } from "fluxiq/ui";
import { activityEvent, relayState } from "../../tests/activity-fixture.ts";
import { askThread } from "../ask-thread.ts";

const PERSON_NEEDED = "FluxIQ needs you: complete the check on this page, then press Continue.";

function waiting(activityId: string, subjectKind: "build" | "run"): ActivityDisplay {
  return { activityId, subjectKind, phase: "waiting_permission", headline: "Waiting for you", detail: PERSON_NEEDED, step: null, working: false, outcome: "waiting", sequence: 9 };
}

const run = activityEvent(4, { activityId: "run:r1", subject: { kind: "run", id: "r1", projectId: "p", flowId: "flow-7" }, phase: "waiting_permission" });
const build = [
  activityEvent(1, { activityId: "build:b1", subject: { kind: "build", id: "b1", projectId: "p", flowId: "flow-7" }, conversationId: "conv-latest" }),
  activityEvent(2, { activityId: "build:b1", subject: { kind: "build", id: "b1", projectId: "p", flowId: "flow-7" }, conversationId: "conv-latest", phase: "waiting_permission" })
];

test("a run asks in its own thread, subject run and its id", () => {
  assert.deepEqual(askThread(relayState([run], { display: waiting("run:r1", "run") })), {
    kind: "question",
    activityId: "run:r1",
    subjectKind: "run",
    subjectId: "r1",
    title: "The run's question",
    projectId: "p"
  });
});

test("a build asks in its Flow's thread, not in the chat it was started from", () => {
  assert.deepEqual(askThread(relayState(build, { display: waiting("build:b1", "build") })), {
    kind: "question",
    activityId: "build:b1",
    subjectKind: "flow",
    subjectId: "flow-7",
    title: "The build's question",
    projectId: "p"
  });
});

test("nothing is asked while the work runs, once it settled, or when its thread cannot be named", () => {
  assert.equal(askThread(relayState([run], { display: { ...waiting("run:r1", "run"), working: true, outcome: null } })), undefined);
  assert.equal(askThread(relayState([run], { display: { ...waiting("run:r1", "run"), outcome: "failed" } })), undefined);
  assert.equal(askThread(relayState([run], { display: null })), undefined);
  assert.equal(askThread(relayState([], { display: waiting("run:r9", "run") })), undefined, "no event of the unit: no subject to go by");
  const noFlow = activityEvent(1, { activityId: "build:b2", subject: { kind: "build", id: "b2", projectId: "p" } });
  assert.equal(askThread(relayState([noFlow], { display: waiting("build:b2", "build") })), undefined, "a build that named no Flow has no thread to find");
});

test("the relay's current event names the unit when the window no longer holds it", () => {
  const state = relayState([], { current: run, display: waiting("run:r1", "run") });
  assert.equal(askThread(state)?.subjectId, "r1");
});
