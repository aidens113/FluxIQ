// A call with `add` whose step copies a step already in the Flow stays taken.
//
// Live run `run-murwdp4f-35f976d2` (C9, rows 0038-0046): the call
// `click t1212, add` repeated step 18's press of the 3-Pack link from the same
// results page and became step 21, a second copy in the Flow; adding it also
// brought in step 19 as its opener. A step that copies a kept one
// (`../../flow-draft/second-copy.ts`) is not added: no act claim, no openers,
// no reversal. It stays in the draft as `taken`, the evidence it is, and the
// model is told so beside the call's own answer, under the entry an amendment
// refused is told under (`../draft-amendment-feedback.ts`, `second_copy`) --
// the way an act the call's add moved off another step is told
// (`./amendment.ts`, `automationStudioLlmEvidenceClaimWrittenAct`). Called from
// the loop's `draftRecord` (`../evidence-loop.ts`).
import { automationStudioFlowDraftSecondCopy, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, automationStudioLlmEvidenceDraftAmendmentFeedback } from "../draft-amendment-feedback.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/**
 * Whether `step`, just appended by a call with `add`, copies a step already in
 * the Flow; when it does, the model is told which, in the numbers of the draft
 * it was shown. The caller leaves such a step `taken`.
 */
export function automationStudioLlmEvidenceSecondCopyRefused(
  context: Pick<AutomationStudioLlmEvidenceDecisionHandlerContext, "input" | "limits" | "draftSteps" | "noProgress" | "evidence" | "accountEvidence">,
  step: AutomationStudioFlowDraftStep
): boolean {
  const copyOf = automationStudioFlowDraftSecondCopy(context.draftSteps, step);
  if (!copyOf) return false;
  const feedback = automationStudioLlmEvidenceDraftAmendmentFeedback({
    refusals: [{ step: step.position, reason: "second_copy", copyOf: copyOf.position }],
    applied: 0, steps: context.draftSteps, stepsWithoutProgress: context.noProgress.steps, maxStepsWithoutProgress: context.limits.maxStepsWithoutProgress,
    actsNotDone: context.input.draft ? context.input.draft.actsMissing?.(context.draftSteps) : undefined
  });
  context.accountEvidence(feedback);
  automationStudioLlmDecisionContextSupersede(context.evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID);
  context.evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID}.${step.iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENT_FEEDBACK_TOOL_ID, value: feedback });
  return true;
}
