// Which of the five consequence classes a person has to be asked about.
//
// **The rule, 2026-09-30.** `docs/working/mvp-today-plan.md:150`, the user's
// binding rule: "Only consequences independently requiring human authority are
// gated: moving money, deleting, and sending or publishing." Independently: the
// act itself needs the person's authority, so it is asked about every time,
// **even when the instruction asked for it**. The instruction is still read and
// recorded (`instructed.ts`, `cross-check.ts`); it is not a permission for these
// three. Only a person's permission is -- `permittedConsequences` on the run, or
// the answer to the question the gate raises.
//
// - `move_money` -- completing a purchase or a checkout, a charge, a refund, a
//   transfer. The money has gone.
// - `delete` -- removing something so that it is gone.
// - `send_or_publish` -- a message, a post, a submitted application or request:
//   once someone else has it, it cannot be taken back.
//
// The other two are never asked about. `create_new` adds something that was not
// there, and `modify_existing` is the broadest of the five, so gating either
// asks a person about ordinary work. Note this is the class, not the act:
// placing an order is `move_money` and is asked about; putting the same item in
// a basket is `create_new` and is not.
//
// **History.** Until 2026-09-24 all five gated, and a build told to add to a
// cart ended at `flow_bootstrap.permission_required` with nobody to answer.
// `modify_existing` came off on 2026-09-26. `send_or_publish` came off on
// 2026-09-28, and from then until 2026-09-30 an instructed `move_money` or
// `delete` also went ahead unasked -- so whether bigbox's Place order asked
// depended on whether the model's reading of the instruction named the class
// (lane t195, runs `run-munoa86g-150fb0d9` and `run-munovwp3-d898de74`), and a
// message nobody asked for was sent without asking. The supervisor restored the
// user's rule on 2026-09-30: all three gated, the instruction waives none.
//
// **Why this exists as its own file.** Which classes stop a run for a person is
// one decision, read by the gate, the panel's capability parser and the
// conversation's invocation, so it lives in one table.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "./consequences.ts";

/**
 * Whether a class needs a person's authority, class by class.
 *
 * A complete record rather than a list, so a class added to
 * `AUTOMATION_STUDIO_ACTION_CONSEQUENCES` is a compile error here until
 * somebody decides whether a person has to be asked about it.
 *
 * `tests/destructive.test.ts` names this table in full and fails the build on
 * any change to it.
 */
const DESTROYS: Readonly<Record<AutomationStudioActionConsequence, boolean>> = Object.freeze({
  move_money: true,
  delete: true,
  modify_existing: false,
  send_or_publish: true,
  create_new: false
});

/** The classes a person is still asked about, in Core's order. */
export const AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES: readonly AutomationStudioActionConsequence[] =
  Object.freeze(AUTOMATION_STUDIO_ACTION_CONSEQUENCES.filter((consequence) => DESTROYS[consequence]));

/** Whether this class is one an instruction or a person's permission has to authorise. */
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
