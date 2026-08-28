import { describe, expect, it } from "vitest";
import { automationControllerStateKeys } from "./useAutomationStudioControllers";

describe("Automation Studio controller ownership", () => {
  it("keeps the seven domain controllers explicit", () => {
    expect(Object.keys(automationControllerStateKeys)).toEqual([
      "project", "hierarchy", "flow", "recording", "runtime", "state", "layout"
    ]);
  });

  it("assigns every state key to one controller", () => {
    const keys = Object.values(automationControllerStateKeys).flat();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(40);
    expect(keys).not.toContain("hierarchyAction");
    expect(keys).not.toContain("preferencesOpen");
    expect(keys).not.toContain("windowAdderOpen");
  });
});