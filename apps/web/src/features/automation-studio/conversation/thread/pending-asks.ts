// What the globally mounted prompt needs, without any of React in it.
//
// The prompt exists because a question that only appears inside one tab of one
// view is a question most people never see: the build-stage permission dialog
// the panel already has has never once been observed in a live run. So the
// prompt is mounted beside the client-pairing prompt, in the root layout, and
// finds the person wherever they are in the product.
//
// It reads through the fixed contract and nothing else: `list-conversations`
// for the open threads, then `get-conversation` for the most recently updated
// one, and `pendingConversationTurn` for the question inside it. Only one
// question is ever shown; answering or dismissing it reveals the next.

import type { Conversation, ConversationTurn } from "./contracts";
import { parseConversations } from "./contracts";
import { conversationSubjectLabel, pendingConversationTurn } from "./model";

/** How many dismissals are remembered, matching the pairing prompt's bound. */
export const CONVERSATION_DISMISSED_LIMIT = 20;

export function openConversationsFromPayload(payload: unknown): Conversation[] {
  const conversations = payload && typeof payload === "object"
    ? (payload as { conversations?: unknown }).conversations
    : undefined;
  return parseConversations(conversations)
    .filter((conversation) => conversation.status === "open")
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

/** The question to put in front of the person, or nothing because they dismissed it. */
export function promptableConversationTurn(
  turns: readonly ConversationTurn[],
  dismissedAskIds: readonly string[]
): ConversationTurn | null {
  const dismissed = new Set(dismissedAskIds);
  const turn = pendingConversationTurn(turns);
  return turn && turn.ask && !dismissed.has(turn.ask.askId) ? turn : null;
}

export function withDismissedAsk(dismissedAskIds: readonly string[], askId: string): string[] {
  return [...dismissedAskIds.filter((id) => id !== askId), askId].slice(-CONVERSATION_DISMISSED_LIMIT);
}

/** The prompt's own heading and lead line, built from what Core sent and nothing else. */
export function conversationPromptCopy(conversation: Conversation | null, turn: ConversationTurn): {
  title: string;
  description: string;
} {
  const subject = conversation ? conversationSubjectLabel(conversation) : "FluxIQ";
  const parks = turn.ask?.parks === true;
  return {
    title: "FluxIQ needs an answer",
    description: parks
      ? `${subject} is waiting on you before it can carry on.`
      : `${subject} asked you something.`
  };
}
