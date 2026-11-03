// Cards that only repeat what the chat already shows, as one card each that
// counts them.
//
// The build's model can ask for the same thing again and again after Core
// declined it, or try the same call and see it fail the same way, and each
// was a card of its own:
//
// - three "Edit the Flow · run the step again / Not done: that step was
//   already tried exactly this way ..." cards in a row read as three pieces of
//   work (U-8 of the run-muw60j7c-bb7c9a62 UI review), as three "Send the Flow
//   again / Not done: the same Flow was already sent exactly like this ..."
//   cards would (lane C, run-mv0fuotv-805294d7, where a whole Flow sent again
//   read "Change the Flow · run the step again");
// - a refused rerun and the rerun of a list read that Core did not send
//   alternated, "Edit the Flow / Not done" then "Read list / Didn't work", one
//   pair per attempt (R2-U-7 of the run-muwansvz-a2b4a987 UI review, steps
//   0033-0046).
//
// So a card that did nothing -- a decision Core declined in whole, or an
// action that didn't work -- folds into an identical card shown earlier in the
// same stretch of cards: same unit of work, and the same kind, target, test
// mark, outcome and reason, so the same words. A stretch is the cards that
// follow one another with nothing new between them. Words of FluxIQ's (a
// decision with its reason, a repair, a note) end it, and so does a card that
// did anything, even in part, which is never folded. A card that is new to the
// stretch after one of its cards has already repeated starts a new stretch, so
// the order still reads true: A B A B A B is A (3 times) and B (3 times), and
// A B A C A is A (2 times), B, C, A. The card folded into keeps its key and
// its place and says how many times it stands for (`times`; "Not done (3
// times): ...", "Didn't work (3 times): ...", `card-words.ts`). A message
// that was only folded cards is gone; one with words keeps them.
//
// A card that did its work folds too, but only into the card shown just
// before it, when that one says the same, result and all: five reruns of one
// list read stacked five identical "Read list · name, price and 4 more /
// Done" cards (R3-U-5 of the run-mux6naez-6c20f26e UI review), and are one
// "Done (5 times)". Only the card just before, so done, failed, done never
// reads as "Done (2 times)" then a failure; another row count is another
// result, shown apart; a card still under way or waiting is never folded.
//
// A decision Core declined in whole folds across decisions too, when the
// decision that asked for it again gave the same reason: round 5 showed two
// identical "Choose ... / Not done: it was already tried exactly this way"
// cards around one Look card, each refused try under its own decision with the
// same words. The first card counts both, and the repeat's message, which then
// says nothing new, is gone. A different reason is new words and stays, and so
// does an action that was really tried again and failed. No DOM.

import type { ActionCard } from "./action-card.ts";
import type { StepMessage } from "./messages.ts";

/** Messages whose words show above their cards: a card after them is new, whatever came before. */
const SPOKEN: ReadonlySet<StepMessage["kind"]> = new Set<StepMessage["kind"]>(["decision", "repair", "note"]);

/** One card of the current stretch, where it is kept, and what it says. */
type Shown = { message: StepMessage; card: number; words: string };
/** The cards shown since something new, in one unit of work; `repeated` once any of them was folded into. */
type Stretch = { activityId: string; cards: Shown[]; repeated: boolean };

/** `messages` (oldest first), with each card that repeats one of its stretch folded into that card. */
export function foldRepeatedCards(messages: readonly StepMessage[]): StepMessage[] {
  const kept: StepMessage[] = [];
  // Each refused card shown under a decision, by its unit, the decision's words and its own.
  const refusals = new Map<string, Shown>();
  let stretch: Stretch | undefined;
  // The card shown just before, when it did its work: an identical one after it is folded into it.
  let last: (Shown & { activityId: string }) | undefined;
  for (const message of messages) {
    // Words above a message's cards are new: a card after them repeats nothing before.
    if (SPOKEN.has(message.kind) || message.actions.length === 0) stretch = last = undefined;
    if (stretch !== undefined && stretch.activityId !== message.activityId) stretch = undefined;
    if (last !== undefined && last.activityId !== message.activityId) last = undefined;
    const copy: StepMessage = { ...message, actions: [] };
    for (const card of message.actions) {
      const words = nothingDone(card) ? sameWords(card) : undefined;
      if (words === undefined) {
        const done = settledWork(card) ? doneWords(card) : undefined;
        if (done !== undefined && last !== undefined && last.words === done) {
          fold(last, card, message);
          continue;
        }
        copy.actions.push(card);
        stretch = undefined;
        last = done === undefined ? undefined : { message: copy, card: copy.actions.length - 1, words: done, activityId: message.activityId };
        continue;
      }
      last = undefined;
      const same = stretch?.cards.find((shown) => shown.words === words);
      if (stretch !== undefined && same !== undefined) {
        fold(same, card, message);
        stretch.repeated = true;
        continue;
      }
      const asked = refusalKey(message, card, words);
      const before = asked === undefined ? undefined : refusals.get(asked);
      if (before !== undefined) {
        fold(before, card, message);
        continue;
      }
      if (stretch?.repeated) stretch = undefined;
      copy.actions.push(card);
      stretch ??= { activityId: message.activityId, cards: [], repeated: false };
      const shown = { message: copy, card: copy.actions.length - 1, words };
      stretch.cards.push(shown);
      if (asked !== undefined) refusals.set(asked, shown);
    }
    if (copy.actions.length === 0 && message.actions.length > 0) continue;
    kept.push(copy);
  }
  return kept;
}

/** Where a refused card under a decision is found again: its unit, the decision's words and the card's; undefined for any other card. */
function refusalKey(message: StepMessage, card: ActionCard, words: string): string | undefined {
  if (message.kind !== "decision" || card.refused === undefined) return undefined;
  return JSON.stringify([message.activityId, message.title, message.text ?? null, words]);
}

/** `card` folded into the card `into` stands for, which then counts it too. */
function fold(into: Shown, card: ActionCard, message: StepMessage): void {
  const before = into.message.actions[into.card]!;
  into.message.actions[into.card] = { ...before, times: (before.times ?? 1) + (card.times ?? 1) };
  into.message.sequence = Math.max(into.message.sequence, message.sequence);
}

/** An action that did its work and said so: done, and not an edit Core took only in part. */
function settledWork(card: ActionCard): boolean {
  return card.outcome === "done" && card.refused === undefined;
}

/** What a card that did its work says, result and all, but for its count. */
function doneWords(card: ActionCard): string {
  return JSON.stringify([card.kind, card.name ?? null, card.target, card.testing === true, "done", card.check, card.said ?? null, card.result?.trim() || null, card.tested ?? null, card.answer ?? null, card.retried ?? null, card.already === true]);
}

/** A decision Core declined in whole, or an action that didn't work: nothing came of it. */
function nothingDone(card: ActionCard): boolean {
  if (card.refused !== undefined) return card.refused.all && card.outcome !== "waiting";
  return card.outcome === "failed" && !card.unconfirmed;
}

/** What the card says, but for its count: two cards with the same are the same card shown twice. */
function sameWords(card: ActionCard): string {
  const named = [card.kind, card.name ?? null, card.target, card.testing === true];
  // A refusal says only that it was not done and why, whatever outcome the card carries (`card-words.ts`).
  if (card.refused !== undefined) return JSON.stringify([...named, "refused", card.refused.because]);
  return JSON.stringify([...named, card.check, card.why, card.why === null ? card.said ?? null : null, card.answer ?? null]);
}
