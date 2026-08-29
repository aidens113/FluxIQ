import { describe, expect, it, vi } from "vitest";
import { submitAutomationHierarchyDialog } from "./AutomationHierarchyDialog";
import {
  createAutomationHierarchyCommandExecutor,
  type AutomationHierarchyCommandDependencies,
  type AutomationHierarchyCommandPort
} from "./command-executor";
import type { AutomationHierarchyNode } from "./contracts";
import {
  createAutomationHierarchyDialogTransaction,
  reduceAutomationHierarchyDialogTransaction,
  type AutomationHierarchyDialogTransaction
} from "./dialog-transaction";
import { createAutomationHierarchyDialogStore } from "./dialog-store";

const flowNode: AutomationHierarchyNode = {
  id: "flow.checkout",
  label: "Checkout",
  kind: "flow",
  category: "flow",
  parentId: null,
  sourceId: "flow.checkout",
  flowId: "flow.checkout",
  viewId: "flow-nodes"
};

function ready<T extends AutomationHierarchyDialogTransaction>(transaction: T): T {
  const named = transaction.kind === "create"
    ? reduceAutomationHierarchyDialogTransaction(transaction, { type: "set-name", name: "Checkout" })
    : transaction;
  return reduceAutomationHierarchyDialogTransaction(named, { type: "set-pin", authorizationPin: "1234" }) as T;
}

function harness(
  nodes: AutomationHierarchyNode[],
  commandOverrides: Partial<AutomationHierarchyCommandPort> = {}
) {
  let projectFlows: any[] = [];
  let customNodes: AutomationHierarchyNode[] = [];
  let deletedIds: string[] = [];
  let selection: AutomationHierarchyCommandDependencies["selection"] = null;
  const openedFlows: string[] = [];
  const openedSubflows: string[] = [];
  const closedNodeIds: string[][] = [];
  const notifications: Array<{ scopes: string[]; ids: string[] }> = [];
  const commands: AutomationHierarchyCommandPort = {
    createFlow: vi.fn(async () => ({ ok: true, payload: { flow: { flowId: "flow.created", name: "Checkout" } } })),
    saveFlow: vi.fn(async ({ flow }) => ({ ok: true, payload: { flow } })),
    loadFlow: vi.fn(async () => ({ ok: false, error: "Not found." })),
    deleteFlow: vi.fn(async () => ({ ok: true })),
    createSubflow: vi.fn(async () => ({ ok: true, payload: { subflow: { subflowId: "subflow.created" } } })),
    deleteSubflow: vi.fn(async () => ({ ok: true })),
    deleteArtifact: vi.fn(async () => ({ ok: true })),
    ...commandOverrides
  };
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const dependencies: AutomationHierarchyCommandDependencies = {
    projectId: "project.1",
    nodes,
    nodeById,
    canonicalFlowIds: new Set(nodes.filter((node) => node.kind === "flow" && node.sourceId).map((node) => node.sourceId!)),
    selection,
    projectTasks: [],
    commands,
    deleteRecordings: vi.fn(async () => true),
    findLocalFlow: () => null,
    rememberFlow: vi.fn(),
    commitSubflowChanged: vi.fn(),
    notifyChanged(scopes, ids) {
      notifications.push({ scopes, ids });
    },
    openCreatedFlow(flowId) {
      openedFlows.push(flowId);
    },
    openCreatedSubflow(flowId) {
      openedSubflows.push(flowId);
    },
    closeDeletedViews(deletingNodes) {
      closedNodeIds.push(deletingNodes.map((node) => node.id));
    },
    clearFlowDrafts: vi.fn(),
    setSelection(next) {
      selection = next;
      dependencies.selection = next;
    },
    updateProjectFlows(update) {
      projectFlows = update(projectFlows);
    },
    updateCustomNodes(update) {
      customNodes = update(customNodes);
    },
    updateDeletedIds(update) {
      deletedIds = update(deletedIds);
    },
    now: () => 100,
    createId: () => "generated.1"
  };
  return {
    commands,
    dependencies,
    state: {
      get projectFlows() { return projectFlows; },
      get customNodes() { return customNodes; },
      get deletedIds() { return deletedIds; },
      openedFlows,
      openedSubflows,
      closedNodeIds,
      notifications
    }
  };
}

describe("Automation hierarchy command executor", () => {
  it("dispatches successful Flow creation and optimistic reconciliation once", async () => {
    const setup = harness([flowNode]);
    const executor = createAutomationHierarchyCommandExecutor();
    const transaction = ready(createAutomationHierarchyDialogTransaction({
      action: { action: "create", category: "flow", parentId: null }
    }));

    const result = await executor.execute(transaction, setup.dependencies);

    expect(result).toEqual({ ok: true });
    expect(setup.commands.createFlow).toHaveBeenCalledTimes(1);
    expect(setup.commands.createFlow).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project.1",
      authorizationPin: "1234",
      name: "Checkout"
    }));
    expect(setup.state.projectFlows[0]?.flow?.flowId).toBe("flow.created");
    expect(setup.state.openedFlows).toEqual(["flow.created"]);
    expect(setup.state.notifications).toContainEqual({
      scopes: ["flow", "summary"],
      ids: ["flow.created"]
    });
  });

  it("dispatches successful Flow deletion and cleans local hierarchy state", async () => {
    const setup = harness([flowNode]);
    const executor = createAutomationHierarchyCommandExecutor();
    setup.dependencies.updateProjectFlows(() => [{ source: "canonical", flow: { flowId: "flow.checkout" } }]);
    const transaction = ready(createAutomationHierarchyDialogTransaction({
      action: { action: "delete", node: flowNode }
    }));

    const result = await executor.execute(transaction, setup.dependencies);

    expect(result).toEqual({ ok: true });
    expect(setup.commands.deleteFlow).toHaveBeenCalledWith("flow.checkout", "1234");
    expect(setup.state.projectFlows).toEqual([]);
    expect(setup.state.closedNodeIds).toEqual([[flowNode.id]]);
  });

  it("rejects a capability-invalid transaction without dispatching a mutation", async () => {
    const protectedSettings: AutomationHierarchyNode = {
      id: "flow.checkout.settings",
      label: "Settings",
      kind: "flow-object",
      category: "flow",
      parentId: flowNode.id,
      sourceId: "flow.checkout",
      flowId: "flow.checkout",
      viewId: "flow-settings"
    };
    const setup = harness([flowNode, protectedSettings]);
    const executor = createAutomationHierarchyCommandExecutor();
    const transaction = ready(createAutomationHierarchyDialogTransaction({
      action: { action: "delete", node: protectedSettings }
    }));

    await expect(executor.execute(transaction, setup.dependencies)).resolves.toEqual({
      ok: false,
      error: "This item can no longer be deleted."
    });
    expect(setup.commands.deleteFlow).not.toHaveBeenCalled();
    expect(setup.commands.deleteArtifact).not.toHaveBeenCalled();
  });

  it("delegates subflow creation and reconciles the created graph", async () => {
    const subflowsRoot: AutomationHierarchyNode = {
      id: "flow.checkout.subflows",
      label: "Subflows",
      kind: "folder",
      category: "flow",
      parentId: flowNode.id,
      flowId: "flow.checkout",
      metadata: { flowStructure: "subflows" }
    };
    const createSubflow = vi.fn(async () => ({
      ok: true as const,
      payload: { subflow: { subflowId: "subflow.created", graphFlowId: "flow.checkout.subflow.created.graph" } }
    }));
    const setup = harness([flowNode, subflowsRoot], { createSubflow });
    const executor = createAutomationHierarchyCommandExecutor();
    const transaction = ready(createAutomationHierarchyDialogTransaction({
      action: { action: "create", category: "flow", parentId: subflowsRoot.id },
      parent: subflowsRoot
    }));

    await expect(executor.execute(transaction, setup.dependencies)).resolves.toEqual({ ok: true });
    expect(createSubflow).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project.1",
      flowId: "flow.checkout",
      parentCategoryId: null,
      authorizationPin: "1234"
    }));
    expect(setup.state.openedSubflows).toEqual(["flow.checkout.subflow.created.graph"]);
    expect(setup.state.notifications).toContainEqual({
      scopes: ["flow", "subflow", "summary"],
      ids: ["flow.checkout", "subflow.created"]
    });
  });

  it("delegates recording deletion and removes the local hierarchy subtree", async () => {
    const recordingNode: AutomationHierarchyNode = {
      id: "recording.row.1",
      label: "Checkout recording",
      kind: "recording",
      category: "recording",
      parentId: null,
      sourceId: "recording.1"
    };
    const setup = harness([recordingNode]);
    const executor = createAutomationHierarchyCommandExecutor();
    const transaction = ready(createAutomationHierarchyDialogTransaction({
      action: { action: "delete", node: recordingNode }
    }));

    await expect(executor.execute(transaction, setup.dependencies)).resolves.toEqual({ ok: true });
    expect(setup.dependencies.deleteRecordings).toHaveBeenCalledWith(["recording.1"], "1234");
    expect(setup.state.customNodes).toEqual([]);
  });});

describe("Automation hierarchy dialog submission", () => {
  it("keeps the dialog open with a transaction-local error after command failure", async () => {
    const setup = harness([], {
      createFlow: vi.fn(async () => ({ ok: false, error: "Flow name already exists." }))
    });
    const executor = createAutomationHierarchyCommandExecutor();
    const store = createAutomationHierarchyDialogStore();
    store.request({ action: "create", category: "flow", parentId: null }, new Map());
    store.dispatch({ type: "set-name", name: "Checkout" });
    store.dispatch({ type: "set-pin", authorizationPin: "1234" });

    const result = await submitAutomationHierarchyDialog(
      store,
      (transaction) => executor.execute(transaction, setup.dependencies)
    );

    expect(result).toEqual({ ok: false, error: "Flow name already exists." });
    expect(store.getSnapshot()).toMatchObject({
      kind: "create",
      status: "failed",
      error: "Flow name already exists.",
      name: "Checkout"
    });
  });

  it("prevents a second submission while the immutable transaction is in flight", async () => {
    let resolveCreate!: (value: { ok: true; payload: { flow: { flowId: string } } }) => void;
    const createPromise = new Promise<{ ok: true; payload: { flow: { flowId: string } } }>((resolve) => {
      resolveCreate = resolve;
    });
    const createFlow = vi.fn(() => createPromise);
    const setup = harness([], { createFlow });
    const executor = createAutomationHierarchyCommandExecutor();
    const store = createAutomationHierarchyDialogStore();
    store.request({ action: "create", category: "flow", parentId: null }, new Map());
    store.dispatch({ type: "set-name", name: "Checkout" });
    store.dispatch({ type: "set-pin", authorizationPin: "1234" });

    const first = submitAutomationHierarchyDialog(store, (transaction) => executor.execute(transaction, setup.dependencies));
    const second = await submitAutomationHierarchyDialog(store, (transaction) => executor.execute(transaction, setup.dependencies));

    expect(second).toEqual({ ok: false, error: "This hierarchy action is already being submitted." });
    expect(createFlow).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ status: "submitting" });

    resolveCreate({ ok: true, payload: { flow: { flowId: "flow.created" } } });
    await expect(first).resolves.toEqual({ ok: true });
    expect(store.getSnapshot()).toBeNull();
  });
});