// A question is told once: by the question in the thread, with its answers. A "Robot
// check · Waiting for you" or "Permission · Waiting for you" card beside it said the same
// thing a second time, so neither is drawn, and "You allowed this." keeps the answer in
// the transcript. The reasoning that led to a question stays; a message that was only the
// question's own card goes.

import type { StepMessage } from "./messages.ts";

const ASK_CARDS: ReadonlySet<string> = new Set(["person_check", "permission", "question"]);

/** `messages` without any question's card, and without a message that held nothing else. */
export function withoutAskCards(messages: readonly StepMessage[]): StepMessage[] {
  const kept: StepMessage[] = [];
  for (const message of messages) {
    const actions = message.actions.filter((card) => !ASK_CARDS.has(card.kind));
    if (actions.length === message.actions.length) {
      kept.push(message);
    } else if (message.kind !== "ask" || actions.length > 0) {
      kept.push({ ...message, actions });
    }
  }
  return kept;
}
