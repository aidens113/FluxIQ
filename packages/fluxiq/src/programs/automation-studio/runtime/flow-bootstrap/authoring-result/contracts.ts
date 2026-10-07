/** A saved authoring result. This carries no execution or promotion authority. */
export type AutomationStudioCandidateAuthoringResult = {
  status: "draft"; projectId: string; flowId: string; candidateId: string;
  revision: number; digest: string; sourceInstructionIds: readonly string[];
  baseDependencyDigest: string; baseSettingsRevision: number;
  verification: "not_performed"; promotionAllowed: false;
  accounting: { requestId: string; estimatedInputTokens: number; provider?: string; model?: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
};
export type AutomationStudioCandidateAuthoringBinding = { projectId: string; flowId: string; candidateId?: string; revision?: number; digest?: string };
