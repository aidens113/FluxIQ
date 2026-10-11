// A run of a Flow under the Flow's one purse, in a Lab-scoped run only (t438).
// The user's words (2026-10-01): "bring the ceiling down to $0.1 per flow max".
import { describe, expect, it } from "vitest";
import { automationStudioLlmCurrentFlowPurse } from "../../../llm/build-purse/index.ts";
import { automationStudioLlmRunCostCeilingUsd } from "../../../llm/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore, AutomationStudioFlowPaths, AutomationStudioProjectPaths, type AutomationStudioProjectStore } from "../../index.ts";
import { automationStudioLabFlowPurse } from "../flow-spend.ts";

function memoryStore(): AutomationStudioFlowBootstrapCreationSpendStore {
  const projectPaths = new AutomationStudioProjectPaths(undefined);
  return new AutomationStudioFlowBootstrapCreationSpendStore(projectPaths, new AutomationStudioFlowPaths(projectPaths), {} as unknown as AutomationStudioProjectStore);
}

describe("a run under its Flow's one purse", () => {
  it("runs under no Flow purse outside a Lab-scoped run, where each run keeps its own limits", async () => {
    const store = memoryStore();
    await automationStudioLabFlowPurse({ store, projectId: "project.one", flowId: "flow.one", interpretationCostUsd: 0.001, labScoped: false }, async () => {
      expect(automationStudioLlmCurrentFlowPurse()).toBeUndefined();
    });
    expect(store.spentNowUsd("project.one", "flow.one")).toBe(0);
  });

  it("runs under no Flow purse when the run names no Flow", async () => {
    await automationStudioLabFlowPurse({ store: memoryStore(), projectId: "project.one", flowId: undefined, labScoped: true }, async () => {
      expect(automationStudioLlmCurrentFlowPurse()).toBeUndefined();
    });
  });

  it("runs under the Flow's purse in a Lab-scoped run, at the run cost ceiling, with what the Flow spent and the chat's reading counted", async () => {
    const store = memoryStore();
    await store.add("project.one", "flow.one", 0.04);
    await automationStudioLabFlowPurse({ store, projectId: "project.one", flowId: "flow.one", interpretationCostUsd: 0.0003, labScoped: true }, async () => {
      const purse = automationStudioLlmCurrentFlowPurse();
      expect(purse?.ceilingUsd).toBe(automationStudioLlmRunCostCeilingUsd());
      expect(purse?.spentUsd()).toBe(0.0403);
    });
    expect(store.spentNowUsd("project.one", "flow.one")).toBe(0.0403);
  });
});
