import type { AutomationStudioCandidateTrialSource } from "../authority/index.ts";
import { trialExecutionSources } from "./source-registry.ts";

export function bindTrialExecutionSource(target: object, source: AutomationStudioCandidateTrialSource): void {
  const prior = trialExecutionSources.get(target);
  if (prior && prior !== source) throw new Error("candidate.trial_source_rebound");
  trialExecutionSources.set(target, source);
}
