// What Run again does with the lasting acts of an answer. Run again starts with an empty record, so it
// does the task again; the same words typed again do not (they carry what was done). The act record
// cannot tell a count (items in a cart) from a state (a saved item) by its class, so the line says both,
// each only as far as it holds: a count may go up again, a state already as asked is checked and not
// pressed. It is said only where an act happened, or may have.

import type { ChatAttemptAct } from "../../ports/index.ts";

/** The line said above Run again. */
export const RUN_AGAIN_DOES_IT_AGAIN = "Run again does the task again. Something already in the state you asked for is checked, not done again, but a count on the site, such as items in a cart, can go up again.";

/** Whether `acts` hold one that happened, or may have. */
export function hasRepeatableAct(acts: readonly ChatAttemptAct[]): boolean {
  return acts.some((act) => act.state === "landed" || act.state === "may_have_landed");
}
