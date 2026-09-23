import type { AutomationStudioFlowSummary } from "../../../storage/index.ts";
import type { AutomationStudioServiceIndexes, AutomationStudioSubflowSummary } from "../indexes/index.ts";

export type AutomationStudioFlowHierarchySubflowPorts = {
  indexes: AutomationStudioServiceIndexes;
};

/** Each Flow summary with the Subflows the Subflow index places under it. */
export async function withAutomationStudioCanonicalFlowHierarchySubflows(ports: AutomationStudioFlowHierarchySubflowPorts, projectId: string, flows: AutomationStudioFlowSummary[]): Promise<AutomationStudioFlowSummary[]> {
  // Only a missing index reads as empty; an unreadable one fails the listing.
  const index = await ports.indexes.readFlowSubflowIndex(projectId);
  const byFlowId = new Map<string, AutomationStudioSubflowSummary[]>();
  for (const subflow of index.subflows ?? []) {
    if (!subflow.flowId) continue;
    const items = byFlowId.get(subflow.flowId) ?? [];
    items.push(subflow);
    byFlowId.set(subflow.flowId, items);
  }
  if (!byFlowId.size) return flows;
  return flows.map((flow) => {
    const subflows = byFlowId.get(flow.flowId);
    if (!subflows) return flow;
    return {
      ...flow,
      hierarchySubflows: subflows
        .sort((left, right) => left.name.localeCompare(right.name) || left.subflowId.localeCompare(right.subflowId))
        .map((subflow) => ({
          subflowId: subflow.subflowId,
          name: subflow.name,
          ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}),
          ...(subflow.parentCategoryId ? { parentCategoryId: subflow.parentCategoryId } : {})
        }))
    };
  });
}
