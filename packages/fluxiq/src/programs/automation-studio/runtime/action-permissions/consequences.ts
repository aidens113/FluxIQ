// What an action can do that outlasts it, as a closed set, and the set of those
// a person has allowed one run to do.
//
// **Classes of consequence, never of control.** Nothing here says what a
// control looks like, what it is called or where it sits. A domain looks at the
// thing it is about to do and says which of these it would cause; Core decides,
// from the set a person granted, whether the run may. So the web domain can
// read a "Refund" button as `move_money` and a mail domain can read "Send" as
// `send_or_publish`, and neither teaches Core a word of its medium.
//
// **Why these five.** The first proposal was `purchase`, `delete`,
// `modify_existing` and `send_external`. Two things were wrong with it, and
// both were found on the jobs this exists to unblock:
//
// - `purchase` is one way of moving money, not the consequence. A refund, a
//   transfer and a payout are not purchases, so the domain would have had to
//   file a refund under `modify_existing` -- asking a person "may it change an
//   existing order?" when what they need to know is that money will move.
//   `move_money` names the consequence instead of one verb that causes it.
// - Nothing covered **making something new**. "Raise a critical escalation",
//   "schedule a post", "create a ticket" all leave a lasting record other people
//   see, and under the first proposal each was either ungated -- a Flow could
//   fill someone's system with records nobody allowed -- or mislabelled as
//   editing. `create_new` is its own class because the stakes differ: a person
//   who is content to let a run add posts need not be content to let it edit
//   the ones already there.
//
// `send_external` became `send_or_publish` because "external" was the one word
// in it a person would have to interpret: the consequence is that somebody else
// receives or sees it, whoever and wherever they are.
//
// **What is not a consequence.** Moving about, opening, expanding, filtering,
// choosing a row, typing into a field that is not yet submitted -- anything a
// person could undo by looking away -- needs no permission, and a domain asks
// for none. A permission a person has to grant for looking would be one they
// learn to grant without reading.
//
// **One action may have several.** A refund moves money and changes an
// existing order. The domain declares every class that applies, and the run
// needs all of them, so a person is never asked for the lesser consequence
// while the greater one rides along unnamed.

/**
 * Every lasting consequence Core can be asked to permit, most serious first.
 * The order is the order a request lists them in.
 */
export const AUTOMATION_STUDIO_ACTION_CONSEQUENCES = Object.freeze([
  /** Spends, charges, refunds or transfers money, or commits to a payment. */
  "move_money",
  /** Deletes or removes something so that it is gone. */
  "delete",
  /** Sends or publishes something that other people or systems receive or see. */
  "send_or_publish",
  /** Changes something that already exists. */
  "modify_existing",
  /** Creates something new that stays after the run. */
  "create_new"
] as const);

export type AutomationStudioActionConsequence = (typeof AUTOMATION_STUDIO_ACTION_CONSEQUENCES)[number];

/**
 * Each consequence as the person being asked would say it. Exhaustive, so a
 * class added to the list above is a compile error here until it can be
 * explained to someone.
 */
export const AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES: Readonly<Record<AutomationStudioActionConsequence, string>> = Object.freeze({
  move_money: "spend, refund or move money",
  delete: "delete or remove something",
  send_or_publish: "send or publish something that others will receive or see",
  modify_existing: "change something that already exists",
  create_new: "create something new that stays"
});

export function isAutomationStudioActionConsequence(value: unknown): value is AutomationStudioActionConsequence {
  return typeof value === "string" && (AUTOMATION_STUDIO_ACTION_CONSEQUENCES as readonly string[]).includes(value);
}

/**
 * The consequences a run is permitted, read from a grant request or a grant.
 *
 * Fail closed in both directions. **Absent is the empty set**: a grant that
 * says nothing permits nothing, and there is no default that a forgotten field
 * could fall back to. **Anything unrecognised refuses the whole set**, rather
 * than being dropped: a caller that asked for `purchase` meant something, and
 * issuing a grant that quietly holds less than was asked for would leave the
 * run to discover the gap by stopping. The answer is deduplicated and in
 * Core's order, so two grants holding the same set compare equal.
 */
export function parseAutomationStudioPermittedConsequences(value: unknown): AutomationStudioActionConsequence[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length * 2) {
    throw new Error("Permitted consequences must be a list of consequence classes.");
  }
  const unrecognised = value.filter((item) => !isAutomationStudioActionConsequence(item));
  if (unrecognised.length) throw new Error("Permitted consequences name a class Core does not recognise.");
  return automationStudioConsequencesInOrder(value as AutomationStudioActionConsequence[]);
}

/** Deduplicated, in the order `AUTOMATION_STUDIO_ACTION_CONSEQUENCES` lists them. */
export function automationStudioConsequencesInOrder(values: readonly AutomationStudioActionConsequence[]): AutomationStudioActionConsequence[] {
  const present = new Set(values);
  return AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => present.has(consequence));
}
