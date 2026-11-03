// When each thread turn happened, so turns and activity rows can be placed on
// one timeline.
//
//   - a turn Core stamped (`createdAt`) takes that time. Core stamps live
//     activity on the same clock, so the two interleave exactly;
//   - an unstamped turn of the first read is history and sorts before every
//     activity row (the caller passes `Number.NEGATIVE_INFINITY` as `now`);
//   - an unstamped turn seen later takes `now`, the time this panel first saw
//     it -- within 300 ms of Core's write, since the thread is re-read that
//     long after an event that names a conversation;
//   - no turn is ever earlier than the one before it, so the thread's own
//     order always holds;
//   - a turn keeps its time on every later read, and turns that left the
//     thread's window are forgotten.

import type { CoreTurn } from "../conversation/index.ts";

/** A turn and the time it takes on the chat's timeline, in ms. */
export type StampedTurn = { turn: CoreTurn; at: number };

export type TurnClock = {
  /** Times `turns`, in thread order. */
  stamp(turns: readonly CoreTurn[], now: number): StampedTurn[];
};

/** Creates an empty clock. */
export function createTurnClock(): TurnClock {
  let times = new Map<string, number>();
  return {
    stamp(turns, now) {
      const next = new Map<string, number>();
      let floor = Number.NEGATIVE_INFINITY;
      const stamped = turns.map((turn) => {
        const at = Math.max(turn.createdAt ?? times.get(turn.turnId) ?? now, floor);
        floor = at;
        next.set(turn.turnId, at);
        return { turn, at };
      });
      times = next;
      return stamped;
    }
  };
}
