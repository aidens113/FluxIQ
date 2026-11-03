/** What a candidate trial's standing verdict was: the trial gate's verdicts, or `not_tested` when none ran. */
export type AutomationStudioCandidateTrialOutcomeVerdict = "yes" | "no" | "unsure" | "not_judged" | "execution_failed" | "not_tested";

/** Why a candidate stayed a draft (t340): the standing verdict, the trial run behind it, and Core's codes. */
export type AutomationStudioCandidateDraftTrialBlock = { verdict: AutomationStudioCandidateTrialOutcomeVerdict; runId?: string; codes: readonly string[] };

/** A saved authoring result. This carries no execution or promotion authority. */
export type AutomationStudioCandidateAuthoringResult = {
  status: "draft"; projectId: string; flowId: string; candidateId: string;
  revision: number; digest: string; sourceInstructionIds: readonly string[];
  baseDependencyDigest: string; baseSettingsRevision: number;
  verification: "not_performed"; promotionAllowed: false;
  accounting: { requestId: string; estimatedInputTokens: number; provider?: string; model?: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
  /** Present when Core had a trial runner: why nothing was promoted. */
  trial?: AutomationStudioCandidateDraftTrialBlock;
};
export type AutomationStudioCandidateAuthoringBinding = { projectId: string; flowId: string; candidateId?: string; revision?: number; digest?: string };

/**
 * A candidate whose trial run was judged yes twice and was proposed (t340): an
 * ordinary proposed adaptation, approved and applied like a legacy one, that
 * names the candidate and trial it came from. A proposal without that block is
 * not a candidate's and is refused.
 */
export type AutomationStudioCandidateProposalResult = {
  status: "proposed"; projectId: string; flowId: string; adaptationId: string;
  /** True when the build finished holding a permission question: nothing may be applied until it is answered. */
  awaitingPermission: boolean;
  candidate: { candidateId: string; revision: number; digest: string; trial: { runId: string; verdict: "yes"; calls: number } };
};
