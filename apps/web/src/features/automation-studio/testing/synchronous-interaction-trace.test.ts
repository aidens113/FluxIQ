import { describe, expect, it } from "vitest";
import type { AutomationHierarchyNode } from "../hierarchy/contracts";
import { createAutomationHierarchyController } from "../hierarchy/controller";
import { createAutomationHierarchyStore } from "../hierarchy/store";
import { createAutomationSelectionStore } from "../stores/selection-store";
import { createAutomationWorkspaceCommandPort } from "../workspace/commands/port";
import { createAutomationWorkspaceCommands } from "../workspace/commands/workspace-commands";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout/defaults";
import { createAutomationWorkspaceRenderStore } from "../workspace/render-store";
import { createAutomationStudioSynchronousTrace } from "./synchronous-interaction-trace";

describe("Automation Studio synchronous interaction tracing", () => {
  it("records exact ordered store and render commits without timers or requests", () => {
    const trace = createAutomationStudioSynchronousTrace();
    const notify = trace.storeSubscriber("selection", ["hierarchy-row", "tab-strip"]);

    trace.interaction("hierarchy.rowClick", () => notify());

    expect(trace.events()).toEqual([
      { sequence: 1, kind: "interaction-start", owner: "hierarchy.rowClick" },
      { sequence: 2, kind: "store-commit", owner: "selection" },
      { sequence: 3, kind: "render-commit", owner: "hierarchy-row", detail: "notified-by:selection" },
      { sequence: 4, kind: "render-commit", owner: "tab-strip", detail: "notified-by:selection" },
      { sequence: 5, kind: "interaction-end", owner: "hierarchy.rowClick" },
    ]);
    expect(trace.summary()).toMatchObject({
      storeCommits: { selection: 1 },
      renderCommits: { "hierarchy-row": 1, "tab-strip": 1 },
      totalStoreCommits: 1,
      totalRenderCommits: 2,
    });
  });

  it("keeps hierarchy publication out of the synchronous visible-view gesture", () => {
    const trace = createAutomationStudioSynchronousTrace();
    const initial = {
      ...defaultAutomationWorkspacePrefs(),
      panes: [{ id: "pane-1", activeViewId: "runtime-debug", tabs: ["runtime-debug", "flow-router"] }],
      activePaneId: "pane-1",
      activeViewId: "runtime-debug",
    };
    const workspace = createAutomationWorkspaceRenderStore(initial);
    const hierarchy = createAutomationHierarchyStore();
    const selection = createAutomationSelectionStore();
    const unsubscribeHierarchy = hierarchy.subscribe(
      trace.storeSubscriber("hierarchy", ["previous-row", "next-row"]),
    );
    const unsubscribeSelection = selection.subscribe(
      trace.storeSubscriber("selection", ["next-row", "active-slot"]),
      "selection",
    );
    const unsubscribeWorkspace = workspace.subscribe(
      trace.storeSubscriber("workspace", ["workspace-region", "tab-strip"]),
      "prefs",
    );
    const commands = createAutomationWorkspaceCommands({
      port: createAutomationWorkspaceCommandPort(workspace),
    });
    const flow: AutomationHierarchyNode = {
      id: "flow.empty",
      label: "Empty Flow",
      kind: "flow" as const,
      category: "flow" as const,
      parentId: null,
      viewId: "flow-nodes",
      sourceId: "flow.empty",
      flowId: "flow.empty",
    };
    const router: AutomationHierarchyNode = {
      id: "flow.empty.router",
      label: "Router",
      kind: "flow-object" as const,
      category: "flow" as const,
      parentId: flow.id,
      viewId: "flow-router",
      sourceId: "flow.empty",
      flowId: "flow.empty",
    };
    const controller = createAutomationHierarchyController(hierarchy, {
      nodes: [flow, router],
      activeViewId: "runtime-debug",
      selection: null,
      recordingPrimaryKind: null,
      setRecordingPrimaryKind: () => undefined,
      setSelection: (next) => selection.select(next),
      openView: (viewId, mode) => commands.openView(viewId, mode),
    });

    trace.interaction("hierarchy.rowClick", () => {
      controller.openNode(flow, "preview");
    });

    const summary = trace.summary();
    expect(summary.storeCommits).toEqual({
      selection: 1,
      workspace: 1,
    });
    expect(summary.renderCommits).toEqual({
      "next-row": 1,
      "active-slot": 1,
      "workspace-region": 1,
      "tab-strip": 1,
    });
    expect(summary.duplicateStoreOwners).toEqual([]);
    expect(summary.totalStoreCommits).toBe(2);
    expect(summary.totalRenderCommits).toBe(4);
    expect(summary.events.filter((event) => event.kind === "store-commit").map((event) => event.owner)).toEqual([
      "workspace",
      "selection",
    ]);
    expect(workspace.getPrefs()).toMatchObject({ activePaneId: "pane-1", activeViewId: "flow-router" });
    expect(selection.getState().selection).toEqual({ kind: "flow", id: "flow.empty" });

    unsubscribeWorkspace();
    unsubscribeSelection();
    unsubscribeHierarchy();
  });

  it("keeps no-op traces empty and supports reusable named render probes", () => {
    const trace = createAutomationStudioSynchronousTrace();
    const probe = trace.renderProbe("AutomationStudioFrame");

    trace.interaction("workspace.noOp", () => undefined);
    probe("controlled-commit");

    expect(trace.summary()).toMatchObject({
      storeCommits: {},
      renderCommits: { AutomationStudioFrame: 1 },
      totalStoreCommits: 0,
      totalRenderCommits: 1,
    });
  });

  it("names redundant commits from the same owner in one synchronous interaction", () => {
    const trace = createAutomationStudioSynchronousTrace();
    const notify = trace.storeSubscriber("workspace", ["tab-strip"]);

    trace.interaction("view.duplicateActivation", () => {
      notify();
      notify();
    });

    expect(trace.summary()).toMatchObject({
      duplicateStoreOwners: ["workspace"],
      storeCommits: { workspace: 2 },
      renderCommits: { "tab-strip": 2 },
      totalStoreCommits: 2,
      totalRenderCommits: 2,
    });
  });
});
