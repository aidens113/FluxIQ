import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createAutomationHierarchyCommands } from "./commands";
import type { AutomationHierarchyNode } from "./contracts";
import { createAutomationHierarchyController } from "./controller";
import { createAutomationHierarchyDialogStore } from "./dialog-store";
import { automationHierarchyPageKey } from "./paged-cache";
import {
  automationHierarchyOpenTargetForNode,
  automationHierarchySelectionForOpenNode,
  automationHierarchyViewIdForOpenNode
} from "./routing";
import { automationHierarchyNodeMatchesSelection } from "./selectors";
import { AutomationHierarchySiblingPager } from "./sibling-pager";
import { createAutomationHierarchyStore } from "./store";

const flow: AutomationHierarchyNode = {
  id: "flow.checkout",
  label: "Checkout",
  kind: "flow",
  category: "flow",
  parentId: null,
  viewId: "flow-nodes",
  sourceId: "flow.checkout",
  flowId: "flow.checkout"
};

const router: AutomationHierarchyNode = {
  id: "flow.checkout.router",
  label: "Router",
  kind: "flow-object",
  category: "flow",
  parentId: flow.id,
  viewId: "flow-router",
  sourceId: "flow.checkout",
  flowId: "flow.checkout"
};

const subflowFolder: AutomationHierarchyNode = {
  id: "flow.checkout.subflows",
  label: "Subflows",
  kind: "folder",
  category: "flow",
  parentId: flow.id,
  flowId: "flow.checkout",
  metadata: { flowStructure: "subflows" }
};

describe("Phase 7 hierarchy routing contracts", () => {
  it("maps legacy Proposal rows to Adaptations without creating Proposal selection state", () => {
    const detachedLegacyProposal: AutomationHierarchyNode = {
      id: "legacy.proposal",
      label: "Imported adaptation",
      kind: "proposal",
      category: "proposal",
      parentId: null,
      viewId: "proposal-workbench",
      sourceId: "proposal.legacy"
    };
    const attachedLegacyProposal = { ...detachedLegacyProposal, flowId: "flow.checkout" };

    expect(automationHierarchyViewIdForOpenNode(detachedLegacyProposal)).toBe("adaptations");
    expect(automationHierarchySelectionForOpenNode(detachedLegacyProposal)).toBeNull();
    expect(automationHierarchyOpenTargetForNode(detachedLegacyProposal).recordingPrimaryKind).toBeNull();
    expect(automationHierarchySelectionForOpenNode(attachedLegacyProposal)).toEqual({
      kind: "flow",
      id: "flow.checkout"
    });
    expect(automationHierarchyNodeMatchesSelection(
      attachedLegacyProposal,
      { kind: "flow", id: "flow.other" }
    )).toBe(false);
  });

  it("selects Router before activating it when the Flow name opens", () => {
    const order: string[] = [];
    const openView = vi.fn((viewId: string) => order.push("view:" + viewId));
    const setSelection = vi.fn(() => order.push("selection"));
    const store = createAutomationHierarchyStore();
    store.subscribe(() => order.push("row"));
    const controller = createAutomationHierarchyController(store, {
      nodes: [flow, router],
      activeViewId: "flow-settings",
      selection: { kind: "flow", id: "flow.other" },
      recordingPrimaryKind: null,
      setRecordingPrimaryKind: vi.fn(),
      setSelection,
      openView
    });

    controller.openNode(flow, "preview");

    expect(store.getSnapshot().primaryTreeNodeId).toBe(router.id);
    expect(setSelection).toHaveBeenCalledWith({ kind: "flow", id: "flow.checkout" });
    expect(openView).toHaveBeenCalledWith("flow-router", "preview");
    expect(order).toEqual(["row", "selection", "view:flow-router"]);
  });

  it("selects the subflow graph before opening its Nodes editor", () => {
    const subflow: AutomationHierarchyNode = {
      id: "subflow.checkout",
      label: "Checkout steps",
      kind: "subflow",
      category: "flow",
      parentId: subflowFolder.id,
      viewId: "flow-nodes",
      sourceId: "subflow.checkout",
      flowId: "flow.checkout",
      metadata: {
        graphFlowId: "flow.checkout.subflow.checkout.graph",
        hierarchyContainer: true,
        defaultCollapsed: true
      }
    };
    const nodes: AutomationHierarchyNode = {
      id: "subflow.checkout.nodes",
      label: "Nodes",
      kind: "flow-object",
      category: "flow",
      parentId: subflow.id,
      viewId: "flow-nodes",
      sourceId: "flow.checkout.subflow.checkout.graph",
      flowId: "flow.checkout.subflow.checkout.graph",
      metadata: { flowStructure: "subflow-nodes" }
    };
    const order: string[] = [];
    const openSubflow = vi.fn(() => order.push("subflow"));
    const store = createAutomationHierarchyStore();
    store.subscribe(() => order.push("row"));
    const controller = createAutomationHierarchyController(store, {
      nodes: [subflow, nodes],
      activeViewId: "flow-router",
      selection: { kind: "flow", id: flow.flowId! },
      recordingPrimaryKind: null,
      setRecordingPrimaryKind: vi.fn(),
      setSelection: () => order.push("selection"),
      openView: vi.fn(),
      openSubflow
    });

    controller.openNode(subflow, "preview");

    expect(store.getSnapshot().primaryTreeNodeId).toBe(nodes.id);
    expect(order.slice(-2)).toEqual(["selection", "subflow"]);
    expect(order.filter((event) => event === "row")).toHaveLength(2);
    expect(openSubflow).toHaveBeenCalledWith(subflow, "preview");
  });
});

describe("Phase 7 hierarchy mutation contracts", () => {
  it("checks parent capabilities before emitting create or delete intents", () => {
    const dispatch = vi.fn();
    const commands = createAutomationHierarchyCommands(dispatch);
    const settings: AutomationHierarchyNode = {
      ...router,
      id: "flow.checkout.settings",
      label: "Settings",
      viewId: "flow-settings"
    };

    expect(commands.create({ parentId: settings.id, parent: settings })).toBeNull();
    expect(commands.create({ parentId: subflowFolder.id, parent: subflowFolder })).toEqual({
      action: "create",
      parentId: subflowFolder.id
    });
    expect(commands.delete(settings)).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("publishes one immutable dialog transaction only for an allowed intent", () => {
    const store = createAutomationHierarchyDialogStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const nodes = new Map([
      [flow.id, flow],
      [router.id, router],
      [subflowFolder.id, subflowFolder]
    ]);

    expect(store.request({ action: "create", parentId: router.id }, nodes)).toBeNull();
    expect(store.getSnapshot()).toBeNull();
    expect(listener).not.toHaveBeenCalled();

    const transaction = store.request(
      { action: "create", parentId: subflowFolder.id },
      nodes
    );
    expect(transaction).toMatchObject({
      kind: "create",
      createKind: "subflow",
      parentId: subflowFolder.id
    });
    expect(store.getSnapshot()).toBe(transaction);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("Phase 7 SQL sibling pagination contracts", () => {
  it("loads exactly one requested sibling page and advances only that parent cursor", async () => {
    const loader = vi.fn(async (request: {
      parentId: string | null;
      cursor: string | null;
      limit: number;
    }) => ({
      items: [{
        id: "subflow.checkout",
        label: "Checkout steps",
        kind: "subflow" as const,
        category: "flow" as const,
        parentId: request.parentId,
        flowId: "flow.checkout"
      }],
      nextCursor: "child.cursor.2",
      hasMore: true
    }));
    const pager = new AutomationHierarchySiblingPager(loader);
    pager.reset("project.1", [flow], {
      [automationHierarchyPageKey(null)]: {
        loadedCount: 1,
        hasMore: false,
        nextCursor: null
      },
      [automationHierarchyPageKey(flow.id)]: {
        loadedCount: 0,
        hasMore: true,
        nextCursor: "child.cursor.1"
      }
    });

    await pager.loadMore(flow.id);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project.1",
      parentId: flow.id,
      cursor: "child.cursor.1",
      limit: 100
    }));
    expect(loader.mock.calls[0]?.[0]).not.toHaveProperty("descendantIds");
    expect(pager.getSnapshot().pageInfo[automationHierarchyPageKey(flow.id)]).toMatchObject({
      loadedCount: 1,
      hasMore: true,
      nextCursor: "child.cursor.2"
    });
    expect(pager.getSnapshot().nodes.map((node) => node.id)).toEqual([
      flow.id,
      "subflow.checkout"
    ]);

    pager.setNodes([flow]);
    expect(pager.getSnapshot().pageInfo[automationHierarchyPageKey(flow.id)]).toMatchObject({
      hasMore: true,
      nextCursor: "child.cursor.2"
    });
  });

  it("forwards parent-owned page metadata through ProjectHierarchySidebar", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./ProjectHierarchySidebar.tsx", import.meta.url)),
      "utf8"
    );

    expect(source).toContain("childPageInfo?: Record<string, AutomationHierarchyPageInfo>");
    expect(source).toContain("loadMoreChildren?(parentId: string | null): void");
    expect(source).toContain("childPageInfo: props.childPageInfo");
    expect(source).toContain("loadMoreChildren: props.loadMoreChildren");
  });
});
