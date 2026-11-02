import { trialExecutionObservation } from "../observation/index.ts";
import { partialTrialContexts } from "./contexts.ts";
import type { PartialTrialContext } from "./context.ts";

export function partialTrialContext(input: object): PartialTrialContext | undefined {
  const original = partialTrialContexts.get(input);
  if (original) return original;
  return trialExecutionObservation(input);
}
