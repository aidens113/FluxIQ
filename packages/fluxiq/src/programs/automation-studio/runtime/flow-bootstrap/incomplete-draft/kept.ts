// The incomplete draft a stopped build keeps, or nothing when it has nothing
// worth keeping.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { flowBootstrapDiagnosticIssueCodes } from "../generation-failure/index.ts";
import type { AutomationStudioFlowBootstrapIncompleteDraft } from "./record.ts";

/**
 * The record a build that ended without an accepted completion leaves.
 *
 * Only the steps a Flow could be proposed from are kept: a step the model
 * dropped or called exploratory, one that only looked, and one that failed are
 * each something the draft already says is not part of the result, and a
 * continuation that inherited them would spend decisions withdrawing them
 * again. A draft with no such step is not nearly a Flow, and keeps nothing --
 * a previous record, if there is one, is left as it was.
 *
 * `previous` is the record this build continued, when it continued one, and
 * decides the revision: the next one after it, or 1 for a build that started
 * afresh. Its creation time is carried so the record says when the work began.
 */
export function automationStudioFlowBootstrapIncompleteDraftKept(input: {
  projectId: string;
  flowId: string;
  baseDependencyDigest: string;
  sourceInstructionIds: readonly string[];
  stopped: AutomationStudioFlowBootstrapIncompleteDraft["stopped"];
  outstandingIssueCodes: readonly string[];
  completionAttempts: number;
  steps: readonly AutomationStudioFlowDraftStep[];
  previous?: AutomationStudioFlowBootstrapIncompleteDraft;
  now: number;
}): AutomationStudioFlowBootstrapIncompleteDraft | undefined {
  const steps = input.steps.filter(automationStudioFlowDraftStepIsProposed).map((step, index) => keptStep(step, index + 1));
  if (!steps.length) return undefined;
  return {
    kind: "flow_bootstrap_incomplete_draft",
    status: "incomplete",
    projectId: input.projectId,
    flowId: input.flowId,
    revision: input.previous ? input.previous.revision + 1 : 1,
    baseDependencyDigest: input.baseDependencyDigest,
    sourceInstructionIds: [...new Set(input.sourceInstructionIds)].sort(),
    stopped: input.stopped,
    outstandingIssueCodes: flowBootstrapDiagnosticIssueCodes(input.outstandingIssueCodes),
    completionAttempts: Number.isSafeInteger(input.completionAttempts) && input.completionAttempts > 0 ? input.completionAttempts : 0,
    steps,
    createdAt: input.previous?.createdAt ?? input.now,
    updatedAt: input.now
  };
}

/**
 * A step as a continuation receives it: its own name, what it did and how to
 * run it again, and nothing that belonged to the call that took it.
 */
function keptStep(step: AutomationStudioFlowDraftStep, position: number): AutomationStudioFlowDraftStep {
  const copy = structuredClone(step);
  delete copy.callId;
  delete copy.replayed;
  copy.position = position;
  copy.iteration = 0;
  return copy;
}
