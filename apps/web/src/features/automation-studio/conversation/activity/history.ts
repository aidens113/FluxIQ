// Holding each unit of work whole across reads, so its step messages stay in
// the chat after Core's snapshot has moved past them.
//
// Core's `get-activity` answers the hub's last 60 events for the project. A
// build makes far more than that, so a chat that drew only the latest snapshot
// lost its first steps while the build was still going. Every read is merged
// into what is already held, per unit of work (`activityId`), each event once
// by `activityId#sequence`.
//
// Only what can become a message, or says how a unit ended, is held: an event
// with a detail, apart from a decision still being made (a `thought` with no
// text), and a unit's final event. Bounded: the newest `eventsPerUnit` of a
// unit, and the `units` heard from most recently. The result is oldest first,
// by Core's time and then its sequence.

import type { ConversationActivity, ConversationActivitySnapshot } from "./contracts";

export type ConversationActivityHistoryLimits = { units: number; eventsPerUnit: number };

export const CONVERSATION_ACTIVITY_HISTORY_LIMITS: ConversationActivityHistoryLimits = Object.freeze({ units: 10, eventsPerUnit: 500 });

/** The events already held plus a snapshot's, held per unit of work, bounded, oldest first. */
export function holdConversationActivity(
  held: readonly ConversationActivity[],
  snapshot: ConversationActivitySnapshot,
  limits: ConversationActivityHistoryLimits = CONVERSATION_ACTIVITY_HISTORY_LIMITS
): ConversationActivity[] {
  const units = new Map<string, Map<number, ConversationActivity>>();
  for (const event of [...held, ...snapshot.recent, ...(snapshot.current ? [snapshot.current] : [])]) {
    if (!worthHolding(event)) continue;
    let unit = units.get(event.activityId);
    if (!unit) {
      unit = new Map();
      units.set(event.activityId, unit);
    }
    unit.set(event.sequence, event);
  }
  const kept = newest([...units.values()]
    .map((unit) => newest([...unit.values()].sort((left, right) => left.sequence - right.sequence), limits.eventsPerUnit))
    .filter((events) => events.length > 0)
    .sort((left, right) => compare(left.at(-1)!, right.at(-1)!)), limits.units);
  return kept.flat().sort(compare);
}

/** The last `count` of `list`; none for a count below one. */
function newest<T>(list: T[], count: number): T[] {
  return count >= 1 ? list.slice(-Math.floor(count)) : [];
}

function worthHolding(event: ConversationActivity): boolean {
  if (event.final === true || event.phase === "done" || event.phase === "failed") return true;
  const detail = event.detail;
  if (!detail) return false;
  return detail.kind !== "thought" || Boolean(detail.text?.trim());
}

function compare(left: ConversationActivity, right: ConversationActivity): number {
  return left.atMs - right.atMs || left.sequence - right.sequence;
}
