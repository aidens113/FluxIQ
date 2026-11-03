// The way-out references a trial's run reported (t470): the domain's opaque
// reference to each control the client pressed to close a layer the page put
// in the way (`../../executor/contracts.ts` `AutomationStudioClearedLayer`),
// handed back to the domain for the handle the trial feedback names it by
// (`./interruptions.ts`).

import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";

/** The most references one trial asks the domain to name. */
const MAX_WAY_OUTS = 24;

/** The way-out references the client reported in `attempts`, each once, in order, at most `MAX_WAY_OUTS`. */
export function automationStudioTrialWayOuts(attempts: readonly AutomationStudioNodeAttemptTrace[]): string[] {
  const wayOuts = attempts.flatMap((attempt) => (attempt.clearedLayers ?? []).flatMap((layer) => (layer.wayOut === undefined ? [] : [layer.wayOut])));
  return [...new Set(wayOuts)].slice(0, MAX_WAY_OUTS);
}
