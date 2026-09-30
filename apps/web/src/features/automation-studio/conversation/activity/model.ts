// What the chat does with live activity, as pure functions: the step phrase,
// how fast to read again, which events are held, and where each row sits among
// the thread's turns.
//
// Nothing here invents a status. The header and the rows say only what an
// event carried; the poll's speed follows whether Core's latest event was its
// last one, never a timer's guess about how long work takes.

import type { ConversationTurn } from "../thread";
import type { ConversationPollOutcome } from "../thread";
import type { ConversationActivity, ConversationActivitySnapshot, ConversationActivityStep } from "./contracts";

/** How many events the chat holds across reads. Core's snapshot keeps 60; this keeps a little more history. */
export const CONVERSATION_ACTIVITY_HELD = 120;

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

/** The events already held plus a snapshot's, once each by sequence, oldest first, bounded. */
export function mergeConversationActivity(held: readonly ConversationActivity[], snapshot: ConversationActivitySnapshot): ConversationActivity[] {
  const bySequence = new Map<number, ConversationActivity>();
  for (const event of [...held, ...snapshot.recent, ...(snapshot.current ? [snapshot.current] : [])]) bySequence.set(event.sequence, event);
  const merged = [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
  return merged.slice(Math.max(0, merged.length - CONVERSATION_ACTIVITY_HELD));
}

export type ConversationThreadEntry =
  | { kind: "turn"; key: string; turn: ConversationTurn }
  | { kind: "activity"; key: string; activity: ConversationActivity };

/**
 * The visible turns with the activity rows between them, by time.
 *
 * Only an event with a detail is a row; a pure status change lives in the
 * header. An event that names another conversation belongs to that thread and
 * is left out. When earlier turns are hidden, rows older than the first shown
 * turn are hidden with them, so "Show earlier turns" still means everything
 * before it.
 */
export function interleaveConversationActivity(input: {
  turns: readonly ConversationTurn[];
  activity: readonly ConversationActivity[];
  conversationId?: string;
  earlierHidden?: boolean;
}): ConversationThreadEntry[] {
  const firstShown = input.earlierHidden && input.turns.length ? input.turns[0]!.createdAt : Number.NEGATIVE_INFINITY;
  const rows = input.activity.filter((event) => event.detail
    && event.atMs >= firstShown
    && !(event.conversationId && input.conversationId && event.conversationId !== input.conversationId));
  const entries: ConversationThreadEntry[] = [];
  let row = 0;
  for (const turn of input.turns) {
    while (row < rows.length && rows[row]!.atMs < turn.createdAt) entries.push(activityEntry(rows[row++]!));
    entries.push({ kind: "turn", key: `turn:${turn.turnId}`, turn });
  }
  while (row < rows.length) entries.push(activityEntry(rows[row++]!));
  return entries;
}

function activityEntry(activity: ConversationActivity): ConversationThreadEntry {
  return { kind: "activity", key: `activity:${activity.sequence}`, activity };
}
