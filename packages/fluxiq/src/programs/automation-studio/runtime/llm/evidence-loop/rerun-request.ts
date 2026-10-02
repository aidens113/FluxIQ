// The one amendment the draft cannot carry out, and what becomes of the ones the
// loop cannot carry out either.
//
// `rerun` says "do this step again with a corrected argument". It has to
// *execute* something, so the draft refuses it as `run_by_the_loop` and the loop
// filters it out of the apply call and asks here for the step to run
// (`../../flow-draft/amendment.ts`).
//
// **What that cost until 2026-09-26.** This function answered with the first
// runnable rerun or with nothing, and nothing was the end of it: a rerun naming
// a step number that had been renumbered, one carrying no argument, one whose
// action the loop no longer offers, and every rerun after the first were all
// dropped without a word. The row read `llm_evidence_loop.draft_unchanged` and
// the model was asked again with nothing to correct -- which is exactly the
// defect a refused amendment stopped having
// (`../draft-amendment-feedback.ts`), surviving on the one path that produced
// no refusal to carry. `run_by_the_loop` could not occur on the loop path at
// all, because the only code that produced it was the code this filtered past.
//
// So a declined rerun is now a refusal like any other. It names the step number
// the model wrote and it guesses nothing: a number that names no step is
// `no_such_step`, the same word the draft uses for it, and the feedback lists
// the numbers that do exist rather than proposing the one the model may have
// meant.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal, AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceRerunInput } from "./rerun-input.ts";

/** A step to run again: which step it replaces, and the call that replaces it, with the whole argument it runs with. */
export type AutomationStudioLlmEvidenceRerunCall = { step: number; toolId: string; input: JsonObject; callId: string };

/**
 * The `rerun` a decision asked for that the loop can carry out, and a refusal
 * for every `rerun` it cannot.
 *
 * One per decision. A decision is one provider call and a rerun is a call, so
 * the first runnable one runs; the rest are refused rather than ignored, and the
 * decision's other amendments are applied as usual.
 */
export function automationStudioLlmEvidenceRerunRequest(
  amendments: readonly AutomationStudioFlowDraftAmendment[],
  steps: readonly AutomationStudioFlowDraftStep[],
  toolIds: ReadonlySet<string>,
  /**
   * Whether this exact call already failed or changed nothing on the page it
   * would run on (`../repeat-guard/outcomes.ts`): `at` is the page the step
   * started on, where the rerun is put back to (`../node-tools/step-place.ts`),
   * or absent for the page as it is now.
   */
  ranAlready: (toolId: string, input: JsonObject, at?: string) => boolean = () => false
): { request: AutomationStudioLlmEvidenceRerunCall | undefined; refused: AutomationStudioFlowDraftAmendmentRefusal[] } {
  let request: AutomationStudioLlmEvidenceRerunCall | undefined;
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  for (const amendment of amendments) {
    if (amendment.change !== "rerun") continue;
    const step = steps.find((candidate) => candidate.position === amendment.step);
    // The step is looked for first, and refused in the draft's own word for it,
    // so a number that names nothing reads the same wherever the model wrote it.
    if (!step) {
      refused.push({ step: amendment.step, reason: "no_such_step" });
      continue;
    }
    const toolId = step.toolId ?? step.actionId;
    // The three ways the loop declines a rerun of a step that does exist: it
    // was given no argument to run with, its action is not one the loop is
    // offering, or this decision has already spent its one rerun.
    if (request !== undefined || !amendment.input || !toolIds.has(toolId)) {
      refused.push({ step: amendment.step, reason: "run_by_the_loop" });
      continue;
    }
    // Only the keys that change, merged over what the step ran with (`./rerun-input.ts`).
    const input = automationStudioLlmEvidenceRerunInput(step.input, amendment.input);
    // The same call on the same untouched page answers the same: refused, unrun (`../repeat-guard/outcomes.ts`).
    if (ranAlready(toolId, input, step.replay?.from ? step.stateBefore : undefined)) {
      refused.push({ step: amendment.step, reason: "changes_nothing" });
      continue;
    }
    request = { step: step.position, toolId, input, callId: `rerun.${step.position}` };
  }
  return { request, refused };
}
