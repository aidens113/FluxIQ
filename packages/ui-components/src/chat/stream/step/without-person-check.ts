// A person-only check is told once: by the question in the thread, which carries
// Continue and Stop. The "Robot check · Waiting for you" card beside it said the same
// thing a second time, so it is not drawn. The reasoning that led to a check stays;
// a message that was only the check's own card goes.

import type { StepMessage } from "./messages.ts";

/** `messages` without any person-only check card, and without a message that held nothing else. */
export function withoutPersonCheck(messages: readonly StepMessage[]): StepMessage[] {
  const kept: StepMessage[] = [];
  for (const message of messages) {
    const actions = message.actions.filter((card) => card.kind !== "person_check");
    if (actions.length === message.actions.length) {
      kept.push(message);
    } else if (message.kind !== "ask" || actions.length > 0) {
      kept.push({ ...message, actions });
    }
  }
  return kept;
}
