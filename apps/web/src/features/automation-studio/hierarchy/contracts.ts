import type { AutomationStudioViewId, RetiredAutomationStudioViewId } from "../views/view-registry";

export type AutomationHierarchyKind = "folder" | "client" | "proposal" | "flow" | "flow-object" | "subflow" | "instruction" | "change-proposal" | "adaptation" | "task" | "routine" | "config" | "recording" | "run";
export type AutomationCreatableHierarchyKind = "folder" | "flow" | "subflow";
export type AutomationHierarchyCategory = "client" | "proposal" | "flow" | "task" | "routine" | "config" | "recording" | "run";
export type AutomationHierarchyViewId = AutomationStudioViewId | RetiredAutomationStudioViewId | "routine-editor" | "runs-history" | "config-default";

export const automationHierarchyCategories: ReadonlyArray<{ id: AutomationHierarchyCategory; label: string; description: string; creatable?: boolean }> = [
  { id: "flow", label: "Flows", description: "Visual, recorded, and programmatic automations", creatable: true }
];

export type AutomationHierarchyNode = {
  id: string;
  label: string;
  kind: AutomationHierarchyKind;
  category: AutomationHierarchyCategory;
  parentId: string | null;
  viewId?: AutomationHierarchyViewId;
  sourceId?: string;
  flowId?: string;
  recordingId?: string;
  metadata?: Record<string, unknown>;
};

export type AutomationHierarchyCreateAction = {
  action: "create";
  category?: AutomationHierarchyCategory;
  parentId: string | null;
};

export type AutomationHierarchyDeleteAction = {
  action: "delete";
  node: AutomationHierarchyNode;
};

export type AutomationHierarchyAction = AutomationHierarchyCreateAction | AutomationHierarchyDeleteAction | null;

export type AutomationStudioProject = {
  id: string;
  name: string;
  description: string;
  domainId?: string | null;
  categoryId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioProjectCategory = {
  id: string;
  name: string;
  domainId?: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationProjectModal = "create" | "rename" | "delete" | "move" | "create-category" | "rename-category" | "delete-category" | "move-category" | null;

export function automationHierarchyCategoryLabel(category: AutomationHierarchyCategory): string {
  return automationHierarchyCategories.find((item) => item.id === category)?.label ?? "Flows";
}