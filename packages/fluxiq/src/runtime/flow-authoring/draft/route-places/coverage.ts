// Whether a Flow goes through the route the person named (D phase 2).
//
// Core cannot see where a step went: it never reads addresses or page words to
// decide it (the old t195 URL scan stays unported). It reads what the model
// says, step by step (`place`, `./set.ts`), and holds the Flow to it: every
// place on the route has a step in the Flow on it, and the first step on each
// place comes no earlier than the first step on the place before it. A step
// out of the Flow is no step on the route, so dropping the only step on the
// middle place leaves that place missing. Whether a claimed step really goes
// there is the whole-Flow judge's to see, from the test and the person's words.

import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftStepIsProposed } from "../step.ts";

/**
 * The places of a route of `places` places (`r1` ... `r<places>`) that no step
 * in the Flow is on, and those first reached before a place earlier on the
 * route, in route order. A claim of a place past the route's end is ignored.
 */
export function automationStudioFlowDraftRouteCoverage(steps: readonly AutomationStudioFlowDraftStep[], places: number): { missing: string[]; outOfOrder: string[] } {
  const kept = steps.filter(automationStudioFlowDraftStepIsProposed);
  const first = Array.from({ length: places }, (_, index) => kept.findIndex((step) => step.places?.includes(`r${index + 1}`) === true));
  const missing = first.flatMap((at, index) => at < 0 ? [`r${index + 1}`] : []);
  const outOfOrder: string[] = [];
  let latest = -1;
  first.forEach((at, index) => {
    if (at < 0) return;
    if (at < latest) outOfOrder.push(`r${index + 1}`);
    else latest = at;
  });
  return { missing, outOfOrder };
}
