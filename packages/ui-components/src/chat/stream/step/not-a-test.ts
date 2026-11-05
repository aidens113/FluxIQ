import type { ActionCard } from "./action-card.ts";

/**
 * The card of a step in an answer-first attempt. An attempt does the task and tests no Flow, so a
 * Flow it runs forward ("Running the rest of the Flow") is the work and not a test: its steps read
 * "Click · Accept", never "Testing: Click · Accept" (t869, `run-mw2fu74l-235889e0`). Core marks a
 * step it ran under the build's own unit `testing`, which is true of a candidate build's test and
 * not of this, so the mark is taken off here.
 */
export function notATest(card: ActionCard): ActionCard {
  if (card.testing !== true) return card;
  const { testing: _testing, ...rest } = card;
  return rest;
}
