import { trialExecutionSources } from "./source-registry.ts";
import { bindTrialExecutionSource } from "./bind-source.ts";

export function inheritTrialExecutionSource(source: object, target: object): void {
  const original = trialExecutionSources.get(source);
  if (original) bindTrialExecutionSource(target, original);
}
