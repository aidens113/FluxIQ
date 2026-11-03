// A chosen thread in the stream's rules: it is the same thread only by its id,
// it has its own key, and it shows the work its project does, minus what
// speaks through another thread; the followed run is found for it.

import assert from "node:assert/strict";
import { test } from "vitest";
import { sameThread } from "../same-thread.ts";
import type { ChatTarget } from "../target.ts";
import { activityEvent, relayState } from "./activity-fixture.ts";
import { activityForTarget, followedRunTarget, threadKey } from "../stream/index.ts";

const ONE: ChatTarget = { kind: "thread", conversationId: "conv-1", projectId: "p" };
const TWO: ChatTarget = { kind: "thread", conversationId: "conv-2", projectId: "p" };

test("a thread is the same thread only as itself, by its id, and never as another kind of target", () => {
  assert.equal(sameThread(ONE, { ...ONE }), true);
  assert.equal(sameThread(ONE, TWO), false);
  assert.equal(sameThread(ONE, { ...ONE, projectId: "q" }), false);
  assert.equal(sameThread(ONE, { kind: "latest", projectId: "p" }), false);
  assert.equal(sameThread({ kind: "latest", projectId: "p" }, ONE), false);
  assert.equal(sameThread(ONE, { kind: "project", projectId: "p" }), false);
  assert.equal(sameThread(ONE, { kind: "automation", flowId: "f", name: "n", projectId: "p" }), false);
});

test("a thread's key names the thread whatever else about the target", () => {
  assert.equal(threadKey(ONE), threadKey({ ...ONE }));
  assert.notEqual(threadKey(ONE), threadKey(TWO));
  assert.notEqual(threadKey(ONE), threadKey({ kind: "latest", projectId: "p" }));
});

test("a chosen thread shows the project's work and leaves out what speaks through another thread", () => {
  const mine = activityEvent(1, { activityId: "run:a", subject: { kind: "run", id: "a", projectId: "p" }, conversationId: "conv-1" });
  const quiet = activityEvent(2, { activityId: "run:b", subject: { kind: "run", id: "b", projectId: "p" } });
  const elsewhere = activityEvent(3, { activityId: "run:c", subject: { kind: "run", id: "c", projectId: "p" }, conversationId: "conv-2" });
  const foreign = activityEvent(4, { activityId: "run:d", subject: { kind: "run", id: "d", projectId: "other" } });
  const state = relayState([mine, quiet, elsewhere, foreign]);
  assert.deepEqual(activityForTarget(state, ONE, undefined).events.map((event) => event.activityId), ["run:a", "run:b"], "known by its id before it is read");
  assert.deepEqual(activityForTarget(state, TWO, "conv-2").events.map((event) => event.activityId), ["run:b", "run:c"]);
});

test("the live line of a chosen thread follows the work that is not in another thread", () => {
  const spoken = activityEvent(1, { activityId: "run:a", subject: { kind: "run", id: "a", projectId: "p" }, conversationId: "conv-2" });
  const display = { activityId: "run:a", subjectKind: "run", phase: "running", headline: "Running", detail: null, step: null, working: true, outcome: null, sequence: 1 } as const;
  const state = relayState([spoken], { display });
  assert.equal(activityForTarget(state, ONE, undefined).display, null);
  assert.equal(activityForTarget(state, TWO, undefined).display?.activityId, "run:a");
});

test("a followed run that a chosen thread shows keeps the person where they are; one it does not show moves them", () => {
  const known = new Map<string, string>();
  const shown = activityEvent(1, { activityId: "run:a", subject: { kind: "run", id: "a", projectId: "p" } });
  assert.equal(followedRunTarget({ run: shown, target: ONE, conversationId: "conv-1", flowName: undefined, known }), null);
  const spoken = activityEvent(2, { activityId: "run:b", subject: { kind: "run", id: "b", projectId: "p" }, conversationId: "conv-9" });
  const moved = followedRunTarget({ run: spoken, target: ONE, conversationId: "conv-1", flowName: undefined, known });
  assert.equal(moved?.kind, "question");
  assert.equal(moved?.projectId, "p");
});
