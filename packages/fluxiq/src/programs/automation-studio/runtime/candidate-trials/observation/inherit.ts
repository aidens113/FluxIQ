import { trialExecutionObservations } from "./registry.ts";
import { bindTrialExecutionObservation } from "./bind.ts";

export function inheritTrialExecutionObservation(source: object, target: object): void {
  const original = trialExecutionObservations.get(source);
  if (original) bindTrialExecutionObservation(target, original);
}
