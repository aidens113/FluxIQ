// A written step was checked and frozen by the domain and never performed, so
// "changed nothing" is what it says by construction, not a failure.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed } from "../step.ts";

const base: AutomationStudioFlowDraftStep = {
  position: 1, iteration: 1, actionId: "node.act", input: {}, effect: "mutate", proposes: true, disposition: "kept"
};

describe("whether a step is proposable", () => {
  it("proposes a written step whatever effectApplied says", () => {
    expect(automationStudioFlowDraftStepIsProposable({ ...base, written: true, effectApplied: false })).toBe(true);
    expect(automationStudioFlowDraftStepIsProposed({ ...base, written: true, effectApplied: false })).toBe(true);
  });

  it("still refuses a recorded step that did not work", () => {
    expect(automationStudioFlowDraftStepIsProposable({ ...base, effectApplied: false })).toBe(false);
  });

  it("still leaves a withdrawn written step out", () => {
    expect(automationStudioFlowDraftStepIsProposed({ ...base, written: true, disposition: "dropped" })).toBe(false);
  });
});
