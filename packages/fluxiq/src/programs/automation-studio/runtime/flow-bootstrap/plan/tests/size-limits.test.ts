import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING } from "../../../../model/index.ts";
import {
  automationStudioFlowBootstrapLargestSizeLimits,
  automationStudioFlowBootstrapSizeLimits,
  automationStudioFlowBootstrapSizeLimitsOf,
  automationStudioFlowBootstrapSizeRefusal,
  automationStudioFlowBootstrapSizeSetting
} from "../size-limits.ts";

// Every bound on a Flow's size follows from one setting, so raising it raises
// all of them together and nothing else holds a node count of its own.
describe("the size bounds derived from a Flow's size setting", () => {
  it("derives every bound from the default of a hundred nodes a Subflow", () => {
    expect(AUTOMATION_STUDIO_FLOW_SIZE_SETTING.defaultValue).toBe(100);
    expect(automationStudioFlowBootstrapSizeLimits()).toEqual({
      maxNodesPerSubflow: 100,
      maxEdgesPerSubflow: 200,
      maxTotalNodes: 800,
      maxTotalEdges: 1_600,
      maxGraphDepth: 100,
      maxPlanBytes: 800 * 2_048,
      maxResultBytes: 100 * 1_024
    });
  });

  it("scales with the setting, and never shrinks a byte budget below the one it had before the setting", () => {
    expect(automationStudioFlowBootstrapSizeLimits(150)).toMatchObject({ maxNodesPerSubflow: 150, maxEdgesPerSubflow: 300, maxGraphDepth: 150, maxResultBytes: 153_600 });
    expect(automationStudioFlowBootstrapSizeLimits(1)).toEqual({
      maxNodesPerSubflow: 1, maxEdgesPerSubflow: 2, maxTotalNodes: 8, maxTotalEdges: 16, maxGraphDepth: 1, maxPlanBytes: 65_536, maxResultBytes: 12_000
    });
    expect(automationStudioFlowBootstrapLargestSizeLimits()).toEqual(automationStudioFlowBootstrapSizeLimits(1_000));
  });

  it("reads a Flow's own setting from its metadata, and the default when it has none or a bad one", () => {
    expect(automationStudioFlowBootstrapSizeLimitsOf({ metadata: { flowSizeSettings: { maxNodesPerSubflow: 150 } } }).maxNodesPerSubflow).toBe(150);
    expect(automationStudioFlowBootstrapSizeLimitsOf({}).maxNodesPerSubflow).toBe(100);
    expect(automationStudioFlowBootstrapSizeLimitsOf({ metadata: { flowSizeSettings: { maxNodesPerSubflow: 0 } } }).maxNodesPerSubflow).toBe(100);
  });

  it("names the setting and its value in a refusal, and says when a bound is derived from it", () => {
    const size = automationStudioFlowBootstrapSizeLimits();
    expect(automationStudioFlowBootstrapSizeRefusal("Subflow has 101 nodes", "maxNodesPerSubflow", size))
      .toBe("Subflow has 101 nodes; this Flow allows 100 (flowSizeSettings.maxNodesPerSubflow, Flow Settings > Maximum nodes per Subflow).");
    expect(automationStudioFlowBootstrapSizeRefusal("Subflow has 201 edges", "maxEdgesPerSubflow", size))
      .toBe("Subflow has 201 edges; this Flow allows 200, derived from flowSizeSettings.maxNodesPerSubflow = 100 (Flow Settings > Maximum nodes per Subflow).");
    expect(automationStudioFlowBootstrapSizeSetting(automationStudioFlowBootstrapSizeLimits(150))).toEqual({
      path: "flowSizeSettings.maxNodesPerSubflow", label: "Flow Settings > Maximum nodes per Subflow", value: 150
    });
  });
});
