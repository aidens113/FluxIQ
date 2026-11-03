// Which thread the chat opens for a followed run (`run-target.ts`): none when
// the thread on screen already shows the run; for a run that speaks through
// no thread, its automation's chat when the name is known, else the latest;
// for a run that speaks through a thread, the latest or automation chat only
// when that thread is known to be the run's, else the run's own thread.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ClientGatewayActivity } from "fluxiq/ui";
import { activityEvent } from "../../tests/activity-fixture.ts";
import type { ChatTarget } from "../../target.ts";
import { followedRunTarget, threadKey } from "../run-target.ts";

const run = (fields: Partial<ClientGatewayActivity> = {}): ClientGatewayActivity =>
  activityEvent(1, { activityId: "run:r1", subject: { kind: "run", id: "r1", projectId: "p", flowId: "flow-8" }, phase: "running", ...fields });
const OTHER: ChatTarget = { kind: "automation", flowId: "flow-7", name: "Price tracker", projectId: "p" };
const LATEST: ChatTarget = { kind: "latest", projectId: "p" };
const QUESTION: ChatTarget = { kind: "question", activityId: "build:b", subjectKind: "flow", subjectId: "flow-7", title: "The build's question", projectId: "p" };
const none = new Map<string, string>();

test("a thread that already shows the run is kept", () => {
  assert.equal(followedRunTarget({ run: run(), target: LATEST, conversationId: "conv-latest", flowName: undefined, known: none }), null);
  assert.equal(followedRunTarget({ run: run(), target: { kind: "automation", flowId: "flow-8", name: "Lamps", projectId: "p" }, conversationId: "conv-8", flowName: "Lamps", known: none }), null);
  assert.equal(followedRunTarget({ run: run({ conversationId: "conv-7" }), target: OTHER, conversationId: "conv-7", flowName: undefined, known: none }), null,
    "a run started from this automation's chat speaks here");
});

test("a run that speaks through no thread opens its automation's chat when the name is known, else the latest", () => {
  for (const target of [OTHER, QUESTION]) {
    assert.deepEqual(followedRunTarget({ run: run(), target, conversationId: "conv-x", flowName: "Lamps", known: none }),
      { kind: "automation", flowId: "flow-8", name: "Lamps", projectId: "p" });
    assert.deepEqual(followedRunTarget({ run: run(), target, conversationId: "conv-x", flowName: undefined, known: none }), LATEST);
    assert.deepEqual(followedRunTarget({ run: run(), target, conversationId: "conv-x", flowName: "  ", known: none }), LATEST);
  }
  assert.deepEqual(followedRunTarget({ run: run({ subject: { kind: "run", id: "r1", projectId: "p" } }), target: OTHER, conversationId: "conv-x", flowName: "Lamps", known: none }), LATEST,
    "a run without a Flow has no automation chat");
});

test("a run that speaks through a thread opens a chat only when that thread is known to be the run's", () => {
  const spoken = run({ conversationId: "conv-latest" });
  assert.deepEqual(followedRunTarget({ run: spoken, target: OTHER, conversationId: "conv-7", flowName: "Lamps", known: new Map([[threadKey(LATEST), "conv-latest"]]) }), LATEST);
  const automation: ChatTarget = { kind: "automation", flowId: "flow-8", name: "Lamps", projectId: "p" };
  assert.deepEqual(followedRunTarget({ run: run({ conversationId: "conv-8" }), target: LATEST, conversationId: "conv-latest", flowName: "Lamps", known: new Map([[threadKey(automation), "conv-8"]]) }), automation);
  // Never read, or read as another thread: the run's own thread, where every event of the run shows.
  for (const known of [none, new Map([[threadKey(LATEST), "conv-other"]])]) {
    assert.deepEqual(followedRunTarget({ run: spoken, target: OTHER, conversationId: "conv-7", flowName: "Lamps", known }),
      { kind: "question", activityId: "run:r1", subjectKind: "run", subjectId: "r1", title: "Run of Lamps", projectId: "p" });
  }
  assert.deepEqual(followedRunTarget({ run: spoken, target: OTHER, conversationId: "conv-7", flowName: undefined, known: none }),
    { kind: "question", activityId: "run:r1", subjectKind: "run", subjectId: "r1", title: "This run", projectId: "p" });
});

test("threadKey names a thread whatever its display name", () => {
  assert.equal(threadKey({ kind: "automation", flowId: "f", name: "A" }), threadKey({ kind: "automation", flowId: "f", name: "B" }));
  assert.notEqual(threadKey({ kind: "latest" }), threadKey({ kind: "latest", projectId: "p" }));
  assert.notEqual(threadKey({ kind: "latest", projectId: "p" }), threadKey({ kind: "project", projectId: "p" }));
});
