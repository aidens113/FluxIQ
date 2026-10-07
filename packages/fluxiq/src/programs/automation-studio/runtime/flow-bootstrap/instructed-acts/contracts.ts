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
//
// Core does read one thing more of a step, still without learning its shape:
// its string values, for the person's own words. A choice is held to its value
// there (`./choice-evidence.ts`), and an act to its object
// (`./object-binding.ts`): a step whose record names another act's object, and
// not this one's, does not do this one.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioInstructedChoiceAfterAct } from "./choice-order.ts";

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
   * Parser-owned provenance for one of several counted objects of one verb.
   * The original clause stays contiguous, unlike the display quote assembled
   * from its verb, this object and the shared destination. The object's own
   * source words distinguish a narrowly quoted sibling from this act.
   */
  source?: { clause: string; object: string };
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
  /**
   * Present when the act's verb names a class a person is asked about before
   * it happens: withdraw, delete or remove is `delete`; order, buy, purchase
   * or pay is `move_money`; send, post, publish, submit or apply is
   * `send_or_publish` (`./act-consequence.ts`). The steps that do the act must
   * declare it (`act_consequence_undeclared`, `./check.ts`).
   */
  consequence?: AutomationStudioActionConsequence;
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
  /**
   * The step named changed nothing: it only reads the page, or it failed. A
   * refusal says which steps only read (`./check.ts`), and the checklist shows
   * an act whose every named step only reads as `step_only_reads`.
   */
  | "step_changed_nothing"
  /** The step named is already claimed for another act. */
  | "step_claimed_twice"
  /**
   * The step named only went to a page, and the act is not one of opening:
   * to where the Flow starts (`run-munoeac4-33c17306`, `./check.ts`), or, for
   * an act of adding, saving, claiming, submitting or moving, a press whose
   * words do not name the act and after which the next recorded step found
   * the page somewhere else -- a typed search that led to the results, a
   * product link (`run-musp4h2f-72e8ed99`, `./act-evidence.ts`). Arriving at a
   * page adds, collects, sets or sends nothing.
   */
  | "step_only_arrives"
  /**
   * The step named made one of the act's own choices, and its words do not
   * name the act: the press of "Spain" for "put the hub in my cart", shipped
   * from Spain (`run-mux74k5q-1c3c2127`, C1b), or the quantity typed. `chooses`
   * names that choice, which the step still makes (`./act-evidence.ts`).
   */
  | "step_only_chooses"
  /**
   * The host says the step named answered something in front of the page --
   * a popup's "Not now", a consent wall -- and its words do not name the act:
   * it cleared the way and did not do the act (`run-muqiho5c-e830ce01`,
   * `./act-evidence.ts`).
   */
  | "step_only_clears_the_way"
  /**
   * The step named only opened the page where the act's own choices are then
   * made: its control does not name the act, and a later step named for one of
   * those choices acted at a different place than it did. It prepared the act;
   * the press after the choices does it (`run-mux6pndp-16feb842`, `./standing.ts`).
   */
  | "step_only_opens_its_choices"
  /**
   * The step named says what it changed on its page, and nothing of that shows
   * the act, while another step that could do the act shows it by its change
   * -- a cart count that rose, an "Added to cart" that appeared -- and the
   * step's words do not name the act. Run `run-muqiho5c-e830ce01` named its add
   * on "Not now", a layer its own Add to cart opened (so not an interruption),
   * and only that Add to cart made the cart count rise. `instead` names the
   * step that shows it (`./act-evidence.ts`).
   */
  | "another_step_shows_it"
  /**
   * The step named ran and its command worked, but it changed nothing anyone
   * could see: the host's state digest after it is the one before it, and it
   * states no changed line and no flipped choice. A digest leaves out where the
   * page is scrolled and laid out, so a press that only scrolled a list is one
   * of these. Run `run-muxkyfxz-446c3a4e` (lane B round 4) put a1, "Switch my
   * pickup store to Millbrook Crossing Supercenter", on a press of the store's
   * name in the chooser -- not its "Set as my store" -- after which the page's
   * words were byte-identical and the store was still Carden Falls
   * (`./act-evidence.ts`). Any kind of act.
   */
  | "step_changed_nothing_seen"
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
   * The act is asked for every member of a set and its step repeats, but the
   * step right after the repeat changes something lasting, runs once after
   * the loop, and is claimed for no act: the confirmation the repeated press
   * opened. Withdraw audit B2, run 3 (`run-munnyvbr-11c28a0f`, `./span.ts`).
   */
  | "span_stops_short"
  /**
   * The act's verb names a class a person is asked about (`consequence`), and
   * no step that does it declares that class, so nobody is asked and the act
   * goes ahead unpermitted. Withdraw audit R2 (`./check.ts`).
   */
  | "act_consequence_undeclared"
  /**
   * A choice was claimed by the step claimed for its own act -- the press that
   * adds -- and nothing that step was given sets it. Pressing add chooses no
   * size and sets no quantity (`run-munvvc3z-3eadc185`, `./check.ts`).
   */
  | "choice_is_the_act_step"
  /**
   * What the step's own record shows it acted on is another act's object, and
   * not this one's: the towels' Add to cart named for the napkins (live run 40,
   * `run-muq6lqnw-fdfa7aac`, `./object-binding.ts`). `actsOn` names that act.
   */
  | "step_acts_on_another_object"
  /**
   * A quantity was named on a step the Flow repeats over a list, which runs it
   * once per list item, not that many times on this item (run 40,
   * `./quantity-fault.ts`).
   */
  | "quantity_is_a_repeat"
  /**
   * A quantity was named on a press of the act's own add, and the kept presses
   * of that add on that item are not exactly the count asked for. `presses`
   * lists them (`./quantity-fault.ts`).
   */
  | "quantity_presses_differ";

/** Why it has no step, and the step the claim named, where one did. */
type AutomationStudioInstructedMissingWhy = {
  reason: AutomationStudioInstructedActMissingReason;
  step?: string;
  /** `span_stops_short` only: the position of the step after the repeat that does part of the act. */
  after?: number;
  /** `step_acts_on_another_object` only: the id of the act whose object the step acted on. */
  actsOn?: string;
  /** `quantity_presses_differ` only: the positions of the kept presses of the add, which are not the count. */
  presses?: number[];
  /** `step_only_chooses` only: the id of the act's own choice the step made instead. */
  chooses?: string;
  /**
   * `step_only_chooses`, `step_only_clears_the_way`, `step_only_arrives`,
   * `step_only_opens_its_choices`, `another_step_shows_it` and
   * `step_changed_nothing_seen`: the position of
   * a step whose change shows the act, else one whose words name it, where
   * the draft has one (`./act-evidence.ts`).
   */
  instead?: number;
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
  | { ok: true; acts: AutomationStudioInstructedAct[]; choicesAfterAct?: AutomationStudioInstructedChoiceAfterAct[] }
  | {
    ok: false;
    acts: AutomationStudioInstructedAct[];
    /** Choices made on a step after their act's step: information, whatever else is missing (`./choice-order.ts`). */
    choicesAfterAct?: AutomationStudioInstructedChoiceAfterAct[];
    missing: AutomationStudioInstructedActMissing[];
    issue: AutomationStudioFlowBootstrapIssue;
    /** What is missing, as the model is shown it. */
    missingActs: JsonObject;
    instruction: string;
  };
