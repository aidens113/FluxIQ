import {
  automationHierarchyNodeCanCreateChildFolder,
  automationHierarchyNodeCanDelete
} from "./capabilities";
import type {
  AutomationHierarchyCategory,
  AutomationHierarchyCreateAction,
  AutomationHierarchyDeleteAction,
  AutomationHierarchyNode
} from "./contracts";

export type AutomationHierarchyCreateCommand = {
  parentId: string | null;
  category?: AutomationHierarchyCategory;
  parent?: AutomationHierarchyNode | null;
};

export type AutomationHierarchyCommands = {
  create(command: AutomationHierarchyCreateCommand): AutomationHierarchyCreateAction | null;
  delete(node: AutomationHierarchyNode): AutomationHierarchyDeleteAction | null;
};

export function automationHierarchyCreateCommandCanDispatch(
  command: AutomationHierarchyCreateCommand
): boolean {
  if (command.parentId === null) return command.category === undefined || command.category === "flow";
  return command.parent?.id === command.parentId
    && automationHierarchyNodeCanCreateChildFolder(command.parent);
}

export function createAutomationHierarchyCommands(
  dispatch: (action: AutomationHierarchyCreateAction | AutomationHierarchyDeleteAction) => void
): AutomationHierarchyCommands {
  return {
    create(command) {
      if (!automationHierarchyCreateCommandCanDispatch(command)) return null;
      const action: AutomationHierarchyCreateAction = {
        action: "create",
        parentId: command.parentId,
        ...(command.category ? { category: command.category } : {})
      };
      dispatch(action);
      return action;
    },
    delete(node) {
      if (!automationHierarchyNodeCanDelete(node)) return null;
      const action: AutomationHierarchyDeleteAction = { action: "delete", node };
      dispatch(action);
      return action;
    }
  };
}

/** Compatibility facade for the current root requestAction callback. */
export function createAutomationHierarchyIntentCommands(
  dispatch: (action: AutomationHierarchyCreateAction | AutomationHierarchyDeleteAction) => void
): {
  create(
    parentId: string | null,
    category?: AutomationHierarchyCategory,
    parent?: AutomationHierarchyNode | null
  ): AutomationHierarchyCreateAction | null;
  delete(node: AutomationHierarchyNode): AutomationHierarchyDeleteAction | null;
} {
  const commands = createAutomationHierarchyCommands(dispatch);
  return {
    create(parentId, category, parent) {
      return commands.create({
        parentId,
        ...(category ? { category } : {}),
        ...(parent !== undefined ? { parent } : {})
      });
    },
    delete(node) {
      return commands.delete(node);
    }
  };
}
