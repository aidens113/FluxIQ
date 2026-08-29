import { describe, expect, it, vi } from "vitest";
import { selectAutomationHierarchyRowWindow } from "./bounded-rows";
import { createAutomationHierarchyIntentCommands } from "./commands";
import { createAutomationHierarchyController } from "./controller";
import type { AutomationHierarchyNode } from "./model";
import { indexAutomationHierarchyNodes } from "./model";
import {
  automationHierarchyNodeSelectionState,
  createAutomationHierarchyProjectionSelector
} from "./selectors";
import { createAutomationHierarchyStore } from "./store";

const flow: AutomationHierarchyNode = {
  id: "flow-a",
  label: "Checkout",
  kind: "flow",
  category: "flow",
  parentId: null,
  viewId: "flow-nodes",
  sourceId: "flow.checkout",
  flowId: "flow.checkout"
};
const router: AutomationHierarchyNode = {
  id: "flow-a-router",
  label: "Router",
  kind: "flow-object",
  category: "flow",
  parentId: flow.id,
  viewId: "flow-router",
  sourceId: "flow.checkout",
  flowId: "flow.checkout"
};
const settings: AutomationHierarchyNode = {
  id: "flow-a-settings",
  label: "Settings",
  kind: "flow-object",
  category: "flow",
  parentId: flow.id,
  viewId: "flow-settings",
  sourceId: "flow.checkout",
  flowId: "flow.checkout"
};

describe("automation hierarchy store", () => {
  it("does not notify or replace snapshots for equal updates", () => {
    const store = createAutomationHierarchyStore();
    const subscriber = vi.fn();
    const publish = vi.fn();
    store.subscribe(subscriber);
    store.setChangeListener(publish);
    const initial = store.getSnapshot();

    expect(store.hydrate({ ...initial, collapsedFolderIds: [] })).toBe(false);
    expect(store.focus("root-flow")).toBe(false);
    expect(store.setPrimary(null)).toBe(false);
    expect(store.getSnapshot()).toBe(initial);
    expect(subscriber).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();

    expect(store.setPrimary(router.id)).toBe(true);
    expect(store.setPrimary(router.id)).toBe(false);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("preserves ordinary folder and default-collapsed subflow semantics", () => {
    const store = createAutomationHierarchyStore();

    store.toggleFolder("folder-a");
    store.toggleFolder("subflow-a", true);
    expect(store.getSnapshot()).toMatchObject({
      collapsedFolderIds: ["folder-a"],
      expandedDefaultCollapsedIds: ["subflow-a"]
    });

    store.expandContainer("folder-a");
    store.expandContainer("subflow-b", true);
    expect(store.getSnapshot()).toMatchObject({
      collapsedFolderIds: [],
      expandedDefaultCollapsedIds: ["subflow-a", "subflow-b"]
    });
  });
});

describe("automation hierarchy selectors", () => {
  it("marks exactly the selected object for each active Flow view", () => {
    const nodes = [flow, router, settings];
    const index = indexAutomationHierarchyNodes(nodes);
    const selected = nodes.filter((node) => automationHierarchyNodeSelectionState({
      node,
      index,
      selection: { kind: "flow", id: "flow.checkout" },
      activeViewId: "flow-settings",
      primaryTreeNodeId: null,
      recordingPrimaryKind: null
    }).primarySelected);

    expect(selected.map((node) => node.id)).toEqual([settings.id]);
  });

  it("retains stable indexes and arrays for unchanged projection inputs", () => {
    const selectProjection = createAutomationHierarchyProjectionSelector();
    const nodes = [flow, router, settings];
    const first = selectProjection(nodes, "", "all");
    const second = selectProjection(nodes, "", "all");

    expect(second).toBe(first);
    expect(second.index).toBe(first.index);
    expect(second.rootNodes).toBe(first.rootNodes);
    expect(selectProjection(nodes, "settings", "all")).not.toBe(first);
  });
});

describe("automation hierarchy controller", () => {
  it("publishes the row primary state before domain navigation work", () => {
    const store = createAutomationHierarchyStore();
    const order: string[] = [];
    store.subscribe(() => order.push("tree"));
    const controller = createAutomationHierarchyController(store, {
      nodes: [flow, router],
      activeViewId: "flow-router",
      selection: { kind: "flow", id: "flow.checkout" },
      recordingPrimaryKind: null,
      setRecordingPrimaryKind: vi.fn(),
      setSelection: () => order.push("selection"),
      openView: () => order.push("view")
    });

    controller.openNode(flow, "preview");

    expect(store.getSnapshot().primaryTreeNodeId).toBe(router.id);
    expect(order[0]).toBe("tree");
    expect(order).toEqual(["tree", "view"]);
  });

  it("opens a subflow through its single graph-shell path and selects Nodes", () => {
    const subflow: AutomationHierarchyNode = {
      id: "subflow-a",
      label: "Primary",
      kind: "subflow",
      category: "flow",
      parentId: "flow-a-subflows",
      viewId: "flow-nodes",
      sourceId: "subflow.primary",
      flowId: "flow.checkout",
      metadata: {
        graphFlowId: "flow.checkout.primary.graph",
        hierarchyContainer: true,
        defaultCollapsed: true
      }
    };
    const nodesBoard: AutomationHierarchyNode = {
      id: "subflow-a-nodes",
      label: "Nodes",
      kind: "flow-object",
      category: "flow",
      parentId: subflow.id,
      viewId: "flow-nodes",
      sourceId: "flow.checkout.primary.graph",
      flowId: "flow.checkout.primary.graph",
      metadata: { flowStructure: "subflow-nodes" }
    };
    const openSubflow = vi.fn();
    const openView = vi.fn();
    const setSelection = vi.fn();
    const store = createAutomationHierarchyStore();
    const controller = createAutomationHierarchyController(store, {
      nodes: [subflow, nodesBoard],
      activeViewId: "flow-nodes",
      selection: { kind: "flow", id: "flow.checkout" },
      recordingPrimaryKind: null,
      setRecordingPrimaryKind: vi.fn(),
      setSelection,
      openView,
      openSubflow
    });

    controller.openNode(subflow, "preview");

    expect(store.getSnapshot().primaryTreeNodeId).toBe(nodesBoard.id);
    expect(store.getSnapshot().expandedDefaultCollapsedIds).toEqual([subflow.id]);
    expect(openSubflow).toHaveBeenCalledOnce();
    expect(openView).not.toHaveBeenCalled();
    expect(setSelection).toHaveBeenCalledWith({ kind: "flow", id: "flow.checkout.primary.graph" });
  });
});

describe("automation hierarchy command and scale budgets", () => {
  it("dispatches exactly one atomic create or delete intent", () => {
    const dispatch = vi.fn();
    const commands = createAutomationHierarchyIntentCommands(dispatch);

    commands.create(null, "flow");
    expect(dispatch).toHaveBeenLastCalledWith({ action: "create", parentId: null, category: "flow" });
    expect(dispatch).toHaveBeenCalledTimes(1);

    commands.delete(flow);
    expect(dispatch).toHaveBeenLastCalledWith({ action: "delete", node: flow });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("bounds a 10,000-row sibling set to the interaction budget", () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => index);
    const startedAt = performance.now();
    const window = selectAutomationHierarchyRowWindow({ rows });
    const elapsedMs = performance.now() - startedAt;

    expect(window.rows).toHaveLength(100);
    expect(window.remaining).toBe(9_900);
    expect(window.loadMoreLabel).toBe("Show 100 more");
    expect(elapsedMs).toBeLessThan(100);
  });
});
