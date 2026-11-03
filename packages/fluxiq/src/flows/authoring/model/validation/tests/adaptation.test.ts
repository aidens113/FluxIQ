import { describe, expect, it } from "vitest";

import type { AutomationStudioFlowAdaptation } from "../../index.ts";
import { createAutomationStudioFlowExpansionFixture } from "../../fixtures.ts";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING } from "../../flow-size/index.ts";
import { parseAutomationStudioDeterministicPath, validateAutomationStudioFlowAdaptation } from "../adaptation.ts";

// A deterministic recovery path inserts its nodes into one Subflow, so it may
// insert as many as one Subflow may hold: the Flow's size setting, not the
// sixteen it was once held to.

function path(count: number): { nodes: Array<{ nodeId: string; definitionId: string }> } {
  return { nodes: Array.from({ length: count }, (_, index) => ({ nodeId: `recover.${index + 1}`, definitionId: "web.dom.click" })) };
}

describe("parseAutomationStudioDeterministicPath", () => {
  it("reads a path as long as the setting's default and refuses one node more", () => {
    const { defaultValue } = AUTOMATION_STUDIO_FLOW_SIZE_SETTING;
    expect(defaultValue).toBe(100);
    expect(parseAutomationStudioDeterministicPath(path(defaultValue))?.nodes).toHaveLength(defaultValue);
    expect(parseAutomationStudioDeterministicPath(path(defaultValue + 1))).toBeUndefined();
  });

  it("reads a longer path for a Flow whose setting allows it", () => {
    expect(parseAutomationStudioDeterministicPath(path(150), 150)?.nodes).toHaveLength(150);
    expect(parseAutomationStudioDeterministicPath(path(151), 150)).toBeUndefined();
  });

  it("reads anything the setting could allow at its maximum, as a stored-record reader passes", () => {
    const { maximum } = AUTOMATION_STUDIO_FLOW_SIZE_SETTING;
    expect(parseAutomationStudioDeterministicPath(path(maximum), maximum)?.nodes).toHaveLength(maximum);
    expect(parseAutomationStudioDeterministicPath(path(maximum + 1), maximum)).toBeUndefined();
  });

  it("still refuses a path that inserts nothing", () => {
    expect(parseAutomationStudioDeterministicPath(path(0))).toBeUndefined();
  });
});

describe("validateAutomationStudioFlowAdaptation: a deterministic path patch", () => {
  function withPath(count: number): AutomationStudioFlowAdaptation {
    return {
      ...createAutomationStudioFlowExpansionFixture().adaptation,
      patch: [{ kind: "insert_deterministic_path", targetId: "node.failed", summary: "Recover", after: path(count) } as AutomationStudioFlowAdaptation["patch"][number]]
    };
  }
  const invalid = (adaptation: AutomationStudioFlowAdaptation, maxNodes?: number) =>
    validateAutomationStudioFlowAdaptation(adaptation, maxNodes).issues.some((issue) => issue.code === "adaptation.path_invalid");

  it("holds the path to the setting's default when no Flow setting is passed", () => {
    expect(invalid(withPath(100))).toBe(false);
    expect(invalid(withPath(101))).toBe(true);
  });

  it("holds the path to the Flow's own setting when one is passed", () => {
    expect(invalid(withPath(150), 150)).toBe(false);
    expect(invalid(withPath(151), 150)).toBe(true);
  });
});
