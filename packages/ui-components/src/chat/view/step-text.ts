// "Step N of M" for an activity's step. Core's `step.index` is 1-based (it
// emits `index: step + 1`). A count that is not a positive whole number, or an
// index past it (a graph that loops or grew), reads as just "Step N", because
// "Step 7 of 5" would be a sentence Core never said.

import type { ClientGatewayActivity } from "fluxiq/ui";

/** The step as words, or undefined when there is no usable step. */
export function stepText(step: ClientGatewayActivity["step"]): string | undefined {
  if (step === undefined || !Number.isInteger(step.index) || step.index < 1) return undefined;
  const counted = Number.isInteger(step.count) && step.count >= 1 && step.index <= step.count;
  const head = counted ? `Step ${step.index} of ${step.count}` : `Step ${step.index}`;
  const label = step.label?.trim();
  return label ? `${head}: ${label}` : head;
}
