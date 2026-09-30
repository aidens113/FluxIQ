// What the chat does with live activity, as pure functions: the step phrase
// and how fast to read again.
//
// Nothing here invents a status. The poll's speed follows whether Core's
// latest event was its last one, never a timer's guess about how long work
// takes. How events are held across reads is `history.ts`; how they become
// messages is `steps/`.

import type { ConversationPollOutcome } from "../thread";
import type { ConversationActivitySnapshot, ConversationActivityStep } from "./contracts";

/**
 * "Step N of M", or just "Step N" when N runs past M or M is not a count.
 * `index` is 1-based, as Core emits it.
 */
export function conversationActivityStepText(step: ConversationActivityStep): string {
  const counted = Number.isInteger(step.count) && step.count > 0 && step.index <= step.count;
  return counted ? `Step ${step.index} of ${step.count}` : `Step ${step.index}`;
}

/** Fast while Core's latest event is not its last; otherwise the ordinary decay. */
export function conversationActivityPollOutcome(snapshot: ConversationActivitySnapshot): ConversationPollOutcome {
  return snapshot.current && !snapshot.current.final ? "pending" : "idle";
}
