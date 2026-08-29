import { automationHierarchyNodeCanDelete } from "./capabilities";
import {
  type AutomationHierarchyCommandDependencies,
  type AutomationHierarchyCommandExecutor
} from "./command-executor-contracts";
import { hierarchySubflowParent } from "./command-executor-support";
import { automationHierarchyCreateCommandCanDispatch } from "./commands";
import { executeHierarchyCreateCommand } from "./create-command-executor";
import { executeHierarchyDeleteCommand } from "./delete-command-executor";
import type { AutomationHierarchyDialogTransaction } from "./dialog-transaction";

export type {
  AutomationHierarchyCommandDependencies,
  AutomationHierarchyCommandExecutor,
  AutomationHierarchyCommandPort,
  AutomationHierarchyExecutionResult,
  AutomationHierarchyInvalidationScope
} from "./command-executor-contracts";

export function createAutomationHierarchyCommandExecutor(): AutomationHierarchyCommandExecutor {
  const inFlight = new Set<number>();
  return {
    async execute(transaction, dependencies) {
      if (inFlight.has(transaction.transactionId)) {
        return { ok: false, error: "This hierarchy action is already being submitted." };
      }
      const capabilityError = hierarchyTransactionCapabilityError(transaction, dependencies);
      if (capabilityError) return { ok: false, error: capabilityError };
      inFlight.add(transaction.transactionId);
      try {
        return transaction.kind === "create"
          ? await executeHierarchyCreateCommand(transaction, dependencies)
          : await executeHierarchyDeleteCommand(transaction, dependencies);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Hierarchy action failed." };
      } finally {
        inFlight.delete(transaction.transactionId);
      }
    }
  };
}

function hierarchyTransactionCapabilityError(
  transaction: AutomationHierarchyDialogTransaction,
  dependencies: AutomationHierarchyCommandDependencies
): string | null {
  if (transaction.kind === "delete") {
    const current = dependencies.nodeById.get(transaction.node.id);
    return current && automationHierarchyNodeCanDelete(current) ? null : "This item can no longer be deleted.";
  }
  const parent = transaction.parentId ? dependencies.nodeById.get(transaction.parentId) ?? null : null;
  if (!automationHierarchyCreateCommandCanDispatch({
    parentId: transaction.parentId,
    category: transaction.category,
    parent
  })) return "This location does not allow new hierarchy items.";
  const subflowParent = parent ? hierarchySubflowParent(parent) : null;
  if (subflowParent && transaction.createKind !== "subflow" && transaction.createKind !== "folder") {
    return "Only subflows and folders can be created here.";
  }
  if (!subflowParent && transaction.createKind === "subflow") return "Subflows must be created inside a Flow's Subflows folder.";
  return null;
}