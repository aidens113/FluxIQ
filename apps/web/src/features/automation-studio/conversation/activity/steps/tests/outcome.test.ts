import { describe, expect, it } from "vitest";
import { conversationStepOutcomeWords, type ConversationStepAction } from "..";

function action(overrides: Partial<ConversationStepAction>): ConversationStepAction {
  return { key: "action:b#1", kind: "click", target: "Next", outcome: "done", why: null, ...overrides };
}

describe("an action card's outcome line", () => {
  it("says done or didn't work with why, and passed or didn't pass for a test run", () => {
    expect(conversationStepOutcomeWords(action({}), false)).toEqual({ state: "done", status: "succeeded", label: "Done" });
    expect(conversationStepOutcomeWords(action({ outcome: "failed", why: "it wasn't on the page" }), false))
      .toEqual({ state: "failed", status: "failed", label: "Didn't work: it wasn't on the page" });
    expect(conversationStepOutcomeWords(action({ outcome: "failed", said: "The field was covered." }), false)?.label).toBe("Didn't work. The field was covered.");
    expect(conversationStepOutcomeWords(action({ kind: "test" }), false)?.label).toBe("Passed");
    expect(conversationStepOutcomeWords(action({ kind: "test", outcome: "failed" }), false)?.label).toBe("Didn't pass");
  });

  it("says waiting for you whenever the work waits on the person", () => {
    expect(conversationStepOutcomeWords(action({ kind: "permission", outcome: "waiting" }), false)).toEqual({ state: "waiting", status: "waiting", label: "Waiting for you" });
  });

  it("says working on it only on the newest card of work still running", () => {
    const started = action({ outcome: "working" });
    expect(conversationStepOutcomeWords(started, true)).toEqual({ state: "working", status: "running", label: "Working on it" });
    expect(conversationStepOutcomeWords(started, false)).toBeNull();
  });
});
