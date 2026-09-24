// Which of the five consequence classes a person still has to be asked about.
//
// **The person's instruction is the authority, and there is no second list.**
// FluxIQ does what the instruction asks for. It holds no opinion of its own
// about which acts are too bold, and it does not refuse an act because the act
// sounds serious. What is left to ask about is the narrow case where doing the
// thing cannot be taken back and the instruction did not ask for it.
//
// **Only what is genuinely destructive.** Three classes are destructive in that
// sense, and they are named by what they take away:
//
// - `move_money` -- completing a purchase or a checkout, a charge, a refund, a
//   transfer. The money has gone.
// - `modify_existing` -- editing or overwriting something that already exists.
//   What was there is not there any more.
// - `delete` -- removing something so that it is gone.
//
// The other two are not. `create_new` adds something that was not there, and
// `send_or_publish` sends what the instruction said to send: neither destroys
// anything, and a person who asked for a thing to be made or sent has said all
// that needs saying. Note this is the class, not the act: placing an order is
// `move_money` and is asked about; putting the same item in a basket is
// `create_new` and is not.
//
// **Why this exists as its own file.** Until 2026-09-24 every one of the five
// gated, so a build told to add an item to a cart, save a listing for later or
// confirm a request ended at `flow_bootstrap.permission_required` with nobody
// there to answer -- for days, on the realistic sites the product is measured
// on, on work the instruction named in so many words. The derivation that reads
// the instruction (`instructed.ts`) was meant to cover exactly that, and it
// cannot be relied on to: it needs a provider call, the model has to name the
// class, and Core keeps a claim only where its quote is the person's own words,
// so an instruction that plainly asks still stops the run whenever any one of
// those three misses. Narrowing what is gated at all removes the whole failure
// mode for the classes that never needed a person, and leaves the derivation
// doing what it is good at: authorising a destructive act the person asked for.
//
// **What did not change.** The gate, the request and the conversation ask are
// untouched; a destructive class the instruction does not ask for still stops
// the run and still reaches a person with everything they need to answer. And
// every declaration is still recorded whatever its class, so the cross-check
// against the instruction still sees all five -- narrowing what is *gated*
// narrows nothing about what is *known*.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "./consequences.ts";

/**
 * Whether a class destroys or spends something, class by class.
 *
 * A complete record rather than a list, so a class added to
 * `AUTOMATION_STUDIO_ACTION_CONSEQUENCES` is a compile error here until
 * somebody decides whether a person has to be asked about it. Defaulting a new
 * class either way silently would be the mistake this shape exists to prevent.
 */
const DESTROYS: Readonly<Record<AutomationStudioActionConsequence, boolean>> = Object.freeze({
  move_money: true,
  delete: true,
  modify_existing: true,
  send_or_publish: false,
  create_new: false
});

/** The classes a person is still asked about, in Core's order. */
export const AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES: readonly AutomationStudioActionConsequence[] =
  Object.freeze(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => DESTROYS[consequence]));

/** Whether this class is one an instruction or a grant has to authorise. */
export function isAutomationStudioDestructiveActionConsequence(value: unknown): value is AutomationStudioActionConsequence {
  return typeof value === "string" && value in DESTROYS && DESTROYS[value as AutomationStudioActionConsequence];
}

/**
 * Of what an action declared, the part anyone could still be asked about:
 * deduplicated, in Core's order, and empty when the action only makes or sends
 * something.
 */
export function automationStudioDestructiveConsequences(
  values: readonly AutomationStudioActionConsequence[]
): AutomationStudioActionConsequence[] {
  return automationStudioConsequencesInOrder(values.filter(isAutomationStudioDestructiveActionConsequence));
}
