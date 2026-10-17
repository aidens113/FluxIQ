// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal, AutomationStudioFlowDraftUnreachedStep } from "../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENTS_REFUSED_CODE } from "./refused-code.ts";
import { REFUSAL_REASONS } from "./refusal-reasons.ts";
import type { AutomationStudioDraftAmendmentFeedbackStep } from "./step.ts";
import { wayOut } from "./way-out.ts";
import { unreachedNote, movedNote } from "./notes.ts";
import { existingPositions } from "./positions.ts";

export const AMENDMENT_FEEDBACK_INSTRUCTION = "The listed amendments changed nothing, for the reason beside each one, and the draft is as it was for them. "
  + "Amend a step that exists, do something else, or complete. A decision whose amendments all change nothing counts toward stopping this exploration.";

// Said beside any refusal: how the numbers in a decision are read
// (`../flow-draft/amendment/shown-numbering.ts`, t195 w45).
export const NUMBERING_INSTRUCTION = " Every step number in one decision names the step as the draft entry you were shown numbered it, and the draft is renumbered once, after the whole decision: the next draft entry shows the new numbers.";

// Said when a decision's moves took a repeat off (`repeat_taken_off`), which
// no amendment of the model's asked for (header, run `run-musr9pv3-f4bf6256`).
export const TAKEN_OFF_INSTRUCTION = " An entry whose reason is repeat_taken_off is a repeat Core took off after this decision's moves, not one of your amendments: next beside it says which step's repeat over which step was taken off, and why.";

/** What an amendment that put the draft back exactly as it stood is recorded and shown under. */
// Said when the decision newly left a step after one that does not bring it to its page (`unreached`).
export const UNREACHED_INSTRUCTION = " unreached is not a refusal: those amendments were applied, and each entry names a step of the Flow that now runs after a step that does not leave the page it acted on, so when the Flow runs it runs on another page; its note says how to give it its way back.";

/** What an answer whose amendments all landed, one of them leaving a step without its way to its page, is shown under. */
export const STEP_UNREACHED_CODE = "llm_evidence_loop.draft_step_unreached";

export const AMENDMENT_UNDONE_CODE = "llm_evidence_loop.draft_amendment_undone";

/** What an answer whose amendments all landed, one of them moving an act, is shown under. */
export const ACT_MOVED_CODE = "llm_evidence_loop.draft_act_moved";

export const MOVED_INSTRUCTION = " moved names each step an act was moved off: the act now stands on the step to, and the step it left does no act yet is still in the Flow. Drop it unless the Flow needs it for something else.";

// Said once a refusal repeats, because the model had already been told the
// reason and sent the same edit anyway: everything-store round 2 sent one set
// of five refused amendments four decisions running.
export const REPEATED_INSTRUCTION = " Every refusal marked repeated was refused for the same reason before, and it will be refused again however often it is sent: stop sending it.";

// Said whenever a refusal carries `next`, so the model reads it as the step to
// take rather than one more explanation (live run 37).
export const NEXT_INSTRUCTION = " next, beside a refusal, is what to do instead, in the draft's own step numbers: do that rather than sending the refused amendment again.";

export const UNDONE_INSTRUCTION = " These amendments put the draft back exactly as it stood at iteration sameDraftAsIteration, so the Flow is no different from then."
  + " Decide once whether the step belongs in the Flow and leave it: toggling a step counts toward stopping this exploration.";

/**
 * What the model reads after an amendment decision the draft refused, before it
 * is asked again: which amendments changed nothing and why, how far the draft
 * reaches, and how close the loop is to stopping. Every refusal and every
 * position is listed: until 2026-09-30 the entry listed at most 16 refusals and
 * the newest 32 positions (user: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
 * ELEMENTS PASSED TO MODEL").
 *
 * `steps` is the draft as it now stands, read for the positions it has and
 * nothing else, so the positions reported are the ones an amendment would
 * actually be looked up against rather than a range assumed from a count.
 */
export function automationStudioLlmEvidenceDraftAmendmentFeedback(input: {
  /** `repeated` on a refusal this build already gave for the same step and reason (`./evidence-loop/amendment-memory.ts`). */
  refusals: readonly (AutomationStudioFlowDraftAmendmentRefusal & { repeated?: boolean })[];
  /** How many of the same decision's amendments did land. */
  applied: number;
  steps: readonly AutomationStudioDraftAmendmentFeedbackStep[];
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
  /** The iteration whose draft the applied amendments put back exactly, when they did. */
  sameDraftAsIteration?: number;
  /**
   * The acts and choices the checklist shows not done, by id, when the draft
   * has a checklist (`./loop-configuration.ts`, `draft.actsMissing`): what an
   * `act_already_named` about a done act is told to go on with, and what every
   * other refusal ends its `next` with.
   */
  actsNotDone?: readonly string[] | undefined;
  /**
   * Each act one of the decision's amendments moved off a step that it left in
   * the Flow with no act (`../flow-draft/amendment/apply.ts`, `moved`).
   */
  moved?: readonly { act: string; from: number; to: number }[] | undefined;
  /**
   * Each step of the Flow the decision newly left after a step that does not
   * bring it to its page (`../flow-draft/amendment/strand-check.ts`):
   * information, never a refusal.
   */
  unreached?: readonly AutomationStudioFlowDraftUnreachedStep[] | undefined;
}): JsonObject {
  const refused = input.refusals.map((refusal) => {
    const next = wayOut(refusal, input.steps, input.actsNotDone);
    return {
      step: refusal.step,
      reason: refusal.reason,
      // A refused bind names its parameter, in the model's own key names.
      ...(refusal.parameter === undefined ? {} : { parameter: refusal.parameter }),
      ...(refusal.copyOf === undefined ? {} : { copyOf: refusal.copyOf }),
      // An act claimed on a step that did something else: the act, the judge's sentence and the step that names it (W1).
      ...(refusal.reason === "act_not_done_there" && refusal.act !== undefined ? { act: refusal.act } : {}),
      ...(refusal.reason === "act_not_done_there" && refusal.said !== undefined ? { said: refusal.said } : {}),
      ...(refusal.reason === "act_not_done_there" && refusal.instead !== undefined ? { instead: refusal.instead } : {}),
      // What the step offers instead, from the step the bind examined (`../flow-draft/bindable/paths.ts`, run B7).
      ...(refusal.reason === "bind_new_key" && refusal.bindable ? { bindable: refusal.bindable } : {}),
      // A repeat Core took off was never sent, so it is never sent again (header).
      ...(refusal.repeated && refusal.reason !== "repeat_taken_off" ? { repeated: true } : {}),
      next
    };
  });
  // Entries that are only repeats Core took off refuse no amendment of the model's (header).
  const amendmentsRefused = refused.some((refusal) => refusal.reason !== "repeat_taken_off");
  const repeatsTakenOff = refused.length > 0 && !amendmentsRefused;
  const undone = input.sameDraftAsIteration !== undefined;
  const moved = (input.moved ?? []).map((move) => ({ step: move.from, act: move.act, to: move.to, note: movedNote(move) }));
  const unreached = (input.unreached ?? []).map((entry) => ({ step: entry.step, after: entry.after, reachedBy: [...entry.reachedBy], note: unreachedNote(entry) }));
  // An answer that is only about a moved act, or a step left unreached, refused nothing: it is told as that.
  const onlyMoved = !refused.length && !undone && (moved.length > 0 || unreached.length > 0);
  const met = [...new Set(refused.map((refusal) => refusal.reason))];
  const reasons: JsonObject = {};
  for (const reason of met) reasons[reason] = REFUSAL_REASONS[reason];
  return {
    ok: onlyMoved,
    code: onlyMoved ? (moved.length ? ACT_MOVED_CODE : STEP_UNREACHED_CODE) : refused.length || !undone ? AUTOMATION_STUDIO_LLM_EVIDENCE_AMENDMENTS_REFUSED_CODE : AMENDMENT_UNDONE_CODE,
    refused,
    ...(moved.length ? { moved } : {}),
    ...(unreached.length ? { unreached } : {}),
    applied: input.applied,
    steps: input.steps.length,
    // Only when the model named a step that is not there: the numbers that are.
    ...(met.includes("no_such_step") ? { positions: existingPositions(input.steps) } : {}),
    reasons,
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    ...(undone ? { sameDraftAsIteration: input.sameDraftAsIteration! } : {}),
    instruction: ((amendmentsRefused || (!undone && !onlyMoved && !repeatsTakenOff) ? AMENDMENT_FEEDBACK_INSTRUCTION : "")
      + (refused.length ? NUMBERING_INSTRUCTION : "")
      + (refused.some((refusal) => refusal.reason === "repeat_taken_off") ? TAKEN_OFF_INSTRUCTION : "")
      + (refused.some((refusal) => refusal.repeated) ? REPEATED_INSTRUCTION : "")
      + (refused.some((refusal) => refusal.next) ? NEXT_INSTRUCTION : "")
      + (undone ? UNDONE_INSTRUCTION : "")
      + (moved.length ? MOVED_INSTRUCTION : "")
      + (unreached.length ? UNREACHED_INSTRUCTION : "")).trim()
  };
}
