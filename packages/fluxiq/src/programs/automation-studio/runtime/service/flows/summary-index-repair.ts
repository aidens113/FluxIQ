import type { AutomationStudioFlowSummary, AutomationStudioFlowSummaryIndex, CanonicalAutomationStudioRepositories } from "../../../storage/index.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import { flowSummaryFromFlow } from "./mapping.ts";
import type { AutomationStudioFlowStore } from "./store.ts";

export type AutomationStudioFlowSummaryIndexRepairPorts = {
  flows: AutomationStudioFlowStore;
  repositories: CanonicalAutomationStudioRepositories;
  indexes: AutomationStudioServiceIndexes;
};

/**
 * Rebuilds a Flow summary index whose ownership or hierarchy metadata predates
 * the current version, from the stored Flows themselves, and carries the
 * repaired Subflow placement into the Subflow index.
 */
export async function repairAutomationStudioFlowSummaryMetadataIndex(ports: AutomationStudioFlowSummaryIndexRepairPorts, projectId: string,
    staleIndex: AutomationStudioFlowSummaryIndex): Promise<AutomationStudioFlowSummaryIndex> {
  const repairedByFlowId = new Map<string, AutomationStudioFlowSummary>();
  await Promise.all((staleIndex.flows ?? []).map(async (summary) => {
    await ports.flows.loadProjectFlow(projectId, summary.flowId);
    const flow = await ports.repositories.flows.get(summary.flowId);
    if (flow?.projectId === projectId) repairedByFlowId.set(summary.flowId, flowSummaryFromFlow(flow));
  }));
  const repairedSubflowPlacement = new Map<string, { graphFlowId?: string; parentCategoryId?: string }>();
  for (const flowSummary of repairedByFlowId.values()) {
    for (const subflow of flowSummary.hierarchySubflows ?? []) {
      repairedSubflowPlacement.set(subflow.subflowId, {
        ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}),
        ...(subflow.parentCategoryId ? { parentCategoryId: subflow.parentCategoryId } : {})
      });
    }
  }
  if (repairedSubflowPlacement.size) {
    await ports.indexes.writeFlowSubflowIndex(projectId, (index) => ({
      schemaVersion: "0.1",
      summaryVersion: 2,
      subflows: (index.subflows ?? []).map((subflow) => {
        const placement = repairedSubflowPlacement.get(subflow.subflowId);
        return placement ? { ...subflow, ...placement } : subflow;
      })
    }));
  }
  return await ports.indexes.writeFlowIndex(projectId, (current) => {
    if (current.ownershipMetadataVersion === 1 && current.hierarchyMetadataVersion === 1) return current;
    return {
      schemaVersion: "0.1",
      ownershipMetadataVersion: 1,
      hierarchyMetadataVersion: 1,
      flows: (current.flows ?? []).map((summary) => repairedByFlowId.get(summary.flowId) ?? summary)
    };
  });
}
