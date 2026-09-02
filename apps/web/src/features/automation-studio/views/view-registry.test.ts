import { describe, expect, it } from "vitest";
import {
  automationStudioViewAvailable,
  automationStudioViewDefinition,
  automationStudioViewDefinitions,
  canonicalAutomationStudioViewId,
  isAutomationStudioViewId,
  migrateAutomationStudioViewState,
  resolveAutomationStudioView
} from "./view-registry";

describe("Automation Studio view registry", () => {
  it("contains unique canonical IDs with complete host and cache metadata", () => {
    const definitions = automationStudioViewDefinitions();
    const ids = definitions.map((definition) => definition.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("flow-nodes");
    expect(ids).not.toContain("policy-primary");
    expect(ids).toContain("runtime-debug");
    expect(ids).not.toContain("proposal-generator");
    expect(ids).not.toContain("proposal-workbench");
    for (const definition of definitions) {
      expect(definition.allowedRegions).toContain(definition.region);
      expect(definition.cache.schemaVersion).toBeGreaterThan(0);
      expect(definition.lifecycle.keepMounted).toBe("warm");
    }
  });

  it("migrates legacy persisted IDs without accepting unknown views", () => {
    expect(canonicalAutomationStudioViewId("policy-primary")).toBe("flow-nodes");
    expect(canonicalAutomationStudioViewId("runs-history")).toBe("runtime-debug");
    expect(canonicalAutomationStudioViewId("signals-web")).toBe("state-explorer");
    expect(canonicalAutomationStudioViewId("workspace-dock")).toBe("global-inspector");
    expect(canonicalAutomationStudioViewId("unknown-view")).toBe("unknown-view");
    expect(canonicalAutomationStudioViewId("config")).toBe("config");
    expect(canonicalAutomationStudioViewId("config-default")).toBe("config-default");
    expect(canonicalAutomationStudioViewId("config", { hasFlow: true })).toBe("flow-settings");
    expect(canonicalAutomationStudioViewId("config-default", { hasFlow: true })).toBe("flow-settings");
    expect(canonicalAutomationStudioViewId("proposal-workbench")).toBe("proposal-workbench");
    expect(canonicalAutomationStudioViewId("proposal-workbench", { hasFlow: true })).toBe("adaptations");
    expect(isAutomationStudioViewId("unknown-view")).toBe(false);
    expect(resolveAutomationStudioView("runs-history")).toMatchObject({
      status: "known",
      id: "runtime-debug",
      migratedFrom: "runs-history"
    });
    expect(resolveAutomationStudioView("config")).toEqual({
      status: "retired",
      id: "config",
      replacementId: "flow-settings"
    });
    expect(resolveAutomationStudioView("config-default", { hasFlow: true })).toMatchObject({
      status: "known",
      id: "flow-settings",
      migratedFrom: "config-default"
    });
    expect(resolveAutomationStudioView("proposal-generator")).toEqual({
      status: "retired",
      id: "proposal-generator",
      replacementId: "adaptations"
    });
    expect(resolveAutomationStudioView("pipeline-workbench", { hasFlow: true })).toMatchObject({
      status: "known",
      id: "adaptations",
      migratedFrom: "pipeline-workbench"
    });
    expect(resolveAutomationStudioView("unknown-view")).toEqual({
      status: "unknown",
      id: "unknown-view"
    });
  });

  it("provides placement, availability, and scope from one definition", () => {
    expect(automationStudioViewDefinition("problems-view")).toMatchObject({
      kind: "problems",
      region: "right",
      requires: "hasProject"
    });
    expect(automationStudioViewDefinition("runs-history")).toMatchObject({
      id: "runtime-debug",
      region: "main"
    });
    expect(automationStudioViewAvailable("flow-router", {
      hasProject: true,
      hasFlow: false,
      hasTopLevelFlow: false,
      hasRecording: false,
      hasSelection: false
    })).toBe(false);
    expect(automationStudioViewAvailable("flow-router", {
      hasProject: true,
      hasFlow: true,
      hasTopLevelFlow: true,
      hasRecording: false,
      hasSelection: false
    })).toBe(true);
    expect(automationStudioViewAvailable("flow-router", {
      hasProject: true,
      hasFlow: true,
      hasTopLevelFlow: false,
      hasRecording: false,
      hasSelection: false
    })).toBe(false);
  });

  it("versions restored view cache state and rejects unknown cache owners", () => {
    expect(migrateAutomationStudioViewState("runs-history", { page: 2 }, 1)).toEqual({
      id: "runtime-debug",
      schemaVersion: 1,
      state: { page: 2 }
    });
    expect(migrateAutomationStudioViewState("config", { section: "runtime" }, 1)).toBeNull();
    expect(migrateAutomationStudioViewState("config", { section: "runtime" }, 1, { hasFlow: true })).toEqual({
      id: "flow-settings",
      schemaVersion: 1,
      state: { section: "runtime" }
    });
    expect(migrateAutomationStudioViewState("proposal-workbench", { page: 2 }, 1)).toBeNull();
    expect(migrateAutomationStudioViewState(
      "proposal-workbench",
      { page: 2 },
      1,
      { hasFlow: true }
    )).toEqual({
      id: "adaptations",
      schemaVersion: 1,
      state: { page: 2 }
    });
    expect(migrateAutomationStudioViewState("missing", { page: 2 }, 1)).toBeNull();
  });
});
