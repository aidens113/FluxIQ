import type { PartialTrialContext } from "./context.ts";
import { partialTrialContexts } from "./contexts.ts";

export function bindPartialTrialContext(target: object, context: PartialTrialContext): void {
  const prior = partialTrialContexts.get(target);
  if (prior && prior !== context) throw new Error("subflow.trial_observation_rebound");
  partialTrialContexts.set(target, context);
}
