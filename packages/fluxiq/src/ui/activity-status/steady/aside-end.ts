// When a run Core makes aside from a test of the Flow ends: getting the page
// ready for a part (`./page-preparation.ts`) or checking the Flow against the
// recorded run (`./recorded-check.ts`). It ends when the build goes back to its
// own work (the next decision, a tool row), a step starts that is not of it, a
// supervisor's card opens or closes a brief, or the unit settles.
//
// Only the row that starts a step (Core's `activity/step/started.ts`: a `step`
// row `started`, numbered) starts one. A step passed over says which step it
// was too (`activity/step/skipped.ts`) and starts nothing: a skipped step in a
// setup rerun ended it and read as the build's test (t769 b13). A Core that
// sends a numbered row with no row of its own (no `detail`) is read as starting
// it, as before.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** True when `event`, which is not a row of the run aside itself, ends it. */
export function activityAsideEnds(event: ClientGatewayActivity): boolean {
  if (event.final === true || event.phase === "failed" || event.phase === "done") return true;
  const detail = event.detail;
  if (event.step !== undefined && (detail === undefined || (detail.kind === "step" && detail.status === "started"))) return true;
  if (detail === undefined) return event.phase === "thinking";
  if (detail.kind === "note" && (detail.project?.kind === "brief" || detail.project?.kind === "return")) return true;
  return (detail.kind === "thought" && detail.status === "started") || detail.kind === "tool";
}
