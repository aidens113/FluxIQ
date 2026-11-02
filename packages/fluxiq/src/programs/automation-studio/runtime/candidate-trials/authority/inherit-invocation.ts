import { candidateTrialInvocations } from "./invocations.ts";

export function inheritCandidateTrialInvocation(source: object, target: object): void {
  const original = candidateTrialInvocations.get(source);
  if (!original) return;
  const prior = candidateTrialInvocations.get(target);
  if (prior && prior !== original) throw new Error("candidate.trial_invocation_rebound");
  candidateTrialInvocations.set(target, original);
}
