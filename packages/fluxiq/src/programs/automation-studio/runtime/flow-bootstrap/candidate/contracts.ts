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
