// The attempt a rerun replaced, and the step standing in its place now.
//
// Where the model authors its draft, a rerun that worked takes the replaced
// step's number and the attempt it replaced is listed at the end of the draft,
// carrying `replacedBy` (`../step.ts`, `../../llm/evidence-loop/rerun-replacement.ts`).
// An amendment or a rerun naming that attempt changes nothing: it is refused,
// naming the step that replaced it (`./apply.ts`,
// `../../llm/evidence-loop/rerun-request.ts`), and the draft entry shows the
// attempt as replaced by that step (`../entry.ts`). Live run
// `run-musp474o-e0ed7432` reran such an attempt three times with the where its
// rerun already held.
import { automationStudioFlowDraftStepById } from "../routing.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "./types.ts";

/**
 * The reason an amendment or rerun naming the attempt a rerun replaced is
 * refused under, with `replacedBy` beside it. Borrowed, as the add and keep of
 * a look borrow it (`./apply.ts`): the attempt is out of the Flow, so the
 * borrowed words are true of it, and a dedicated reason is a change of this
 * one constant plus the reason's words wherever the refusal union is
 * exhaustive.
 */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON: AutomationStudioFlowDraftAmendmentRefusal["reason"] = "not_a_kept_step";

/**
 * The step standing now in place of the attempt a rerun replaced, following a
 * rerun replaced in turn to the end of the chain; nothing when `step` is not
 * such an attempt or the chain names no step in the draft.
 */
export function automationStudioFlowDraftReplacingStep(
  steps: readonly AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep
): AutomationStudioFlowDraftStep | undefined {
  let current = step;
  // Bounded by the draft, so a link that loops ends rather than spins.
  for (let hops = 0; current.replacedBy !== undefined && hops < steps.length; hops += 1) {
    const next = automationStudioFlowDraftStepById(steps, current.replacedBy);
    if (!next) return undefined;
    current = next;
  }
  return current === step || current.replacedBy !== undefined ? undefined : current;
}
