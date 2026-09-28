// Which of the five consequence classes a person still has to be asked about.
//
// **The person's instruction is the authority, and there is no second list.**
// FluxIQ does what the instruction asks for. It holds no opinion of its own
// about which acts are too bold, and it does not refuse an act because the act
// sounds serious. What is left to ask about is the narrow case where doing the
// thing cannot be taken back and the instruction did not ask for it.
//
// **Only what has a genuinely high-risk real-world consequence.** Two classes
// need authority beyond an unrelated instruction:
//
// - `move_money` -- completing a purchase or a checkout, a charge, a refund, a
//   transfer. The money has gone.
// - `delete` -- removing something so that it is gone.
//
// The other three are not asked about. `create_new` adds something that was not
// there, and `modify_existing` is the broadest of the five, so gating either
// asks a person about ordinary work. Note this is the class, not the act:
// placing an order is `move_money` and is asked about; putting the same item in
// a basket is `create_new` and is not.
//
// **`send_or_publish` came off this list on 2026-09-28**, on the product owner's
// rule that the person's instruction is itself the grant. A run that sends is a
// run whose instruction asked for the sending, so a standing gate on every send
// asks permission for the request itself -- the exact shape the rule forbids.
// The case it was there for, a send *nobody asked for*, is not a permission
// question at all: it is a disagreement between what a step declared and what
// the instruction called for, and `cross-check.ts` is what compares those two. A
// standing gate cannot tell the two apart, so it stopped every send -- including
// the ones the person asked for in so many words -- whenever the derivation that
// reads the instruction missed, which it does whenever the provider call fails,
// the model does not name the class, or the quote is not the person's own words.
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
 *
 * **Only a very high risk is asked about, as of 2026-09-28.** The user's rule is
 * that their instruction is itself the grant, and that a question reaches them
 * for genuinely risky real-world consequences and nothing else -- deleting
 * something, and completing a purchase, payment or transfer. Those two, and
 * nothing else. `modify_existing` came off this list on 2026-09-26 and
 * `send_or_publish` on 2026-09-28, on the same instruction: each was gating the
 * automation doing the job it was asked to do. An irreversible overwrite or a
 * send the instruction did not ask for is caught where it belongs, by the
 * consequence cross-check comparing what a step declared against what the
 * instruction called for, rather than by a standing gate on every edit or send.
 *
 * Adding a class here re-gates ordinary work, so `tests/destructive.test.ts`
 * names this table in full and fails the build on any change to it.
 */
const DESTROYS: Readonly<Record<AutomationStudioActionConsequence, boolean>> = Object.freeze({
  move_money: true,
  delete: true,
  modify_existing: false,
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
 * deduplicated, in Core's order, and empty when the action only creates or edits
 * something.
 */
export function automationStudioDestructiveConsequences(
  values: readonly AutomationStudioActionConsequence[]
): AutomationStudioActionConsequence[] {
  return automationStudioConsequencesInOrder(values.filter(isAutomationStudioDestructiveActionConsequence));
}
