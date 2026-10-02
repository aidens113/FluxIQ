import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftReplaySignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapSeedSignature } from "../seed-signature.ts";

const kept = { position: 1, iteration: 1, callId: "call.1", actionId: "web.output.dom-click", toolId: "core.run_node", input: { node: "web.output.dom-click" }, effect: "mutate", effectApplied: true, disposition: "kept", proposes: true } as AutomationStudioFlowDraftStep;

describe("the signature of the Flow round 0 starts from", () => {
  it("is the seed's replay signature when the round starts from a Flow", () => {
    expect(automationStudioFlowBootstrapSeedSignature([kept])).toEqual({ seedSignature: automationStudioFlowDraftReplaySignature([kept]) });
  });

  it("is nothing for a round that starts from no Flow", () => {
    expect(automationStudioFlowBootstrapSeedSignature(undefined)).toEqual({});
    expect(automationStudioFlowBootstrapSeedSignature([])).toEqual({});
  });
});
