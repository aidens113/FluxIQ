import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapPlan } from "../contracts.ts";
import { automationStudioEvidenceFlowBootstrapLimitsExceeded } from "../profile-limits.ts";

function planOf(nodeCount: number): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Flow", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary", name: "Primary", role: "primary",
      nodes: Array.from({ length: nodeCount }, (_unused, index) => ({ key: `n${index}`, definitionId: "builtin.control.end", definitionVersion: "1.0.0" })),
      edges: []
    }]
  } as unknown as AutomationStudioFlowBootstrapPlan;
}

describe("the limits a completed result is held to", () => {
  it("names each limit a model-written result exceeds, with its maximum and the actual value", () => {
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "x".repeat(241), plan: planOf(17) })).toEqual([
      { limit: "maxSummaryLength", max: 240, actual: 241, path: "summary" },
      { limit: "maxNodesPerSubflow", max: 16, actual: 17, path: "plan.subflows.0.nodes" }
    ]);
  });

  // The recorded script for `bigbox-retail-pickup-cart` is thirty steps. A plan
  // Core assembled from the steps a build ran is not one reply, and is held to
  // the Flow's own limits.
  it("holds a plan assembled from the draft to the Flow's own limits, not to one reply's", () => {
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "Switches store and fills the cart.", plan: planOf(30) }, "draft")).toEqual([]);
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "Too long.", plan: planOf(65) }, "draft").map((limit) => limit.limit)).toEqual(["maxNodesPerSubflow"]);
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "x".repeat(241), plan: planOf(3) }, "draft").map((limit) => limit.limit)).toEqual(["maxSummaryLength"]);
  });
});
