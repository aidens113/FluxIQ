// Which work a settling row ends, as Core's own words for it say.
//
// The headline a unit of work settles on is chosen by its kind: a failed run
// whose repair was under way reads "Couldn't fix your Flow", a failed build
// "Build failed" (`headline.ts`). The kind comes from the event's subject.
// Run A of live round 1 (`run-muw60unq-591e23bd`, U4) ended a creation build
// on "Couldn't fix your Flow · Build stopped: the Flow is not finished yet":
// the row was the build's own ending, yet its headline was a run's. Neither
// the extension nor Core's emission (`runtime/activity/build.ts`, which ends
// every build under its build scope) shows how that row came to read as a
// run's -- the Lab keeps no record of the events the extension received, so
// the cause is not established (t276 report, item 3).
//
// Core's ending rows name the work they end, and that name is the stronger
// signal: "Build failed", "Build stopped: ...", "Not doable: ..." and "Build
// finished" end a build (`build.ts`'s titles); "Run failed", "Run cancelled"
// and "Run finished" end a run (`run.ts`). So a settling row's own title picks
// the headline's kind, and the subject only when the title names neither.
//
// The words count wherever the settling row carries them: its row's title, of
// any kind, or its label when it has no row (lane A round 4,
// `run-muxkzdjw-31a13429`, moments 15-16: a creation build that stopped on its
// call allowance still ended "Couldn't fix your Flow · Build stopped: a budget
// ran out"; with no record of the events received, a row of another kind
// carrying the build's words is one of the two ways left to that headline, the
// other a later row reopening the settled unit, `pacer.ts`).

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ActivityDisplay } from "./activity-display.ts";

const BUILD_ENDING = /^(?:Build (?:failed|stopped|finished)|Not doable)\b/u;
const RUN_ENDING = /^Run (?:failed|cancelled|finished)\b/u;

/** The kind of work `event`'s settling row says it ends; undefined for any other row. */
export function endingKindOf(event: ClientGatewayActivity): ActivityDisplay["subjectKind"] | undefined {
  if (event.final !== true && event.phase !== "failed" && event.phase !== "done") return undefined;
  for (const words of [event.detail?.title, event.label]) {
    if (typeof words !== "string") continue;
    if (BUILD_ENDING.test(words)) return "build";
    if (RUN_ENDING.test(words)) return "run";
  }
  return undefined;
}
