import { describe, expect, it, vi } from "vitest";
import { selectAutomationHierarchyRowWindow } from "./bounded-rows";
import { createAutomationHierarchyIntentCommands } from "./commands";
import { createAutomationHierarchyController } from "./controller";
import type { AutomationHierarchyNode } from "./model";
import { indexAutomationHierarchyNodes } from "./model";
import {
  automationHierarchyAncestorContainersForSelection,
  automationHierarchyDefaultContainersForSelection,
  automationHierarchyNodeSelectionState,
  createAutomationHierarchyProjectionSelector,
  selectAutomationHierarchyEffectiveCollapsedIds,
  selectAutomationHierarchyPrimaryTreeNodeId
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

  it("hydrates cached project state once without publishing it back", () => {
    const store = createAutomationHierarchyStore();
    const subscriber = vi.fn();
    const publish = vi.fn();
    store.subscribe(subscriber);
    store.setChangeListener(publish);
    const cached = {
      collapsedFolderIds: ["folder-a"],
      expandedDefaultCollapsedIds: ["subflow-a"],
      focusedTreeNodeId: "flow-a",
      primaryTreeNodeId: router.id
    };

    expect(store.hydrate(cached)).toBe(true);
    expect(store.getSnapshot()).toEqual(cached);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();

    expect(store.hydrate({ ...cached, collapsedFolderIds: [...cached.collapsedFolderIds] })).toBe(false);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();

    expect(store.focus(settings.id)).toBe(true);
    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(store.hydrate({ ...store.getSnapshot() })).toBe(false);
    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);

    expect(store.hydrate(null)).toBe(true);
    expect(store.getSnapshot()).toEqual({
      collapsedFolderIds: [],
      expandedDefaultCollapsedIds: [],
      focusedTreeNodeId: "root-flow",
      primaryTreeNodeId: null
    });
    expect(subscriber).toHaveBeenCalledTimes(3);
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
  it("returns only the ancestor chain needed to reveal a restored nested inner view", () => {
    const subflow = {
      id: "subflow-review",
      label: "Review",
      kind: "subflow",
      category: "flow",
      parentId: flow.id,
      flowId: "flow.checkout",
      metadata: { defaultCollapsed: true, graphFlowId: "flow.review.graph" }
    } as AutomationHierarchyNode;
    const instructions = {
      id: "subflow-review-instructions",
      label: "Instructions",
      kind: "flow-object",
      category: "flow",
      parentId: subflow.id,
      flowId: "flow.review.graph",
      viewId: "flow-instructions",
      sourceId: "flow.review.graph"
    } as AutomationHierarchyNode;
    expect(automationHierarchyAncestorContainersForSelection(
      [flow, subflow, instructions],
      { kind: "flow", id: "flow.review.graph" },
      "flow-instructions"
    )).toEqual([flow.id, subflow.id]);
  });

  it("expands the active subflow until the user explicitly collapses it", () => {
    const subflow = {
      id: "subflow-a",
      label: "Checkout",
      kind: "subflow",
      category: "flow",
      parentId: flow.id,
      metadata: { defaultCollapsed: true, graphFlowId: "flow.checkout.subflow.graph" }
    } as AutomationHierarchyNode;
    const input = {
      nodes: [flow, subflow],
      collapsedFolderIds: [],
      expandedDefaultCollapsedIds: [],
      selection: { kind: "flow", id: "flow.checkout.subflow.graph" }
    } satisfies Parameters<typeof selectAutomationHierarchyEffectiveCollapsedIds>[0];
    expect(selectAutomationHierarchyEffectiveCollapsedIds(input)).not.toContain("subflow-a");
    expect(selectAutomationHierarchyEffectiveCollapsedIds({
      ...input,
      collapsedFolderIds: ["subflow-a"]
    })).toContain("subflow-a");
  });

  it("keeps a Flow's subflow branches visible while selecting Router or another Flow object", () => {
    const subflow = {
      id: "subflow-a",
      label: "Checkout",
      kind: "subflow",
      category: "flow",
      parentId: flow.id,
      flowId: "flow.checkout",
      metadata: { defaultCollapsed: true, graphFlowId: "flow.checkout.subflow.graph" }
    } as AutomationHierarchyNode;
    const selectedSubflow = { kind: "flow", id: "flow.checkout.subflow.graph" } as const;
    const store = createAutomationHierarchyStore();
    for (const containerId of automationHierarchyDefaultContainersForSelection(
      [flow, router, subflow],
      selectedSubflow,
      store.getSnapshot().collapsedFolderIds
    )) {
      store.expandContainer(containerId, true);
    }
    const input = {
      nodes: [flow, router, subflow],
      collapsedFolderIds: store.getSnapshot().collapsedFolderIds,
      expandedDefaultCollapsedIds: store.getSnapshot().expandedDefaultCollapsedIds,
      selection: { kind: "flow", id: "flow.checkout" }
    } satisfies Parameters<typeof selectAutomationHierarchyEffectiveCollapsedIds>[0];

    expect(selectAutomationHierarchyEffectiveCollapsedIds(input)).not.toContain(subflow.id);
    expect(selectAutomationHierarchyEffectiveCollapsedIds({
      ...input,
      collapsedFolderIds: [subflow.id]
    })).toContain(subflow.id);
  });

  it("leaves unopened subflows default-collapsed when their parent Flow is selected", () => {
    const subflow = {
      id: "subflow-a",
      label: "Checkout",
      kind: "subflow",
      category: "flow",
      parentId: flow.id,
      flowId: "flow.checkout",
      metadata: { defaultCollapsed: true, graphFlowId: "flow.checkout.subflow.graph" }
    } as AutomationHierarchyNode;

    expect(selectAutomationHierarchyEffectiveCollapsedIds({
      nodes: [flow, subflow],
      collapsedFolderIds: [],
      expandedDefaultCollapsedIds: [],
      selection: { kind: "flow", id: "flow.checkout" }
    })).toContain(subflow.id);
  });

  it("highlights the Nodes row that owns a restored editor-node selection", () => {
    const subflow = {
      id: "subflow-a",
      label: "Primary",
      kind: "subflow",
      category: "flow",
      parentId: flow.id,
      viewId: "flow-nodes",
      sourceId: "subflow.primary",
      flowId: "flow.checkout",
      metadata: { graphFlowId: "flow.checkout.primary.graph", defaultCollapsed: true }
    } as AutomationHierarchyNode;
    const nodesBoard = {
      id: "subflow-a-nodes",
      label: "Nodes",
      kind: "flow-object",
      category: "flow",
      parentId: subflow.id,
      viewId: "flow-nodes",
      sourceId: "flow.checkout.primary.graph",
      flowId: "flow.checkout.primary.graph"
    } as AutomationHierarchyNode;
    const selection = {
      kind: "editor-node" as const,
      id: "node.output",
      flowId: "flow.checkout.primary.graph",
      node: {
        label: "Output",
        nodeType: "custom",
        family: "output",
        description: "Output",
        inputs: [],
        outputs: [],
        parameters: [],
        parameterValues: {}
      }
    };
    const nodes = [flow, subflow, nodesBoard];
    const index = indexAutomationHierarchyNodes(nodes);

    expect(automationHierarchyNodeSelectionState({
      node: nodesBoard,
      index,
      selection,
      activeViewId: "flow-nodes",
      primaryTreeNodeId: null,
      recordingPrimaryKind: null
    }).primarySelected).toBe(true);
    expect(selectAutomationHierarchyEffectiveCollapsedIds({
      nodes,
      collapsedFolderIds: [],
      expandedDefaultCollapsedIds: [],
      selection
    })).not.toContain(subflow.id);
  });

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

  it("derives external selection without feeding updates back into the hierarchy store", () => {
    const store = createAutomationHierarchyStore({
      collapsedFolderIds: [],
      expandedDefaultCollapsedIds: [],
      focusedTreeNodeId: router.id,
      primaryTreeNodeId: router.id
    });
    const subscriber = vi.fn();
    store.subscribe(subscriber);

    for (let index = 0; index < 100; index += 1) {
      expect(selectAutomationHierarchyPrimaryTreeNodeId({
        nodes: [flow, router, settings],
        primaryTreeNodeId: store.getSnapshot().primaryTreeNodeId,
        selection: { kind: "flow", id: "flow.checkout" },
        activeViewId: "flow-settings",
        recordingPrimaryKind: null
      })).toBeNull();
    }

    expect(store.getSnapshot().primaryTreeNodeId).toBe(router.id);
    expect(subscriber).not.toHaveBeenCalled();

    const selected = [flow, router, settings].filter((node) => automationHierarchyNodeSelectionState({
      node,
      index: indexAutomationHierarchyNodes([flow, router, settings]),
      selection: { kind: "flow", id: "flow.checkout" },
      activeViewId: "flow-settings",
      primaryTreeNodeId: null,
      recordingPrimaryKind: null
    }).primarySelected);
    expect(selected.map((node) => node.id)).toEqual([settings.id]);
  });

  it("shows a newly requested primary row before its workspace view activates", () => {
    expect(selectAutomationHierarchyPrimaryTreeNodeId({
      nodes: [flow, router, settings],
      primaryTreeNodeId: settings.id,
      selection: { kind: "flow", id: "flow.checkout" },
      activeViewId: undefined,
      recordingPrimaryKind: null
    })).toBe(settings.id);

    expect(selectAutomationHierarchyPrimaryTreeNodeId({
      nodes: [flow, router, settings],
      primaryTreeNodeId: settings.id,
      selection: { kind: "flow", id: "flow.checkout" },
      activeViewId: "flow-router",
      recordingPrimaryKind: null
    })).toBeNull();
  });

  it("retains stable indexes and arrays for unchanged projection inputs", () => {
    const selectProjection = createAutomationHierarchyProjectionSelector();
    const nodes = [flow, router, settings];
    const first = selectProjection(nodes, "", "all");
    const second = selectProjection(nodes, "", "all");

    expect(second).toBe(first);
    expect(second.index).toBe(first.index);
    expect(second.rootNodes).toBe(first.rootNodes);
    const filtered = selectProjection(nodes, "settings", "all");
    expect(filtered).not.toBe(first);
    expect(filtered.index).toBe(first.index);
    expect(filtered.matchCount).toBe(1);
  });
});

describe("automation hierarchy controller", () => {
  it("commits same-selection activation without a redundant tree publication", () => {
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
    expect(order).toEqual(["view", "selection"]);
  });

  it("keeps one controller while reading the latest command context", () => {
    const firstOpenView = vi.fn();
    const latestOpenView = vi.fn();
    const latestSetSelection = vi.fn();
    const store = createAutomationHierarchyStore();
    let context = {
      nodes: [flow, router],
      activeViewId: "flow-router" as string | undefined,
      selection: { kind: "flow" as const, id: "flow.checkout" },
      recordingPrimaryKind: null as "recording" | null,
      setRecordingPrimaryKind: vi.fn(),
      setSelection: vi.fn(),
      openView: firstOpenView
    };
    const controller = createAutomationHierarchyController(store, () => context);
    const originalController = controller;

    controller.openNode(router, "preview");
    expect(firstOpenView).toHaveBeenCalledOnce();

    const defaultCollapsedFolder: AutomationHierarchyNode = {
      id: "folder-latest",
      label: "Latest folder",
      kind: "folder",
      category: "flow",
      parentId: flow.id,
      metadata: { defaultCollapsed: true }
    };
    context = {
      ...context,
      nodes: [flow, router, defaultCollapsedFolder],
      activeViewId: "flow-settings",
      selection: { kind: "flow", id: "flow.other" },
      setSelection: latestSetSelection,
      openView: latestOpenView
    };

    controller.openNode(router, "new-pane-or-focus");
    controller.toggleFolder(defaultCollapsedFolder.id);

    expect(controller).toBe(originalController);
    expect(firstOpenView).toHaveBeenCalledOnce();
    expect(latestSetSelection).toHaveBeenCalledWith({ kind: "flow", id: "flow.checkout" });
    expect(latestOpenView).toHaveBeenCalledWith("flow-router::object::flow.checkout", "new-pane-or-focus");
    expect(store.getSnapshot().expandedDefaultCollapsedIds).toEqual([defaultCollapsedFolder.id]);
  });

  it("keeps folder toggles local to the hierarchy store", () => {
    const folder: AutomationHierarchyNode = {
      id: "folder-a",
      label: "Folder",
      kind: "folder",
      category: "flow",
      parentId: flow.id
    };
    const store = createAutomationHierarchyStore();
    const subscriber = vi.fn();
    const setRecordingPrimaryKind = vi.fn();
    const setSelection = vi.fn();
    const openView = vi.fn();
    store.subscribe(subscriber);
    const controller = createAutomationHierarchyController(store, {
      nodes: [flow, folder],
      activeViewId: "flow-router",
      selection: { kind: "flow", id: "flow.checkout" },
      recordingPrimaryKind: null,
      setRecordingPrimaryKind,
      setSelection,
      openView
    });

    controller.toggleFolder(folder.id);
    expect(store.getSnapshot().collapsedFolderIds).toEqual([folder.id]);
    controller.toggleFolder(folder.id);
    expect(store.getSnapshot().collapsedFolderIds).toEqual([]);

    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(setRecordingPrimaryKind).not.toHaveBeenCalled();
    expect(setSelection).not.toHaveBeenCalled();
    expect(openView).not.toHaveBeenCalled();
  });
  it("delegates subflow selection to its single asynchronous graph-shell path", () => {
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
    expect(setSelection).not.toHaveBeenCalled();
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
