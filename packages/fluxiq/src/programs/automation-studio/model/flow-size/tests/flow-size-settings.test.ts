import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING, automationStudioFlowMaxNodesPerSubflow, automationStudioFlowSizeSettingIssue } from "../index.ts";

describe("the Flow size setting", () => {
  it("defaults to 100 nodes per Subflow for a Flow with no setting", () => {
    expect(AUTOMATION_STUDIO_FLOW_SIZE_SETTING.defaultValue).toBe(100);
    expect(automationStudioFlowMaxNodesPerSubflow(undefined)).toBe(100);
    expect(automationStudioFlowMaxNodesPerSubflow({})).toBe(100);
  });

  it("reads the Flow's own value", () => {
    expect(automationStudioFlowMaxNodesPerSubflow({ flowSizeSettings: { maxNodesPerSubflow: 150 } })).toBe(150);
    expect(automationStudioFlowMaxNodesPerSubflow({ flowSizeSettings: { maxNodesPerSubflow: 1 } })).toBe(1);
  });

  it("reads the default for a stored value that cannot be the setting", () => {
    for (const value of [0, -1, 1.5, "150", null, 1_001]) {
      expect(automationStudioFlowMaxNodesPerSubflow({ flowSizeSettings: { maxNodesPerSubflow: value } })).toBe(100);
    }
    expect(automationStudioFlowMaxNodesPerSubflow({ flowSizeSettings: [] })).toBe(100);
  });

  it("names the setting when it refuses a value", () => {
    expect(automationStudioFlowSizeSettingIssue(100)).toBeUndefined();
    expect(automationStudioFlowSizeSettingIssue(0)).toContain("flowSizeSettings.maxNodesPerSubflow");
    expect(automationStudioFlowSizeSettingIssue(2.5)).toContain("whole number");
    expect(automationStudioFlowSizeSettingIssue(1_001)).toContain("between 1 and 1000");
  });
});
