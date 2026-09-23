// The transcript as an ordered, append-only list, and the two decisions the
// thread makes about it: which turn is still waiting on the person, and
// whether an arriving turn should pull the view down with it.
//
// Pure functions, deliberately: the thread is the first surface in the panel
// that appends while the person is reading it, and getting that wrong is the
// difference between a conversation and a jumping page.

import type { Conversation, ConversationTurn } from "./contracts";

/** How many turns the thread mounts at once; older ones are behind "Show earlier". */
export const CONVERSATION_VISIBLE_TURNS = 200;

/** How close to the bottom still counts as "following", in CSS pixels. */
export const CONVERSATION_TAIL_SLACK_PX = 48;

/**
 * Append-only merge. A turn already held wins over an arriving copy of itself,
 * so a re-read never rewrites what the person already read; ordering is by
 * `createdAt`, then `turnId`, so two turns written in the same millisecond keep
 * a stable order across reads.
 */
export function mergeConversationTurns(
  existing: readonly ConversationTurn[],
  incoming: readonly ConversationTurn[]
): ConversationTurn[] {
  if (!incoming.length) return [...existing];
  const byId = new Map<string, ConversationTurn>();
  for (const turn of incoming) byId.set(turn.turnId, turn);
  for (const turn of existing) byId.set(turn.turnId, turn);
  return [...byId.values()].sort((left, right) =>
    left.createdAt - right.createdAt || (left.turnId < right.turnId ? -1 : left.turnId > right.turnId ? 1 : 0)
  );
}

/** The cursor for the next read: the last turn this tab already holds. */
export function latestConversationTurnId(turns: readonly ConversationTurn[]): string | null {
  return turns.length ? turns[turns.length - 1]!.turnId : null;
}

/**
 * The turn the person still owes an answer to: the newest one carrying an ask
 * whose status is still `pending`. Only one is ever offered, so a thread that
 * parked twice does not present two questions at once.
 */
export function pendingConversationTurn(turns: readonly ConversationTurn[]): ConversationTurn | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index]!;
    if (turn.ask && turn.ask.status === "pending") return turn;
  }
  return null;
}

/** The turns the thread mounts, newest last, bounded by `CONVERSATION_VISIBLE_TURNS`. */
export function visibleConversationTurns(
  turns: readonly ConversationTurn[],
  showAll: boolean
): { turns: ConversationTurn[]; hidden: number } {
  if (showAll || turns.length <= CONVERSATION_VISIBLE_TURNS) return { turns: [...turns], hidden: 0 };
  return {
    turns: turns.slice(turns.length - CONVERSATION_VISIBLE_TURNS),
    hidden: turns.length - CONVERSATION_VISIBLE_TURNS
  };
}

/**
 * Whether the thread is following its tail. A person who has scrolled up is
 * reading something, and an arriving turn must not yank them away from it; a
 * person at the bottom is watching the exchange and wants the new turn.
 */
export function conversationFollowsTail(metrics: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= CONVERSATION_TAIL_SLACK_PX;
}

/** Open conversations first, then most recently updated, so the list opens on live work. */
export function sortConversationsForThreadList(conversations: readonly Conversation[]): Conversation[] {
  return [...conversations].sort((left, right) => {
    if (left.status !== right.status) return left.status === "open" ? -1 : 1;
    return right.updatedAt - left.updatedAt;
  });
}

/** How a subject reads in the conversation list, without inventing a name Core did not send. */
export function conversationSubjectLabel(conversation: Conversation): string {
  const kind = conversation.subject.kind;
  const noun = kind === "project" ? "Project" : kind === "flow" ? "Flow" : kind === "build" ? "Build" : "Run";
  return `${noun} ${conversation.subject.id}`;
}
