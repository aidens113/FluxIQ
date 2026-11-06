// Whether an act was done by an earlier attempt at the same request, as Core's act record says it on a
// result: its words begin "Already done earlier: " or "May already be done: ". Such an act is never
// this attempt's own, so a count of what this attempt did on the site leaves it out.

import type { ChatAttemptAct } from "../../ports/index.ts";

const EARLIER = /^(?:Already done earlier|May already be done): /u;

/** True when `act` was carried from an earlier attempt. */
export function isEarlierAct(act: ChatAttemptAct): boolean {
  return EARLIER.test(act.what);
}
