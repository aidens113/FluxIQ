import assert from "node:assert/strict";
import { test } from "vitest";
import { threadSendRequest } from "../thread-requests.ts";

test("a message carries the attached recording in onScreen", () => {
  const request = threadSendRequest({ kind: "latest", projectId: "p1" }, undefined, "build this", "rec-1");
  assert.deepEqual(request.onScreen, { recordingId: "rec-1" });
});

test("the recording joins the Flow or run already on screen", () => {
  assert.deepEqual(threadSendRequest({ kind: "automation", flowId: "f1", name: "N", projectId: "p1" }, undefined, "x", "rec-1").onScreen, { flowId: "f1", recordingId: "rec-1" });
  assert.deepEqual(threadSendRequest({ kind: "question", activityId: "a", subjectKind: "run", subjectId: "r1", title: "t", projectId: "p1" }, undefined, "x", "rec-1").onScreen, { runId: "r1", recordingId: "rec-1" });
});

test("without a recording onScreen is as before", () => {
  assert.equal(threadSendRequest({ kind: "latest", projectId: "p1" }, undefined, "hi").onScreen, undefined);
  assert.deepEqual(threadSendRequest({ kind: "automation", flowId: "f1", name: "N" }, undefined, "hi").onScreen, { flowId: "f1" });
});
