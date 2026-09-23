// What each action said about itself, kept so the run can publish it.
//
// The gate's answer to a declaration used to be the whole of what survived it:
// `{ permitted: true }` and nothing else, so the only trace a permitted action
// left was that it was not refused. Measured live on 2026-09-22
// (`fa-flow-permission-gate-landing.md`), that made the central question of the
// whole seam unanswerable -- four builds authored Flows containing presses and
// nobody could say what any press had declared, only that none of them had been
// refused. A declaration nobody can read is a self-report nobody can audit.
//
// So the gate keeps one record per action it was asked about, in the order it
// was asked, and a build carries them onto the proposal. The record is the
// declaration as Core read it, plus Core's answer: nothing is inferred, nothing
// is summarised, and the control's name obeys the same evidence rule the
// request does -- a name the model was never shown is withheld here too,
// because this record travels to the same places.

import { automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "./consequences.ts";
import type { AutomationStudioActionEffect } from "./declaration.ts";
import type { AutomationStudioActionPermissionActionKind } from "./request.ts";

/** How many declarations one gate keeps. Past it the run acts as before and stops recording. */
export const AUTOMATION_STUDIO_ACTION_DECLARATIONS_MAX = 500;

/** One action, as the domain declared it and as Core answered it. */
export type AutomationStudioActionDeclarationRecord = {
  action: {
    kind: AutomationStudioActionPermissionActionKind;
    /** The tool the call named, or the node definition the step runs. */
    id: string;
    /** The call id, or the step's ref: what joins this record to the trace. */
    ref: string;
    verb: string;
    /** Whether taking it changes anything, as the domain stated it. */
    effect: AutomationStudioActionEffect;
  };
  /** The control as a person would name it, withheld when the model was never shown that name. */
  control: { name: string | null; kind: string | null };
  /** What the action said it would lastingly do, in Core's order. Empty is an answer. */
  consequences: AutomationStudioActionConsequence[];
  permitted: boolean;
  /** Present only on a refusal: what the run did not hold. */
  missing?: AutomationStudioActionConsequence[];
  /** Present only on a refusal that raised or reported a request. */
  requestId?: string;
  /**
   * Classes an *observing* action named, which Core did not treat as lasting.
   *
   * Kept rather than dropped, and this is the whole reason a read still goes to
   * the gate. The classes here are a model saying that reading a page creates
   * something, which is worth being able to see and count -- it is what a
   * build's guidance is measured by -- and it is also how a reader tells
   * "declared nothing" apart from "declared something that could not apply".
   */
  disregarded?: AutomationStudioActionConsequence[];
};

/** Every class any of these actions declared, deduplicated and in Core's order. */
export function automationStudioDeclaredConsequences(
  records: readonly AutomationStudioActionDeclarationRecord[]
): AutomationStudioActionConsequence[] {
  return automationStudioConsequencesInOrder(records.flatMap((record) => record.consequences));
}

/**
 * The actions that acted and said they would cause nothing lasting.
 *
 * An observing action is not among them however it declared: it did not act,
 * so "it acted and said it would cause nothing" is not true of it, and counting
 * reads here would make a build that looked at a page look like a build that
 * pressed things and swore each press was harmless.
 */
export function automationStudioDeclaredNothingLasting(
  records: readonly AutomationStudioActionDeclarationRecord[]
): AutomationStudioActionDeclarationRecord[] {
  return records.filter((record) => record.action.effect !== "observe" && record.consequences.length === 0);
}
