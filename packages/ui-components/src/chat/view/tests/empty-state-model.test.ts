// The empty chat's words: the latest chat's onboarding (the concept, its two
// starts, the examples, and the model-key line only when no key is enabled),
// and the quieter empty states that offer no starts.

import assert from "node:assert/strict";
import { test } from "vitest";
import { emptyStateModel, MODEL_KEY_LINE, ONBOARDING_CONCEPT } from "../empty-state-model.ts";

const LATEST = { kind: "latest" } as const;

test("the empty latest chat explains FluxIQ, ending on stop and take over, under a short plain title", () => {
  const model = emptyStateModel("empty", LATEST)!;
  assert.equal(model.title, "What can FluxIQ do for you?");
  assert.equal(model.line, ONBOARDING_CONCEPT);
  assert.match(model.line, /^FluxIQ turns a job you describe on a website into an automation you can run again\./u);
  assert.match(model.line, /repeats the saved steps without AI/u);
  assert.match(model.line, /You can stop it, or take over the page, at any time\.$/u);
});

test("the empty latest chat offers Describe and Extract as starts and keeps the fill-only examples", () => {
  const model = emptyStateModel("empty", LATEST)!;
  assert.deepEqual(model.starts, [
    { id: "describe", label: "Describe what you want" },
    { id: "extract", label: "Extract data from this page" }
  ]);
  assert.equal(model.examples.length, 3);
});

test("without extract the empty latest chat offers only Describe, and the rest is unchanged", () => {
  const model = emptyStateModel("empty", LATEST, "missing", { extract: false })!;
  assert.deepEqual(model.starts, [{ id: "describe", label: "Describe what you want" }]);
  assert.equal(model.keyLine, MODEL_KEY_LINE);
  assert.equal(model.line, ONBOARDING_CONCEPT);
  assert.equal(model.examples.length, 3);
  assert.deepEqual(emptyStateModel("empty", LATEST, "unknown", { extract: true }), emptyStateModel("empty", LATEST));
});

test("the model-key line shows only when the keys were read and none is enabled", () => {
  assert.equal(emptyStateModel("empty", LATEST, "missing")!.keyLine, MODEL_KEY_LINE);
  assert.equal(MODEL_KEY_LINE, "FluxIQ needs a model key before it can build. Add one in FluxIQ.");
  assert.equal(emptyStateModel("empty", LATEST, "ready")!.keyLine, null);
  assert.equal(emptyStateModel("empty", LATEST, "unknown")!.keyLine, null, "a failed read says nothing");
  assert.equal(emptyStateModel("empty", LATEST)!.keyLine, null);
  assert.deepEqual(emptyStateModel("empty", LATEST, "missing")!.starts.map((start) => start.id), ["describe", "extract"], "Extract stays without a key");
});

test("only the empty latest chat is the onboarding", () => {
  const automation = emptyStateModel("empty", { kind: "automation", flowId: "f", name: "Orders" }, "missing")!;
  assert.equal(automation.title, "Ask about Orders");
  assert.deepEqual(automation.starts, []);
  assert.equal(automation.keyLine, null);
  assert.equal(automation.examples.length, 3);
  const question = emptyStateModel("empty", { kind: "question", activityId: "a", subjectKind: "run", subjectId: "r", title: "The run's question" }, "missing")!;
  assert.deepEqual([question.starts, question.keyLine, question.examples], [[], null, []]);
  for (const mode of ["offline", "loading"] as const) {
    const model = emptyStateModel(mode, LATEST, "missing")!;
    assert.deepEqual([model.starts, model.keyLine, model.examples], [[], null, []], mode);
    assert.notEqual(model.line, ONBOARDING_CONCEPT, mode);
  }
  assert.equal(emptyStateModel("thread", LATEST, "missing"), null, "a thread with turns shows no onboarding");
});

test("another project's empty thread keeps the plain invitation without the onboarding", () => {
  const model = emptyStateModel("empty", { kind: "project", projectId: "p2" }, "missing")!;
  assert.equal(model.title, "What can FluxIQ do for you?");
  assert.deepEqual([model.starts, model.keyLine], [[], null]);
  assert.equal(model.examples.length, 3);
});
