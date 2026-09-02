import { describe, expect, it } from "vitest";
import { createAutomationStudioStores } from "../stores";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import { createAutomationWorkspaceRenderStore } from "../workspace/render-store";
import { createAutomationProjectViewModelCache } from "./project-view-model-cache";

describe("Automation project view model cache", () => {
  it("shares one model by project-data, selection, and preference revisions", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const cache = createAutomationProjectViewModelCache({ activeProjectId: "project-a", stores, workspace });
    const firstKey = cache.getRevisionKey();
    const first = cache.read();

    expect(cache.read()).toBe(first);
    stores.projectData.upsert("flows", "flow-a", {
      source: "canonical",
      flow: { flowId: "flow-a", name: "Checkout", metadata: {}, nodes: [], edges: [] }
    });
    const withFlow = cache.read();
    expect(cache.getRevisionKey()).not.toBe(firstKey);
    expect(withFlow).not.toBe(first);
    expect(withFlow.hierarchyNodes.some((node) => node.sourceId === "flow-a")).toBe(true);

    stores.selection.select({ kind: "flow", id: "flow-a" });
    const selected = cache.read();
    expect(selected.selectedFlow?.flowId).toBe("flow-a");
    expect(cache.read()).toBe(selected);
  });

  it("does not duplicate heavy source derivation for preference-only revisions", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const cache = createAutomationProjectViewModelCache({ activeProjectId: "project-a", stores, workspace });
    const first = cache.read();
    workspace.replace({ ...workspace.getPrefs(), sidebarWidth: workspace.getPrefs().sidebarWidth + 12 });
    const second = cache.read();

    expect(second).toBe(first);
    expect(second.hierarchyNodes).toBe(first.hierarchyNodes);
    expect(second.indexes).toBe(first.indexes);
  });
});
