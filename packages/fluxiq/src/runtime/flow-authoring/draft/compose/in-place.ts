// The framework's draft written back onto the loop's own steps.
//
// **Why.** The drafting function is pure and returns copies (`./compose.ts`), so it can be replayed and
// tested on its own. The evidence loop cannot use copies: it and its handlers hold the very step objects
// the draft lists -- the step a rerun replaces, the steps held amendments name, the step a claim lands on --
// and a copy standing where the original stood would leave each of those holding a step that is no longer
// in the draft. So the loop composes, and the framework's word is written back onto the same objects:
// whether the step is in (`drafted`, `disposition`), the pairing an undone press carries (`cancels`), and the
// acts it no longer does once it is out (`acts`). Nothing else compose reads is changed by it, and a step the
// model ruled on is copied through untouched, so writing it back is a no-op.
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftCompose } from "./compose.ts";

/** Composes the draft and writes the framework's word back onto `steps` themselves, in place; `tests` are the caller's, as `./compose.ts` takes them. */
export function automationStudioFlowDraftComposeInPlace(
  steps: readonly AutomationStudioFlowDraftStep[],
  tests: Omit<Parameters<typeof automationStudioFlowDraftCompose>[0], "steps"> = {}
): void {
  const composed = automationStudioFlowDraftCompose({ steps, ...tests });
  composed.forEach((drafted, index) => {
    const step = steps[index]!;
    step.disposition = drafted.disposition;
    writeBack(step, "drafted", drafted.drafted);
    writeBack(step, "cancels", drafted.cancels);
    writeBack(step, "acts", drafted.acts);
  });
}

function writeBack<Key extends "drafted" | "cancels" | "acts">(step: AutomationStudioFlowDraftStep, key: Key, value: AutomationStudioFlowDraftStep[Key]): void {
  if (value === undefined) delete step[key];
  else step[key] = value;
}
