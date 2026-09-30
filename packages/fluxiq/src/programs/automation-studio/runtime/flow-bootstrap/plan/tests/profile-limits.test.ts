import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapPlan } from "../contracts.ts";
import { automationStudioEvidenceFlowBootstrapLimitsExceeded } from "../profile-limits.ts";
import { automationStudioFlowBootstrapSizeLimits } from "../size-limits.ts";

const SETTING = { path: "flowSizeSettings.maxNodesPerSubflow", label: "Flow Settings > Maximum nodes per Subflow", value: 100 };

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
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "x".repeat(241), plan: planOf(101) })).toEqual([
      { limit: "maxSummaryLength", max: 240, actual: 241, path: "summary" },
      { limit: "maxNodesPerSubflow", max: 100, actual: 101, path: "plan.subflows.0.nodes", setting: SETTING }
    ]);
  });

  // The recorded script for `bigbox-retail-pickup-cart` is thirty steps. Neither
  // a reply nor a plan Core assembled from the steps a build ran is held to a
  // node count of its own: both are held to the Flow's size setting.
  it("holds a reply and a plan assembled from the draft to the Flow's size setting", () => {
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "Switches store and fills the cart.", plan: planOf(30) }, "reply")).toEqual([]);
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "Switches store and fills the cart.", plan: planOf(30) }, "draft")).toEqual([]);
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "Too long.", plan: planOf(101) }, "draft").map((limit) => limit.limit)).toEqual(["maxNodesPerSubflow"]);
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "Too long.", plan: planOf(30) }, "draft", automationStudioFlowBootstrapSizeLimits(20)))
      .toEqual([{ limit: "maxNodesPerSubflow", max: 20, actual: 30, path: "plan.subflows.0.nodes", setting: { ...SETTING, value: 20 } }]);
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "x".repeat(241), plan: planOf(3) }, "draft").map((limit) => limit.limit)).toEqual(["maxSummaryLength"]);
  });
});
