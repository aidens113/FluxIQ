import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapCompletionVerdict } from "../../llm/harness-options/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";

/** Historical owner-enumerated bytes, never pinned-read or execution authority. */
export type AutomationStudioCandidateOriginalSources = {
  schemaVersion: "candidate.original_sources.v1";
  projectId: string;
  flowId: string;
  inventoryInstructionIds: readonly string[];
  instructions: readonly AutomationStudioFlowInstruction[];
  effectiveInstructionIds: readonly string[];
  excludedInstructionIds: readonly string[];
};
export type AutomationStudioCandidateOriginalSourceBinding = {
  originalSources: AutomationStudioCandidateOriginalSources;
  originalInstructionsDigest: string;
};

/** Static submission receipt. It grants neither execution nor promotion. */
export type AutomationStudioFlowCandidate = {
  revision: number;
  digest: string;
  baseDependencyDigest: string;
  status: "draft";
  summary: string;
  buildPlan: AutomationStudioFlowBuildPlan;
  changedPaths: string[];
  fingerprintVersion?: "candidate.plan+original_sources.v2";
  originalInstructionsDigest?: string;
};

export type AutomationStudioFlowCandidateSubmission =
  | { ok: true; candidate: AutomationStudioFlowCandidate }
  | { ok: false; revision: number; check: Extract<AutomationStudioFlowBootstrapCompletionVerdict, { ok: false }>["check"] };

/**
 * One trial of a submitted candidate: Core runs that exact candidate once from
 * its declared start and judges only what the trial did. The port is injected
 * by the service that owns execution and judging; the authoring loop only asks
 * and records the answer. `candidate` is the exact submission `revision` and
 * `digest` name, so the port runs the bytes the verdict is bound to.
 */
export type AutomationStudioCandidateTrialRequest = {
  candidateId: string;
  revision: number;
  digest: string;
  signal: AbortSignal;
  candidate: Readonly<AutomationStudioFlowCandidate>;
};

export const AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS = Object.freeze(["yes", "no", "unsure", "not_judged", "execution_failed"] as const);
export type AutomationStudioCandidateTrialVerdict = (typeof AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS)[number];

/** What the trial port answers. Only `yes` for the exact latest revision and digest lets the model complete. */
export type AutomationStudioCandidateTrialResult = {
  revision: number;
  digest: string;
  verdict: AutomationStudioCandidateTrialVerdict;
  /** Bounded JSON for the model: what the trial did and why the verdict, never exploration evidence. */
  feedback: JsonObject;
  trialRunId?: string;
};

export type AutomationStudioCandidateTrialPort = (request: AutomationStudioCandidateTrialRequest) => Promise<AutomationStudioCandidateTrialResult>;
