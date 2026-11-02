import type { TrialExecutionObservation } from "./binding.ts";
import { trialExecutionObservations } from "./registry.ts";

export function bindTrialExecutionObservation(target: object, observation: TrialExecutionObservation): void {
  const prior = trialExecutionObservations.get(target);
  if (prior && prior !== observation) throw new Error("candidate.trial_observation_rebound");
  trialExecutionObservations.set(target, observation);
}
