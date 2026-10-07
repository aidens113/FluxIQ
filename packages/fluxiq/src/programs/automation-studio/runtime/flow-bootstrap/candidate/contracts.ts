import type { AutomationStudioFlowBuildPlan } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapCompletionVerdict } from "../../llm/harness-options/index.ts";

/** Static submission receipt. It grants neither execution nor promotion. */
export type AutomationStudioFlowCandidate = {
  revision: number;
  digest: string;
  baseDependencyDigest: string;
  status: "draft";
  summary: string;
  buildPlan: AutomationStudioFlowBuildPlan;
  changedPaths: string[];
};

export type AutomationStudioFlowCandidateSubmission =
  | { ok: true; candidate: AutomationStudioFlowCandidate }
  | { ok: false; revision: number; check: Extract<AutomationStudioFlowBootstrapCompletionVerdict, { ok: false }>["check"] };
