import { describe, expect, it, vi } from "vitest";
import { automationHierarchyRowActionIds } from "./capabilities";
import { createAutomationHierarchyCommands } from "./commands";
import { createAutomationHierarchyController } from "./controller";
import {
  automationHierarchyDialogSubmission,
  createAutomationHierarchyDialogTransaction,
  reduceAutomationHierarchyDialogTransaction
} from "./dialog-transaction";
import { collectHierarchyDescendantIds, type AutomationHierarchyNode } from "./model";
import { automationHierarchyKeyboardAction, type AutomationHierarchyKeyboardItem } from "./keyboard";
import {
  automationHierarchyOpenTargetForNode,
  automationHierarchyViewIdForOpenNode
} from "./routing";
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
  sourceId: flow.sourceId!,
  flowId: flow.flowId!
};
const protectedSettings: AutomationHierarchyNode = {
  id: "flow-a-settings",
  label: "Settings",
  kind: "flow-object",
  category: "flow",
  parentId: flow.id,
  viewId: "flow-settings",
  sourceId: flow.sourceId!,
  flowId: flow.flowId!
};

describe("hierarchy routing and activation", () => {
  it("canonicalizes legacy node views without exposing retired views to the host", () => {
    expect(automationHierarchyViewIdForOpenNode({ ...protectedSettings, viewId: "runs-history" })).toBe("runtime-debug");
    expect(automationHierarchyViewIdForOpenNode({ ...protectedSettings, viewId: "proposal-workbench" })).toBe("adaptations");
    expect(automationHierarchyViewIdForOpenNode({ ...protectedSettings, viewId: "config" })).toBe("flow-settings");
    expect(automationHierarchyViewIdForOpenNode({ ...protectedSettings, viewId: "config-default" })).toBe("flow-settings");
  });

  it("keeps subflow navigation on the dedicated graph-shell path", () => {
    const subflow: AutomationHierarchyNode = {
      id: "subflow-a",
      label: "Primary",
      kind: "subflow",
      category: "flow",
      parentId: "flow-a-subflows",
      viewId: "flow-nodes",
      sourceId: "subflow.primary",
      flowId: "flow.checkout",
      metadata: { graphFlowId: "flow.checkout.primary.graph" }
    };
    expect(automationHierarchyOpenTargetForNode(subflow)).toMatchObject({
      navigation: "subflow",
      viewId: "flow-nodes",
      selection: { kind: "flow", id: "flow.checkout.primary.graph" }
    });
  });

  it("activates the view before queued domain reconciliation", () => {
    const order: string[] = [];
    const queued: Array<() => void> = [];
    const store = createAutomationHierarchyStore();
    store.subscribe(() => order.push("row"));
    const controller = createAutomationHierarchyController(store, {
      nodes: [flow, router],
      activeViewId: "flow-settings",
      selection: { kind: "flow", id: "flow.other" },
      recordingPrimaryKind: null,
      setRecordingPrimaryKind: vi.fn(),
      scheduleReconciliation: (commit) => queued.push(commit),
      openView: () => order.push("view"),
      setSelection: () => order.push("selection")
    });

    controller.openNode(flow, "preview");

    expect(store.getSnapshot().primaryTreeNodeId).toBe(router.id);
    expect(order).toEqual(["view"]);
    queued.forEach((commit) => commit());
    expect(order).toEqual(["view", "selection"]);
  });
});

describe("hierarchy command and dialog transactions", () => {
  it("dispatches typed commands once and rejects protected deletion", () => {
    const dispatch = vi.fn();
    const commands = createAutomationHierarchyCommands(dispatch);

    expect(commands.create({ parentId: null, category: "flow" })).toEqual({
      action: "create",
      parentId: null,
      category: "flow"
    });
    expect(commands.delete(protectedSettings)).toBeNull();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(commands.delete(flow)).toEqual({ action: "delete", node: flow });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("derives one immutable create transaction for nested subflow folders", () => {
    const subflows: AutomationHierarchyNode = {
      id: "flow-a-subflows",
      label: "Subflows",
      kind: "folder",
      category: "flow",
      parentId: flow.id,
      viewId: "flow-subflows",
      sourceId: flow.sourceId!,
      flowId: flow.flowId!,
      metadata: { flowStructure: "subflows" }
    };
    const initial = createAutomationHierarchyDialogTransaction({
      action: { action: "create", parentId: subflows.id },
      parent: subflows
    });
    expect(initial).toMatchObject({
      kind: "create",
      createKind: "subflow",
      category: "flow",
      parentId: subflows.id,
      step: "type",
      status: "editing"
    });
    const named = reduceAutomationHierarchyDialogTransaction(initial, { type: "set-name", name: "  Retry Checkout  " });
    const pinned = reduceAutomationHierarchyDialogTransaction(named, { type: "set-pin", authorizationPin: "12ab345" });

    expect(initial).not.toBe(named);
    expect(initial.authorizationPin).toBe("");
    expect(pinned.authorizationPin).toBe("12345");
    expect(automationHierarchyDialogSubmission(pinned)).toMatchObject({
      ok: true,
      transaction: { name: "Retry Checkout", authorizationPin: "12345" }
    });
  });

  it("validates the entire transaction instead of independent dialog fields", () => {
    const transaction = createAutomationHierarchyDialogTransaction({
      action: { action: "delete", node: flow }
    });
    expect(automationHierarchyDialogSubmission(transaction)).toEqual({
      ok: false,
      error: "Enter your PIN before changing hierarchy items."
    });
    const failed = reduceAutomationHierarchyDialogTransaction(transaction, {
      type: "submit-failed",
      error: "Delete failed."
    });
    expect(failed).toMatchObject({ status: "failed", error: "Delete failed.", node: flow });
  });
});

describe("hierarchy keyboard and row menus", () => {
  const items: AutomationHierarchyKeyboardItem[] = [
    { id: "root-flow", parentId: null, expanded: true },
    { id: flow.id, parentId: "root-flow", expanded: true },
    { id: router.id, parentId: flow.id, expanded: null },
    { id: protectedSettings.id, parentId: flow.id, expanded: null }
  ];

  it("supports roving focus, parent/child traversal, disclosure, and activation", () => {
    expect(automationHierarchyKeyboardAction({ items, currentId: flow.id, key: "ArrowRight" })).toEqual({ type: "focus", id: router.id });
    expect(automationHierarchyKeyboardAction({ items, currentId: router.id, key: "ArrowLeft" })).toEqual({ type: "focus", id: flow.id });
    expect(automationHierarchyKeyboardAction({
      items: items.map((item) => item.id === flow.id ? { ...item, expanded: false } : item),
      currentId: flow.id,
      key: "ArrowRight"
    })).toEqual({ type: "toggle", id: flow.id });
    expect(automationHierarchyKeyboardAction({ items, currentId: router.id, key: "End" })).toEqual({ type: "focus", id: protectedSettings.id });
    expect(automationHierarchyKeyboardAction({ items, currentId: router.id, key: "Enter" })).toEqual({ type: "open", id: router.id });
  });

  it("exposes only capability-backed menu actions", () => {
    const subflowFolder: AutomationHierarchyNode = {
      id: "subflows",
      label: "Subflows",
      kind: "folder",
      category: "flow",
      parentId: flow.id,
      flowId: flow.flowId!,
      metadata: { flowStructure: "subflows" }
    };
    expect(automationHierarchyRowActionIds(flow)).toEqual(["open-settings", "delete"]);
    expect(automationHierarchyRowActionIds(protectedSettings)).toEqual([]);
    expect(automationHierarchyRowActionIds(subflowFolder)).toEqual(["create-child"]);
  });
});

describe("hierarchy large-tree deletion", () => {
  it("collects a deep 10,000-node subtree without recursive stack growth", () => {
    const nodes: AutomationHierarchyNode[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: "node-" + index,
      label: "Node " + index,
      kind: index === 0 ? "flow" : "folder",
      category: "flow",
      parentId: index === 0 ? null : "node-" + (index - 1)
    }));
    const descendants = collectHierarchyDescendantIds("node-0", nodes);
    expect(descendants).toHaveLength(9_999);
    expect(descendants[0]).toBe("node-1");
    expect(descendants[9_998]).toBe("node-9999");
  });
});
