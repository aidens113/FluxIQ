// When the unit of work began, for the header's ticking time.
//
// It starts from the activity `at` of the first event seen for the unit
// (never later than now), else from when the header was first shown; the
// host's meter may name the start outright (`startedAtMs`). A send that
// precedes the first activity starts the clock, and the work that then
// arrives keeps that earlier start. A different unit of work, or none, starts
// again. No DOM, no timers: the caller says what time it is.

/** The clock: `read` is called on each render and tick with the unit's id, null between units of work. */
export type ElapsedClock = {
  /** Elapsed ms for the unit `key` (an activity id, or "sending"), null when there is no unit. */
  read(key: string | null, firstAt: string | undefined, now: number, hostStart?: number): number | null;
};

/** Creates a clock that has not started. */
export function createElapsedClock(): ElapsedClock {
  let key: string | null = null;
  let start = 0;
  return {
    read(next, firstAt, now, hostStart) {
      if (next === null) {
        key = null;
        return null;
      }
      if (next !== key) {
        const stamped = firstAt === undefined ? Number.NaN : Date.parse(firstAt);
        const seen = Number.isFinite(stamped) && stamped <= now ? stamped : now;
        // Work that follows a send keeps the send's start.
        start = key === "sending" ? Math.min(start, seen) : next === "sending" ? now : seen;
        key = next;
      }
      const from = hostStart !== undefined && Number.isFinite(hostStart) ? hostStart : start;
      return Math.max(0, now - from);
    }
  };
}
