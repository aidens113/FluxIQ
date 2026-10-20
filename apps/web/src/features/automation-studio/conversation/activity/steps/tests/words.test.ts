// The words a step message is said in.

import { describe, expect, it } from "vitest";
import type { ConversationActivity } from "../../contracts";
import { conversationActivitySentence } from "..";

function event(sequence: number, overrides: Partial<ConversationActivity> = {}): ConversationActivity {
  const atMs = 1_790_000_000_000 + sequence * 1_000;
  return {
    activityId: "build.1",
    sequence,
    subject: { kind: "build", id: "build.1", projectId: "project.one" },
    phase: "exploring",
    label: `Looking at the page ${sequence}`,
    at: new Date(atMs).toISOString(),
    atMs,
    ...overrides
  };
}

describe("the words a step is said in", () => {
  it("takes Core's sentence without its outcome", () => {
    expect(conversationActivitySentence(event(1, { label: "Clicking “Get a free quote” — done", detail: { kind: "tool", title: "Clicking “Get a free quote”", status: "succeeded" } })))
      .toBe("Clicking “Get a free quote”");
  });

  it("never says a tool id or a result code", () => {
    const raw = event(1, { label: "Using core.run_node: web.action.rejected.target_unobserved", detail: { kind: "tool", title: "web.detect_repeating_structure", ref: "core.run_node" } });
    expect(conversationActivitySentence(raw)).toBe("Working on the page");
    expect(conversationActivitySentence(event(2, { label: "Using web.inspect", detail: { kind: "step", title: "Step 6" } }))).toBe("Step 6");
    expect(conversationActivitySentence(event(3, { label: "target_unobserved", detail: { kind: "check", title: "n3.web_click" } }))).toBe("Checking the Flow");
  });
});
