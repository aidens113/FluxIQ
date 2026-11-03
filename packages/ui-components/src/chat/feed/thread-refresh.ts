import type { ChatActivityState } from "../ports/index.ts";
// When live activity means the thread may have changed. Activity is not a
// turn (plan D2), but Core speaks through the thread while it works, so an
// event that names a conversation, or ends the unit of work, is a reason to
// read the thread now instead of waiting for the 4 s poll.
//
// "New" is by identity (`activityId` and `sequence`), not by a sequence high
// mark: Core's sequence restarts with its process, and the relay then keeps
// counting from the start again.


/** Whether to read the thread, and the events seen so far for the next call. */
export type ThreadRefreshDecision = { refresh: boolean; seen: ReadonlySet<string> };

/**
 * Compares `state` with the events already `seen`. The first call (`seen`
 * undefined) never asks for a read: the thread is read when the chat starts.
 */
export function threadRefreshWanted(seen: ReadonlySet<string> | undefined, state: ChatActivityState): ThreadRefreshDecision {
  const next = new Set(state.recent.map(eventKey));
  if (seen === undefined) return { refresh: false, seen: next };
  const refresh = state.recent.some((event) => !seen.has(eventKey(event)) && (event.conversationId !== undefined || event.final === true));
  return { refresh, seen: next };
}

function eventKey(event: ChatActivityState["recent"][number]): string {
  return `${event.activityId}#${event.sequence}`;
}
