// Saying which places on the named route a step is on.
//
// Unlike an act (`../act-claim.ts`), a place is not one step's: getting to the
// Friends page may take the menu press that shows its link and the press on the
// link, and one step may be on two places. So the newest `place` for a step
// replaces that step's own places and never touches another step's, and a
// mistaken claim is corrected by naming the step's places again, or `none`.

import type { AutomationStudioFlowDraftStep } from "../step.ts";

/**
 * Sets the places `step` is on to the ones `value` names
 * (`./place-value.ts`, already checked), in the route's order and once each,
 * or clears them for `none`. Answers whether anything changed.
 */
export function automationStudioFlowDraftSetRoutePlaces(step: AutomationStudioFlowDraftStep, value: string): boolean {
  const named = value === "none" ? [] : [...new Set(value.split(","))].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
  const before = step.places ?? [];
  if (named.length === before.length && named.every((place, index) => place === before[index])) return false;
  if (named.length) step.places = named;
  else delete step.places;
  return true;
}
