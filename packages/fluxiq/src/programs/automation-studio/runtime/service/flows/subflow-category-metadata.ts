import type { AutomationStudioFlowSubflow } from "../../../model/index.ts";

// The Subflow metadata that records which category a Subflow sits under,
// written under both the current and the earlier field name.

export function subflowMetadataWithParentCategory(metadata: AutomationStudioFlowSubflow["metadata"], parentCategoryId: string | null): AutomationStudioFlowSubflow["metadata"] | undefined {
  const next = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
  delete next.parentCategoryId;
  delete next.subflowCategoryId;
  delete next.categoryId;
  if (parentCategoryId?.trim()) {
    next.parentCategoryId = parentCategoryId.trim();
    next.subflowCategoryId = parentCategoryId.trim();
  }
  return Object.keys(next).length ? next : undefined;
}
