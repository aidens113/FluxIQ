import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../step-goes-to-location.ts";

// The one reading of which draft step arrived where the Flow starts, shared by
// the arrival restore and the instructed-acts check.

const START = "https://shop.test/collections/audio";

function step(overrides: Partial<AutomationStudioFlowDraftStep>): AutomationStudioFlowDraftStep {
  return { position: 1, id: "d1", iteration: 1, actionId: "any", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

describe("whether a draft step went to where the Flow starts", () => {
  it("reads what the step ran with before what it was written with", () => {
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { url: "about:blank" } }, ranWith: { parameters: { url: START } } }), START)).toBe(true);
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { url: START } }, ranWith: { parameters: { selector: "#add" } } }), START)).toBe(false);
  });

  it("reads what it was written with where it carries no record of the run", () => {
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { url: START } } }), START)).toBe(true);
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { selector: "#add" } } }), START)).toBe(false);
  });
});
