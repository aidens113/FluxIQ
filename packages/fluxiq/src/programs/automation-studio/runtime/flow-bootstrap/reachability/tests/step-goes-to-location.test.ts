import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../step-goes-to-location.ts";

// The one reading of which draft step arrived where the Flow starts, shared by
// the arrival restore and the instructed-acts check.

const START = "https://shop.test/collections/audio";

function step(overrides: Partial<AutomationStudioFlowDraftStep>): AutomationStudioFlowDraftStep {
  return { position: 1, id: "d1", iteration: 1, actionId: "arrive", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

describe("whether a draft step went to where the Flow starts", () => {
  it("reads what the step ran with before what it was written with", () => {
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { url: "about:blank" } }, ranWith: { parameters: { url: START } } }), START, { node: "arrive", parameter: "url" })).toBe(true);
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { url: START } }, ranWith: { parameters: { selector: "#add" } } }), START)).toBe(false);
  });

  it("reads what it was written with where it carries no record of the run", () => {
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { url: START } } }), START, { node: "arrive", parameter: "url" })).toBe(true);
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { selector: "#add" } } }), START)).toBe(false);
  });
});

describe("declared arrival identity", () => {
  const arrival = { node: "arrive", parameter: "destination" };
  it("does not mistake a succeeded increment's retained location for arrival", () => {
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ actionId: "increment", input: { parameters: { destination: START, amount: 1 } } }), START, arrival)).toBe(false);
  });
  it("reads only the declared arrival parameter, with resolved precedence", () => {
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ actionId: "arrive", input: { parameters: { destination: START } } }), START, arrival)).toBe(true);
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ actionId: "arrive", input: { parameters: { unrelated: START } } }), START, arrival)).toBe(false);
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ actionId: "arrive", input: { parameters: { destination: START } }, ranWith: { parameters: { destination: "elsewhere" } } }), START, arrival)).toBe(false);
  });
  it("does not infer undeclared arrival and supports opaque locations", () => {
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ input: { parameters: { destination: START } } }), START)).toBe(false);
    expect(automationStudioFlowBootstrapDraftStepGoesToLocation(step({ actionId: "arrive", input: { parameters: { destination: "warehouse-A" } } }), "warehouse-A", arrival)).toBe(true);
  });
});
