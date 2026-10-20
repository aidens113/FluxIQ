// Coverage of model-thought.ts: which of Core's rows are the model's words (a
// reason, a refusal, a recovery choice) and which are status: Core's own
// deciding row, with or without text, and every tool, note or check row.

import { expect, test } from "vitest";

import { isModelThought, type ClientGatewayActivity } from "../index.ts";

function event(detail: ClientGatewayActivity["detail"], label = "Clicking “Set as my store”"): ClientGatewayActivity {
  return { activityId: "build:b1", sequence: 1, subject: { kind: "build", id: "b1", projectId: "p" }, phase: "exploring", label, at: "2026-10-03T00:00:00.000Z", ...(detail ? { detail } : {}) };
}

test("a thought row with the model's words is a thought: a reason for a step, or a refused edit", () => {
  expect(isModelThought(event({ kind: "thought", title: "Clicking “Set as my store”", text: "Store chooser is open; I'll press it.", status: "succeeded" }))).toBe(true);
  expect(isModelThought(event({ kind: "thought", title: "Didn't change the Flow", text: "That step has no such value to make vary; so this was not done: adding the pape…", status: "failed" }, "Didn't change the Flow"))).toBe(true);
});

test("Core's own deciding row is status, even when it carries Core's sentence; so is a thought with no words", () => {
  expect(isModelThought(event({ kind: "thought", title: "Deciding the next step", status: "started" }, "Deciding the next step"))).toBe(false);
  expect(isModelThought(event({ kind: "thought", title: "Deciding the next step", status: "failed", text: "The AI model provider did not answer this request. Asking it again; the build stops if it keeps not answering." }, "The AI model provider did not answer"))).toBe(false);
  expect(isModelThought(event({ kind: "thought", title: "Clicking “X”", text: "   ", status: "succeeded" }))).toBe(false);
});

// t378 W4: Core heads a decision it must ask for again "Asking the AI model
// again" (failed, with Core's sentence). That is FluxIQ's own status, never the
// model's words: drawn as the live line, not told as the model's message.
test("Core's asking-again row is status, whether the provider gave no answer or an unusable one", () => {
  for (const [label, text] of [
    ["The AI model's answer couldn't be used", "The AI model's answer didn't make sense, so FluxIQ is asking it again. If that keeps happening, the build stops."],
    ["The AI model provider did not answer", "The AI model provider didn't answer, so FluxIQ is asking it again. If it keeps not answering, the build stops."]
  ] as const) {
    expect(isModelThought(event({ kind: "thought", title: "Asking the AI model again", status: "failed", text }, label)), label).toBe(false);
  }
});

test("tool, note and check rows, and a row with no detail, are never thoughts", () => {
  expect(isModelThought(event(undefined))).toBe(false);
  expect(isModelThought(event({ kind: "tool", title: "Clicking “X”", text: "Result: web.action.succeeded", status: "succeeded", ref: "core.run_node" }))).toBe(false);
  expect(isModelThought(event({ kind: "note", title: "Judging the Flow", text: "The Flow was tested from its start." }))).toBe(false);
  expect(isModelThought(event({ kind: "check", title: "Result check", text: "The model judged that the result answers the request.", status: "succeeded" }))).toBe(false);
});
