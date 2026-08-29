import {
  automationHierarchyCreateCommandCanDispatch
} from "./commands";
import { automationHierarchyNodeCanDelete } from "./capabilities";
import type { AutomationHierarchyAction, AutomationHierarchyNode } from "./contracts";
import {
  createAutomationHierarchyDialogTransaction,
  reduceAutomationHierarchyDialogTransaction,
  type AutomationHierarchyDialogEvent,
  type AutomationHierarchyDialogTransaction
} from "./dialog-transaction";

export type AutomationHierarchyDialogStore = {
  getSnapshot(): AutomationHierarchyDialogTransaction | null;
  subscribe(listener: () => void): () => void;
  request(
    action: NonNullable<AutomationHierarchyAction>,
    nodeById: ReadonlyMap<string, AutomationHierarchyNode>
  ): AutomationHierarchyDialogTransaction | null;
  dispatch(event: AutomationHierarchyDialogEvent): void;
  close(): void;
};

export function createAutomationHierarchyDialogStore(): AutomationHierarchyDialogStore {
  let snapshot: AutomationHierarchyDialogTransaction | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: AutomationHierarchyDialogTransaction | null) => {
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    request(action, nodeById) {
      const parent = action.action === "create" && action.parentId
        ? nodeById.get(action.parentId) ?? null
        : null;
      const allowed = action.action === "delete"
        ? automationHierarchyNodeCanDelete(action.node)
        : automationHierarchyCreateCommandCanDispatch({
          parentId: action.parentId,
          ...(action.category ? { category: action.category } : {}),
          parent
        });
      if (!allowed) return null;
      const transaction = createAutomationHierarchyDialogTransaction({ action, parent });
      publish(transaction);
      return transaction;
    },
    dispatch(event) {
      if (snapshot) publish(reduceAutomationHierarchyDialogTransaction(snapshot, event));
    },
    close() {
      publish(null);
    }
  };
}
