// Whether a build continues an incomplete draft, and the draft it starts from
// when it does.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResume } from "../../llm/evidence-loop/index.ts";
import type { AutomationStudioFlowBootstrapIncompleteDraft } from "./record.ts";

/** What the evidence loop's `draft` is given to continue a stopped build. */
export type AutomationStudioFlowBootstrapIncompleteDraftContinuation = {
  seed: AutomationStudioFlowDraftStep[];
  resume: AutomationStudioLlmEvidenceLoopResume;
};

/**
 * The seed and resume entry for a build of the Flow the record was written
 * for, or nothing when it is not that build any more.
 *
 * A record is continued only while the Flow's execution digest and the
 * instructions it answered are what they were: a draft proved against a Flow
 * that has since changed, or towards an instruction that has since been
 * rewritten, is a list of steps for a different job. Such a build starts from
 * nothing, as it would have without the record, and writes revision 1 if it
 * too stops short.
 */
export function automationStudioFlowBootstrapIncompleteDraftContinuation(
  record: AutomationStudioFlowBootstrapIncompleteDraft | undefined,
  build: { baseDependencyDigest: string; sourceInstructionIds: readonly string[] }
): AutomationStudioFlowBootstrapIncompleteDraftContinuation | undefined {
  if (!record || !record.steps.length || record.baseDependencyDigest !== build.baseDependencyDigest) return undefined;
  const instructions = [...new Set(build.sourceInstructionIds)].sort();
  if (instructions.length !== record.sourceInstructionIds.length || instructions.some((id, index) => id !== record.sourceInstructionIds[index])) return undefined;
  return {
    seed: record.steps.map((step) => structuredClone(step)),
    resume: { revision: record.revision, stopped: record.stopped, outstandingIssueCodes: [...record.outstandingIssueCodes] }
  };
}
