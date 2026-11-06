// Whether the attempt a working display speaks of has already ended: its record says so (an
// answer is in the thread) while Core's activity for the unit has not yet sent its closing row,
// because the unit still files what it did after it answers. The strip under a finished answer
// must not say "Working" then. The attempt is this unit's own only when it ended no earlier than
// the unit's first row, so an earlier attempt's ending never closes a new one. It is the ending
// that is held to the unit, not the start: an attempt carried on after Core restarted began in the
// unit before, and a long unit's first row may have aged out of the events kept, so its start can be
// long before every row held and it still ended in this unit.

import { ACTIVITY_ATTEMPT_WORDS, type ActivityDisplay, type ClientGatewayActivity } from "fluxiq/ui";
import type { ChatTaskOutcome } from "../ports/index.ts";

/** How much earlier than the unit's first row an attempt's ending may be stamped (two clocks, one machine). A person pressing Run again is seconds behind the answer, so this never reaches the attempt before. */
const SKEW_MS = 1000;

/** True when `display` is an attempt unit at work whose newest attempt in `outcomes` ended within it. */
export function attemptEnded(display: ActivityDisplay | null | undefined, events: readonly ClientGatewayActivity[], outcomes: readonly ChatTaskOutcome[]): boolean {
  if (display?.working !== true || display.headline !== ACTIVITY_ATTEMPT_WORDS.working) return false;
  const attempt = outcomes.at(-1)?.attempt;
  if (attempt === undefined || attempt.status === "working" || attempt.endedAtMs === undefined) return false;
  const stamps = events.filter((event) => event.activityId === display.activityId).map((event) => Date.parse(event.at)).filter(Number.isFinite);
  if (stamps.length === 0) return false;
  return attempt.endedAtMs >= Math.min(...stamps) - SKEW_MS;
}
