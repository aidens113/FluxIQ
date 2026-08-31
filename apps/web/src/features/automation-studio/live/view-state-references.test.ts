import { describe, expect, it } from "vitest";
import { automationViewStateReferencesAny } from "./view-state-references";

describe("automationViewStateReferencesAny", () => {
  it("finds exact IDs in nested view state without serialization", () => {
    const ids = new Set(["flow.42"]);
    expect(automationViewStateReferencesAny({ editor: { history: ["flow.42"] } }, ids)).toBe(true);
    expect(automationViewStateReferencesAny({ editor: { history: ["flow.420"] } }, ids)).toBe(false);
  });

  it("handles cyclic state", () => {
    const state: Record<string, unknown> = {};
    state.self = state;
    expect(automationViewStateReferencesAny(state, new Set(["flow.42"]))).toBe(false);
  });

  it("fails closed when malformed view state exceeds its traversal budget", () => {
    let state: Record<string, unknown> = {};
    const root = state;
    for (let index = 0; index < 520; index += 1) {
      state.next = {};
      state = state.next as Record<string, unknown>;
    }
    expect(automationViewStateReferencesAny(root, new Set(["flow.42"]))).toBe(true);
  });
});
