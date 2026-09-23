// How the model edits the draft, instead of composing a final answer.
//
// The failure this replaces. A completed result the caller refuses used to be
// fed back as issue codes alone, and the model was asked again with its own
// previous answer absent from the request -- so the only thing it could do was
// write the whole answer again from memory. A live build authored the right
// acting steps, had each one refused for a handle it had invented, and
// completed again with those steps deleted and the wrong answer in their
// place. Re-emission is not a correction; it is a second first draft.
//
// An amendment names one step and says one thing about it, so a correction
// costs the model a sentence rather than the whole result. Five changes, which
// are the five the model actually needs and no more:
//
//   drop         -- this step should not be in the result at all.
//   exploratory  -- I did this to look around; do not keep it.
//   keep         -- undo one of the above.
//   reorder      -- this step belongs at another position.
//   rerun        -- do it again with a corrected argument, replacing it.
//
// `settings` rides alongside any of them, because "keep this step, but with
// this wait condition" is one thought and should not cost two calls.
//
// `rerun` is the one amendment this module does not carry out. It has to
// *execute* something, and executing is the loop's job rather than the draft's:
// the loop runs the step's action again with the new argument, appends what came
// back as a new step, and drops the old one. It is declared here because it is an
// edit to the draft in the model's eyes and has to be written in the same grammar
// as the others -- a model that must choose between "edit the draft" and "call a
// tool" to correct one parameter is choosing between two vocabularies again.
//
// **One shape, two required fields.** The model is asked for the smallest thing
// that can carry the meaning: a step number and a word. Everything else about
// the step -- what it did, what it was given, what state it produced -- Core
// already holds and never asks for again.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";

/** Every change one amendment may ask for. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES = ["drop", "exploratory", "keep", "reorder", "rerun"] as const;

export type AutomationStudioFlowDraftAmendmentChange = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES)[number];

/** One edit to one step of the draft. */
export type AutomationStudioFlowDraftAmendment = {
  /** The step's position in the draft, counting from 1. */
  step: number;
  change: AutomationStudioFlowDraftAmendmentChange;
  /** Settings to carry on the step. Merged over whatever it already had. */
  settings?: JsonObject;
  /** `reorder` only: the position to move the step to, counting from 1. */
  to?: number;
  /** `rerun` only: the whole argument to run the step's action with this time. */
  input?: JsonObject;
};

/** Why one amendment changed nothing. */
export type AutomationStudioFlowDraftAmendmentRefusal = {
  step: number;
  reason: "no_such_step" | "already_so" | "no_such_position" | "run_by_the_loop";
};

/** What the model is shown of the amendment shape, as a decision variant's schema. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["step", "change"],
  properties: {
    step: { type: "integer", minimum: 1, description: "The step number shown in the draft." },
    change: {
      enum: [...AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES],
      description: "drop: leave this step out of the result. exploratory: I did this only to look around. keep: put it back in. reorder: move it to the position given by to. rerun: do it again with the argument given by input, which replaces this step."
    },
    settings: { type: "object", description: "Settings to carry on the step, merged over any it already has." },
    to: { type: "integer", minimum: 1, description: "reorder only: the position to move the step to, counting from 1." },
    input: { type: "object", description: "rerun only: the whole argument to run the step's action with this time. It replaces the one it was given, so write every key it needs." }
  }
};

/**
 * Applies each amendment to the step it names, in place, and says which ones
 * changed nothing.
 *
 * In place because the loop appends to the same list as it goes, and a copy
 * returned here would be a second draft to keep in step with the first.
 *
 * An amendment that names no step, or that says what is already true and
 * carries no settings, is refused rather than counted: the loop's no-progress
 * guard is what stops a model editing the same step forever, and it can only
 * do that if an edit that changed nothing is reported as one.
 */
export function applyAutomationStudioFlowDraftAmendments(
  steps: AutomationStudioFlowDraftStep[],
  amendments: readonly AutomationStudioFlowDraftAmendment[]
): { applied: number; refused: AutomationStudioFlowDraftAmendmentRefusal[] } {
  let applied = 0;
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  for (const amendment of amendments) {
    const step = steps.find((candidate) => candidate.position === amendment.step);
    if (!step) {
      refused.push({ step: amendment.step, reason: "no_such_step" });
      continue;
    }
    // Running something again is the loop's to carry out, not the draft's.
    if (amendment.change === "rerun") {
      refused.push({ step: amendment.step, reason: "run_by_the_loop" });
      continue;
    }
    if (amendment.change === "reorder") {
      if (moveStep(steps, step, amendment.to, amendment.settings)) applied += 1;
      else refused.push({ step: amendment.step, reason: placeExists(steps, amendment.to) ? "already_so" : "no_such_position" });
      continue;
    }
    const disposition = amendment.change === "keep" ? "kept" : amendment.change === "drop" ? "dropped" : "exploratory";
    const changesDisposition = step.disposition !== disposition;
    const changesSettings = amendment.settings !== undefined;
    if (!changesDisposition && !changesSettings) {
      refused.push({ step: amendment.step, reason: "already_so" });
      continue;
    }
    step.disposition = disposition;
    if (amendment.settings) step.settings = { ...(step.settings ?? {}), ...amendment.settings };
    applied += 1;
  }
  return { applied, refused };
}

/**
 * Move one step to another position and renumber the draft, or answer `false`
 * when there is no such position or it is already there.
 *
 * Renumbering is what keeps a position a name the model can use: the draft it
 * is shown next is numbered 1..n in the order the steps now stand, so the
 * number it reads is the number an amendment takes. Settings ride along, since
 * "put this last and give it a longer wait" is one thought.
 */
function moveStep(
  steps: AutomationStudioFlowDraftStep[],
  step: AutomationStudioFlowDraftStep,
  to: number | undefined,
  settings: JsonObject | undefined
): boolean {
  if (!placeExists(steps, to)) return false;
  if (to === step.position && settings === undefined) return false;
  const from = steps.indexOf(step);
  if (from < 0) return false;
  steps.splice(from, 1);
  steps.splice(to! - 1, 0, step);
  steps.forEach((entry, index) => { entry.position = index + 1; });
  if (settings) step.settings = { ...(step.settings ?? {}), ...settings };
  return true;
}

/** Whether the draft has the position an amendment asked to move a step to. */
function placeExists(steps: readonly AutomationStudioFlowDraftStep[], to: number | undefined): boolean {
  return to !== undefined && Number.isInteger(to) && to >= 1 && to <= steps.length;
}
