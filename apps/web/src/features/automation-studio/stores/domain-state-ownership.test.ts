import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ownerFiles = {
  hierarchy: "../hierarchy/useAutomationHierarchyWorkspaceState.ts",
  flow: "../flow-editor/useAutomationFlowProjectState.ts",
  recording: "../recordings/useAutomationRecordingProjectState.ts",
  runtimeProject: "../runtime/useAutomationRuntimeProjectState.ts",
  runtimeStatus: "../runtime/useAutomationRuntimeStatusState.ts",
  state: "../state/useAutomationStateProjectState.ts",
  selection: "./use-automation-selection-state.ts"
} as const;

describe("Automation Studio domain state ownership", () => {
  it("keeps every former controller slice in one named owner", () => {
    expect(Object.keys(ownerFiles)).toEqual([
      "hierarchy", "flow", "recording", "runtimeProject", "runtimeStatus", "state", "selection"
    ]);
    for (const path of Object.values(ownerFiles)) {
      expect(readFileSync(new URL(path, import.meta.url), "utf8").length).toBeGreaterThan(0);
    }
  });

  it("keeps project data and selection subscriptions on scoped store selectors", () => {
    const resourceOwner = readFileSync(new URL("./use-project-data-resource.ts", import.meta.url), "utf8");
    const selectionOwner = readFileSync(new URL(ownerFiles.selection, import.meta.url), "utf8");
    expect(resourceOwner).toContain("useAutomationStoreSelector");
    expect(resourceOwner).toContain("shallowArraySame");
    expect(selectionOwner).toContain("useAutomationStoreSelector");
    expect(selectionOwner).not.toContain("useState(");
  });
});