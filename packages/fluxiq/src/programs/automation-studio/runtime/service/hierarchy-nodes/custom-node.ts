import type { AutomationStudioHierarchyNode } from "../../../api/contracts.ts";

// Reading a host-supplied hierarchy node: every field is required to be what
// the contract says, because a malformed node would otherwise reach the tree.

const AUTOMATION_STUDIO_HIERARCHY_NODE_KINDS = new Set<AutomationStudioHierarchyNode["kind"]>([
  "folder", "client", "proposal", "flow", "config", "recording", "run", "task", "routine"
]);
const AUTOMATION_STUDIO_HIERARCHY_NODE_CATEGORIES = new Set<AutomationStudioHierarchyNode["category"]>([
  "client", "proposal", "flow", "config", "recording", "run", "task", "routine"
]);

export function requiredHierarchyId(value: unknown, fieldName: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`Automation Studio hierarchy ${fieldName} is required.`);
  return normalized;
}

export function normalizeCustomHierarchyNode(value: unknown): AutomationStudioHierarchyNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Automation Studio hierarchy node must be an object.");
  }
  const node = value as Record<string, unknown>;
  const id = requiredHierarchyId(node.id, "node.id");
  const label = requiredHierarchyId(node.label, "node.label");
  if (!AUTOMATION_STUDIO_HIERARCHY_NODE_KINDS.has(node.kind as AutomationStudioHierarchyNode["kind"])) {
    throw new Error("Automation Studio hierarchy node.kind is invalid.");
  }
  if (!AUTOMATION_STUDIO_HIERARCHY_NODE_CATEGORIES.has(node.category as AutomationStudioHierarchyNode["category"])) {
    throw new Error("Automation Studio hierarchy node.category is invalid.");
  }
  const parentId = node.parentId === null ? null : requiredHierarchyId(node.parentId, "node.parentId");
  const optionalId = (fieldName: "viewId" | "sourceId" | "recordingId"): string | undefined => (
    node[fieldName] === undefined ? undefined : requiredHierarchyId(node[fieldName], `node.${fieldName}`)
  );
  const viewId = optionalId("viewId");
  const sourceId = optionalId("sourceId");
  const recordingId = optionalId("recordingId");
  return {
    id,
    label,
    kind: node.kind as AutomationStudioHierarchyNode["kind"],
    category: node.category as AutomationStudioHierarchyNode["category"],
    parentId,
    ...(viewId ? { viewId } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(recordingId ? { recordingId } : {})
  };
}
