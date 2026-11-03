// Steps done again, as one line in the chat that opens to show them. No DOM.
//
// Before a step is tried again, the work does the steps before it again first
// (Core's "Doing an earlier step again first", "Checking an earlier step is
// still done"), and a test of the Flow runs it from its start. Each pass was a
// full card per step, all of them already in the chat: before every retry the
// repair printed 4-6 success cards again -- Accept all, 7-in-1, Spain, Get
// coupons, +, Space Grey -- and the stream filled with repeated successes (D7
// of the t342 round 2 UI review, run-muylu4pp-f9cb2121, screenshots 09-13).
//
// So, within one message, two or more cards in a row that each did their work
// on something a card of the same unit of work already did -- the same kind,
// the same named target, the same test mark -- are one card that holds them
// (`again`): it keeps the first one's key, and so its place, and reads "Did 3
// earlier steps again: Accept all, 7-in-1 and Spain" (`doneAgainWords`); the
// view opens it to show each card as it was. A step done again alone, one
// still under way, one that did not work, one Core refused, and one with no
// name a person could tell apart is a card of its own, as before.

import type { ActionCard } from "./action-card.ts";
import type { StepMessage } from "./messages.ts";

/** The fewest steps done again in a row that become one line: one alone reads as itself. */
const MIN_RUN = 2;
/** The most steps the line names before it says how many more. */
const MAX_NAMED = 3;

/** `messages` (oldest first), with each run of steps done again folded into one card that holds them. */
export function foldDoneAgain(messages: readonly StepMessage[]): StepMessage[] {
  const shown = new Map<string, Set<string>>();
  return messages.map((message) => {
    let seen = shown.get(message.activityId);
    if (seen === undefined) shown.set(message.activityId, seen = new Set());
    const actions: ActionCard[] = [];
    let run: ActionCard[] = [];
    const flush = (): void => {
      if (run.length >= MIN_RUN) actions.push({ ...run[0]!, again: run });
      else actions.push(...run);
      run = [];
    };
    for (const card of message.actions) {
      const identity = identityOf(card);
      if (identity !== undefined && seen.has(identity)) {
        run.push(card);
        continue;
      }
      flush();
      actions.push(card);
      if (identity !== undefined) seen.add(identity);
    }
    flush();
    return actions.length === message.actions.length ? message : { ...message, actions };
  });
}

/** The line a card holding steps done again reads. */
export function doneAgainWords(cards: readonly ActionCard[]): string {
  const names = cards.map((card) => card.target ?? "").filter(Boolean);
  const named = names.slice(0, MAX_NAMED);
  const more = names.length - named.length;
  const list = more > 0 ? `${named.join(", ")} and ${more} more` : named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named[0] ?? "";
  return `Did ${cards.length} earlier steps again${list ? `: ${list}` : ""}`;
}

/** What a card that did its work did, for telling the same step done again; undefined for any card that cannot be one. */
function identityOf(card: ActionCard): string | undefined {
  // A step already done was skipped, not done again (`already-done.ts`).
  if (card.outcome !== "done" || card.already !== undefined || card.refused !== undefined || card.check || card.again !== undefined || !card.target) return undefined;
  return JSON.stringify([card.kind, card.target, card.testing === true]);
}
