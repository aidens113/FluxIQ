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
// the instruction is the permission -- it is a completeness one, fed back at
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
  /**
   * The person's own words for this act alone, whole: its verb up to the
   * next act's verb, or, for one of several counted objects of one verb, the
   * verb, that object and where it goes (`./instruction-acts.ts`).
   */
  quote: string;
  /**
   * Present, and true, when the act is asked for every member of a set:
   * "confirm everyone ...", "withdraw every request ...", "save all ...". One
   * step that acts once does not do it; a step the Flow repeats over a list
   * does (`./check.ts`). Absent on every other act.
   */
  plural?: true;
  /**
   * Present, and never empty, when the instruction attaches to the item this
   * act adds or buys a quantity above one or a named variant of it: "two
   * packs", "in the 12 Double Rolls size" (`./instruction-choices.ts`). Each is
   * a requirement of its own, claimed by a step of its own (`./check.ts`).
   */
  requires?: AutomationStudioInstructedChoice[];
};

/**
 * What a choice of an item fixes. Closed, like the act kinds.
 *
 * - `quantity`: how many, where the instruction asks for more than one.
 * - `variant`: which one of the item's sizes, colours, counts, packs,
 *   flavours or versions.
 */
export type AutomationStudioInstructedChoiceKind = "quantity" | "variant";

/**
 * A choice the instruction attaches to the item an act adds, as its own
 * requirement: a setting (`kind: "set"`) that the act's own press does not
 * make. Run 28 (`run-munvvc3z-3eadc185`) kept these as quote text only, and a
 * Flow that chose no size and set no quantity passed.
 */
export type AutomationStudioInstructedChoice = {
  /** The act's id and what it fixes: `a2.quantity`, `a2.size`, `a3.colour`. */
  id: string;
  kind: "set";
  /** The id of the act whose item it qualifies. */
  of: string;
  choice: AutomationStudioInstructedChoiceKind;
  /** The person's own words for the value, as written: `two`, `3`, `12 Double Rolls`. */
  value: string;
  /** The person's own words that ask for it: `two packs`, `in the 12 Double Rolls size`. */
  quote: string;
};

/** A model's claim that a draft step does an act. Both strings are the model's, bounded before use. */
export type AutomationStudioInstructedActClaim = { action: string; step: string };

/** Why an act has no step that does it. */
export type AutomationStudioInstructedActMissingReason =
  /** No claim names this act, by its id, a word of its own, its verb or its kind. */
  | "no_step_named"
  /** The step named is not in the draft. */
  | "no_such_step"
  /** The step named was dropped or marked exploratory. */
  | "step_not_kept"
  /** The step named changed nothing, or failed. */
  | "step_changed_nothing"
  /** The step named is already claimed for another act. */
  | "step_claimed_twice"
  /**
   * The step named only went to where the Flow starts, and the act is not one
   * of opening. Arriving at the start page adds, collects, sets or sends
   * nothing (`run-munoeac4-33c17306`, `./check.ts`).
   */
  | "step_only_arrives"
  /**
   * The step named is marked optional, so the Flow carries on when it fails
   * and the act may never be done (`run-munnop9n-5475d593`, `./check.ts`).
   */
  | "step_is_optional"
  /**
   * The act is asked for every member of a set, and the step named acts once:
   * it neither repeats over a list nor lies inside a span that does
   * (`run-munnop9n-5475d593`, `./check.ts`).
   */
  | "act_needs_repeat"
  /**
   * A choice was claimed by the step claimed for its own act -- the press that
   * adds -- and nothing that step was given sets it. Pressing add chooses no
   * size and sets no quantity (`run-munvvc3z-3eadc185`, `./check.ts`).
   */
  | "choice_is_the_act_step";

/** Why it has no step, and the step the claim named, where one did. */
type AutomationStudioInstructedMissingWhy = {
  reason: AutomationStudioInstructedActMissingReason;
  step?: string;
};

/**
 * An act, or a choice of an act's item, with no step that does it, as the
 * model is shown it. The two share `id`, `kind`, `quote` and `reason`.
 */
export type AutomationStudioInstructedActMissing =
  | (AutomationStudioInstructedAct & AutomationStudioInstructedMissingWhy)
  | (AutomationStudioInstructedChoice & AutomationStudioInstructedMissingWhy);

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
