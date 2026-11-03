// t412: a run Core stopped as Outcome uncertain ends on Core's own "Stopped"
// row (`runtime/activity/wording/run-uncertain.ts` in Core), and the chat's
// ending card says it as written, never "Run failed".

import assert from "node:assert/strict";
import { test } from "vitest";
import { activityEvent } from "../../../tests/activity-fixture.ts";
import { stepMessages } from "../messages.ts";

test("a run stopped as Outcome uncertain ends on \"Stopped\" with Core's sentence", () => {
  const sentence = "not sure the last step went through, so it was not repeated.";
  const run = { activityId: "run:r1", subject: { kind: "run" as const, id: "r1", projectId: "project-1" } };
  const messages = stepMessages([
    activityEvent(1, { ...run, phase: "running", label: "Running step 3 of 3: Confirm", step: { index: 3, count: 3, nodeId: "n3", label: "Confirm" }, detail: { kind: "step", title: "Confirm", status: "started", ref: "n3" } }),
    activityEvent(2, { ...run, phase: "failed", label: `Stopped: ${sentence}`, final: true, detail: { kind: "step", title: "Stopped", status: "failed", text: sentence } })
  ], 10);
  const ending = messages.at(-1)!;
  assert.equal(ending.title, "Stopped");
  assert.equal(ending.text, sentence);
});
