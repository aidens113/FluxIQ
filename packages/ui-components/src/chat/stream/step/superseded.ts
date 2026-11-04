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
// Two things calm a failed step, both of the same unit of work: a result
// check that passed after a test step that failed outright, and the same act
// on the same thing done later (the work tried again and got past it, which
// `retried.ts` folds only when the two sit side by side). A routine retry is
// no alarm: the card keeps its words in the neutral look. A failure with
// nothing after it, an unconfirmed result and a refused decision stay as they
// are. No DOM.

import type { ActionCard } from "./action-card.ts";
import type { StepMessage } from "./messages.ts";

/** A failed test step the work then got past. */
function failedTestStep(card: ActionCard): boolean {
  return card.testing === true && card.outcome === "failed" && !card.check && card.unconfirmed !== true && card.refused === undefined;
}

/** A result check that passed. */
function passed(card: ActionCard): boolean {
  return card.check && card.outcome === "done";
}

/** A step on the page that failed outright, named and not refused: one a later try of the same act may follow. */
function retryable(card: ActionCard): boolean {
  return card.outcome === "failed" && !card.check && card.unconfirmed !== true && card.refused === undefined && card.target !== null && card.again === undefined;
}

/** A step that did its work, named: what a failed try of the same act is got past by. */
function worked(card: ActionCard): boolean {
  return card.outcome === "done" && !card.check && card.refused === undefined && card.already === undefined && card.target !== null && card.again === undefined;
}

/** The act and the thing it acted on, for telling a try from the one before it. */
function actOf(card: ActionCard): string {
  return JSON.stringify([card.kind, card.name ?? null, card.target, card.testing === true]);
}

/** A card's place in the stream: its message, then its position in the message. */
type Place = { message: number; card: number };
const after = (later: Place, earlier: Place): boolean => later.message > earlier.message || (later.message === earlier.message && later.card > earlier.card);

/**
 * `messages` (oldest first), with each failed step that the work got past marked `superseded`: a failed test
 * step that a later passed check of its unit got past, and a failed step a later try of the same act did.
 */
export function calmSupersededFailures(messages: readonly StepMessage[]): StepMessage[] {
  const passedAt = new Map<string, Place>();
  const workedAt = new Map<string, Place>();
  messages.forEach((message, index) => {
    message.actions.forEach((card, at) => {
      if (passed(card)) passedAt.set(message.activityId, { message: index, card: at });
      if (worked(card)) workedAt.set(`${message.activityId}|${actOf(card)}`, { message: index, card: at });
    });
  });
  return messages.map((message, index) => {
    if (!message.actions.some((card) => retryable(card) || failedTestStep(card))) return message;
    let changed = false;
    const actions = message.actions.map((card, at) => {
      const here = { message: index, card: at };
      const check = passedAt.get(message.activityId);
      const retry = workedAt.get(`${message.activityId}|${actOf(card)}`);
      // A check that passed calms only a failed test step; a later try of the same act calms any named step.
      const got = (failedTestStep(card) && check !== undefined && after(check, here)) || (retryable(card) && retry !== undefined && after(retry, here));
      if (!got) return card;
      changed = true;
      return { ...card, superseded: true as const };
    });
    return changed ? { ...message, actions } : message;
  });
}
