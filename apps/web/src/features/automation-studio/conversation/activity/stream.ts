// The message stream: the thread's turns, with FluxIQ's step messages placed
// among them by time.
//
// A fold ("Worked for 2m 5s · 14 steps") hid what FluxIQ did and why behind a
// disclosure; a person asked to see each step as its own message with its
// reason. Each step message (`steps/messages.ts`) sits where the event that
// opened it happened, so it is placed once and never moves. The live line is
// not an entry: the thread draws it after the last one while Core works.

import type { ConversationTurn } from "../thread";
import type { ConversationActivity } from "./contracts";
import { conversationStepMessages, type ConversationStepMessage } from "./steps";

export type ConversationStreamEntry =
  | { kind: "turn"; key: string; turn: ConversationTurn }
  | { kind: "step"; key: string; message: ConversationStepMessage };

/**
 * Turns in order, and the step messages between them by time. An event that
 * names another conversation belongs to that thread and is left out. When
 * earlier turns are hidden, messages older than the first shown turn are
 * hidden with them, so "Show earlier turns" still means everything before it.
 */
export function conversationStream(input: {
  turns: readonly ConversationTurn[];
  activity: readonly ConversationActivity[];
  conversationId?: string;
  earlierHidden?: boolean;
}): ConversationStreamEntry[] {
  const own = input.activity.filter((event) => !(event.conversationId && input.conversationId && event.conversationId !== input.conversationId));
  const firstShown = input.earlierHidden && input.turns.length ? input.turns[0]!.createdAt : Number.NEGATIVE_INFINITY;
  const messages = conversationStepMessages(own).filter((message) => message.atMs >= firstShown);
  const entries: ConversationStreamEntry[] = [];
  let next = 0;
  for (const turn of input.turns) {
    while (next < messages.length && messages[next]!.atMs < turn.createdAt) entries.push(stepEntry(messages[next++]!));
    entries.push({ kind: "turn", key: `turn:${turn.turnId}`, turn });
  }
  while (next < messages.length) entries.push(stepEntry(messages[next++]!));
  return entries;
}

function stepEntry(message: ConversationStepMessage): ConversationStreamEntry {
  return { kind: "step", key: message.key, message };
}
