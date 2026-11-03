import assert from "node:assert/strict";
import { test } from "vitest";
import { stepWords } from "../words.ts";

// D12 of the t342 round 2 UI review (run-muylu4pp-f9cb2121, screenshot 05):
// the panel said "Changing the Flow" where the overlay said "Updating the
// Flow". One act, one word: Core's own heading for an edit is "Changing the
// Flow", and every client says it the same way.
test("an edit to the Flow is said as Core says it, \"Changing the Flow\", in either tense (D12)", () => {
  assert.equal(stepWords({ kind: "tool", title: "", status: "started", ref: "core.flow_draft" }).title, "Changing the Flow");
  assert.equal(stepWords({ kind: "tool", title: "", status: "succeeded", ref: "core.flow_draft" }).title, "Changed the Flow");
  assert.equal(stepWords({ kind: "step", title: "Amending the draft Flow", status: "started" }).title, "Changing the Flow");
  assert.equal(stepWords({ kind: "tool", title: "Changing the Flow", status: "started", ref: "core.flow_draft" }).title, "Changing the Flow");
});

// Lane C (run-mv0fuotv-805294d7, defect 6): a reply Core could not use was headed "Decided the next step".
// t378 W4: Core now heads that row "Asking the AI model again" itself, and its
// own failed "Deciding the next step" (no text) is a decision that stopped, not one asked again.
test("a decision Core could not get from the model is never said as decided", () => {
  const unusable = { kind: "thought" as const, title: "Asking the AI model again", status: "failed" as const, text: "The AI model's answer didn't make sense, so FluxIQ is asking it again. If that keeps happening, the build stops." };
  assert.deepEqual(stepWords(unusable), { title: "Asking the AI model again", text: unusable.text });
  const deciding = { kind: "thought" as const, title: "Deciding the next step" };
  assert.equal(stepWords({ ...deciding, status: "started" }).title, "Deciding the next step");
  assert.equal(stepWords({ ...deciding, status: "succeeded" }).title, "Decided the next step");
  assert.equal(stepWords({ ...deciding, status: "failed" }).title, "Deciding the next step", "a stopped decision is neither decided nor asked again");
});
