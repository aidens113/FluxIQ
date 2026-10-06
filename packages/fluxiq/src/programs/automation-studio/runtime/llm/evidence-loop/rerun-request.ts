// The one amendment the draft cannot carry out, and what becomes of the ones the
// loop cannot carry out either.
//
// `rerun` says "do this step again with a corrected argument". It has to
// *execute* something, so the draft refuses it as `run_by_the_loop` and the loop
// filters it out of the apply call and asks here for the step to run
// (`../../flow-draft/amendment/`).
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
//
// **Bindings (t252).** A binding resolves only in the Flow, so a rerun never
// sends one live. A written step is put back written: its call carries `write`,
// and a binding form in the patch is translated as a written call's is, once,
// here, a `$step` against the steps before it (P5, t270; `bind_malformed` when
// it names this step, a later one or one that is not in the Flow). A recorded
// step whose merged argument still holds a binding is refused
// as `rerun_holds_binding`, unrun: rerun it with a value for every bound
// parameter, or write it.
//
// **A rerun of a done act is requested here like any other and run as a check**
// (live run `run-murwcaj0-40e56557`, R7: a repair rerun of the step that had
// confirmed Amara's request, act a1, pressed Tom's Confirm instead). It is not
// refused: the step carries an instructed act its own run already did, so the
// call that answers it checks the new argument and does not do the act again
// (`../node-tools/rerun-check.ts`).
//
// **A rerun of the attempt a rerun replaced is refused naming its replacement**
// (`../../flow-draft/amendment/replaced-attempt.ts`). Live run
// `run-musp474o-e0ed7432` reran its listing at step 6 with a fixed where, was
// shown the withdrawn attempt as step 7, and reran "step 7" with that where
// three times: each was refused `changes_nothing`, which never said step 6
// already held it, and the round stopped. It is checked before anything else
// about the rerun, so the model is told which step to change rather than why
// this one would not run.

import type { JsonObject } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON,
  automationStudioFlowDraftHoldsBinding,
  automationStudioFlowDraftReplacingStep,
  automationStudioFlowDraftTranslateBindings,
  type AutomationStudioFlowDraftAmendment,
  type AutomationStudioFlowDraftAmendmentRefusal,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceRerunInput } from "./rerun-input.ts";
import { automationStudioRerunRetainedPaths, automationStudioRerunScreenedPaths, type AutomationStudioRerunArgumentMetadata } from "../rerun-arguments/index.ts";

/** The key that asks for a node call to be written rather than run (`../node-tools/replay.ts`). */
const WRITE_KEY = "write";
/** The key a node call's parameters sit under (`../node-tools/run-node.ts`). */
const PARAMETERS_KEY = "parameters";

/** A step to run again: which step it replaces, and the call that replaces it, with the whole argument it runs with. */
export type AutomationStudioLlmEvidenceRerunCall = { step: number; toolId: string; input: JsonObject; callId: string; retained?: AutomationStudioRerunArgumentMetadata };

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
  ranAlready: (toolId: string, input: JsonObject, at?: string) => boolean = () => false,
  deniedEvidenceKeys?: readonly string[]
): { request: AutomationStudioLlmEvidenceRerunCall | undefined; refused: AutomationStudioFlowDraftAmendmentRefusal[]; retainedRefusals?: { retained: AutomationStudioRerunArgumentMetadata; reason: "rerun_holds_binding" }[] } {
  let request: AutomationStudioLlmEvidenceRerunCall | undefined;
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  const retainedRefusals: { retained: AutomationStudioRerunArgumentMetadata; reason: "rerun_holds_binding" }[] = [];
  for (const amendment of amendments) {
    if (amendment.change !== "rerun") continue;
    const step = steps.find((candidate) => candidate.position === amendment.step);
    // The step is looked for first, and refused in the draft's own word for it,
    // so a number that names nothing reads the same wherever the model wrote it.
    if (!step) {
      refused.push({ step: amendment.step, reason: "no_such_step" });
      continue;
    }
    // The attempt a rerun replaced: change the step standing in its place (header).
    const replacing = automationStudioFlowDraftReplacingStep(steps, step);
    if (replacing) {
      refused.push({ step: amendment.step, reason: AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON, replacedBy: replacing.position });
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
    const merged = automationStudioLlmEvidenceRerunInput(step.input, amendment.input);
    const collected = automationStudioRerunRetainedPaths(step.input, amendment.input, merged);
    const paths = automationStudioRerunScreenedPaths(collected.paths, deniedEvidenceKeys);
    const retained = paths.length ? { step: step.position, paths, parameters: collected.parameters } : undefined;
    const input = step.written ? writtenInput(merged, steps, step) : merged;
    if (input === undefined) {
      refused.push({ step: amendment.step, reason: "bind_malformed" });
      continue;
    }
    if (!step.written && automationStudioFlowDraftHoldsBinding(input)) {
      refused.push({ step: amendment.step, reason: "rerun_holds_binding" });
      if (retained) retainedRefusals.push({ retained, reason: "rerun_holds_binding" });
      continue;
    }
    // The same call on the same untouched page answers the same: refused, unrun (`../repeat-guard/outcomes.ts`).
    if (ranAlready(toolId, input, step.replay?.from ? step.stateBefore : undefined)) {
      refused.push({ step: amendment.step, reason: "changes_nothing" });
      continue;
    }
    request = { step: step.position, toolId, input, callId: `rerun.${step.position}`, ...(retained ? { retained } : {}) };
  }
  return { request, refused, ...(retainedRefusals.length ? { retainedRefusals } : {}) };
}

/**
 * A written step's rerun argument: written again, with any binding form its
 * parameters were given translated to the state binding a written call sends
 * (`../evidence-loop-decision.ts`); nothing when a form cannot be read, which
 * is never sent on as a literal. A `$step` reads a step before the one rerun,
 * where it stands in the draft (P5, t270).
 */
function writtenInput(input: JsonObject, steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): JsonObject | undefined {
  const parameters = input[PARAMETERS_KEY];
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) return { ...input, [WRITE_KEY]: true };
  const translated = automationStudioFlowDraftTranslateBindings(parameters, { steps, at: step.position });
  if (translated.refused.length) return undefined;
  return { ...input, [PARAMETERS_KEY]: translated.parameters, [WRITE_KEY]: true };
}
