import { describe, expect, it } from "vitest";
import { conversationStepOutcomeWords, type ConversationStepMessage } from "..";

function message(overrides: Partial<ConversationStepMessage>): ConversationStepMessage {
  return { key: "step:b#1", activityId: "b", kind: "decision", title: "Clicking “Next”", outcome: null, atMs: 0, sequence: 1, latest: true, ...overrides };
}

describe("the outcome line", () => {
  it("says done or didn't work, with Core's sentence when it has one, and passed or didn't pass for a check", () => {
    expect(conversationStepOutcomeWords(message({ outcome: { status: "succeeded" } }), false)).toEqual({ state: "succeeded", label: "Done" });
    expect(conversationStepOutcomeWords(message({ outcome: { status: "failed", text: "The field was covered." } }), false))
      .toEqual({ state: "failed", label: "Didn't work. The field was covered." });
    expect(conversationStepOutcomeWords(message({ kind: "check", outcome: { status: "succeeded" } }), false)?.label).toBe("Passed");
    expect(conversationStepOutcomeWords(message({ kind: "check", outcome: { status: "failed" } }), false)?.label).toBe("Didn't pass");
    expect(conversationStepOutcomeWords(message({ outcome: null }), true)).toBeNull();
  });

  it("says working on it only on the newest message of work still running", () => {
    const started = message({ outcome: { status: "started" } });
    expect(conversationStepOutcomeWords(started, true)).toEqual({ state: "working", label: "Working on it" });
    expect(conversationStepOutcomeWords(started, false)).toBeNull();
    expect(conversationStepOutcomeWords({ ...started, latest: false }, true)).toBeNull();
  });
});
