// What the judge of a trial is told the site already held when the trial
// began (t471), from the reset's `startedWith` (`../site-reset/trial-policy.ts`).
//
// Lane D round 9 (`run-mv5q4j2n-25784472`) tested on a site that still held
// three requests its earlier trial had confirmed, which no control of the site
// takes back. The judge, told nothing, read the run as if the site were fresh.
// Each act is said by what it did -- Core's words over the gate's carried
// control name -- and each difference in the domain's own words; both were
// already shown to the model, and are screened again with the summary.

import type { JsonObject } from "../../../../../core/index.ts";

/** The most entries said: the acts first, then the differences. */
const MOST = 20;

/** One line per act the trial started with, and per difference from the start, in that order; none when it started clean. */
export function automationStudioCandidateStartedWithSaid(startedWith: JsonObject | undefined): string[] {
  if (!startedWith) return [];
  const acts = ["cannotUndo", "acts"].flatMap((key) => {
    const value = startedWith[key];
    return Array.isArray(value) ? value : [];
  // The act's id keeps two acts that did the same thing to two rows from reading as one.
  }).flatMap((act) => (act && typeof act === "object" && !Array.isArray(act) && typeof act.did === "string" ? [`already done by this build${typeof act.act === "string" ? ` (${act.act})` : ""}: ${act.did}`] : []));
  const differs = Array.isArray(startedWith.differs) ? startedWith.differs.filter((line): line is string => typeof line === "string").map((line) => `not as the build found it: ${line}`) : [];
  return [...new Set([...acts, ...differs])].slice(0, MOST);
}
