import { describe, expect, it } from "vitest";
import { automationStudioViewDefinitions, resolveAutomationStudioView } from "./view-registry";
import { automationViewContracts } from "./view-contracts";

describe("Automation Studio view functionality contracts", () => {
  it("requires a complete contract for every canonical registry entry", () => {
    const definitions = automationStudioViewDefinitions();
    expect(Object.keys(automationViewContracts).sort()).toEqual(definitions.map((view) => view.id).sort());
    for (const definition of definitions) {
      const contract = automationViewContracts[definition.id];
      expect(contract.id).toBe(definition.id);
      expect(contract.purpose.length).toBeGreaterThan(10);
      expect(contract.scope.length).toBeGreaterThan(0);
      expect(Object.values(contract.states).every(Boolean)).toBe(true);
    }
  });

  it("keeps retired IDs outside canonical contracts and resolves them through migration", () => {
    expect(Object.keys(automationViewContracts)).not.toContain("config");
    expect(Object.keys(automationViewContracts)).not.toContain("config-default");
    expect(Object.keys(automationViewContracts)).not.toContain("proposal-generator");
    expect(Object.keys(automationViewContracts)).not.toContain("proposal-workbench");
    expect(resolveAutomationStudioView("config", { hasFlow: true })).toMatchObject({
      status: "known",
      id: "flow-settings",
      migratedFrom: "config"
    });
    expect(resolveAutomationStudioView("config")).toEqual({
      status: "retired",
      id: "config",
      replacementId: "flow-settings"
    });
    expect(resolveAutomationStudioView("proposal-workbench", { hasFlow: true })).toMatchObject({
      status: "known",
      id: "adaptations",
      migratedFrom: "proposal-workbench"
    });
    expect(resolveAutomationStudioView("proposal-generator")).toEqual({
      status: "retired",
      id: "proposal-generator",
      replacementId: "adaptations"
    });
  });

  it("marks data-heavy views for paging, virtualization, or graph culling", () => {
    for (const id of ["timeline-recording", "flow-nodes", "flow-router", "flow-subflows", "flow-instructions", "adaptations", "state-explorer", "runtime-debug", "problems-view"] as const) {
      expect(automationViewContracts[id].dataIntensity).not.toBe("light");
    }
  });
});