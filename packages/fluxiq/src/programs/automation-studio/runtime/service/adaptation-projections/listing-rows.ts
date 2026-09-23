import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation, AutomationStudioFlowChangeProposal } from "../../../model/index.ts";
import type { AutomationStudioAdaptationPolicySummary, AutomationStudioAdaptationSummary, AutomationStudioChangeProposalSummary } from "../indexes/index.ts";

// The listing rows a change proposal, an adaptation and an adaptation policy
// project to.

export function changeProposalSummaryFromProposal(proposal: AutomationStudioFlowChangeProposal): AutomationStudioChangeProposalSummary {
  return {
    proposalId: proposal.proposalId,
    flowId: proposal.flowId,
    projectId: proposal.projectId,
    ...(proposal.subflowId ? { subflowId: proposal.subflowId } : {}),
    mode: proposal.mode,
    status: proposal.status,
    riskLevel: proposal.riskLevel,
    patchCount: proposal.patches.length,
    updatedAt: proposal.updatedAt
  };
}
export function adaptationSummaryFromAdaptation(adaptation: AutomationStudioFlowAdaptation): AutomationStudioAdaptationSummary {
  return {
    adaptationId: adaptation.adaptationId,
    flowId: adaptation.flowId,
    projectId: adaptation.projectId,
    ...(adaptation.subflowId ? { subflowId: adaptation.subflowId } : {}),
    status: adaptation.status,
    riskLevel: adaptation.riskLevel,
    trigger: adaptation.trigger,
    updatedAt: adaptation.updatedAt
  };
}

export function adaptationPolicySummaryFromPolicy(projectId: string, policy: AutomationStudioAdaptationPolicy): AutomationStudioAdaptationPolicySummary {
  return {
    policyId: policy.policyId,
    projectId,
    flowId: policy.scope.flowId,
    ...(policy.scope.kind === "subflow" ? { subflowId: policy.scope.subflowId } : {}),
    preset: policy.preset,
    proposalMode: policy.proposalMode,
    updatedAt: policy.updatedAt
  };
}
