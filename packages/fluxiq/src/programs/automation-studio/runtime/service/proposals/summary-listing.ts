import type { AutomationStudioProposalSummary } from "../../../storage/index.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";

export type AutomationStudioProposalSummaryListingPorts = {
  indexes: AutomationStudioServiceIndexes;
};

/** Both kinds of proposal in one listing, newest first. */
export async function listAutomationStudioProposalSummaries(ports: AutomationStudioProposalSummaryListingPorts, projectId: string): Promise<AutomationStudioProposalSummary[]> {
  const index = await ports.indexes.readPipelineIndex(projectId);
  const policyProposals = (index.policyProposals ?? []).map((item): AutomationStudioProposalSummary => ({
    proposalId: item.proposalId,
    recordingId: item.recordingId ?? "unknown",
    kind: "policy",
    status: item.status === "approved" ? "approved" : "generated",
    generatedAt: item.generatedAt,
    updatedAt: item.generatedAt,
    nodeCount: 0,
    issueCount: 0
  }));
  const recordingFlowProposals = (index.recordingFlowProposals ?? []).map((item): AutomationStudioProposalSummary => ({
    proposalId: item.proposalId,
    recordingId: item.recordingId ?? "unknown",
    kind: "recording_flow",
    status: item.status === "proposed" ? "generated" : item.status,
    generatedAt: item.generatedAt,
    updatedAt: item.generatedAt,
    nodeCount: 0,
    issueCount: 0
  }));
  return [...policyProposals, ...recordingFlowProposals].sort((left, right) => right.generatedAt - left.generatedAt);
}
