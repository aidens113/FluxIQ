// A step a test could not do, which a later passed check of the same build
// makes routine: not red.
//
// A build tests its Flow, fixes what the test found, and tests again. The
// step the first test could not do ("Testing: Next page / Didn't work: it
// didn't do the same when the test tried it again") then sat in red directly
// above the check that said "Passed" and a Flow that is ready (A 19 of the
// answer-first study, run `run-mw0l0e9y`). Red is for what the person should
// act on or know about; a failure the same work went on to get past is not
// that. It stays on its card, with its words, in the neutral settled look.
//
// Only a step a test of the Flow ran (`testing`) that failed outright is
// calmed, and only by a result check that passed later in the same unit of
// work: a failure with nothing after it, an unconfirmed result, a refused
// decision and every failure of a run stay as they are. No DOM.

import type { ActionCard } from "./action-card.ts";
import type { StepMessage } from "./messages.ts";

/** A failed test step the work then got past. */
function superseded(card: ActionCard): boolean {
  return card.testing === true && card.outcome === "failed" && !card.check && card.unconfirmed !== true && card.refused === undefined;
}

/** A result check that passed. */
function passed(card: ActionCard): boolean {
  return card.check && card.outcome === "done";
}

/** `messages` (oldest first), with each failed test step that a later passed check of its unit got past marked `superseded`. */
export function calmSupersededFailures(messages: readonly StepMessage[]): StepMessage[] {
  const passedAt = new Map<string, number>();
  messages.forEach((message, index) => {
    if (message.actions.some(passed)) passedAt.set(message.activityId, index);
  });
  return messages.map((message, index) => {
    const last = passedAt.get(message.activityId);
    if (last === undefined || !message.actions.some(superseded)) return message;
    // A failure in the same message as the pass is before it only when the pass comes after it in the cards.
    const lastCard = message.actions.reduce((found, card, at) => (passed(card) ? at : found), -1);
    return {
      ...message,
      actions: message.actions.map((card, at) => (superseded(card) && (index < last || (index === last && at < lastCard)) ? { ...card, superseded: true as const } : card))
    };
  });
}
