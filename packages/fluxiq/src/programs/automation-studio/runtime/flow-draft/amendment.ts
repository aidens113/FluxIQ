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
// costs the model a sentence rather than the whole result. Three changes, which
// are the three the model actually needs and no more:
//
//   drop         -- this step should not be in the result at all.
//   exploratory  -- I did this to look around; do not keep it.
//   keep         -- undo one of the above.
//
// `settings` rides alongside any of them, because "keep this step, but with
// this wait condition" is one thought and should not cost two calls.
//
// **One shape, two required fields.** The model is asked for the smallest thing
// that can carry the meaning: a step number and a word. Everything else about
// the step -- what it did, what it was given, what state it produced -- Core
// already holds and never asks for again.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";

/** One edit to one step of the draft. */
export type AutomationStudioFlowDraftAmendment = {
  /** The step's position in the draft, counting from 1. */
  step: number;
  change: "drop" | "exploratory" | "keep";
  /** Settings to carry on the step. Merged over whatever it already had. */
  settings?: JsonObject;
};

/** Why one amendment changed nothing. */
export type AutomationStudioFlowDraftAmendmentRefusal = {
  step: number;
  reason: "no_such_step" | "already_so";
};

/** What the model is shown of the amendment shape, as a decision variant's schema. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["step", "change"],
  properties: {
    step: { type: "integer", minimum: 1, description: "The step number shown in the draft." },
    change: { enum: ["drop", "exploratory", "keep"], description: "drop: leave this step out of the result. exploratory: I did this only to look around. keep: put it back in." },
    settings: { type: "object", description: "Settings to carry on the step, merged over any it already has." }
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
