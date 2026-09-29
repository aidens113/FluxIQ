// What the person's instruction asks to be *done*, and whether a draft does it.
//
// **The defect this closes.** `run-mulxk0ro-36bf090d` was told to save the three
// cheapest dining tables within five miles, then list what was in saved items.
// The build searched, read the first results page, and was accepted as
// finished: nothing saved, no radius set, saved items never opened. Every
// completion check had passed, because the only question any of them asked of
// the instruction was whether it wanted records and whether some step produced
// them (`../answerability/`). The build's own consequence cross-check knew --
// `instructed: [modify_existing, create_new]`, `declared: []` -- but it is
// advisory and is computed after the loop, so the model was never told.
//
// So completion now also asks: for every lasting act the instruction asks for,
// is there a step in the draft that does it?
//
// **Core reads the acts; the model names the steps; Core checks the names.** A
// draft step is opaque to Core by design (`../../flow-draft/step.ts`), so Core
// cannot tell a press of Save from a press of Decline cookies, and it must not
// learn to: that is a domain's business. What Core can read is the person's
// own words, as `../answerability/instruction-ask.ts` already does for records,
// and what it can check is a claim: that the step the model says does an act
// exists, is kept, changed something, and is not also claimed for another act.
// It is not a permission question -- saving is the automation's own work and
// the instruction is the grant -- it is a completeness one, fed back at
// `complete` like every other correctable refusal.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";

/**
 * The kinds of lasting act the reader recognises. Closed, so a refusal names a
 * kind a model can read and a reader of the record can count.
 *
 * - `save`: save or bookmark something.
 * - `add_to`: add or put something into a cart, basket, list or collection.
 * - `claim`: collect, claim, clip, redeem or use a coupon, voucher or code.
 * - `set`: switch or set a store, location, radius or other setting, or narrow,
 *   filter or sort results.
 * - `move`: move something somewhere.
 * - `open`: open a place the instruction reads from, such as saved items.
 * - `submit`: book, buy, order, send, post, create, confirm, withdraw, place a
 *   bid, check out, or ask for a quote.
 */
export type AutomationStudioInstructedActKind = "save" | "add_to" | "claim" | "set" | "move" | "open" | "submit";

/** One lasting act the instruction asks for, in the person's own words. */
export type AutomationStudioInstructedAct = {
  /** Core's name for it within this build: `a1`, `a2` ... in the order the instruction asks. */
  id: string;
  kind: AutomationStudioInstructedActKind;
  /** The verb that asks for it, as the person wrote it, lowercased. */
  verb: string;
  /** The person's sentence that asks for it, bounded. */
  quote: string;
};

/** A model's claim that a draft step does an act. Both strings are the model's, bounded before use. */
export type AutomationStudioInstructedActClaim = { action: string; step: string };

/** Why an act has no step that does it. */
export type AutomationStudioInstructedActMissingReason =
  /** No claim names this act. */
  | "no_step_named"
  /** The step named is not in the draft. */
  | "no_such_step"
  /** The step named was dropped or marked exploratory. */
  | "step_not_kept"
  /** The step named changed nothing, or failed. */
  | "step_changed_nothing"
  /** The step named is already claimed for another act. */
  | "step_claimed_twice";

/** An act with no step that does it, as the model is shown it. */
export type AutomationStudioInstructedActMissing = AutomationStudioInstructedAct & {
  reason: AutomationStudioInstructedActMissingReason;
  /** The step the claim named, where one did. */
  step?: string;
};

/**
 * Whether every act has a step, or what the model is told instead. Like the
 * answerability check, a refusal is correctable: it is fed back and the build
 * asks again on the same budget and guards.
 */
export type AutomationStudioInstructedActsVerdict =
  | { ok: true; acts: AutomationStudioInstructedAct[] }
  | {
    ok: false;
    acts: AutomationStudioInstructedAct[];
    missing: AutomationStudioInstructedActMissing[];
    issue: AutomationStudioFlowBootstrapIssue;
    /** What is missing, as the model is shown it. */
    missingActs: JsonObject;
    instruction: string;
  };
