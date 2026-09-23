// The single switch from a shape name to the policy that implements it.
//
// The five shapes share one body rather than living in five near-identical
// files, because what separates them is a single arithmetic step
// (`ordinals.ts`'s `widenShape`) and five copies of the same twenty lines would
// be five places for the reset rules to drift apart. What the design asked for
// is that the *policy be replaceable*, and it is: a caller holds an
// `AutomationStudioResultCheckSchedule` and never a shape name, so a shape with
// a genuinely different body -- one keyed to elapsed time rather than to runs
// -- is added here without touching the runtime.
//
// An unrecognised shape resolves to the default, never to `never`. A settings
// record written by a newer build, or damaged, must not silently stop a Flow
// being checked; that is the same fail-closed reading `trainingModeValue`
// applies to the training mode beside it.

import { decideAutomationStudioResultCheck } from "./decide.ts";
import type { AutomationStudioResultCheckSchedule } from "./policy.ts";
import { automationStudioResultCheckShapeValue } from "./settings.ts";

export function resolveAutomationStudioResultCheckSchedule(shape: unknown): AutomationStudioResultCheckSchedule {
  const resolved = automationStudioResultCheckShapeValue(shape);
  return {
    shape: resolved,
    decide: (input) => decideAutomationStudioResultCheck({ state: input.state, settings: { ...input.settings, shape: resolved } })
  };
}
