// A step that didn't work and then worked when it was tried again, as one
// card that says so.
//
// A press inside a repeat that the site refused, then made again on the same
// row, read as a red "Click · Confirm / Didn't work: ..." card and, below the
// retry's note, a green "Click · Confirm / Done" card: nothing said they were
// the same press on the same row (lane D, run-mv0fuual-f9e6f089, finding 2).
//
// So a card that did its work takes in the failed card just before it in its
// unit of work when both say the same act on the same thing, and both are
// steps a run or a test of the Flow ran (Core's recovery tries those again by
// itself; a build's own call made again is the model's choice): the same kind,
// name, target (a row included) and test mark, and a target at all, since
// two unnamed presses may be any two controls. The failed card is taken out,
// and the one that worked says on which try, and why the earlier ones did not
// ("Done on the 2nd try. The first try didn't work: the site asked FluxIQ to
// slow down"; `retried`, `card-words.ts`). Only the run's own notes may come
// between them: Core's recovery says "Trying the step again" as a repair, and
// a note says what it did meanwhile. Another card, or a decision of the model's,
// ends it: a decision's words may say why the first did not work, and it would
// lose the card it speaks of. A recovery Core reported meanwhile (a step done
// before trying again, `recovery-message.ts`) is passed over: it is no try of
// the step, and it neither ends the retry nor is taken in. A refusal is no
// try, and a result check or a test run is no step, so neither is taken in. A
// message left with no card and no words of its own is gone. No DOM.

import type { ActionCard } from "./action-card.ts";
import type { StepMessage } from "./messages.ts";

/** Messages a retry may say between the try that failed and the one that worked. */
const BETWEEN: ReadonlySet<StepMessage["kind"]> = new Set<StepMessage["kind"]>(["repair", "note"]);
/** Messages that are only their card: emptied, nothing of them is left. */
const ONLY_CARDS: ReadonlySet<StepMessage["kind"]> = new Set<StepMessage["kind"]>(["step", "action"]);
/** Kinds whose card is no step on the page or the Flow that could be tried again. */
const NOT_A_TRY: ReadonlySet<ActionCard["kind"]> = new Set<ActionCard["kind"]>(["test", "result_check", "draft", "person_check", "permission", "question"]);

/** The failed card a retry would take in: where it is kept. */
type Failed = { message: StepMessage; card: number };

/** `messages` (oldest first), with each failed card that worked when tried again folded into the card that worked. */
export function foldRetriedCards(messages: readonly StepMessage[]): StepMessage[] {
  const kept: StepMessage[] = [];
  const emptied = new Set<StepMessage>();
  const failed = new Map<string, Failed>();
  for (const message of messages) {
    // A recovery done around the step is passed over, its card and all.
    if (message.kind === "recovery") {
      kept.push({ ...message, actions: [...message.actions] });
      continue;
    }
    // The model's words end it, and so does any other message with nothing to try again.
    if (message.kind === "decision" || (message.actions.length === 0 && !BETWEEN.has(message.kind))) failed.delete(message.activityId);
    const copy: StepMessage = { ...message, actions: [] };
    for (const card of message.actions) {
      const last = failed.get(message.activityId);
      const before = last === undefined ? undefined : last.message.actions[last.card];
      let shown = card;
      if (last !== undefined && before !== undefined && runs(message, card) && worked(card) && sameAct(before, card)) {
        last.message.actions.splice(last.card, 1);
        if (last.message.actions.length === 0 && last.message !== copy) emptied.add(last.message);
        const tries = (before.retried?.tries ?? before.times ?? 1) + 1;
        shown = { ...card, retried: { tries, why: before.retried?.why ?? before.why } };
      }
      copy.actions.push(shown);
      if (runs(message, shown) && retryable(shown)) failed.set(message.activityId, { message: copy, card: copy.actions.length - 1 });
      else failed.delete(message.activityId);
    }
    kept.push(copy);
  }
  return kept.filter((message) => !(emptied.has(message) && message.actions.length === 0 && (ONLY_CARDS.has(message.kind) || message.text === undefined)));
}

/**
 * A step the Flow ran, in a run or a test of it, which Core's recovery tries
 * again by itself. A build's own calls are the model's, and the same call
 * made again after a failure is its choice, said by its own decisions.
 */
function runs(message: StepMessage, card: ActionCard): boolean {
  return message.kind === "step" || card.testing === true;
}

/** A step on the page that did not work, named, and no refusal: one a retry may follow. */
function retryable(card: ActionCard): boolean {
  return card.outcome === "failed" && card.refused === undefined && !card.unconfirmed && !card.check && card.target !== null && !NOT_A_TRY.has(card.kind);
}

/** A step that did its work, and no edit Core took only in part. */
function worked(card: ActionCard): boolean {
  // A step already done was not tried again: it was skipped (`already-done.ts`).
  return card.outcome === "done" && card.already === undefined && card.refused === undefined && !card.check && card.target !== null && !NOT_A_TRY.has(card.kind);
}

/** The same act on the same thing: what a person reads at the head of both cards is the same. */
function sameAct(failed: ActionCard, done: ActionCard): boolean {
  return failed.kind === done.kind && failed.name === done.name && failed.target === done.target && (failed.testing === true) === (done.testing === true);
}
