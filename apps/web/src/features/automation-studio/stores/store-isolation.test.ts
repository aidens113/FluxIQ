import { describe, expect, it, vi } from "vitest";
import { createAutomationStudioStores } from "./studio-stores";
import { createAutomationStudioUiStore } from "../workspace/studio-ui-store";
import { createAutomationWorkspaceRenderStore } from "../workspace/render-store";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";

describe("Automation Studio scoped store isolation", () => {
  it("does not render layout or overlay subscribers for selection writes", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const ui = createAutomationStudioUiStore();
    const selectionRender = vi.fn();
    const layoutRender = vi.fn();
    const overlayRender = vi.fn();

    stores.selection.subscribe(selectionRender, "selection");
    workspace.subscribe(layoutRender, "prefs");
    ui.subscribe(overlayRender, "overlay");

    stores.selection.select({ kind: "flow", id: "flow.one" });

    expect(selectionRender).toHaveBeenCalledTimes(1);
    expect(layoutRender).not.toHaveBeenCalled();
    expect(overlayRender).not.toHaveBeenCalled();
  });

  it("does not render project-data subscribers for Studio UI form writes", () => {
    const stores = createAutomationStudioStores();
    const ui = createAutomationStudioUiStore();
    const projectDataRender = vi.fn();
    const projectUiRender = vi.fn();

    stores.projectData.subscribe(projectDataRender);
    ui.subscribe(projectUiRender, "project-ui");

    ui.patch({ projectName: "Nightly import" });
    ui.patch({ projectName: "Nightly import" });

    expect(projectUiRender).toHaveBeenCalledTimes(1);
    expect(projectDataRender).not.toHaveBeenCalled();
  });

  it("normalizes collection writes and skips equal replacements", () => {
    const stores = createAutomationStudioStores();
    const flowRender = vi.fn();
    stores.projectData.subscribe(flowRender, "entities:flows");
    const flow = { flowId: "flow.one", name: "One" };

    expect(stores.projectData.replaceAll("flows", [["flow.one", flow]])).toBe(true);
    expect(stores.projectData.replaceAll("flows", [["flow.one", flow]])).toBe(false);

    expect(stores.projectData.getState().entities.flows.get("flow.one")).toBe(flow);
    expect(flowRender).toHaveBeenCalledTimes(1);
  });

  it("batches each owner once during a cross-store transaction", () => {
    const stores = createAutomationStudioStores();
    const catalogRender = vi.fn();
    const dataRender = vi.fn();
    const selectionRender = vi.fn();
    stores.catalog.subscribe(catalogRender);
    stores.projectData.subscribe(dataRender);
    stores.selection.subscribe(selectionRender);

    stores.transaction(() => {
      stores.catalog.activate("project.one");
      stores.catalog.setLoaded(true);
      stores.projectData.activate("project.one");
      stores.projectData.setResource("snapshot", { id: "snapshot.one" });
      stores.selection.select({ kind: "flow", id: "flow.one" });
      stores.selection.setBottomPreview("entry.one");
    });

    expect(catalogRender).toHaveBeenCalledTimes(1);
    expect(dataRender).toHaveBeenCalledTimes(1);
    expect(selectionRender).toHaveBeenCalledTimes(1);
  });

  it("publishes one hierarchy render for a 5,000-entry replacement and no cross-domain renders", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const ui = createAutomationStudioUiStore();
    const hierarchyRender = vi.fn();
    const selectionRender = vi.fn();
    const runtimeRender = vi.fn();
    const workspaceRender = vi.fn();
    const overlayRender = vi.fn();

    stores.projectData.subscribe(hierarchyRender, "entities:hierarchy");
    stores.selection.subscribe(selectionRender);
    stores.runtimeStatus.subscribe(runtimeRender);
    workspace.subscribe(workspaceRender, "prefs");
    ui.subscribe(overlayRender, "overlay");

    const entries = Array.from({ length: 5_000 }, (_, index) => [
      "hierarchy." + index,
      { id: "hierarchy." + index, parentId: null, kind: "flow", name: "Flow " + index }
    ] as const);
    stores.projectData.replaceAll("hierarchy", entries);

    expect(hierarchyRender).toHaveBeenCalledTimes(1);
    expect(selectionRender).not.toHaveBeenCalled();
    expect(runtimeRender).not.toHaveBeenCalled();
    expect(workspaceRender).not.toHaveBeenCalled();
    expect(overlayRender).not.toHaveBeenCalled();
  });

  it("keeps runtime-status commits out of project, selection, workspace, and overlay renders", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const ui = createAutomationStudioUiStore();
    const runtimeRender = vi.fn();
    const projectRender = vi.fn();
    const selectionRender = vi.fn();
    const workspaceRender = vi.fn();
    const overlayRender = vi.fn();

    stores.runtimeStatus.subscribe(runtimeRender, "flow-run");
    stores.projectData.subscribe(projectRender);
    stores.selection.subscribe(selectionRender);
    workspace.subscribe(workspaceRender, "prefs");
    ui.subscribe(overlayRender, "overlay");

    stores.runtimeStatus.setFlowRunState({ phase: "running", runId: "run.one" });

    expect(runtimeRender).toHaveBeenCalledTimes(1);
    expect(projectRender).not.toHaveBeenCalled();
    expect(selectionRender).not.toHaveBeenCalled();
    expect(workspaceRender).not.toHaveBeenCalled();
    expect(overlayRender).not.toHaveBeenCalled();
  });

  it("keeps workspace layout commits out of project, selection, runtime, and overlay renders", () => {
    const stores = createAutomationStudioStores();
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const ui = createAutomationStudioUiStore();
    const workspaceRender = vi.fn();
    const projectRender = vi.fn();
    const selectionRender = vi.fn();
    const runtimeRender = vi.fn();
    const overlayRender = vi.fn();

    workspace.subscribe(workspaceRender, "prefs");
    stores.projectData.subscribe(projectRender);
    stores.selection.subscribe(selectionRender);
    stores.runtimeStatus.subscribe(runtimeRender);
    ui.subscribe(overlayRender, "overlay");

    workspace.replace({ ...workspace.getPrefs(), sidebarWidth: 360 });

    expect(workspaceRender).toHaveBeenCalledTimes(1);
    expect(projectRender).not.toHaveBeenCalled();
    expect(selectionRender).not.toHaveBeenCalled();
    expect(runtimeRender).not.toHaveBeenCalled();
    expect(overlayRender).not.toHaveBeenCalled();
  });
  it("keeps workspace save status separate from layout renders", () => {
    const workspace = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const layoutRender = vi.fn();
    const saveStatusRender = vi.fn();
    workspace.subscribe(layoutRender, "prefs");
    workspace.subscribe(saveStatusRender, "save-status");

    workspace.setSaveStatus("Saving workspace changes...");
    workspace.setSaveStatus("Saving workspace changes...");

    expect(saveStatusRender).toHaveBeenCalledTimes(1);
    expect(layoutRender).not.toHaveBeenCalled();
  });
});
