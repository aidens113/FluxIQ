import { trialReadOnlyInvocations } from "./read-only-invocations.ts";

export function bindTrialReadOnlyInvocation(input: object, invocation: { current(): boolean }): () => void {
  if (trialReadOnlyInvocations.has(input)) throw new Error("candidate.trial_readonly_invocation_rebound");
  trialReadOnlyInvocations.set(input, invocation);
  return () => { if (trialReadOnlyInvocations.get(input) === invocation) trialReadOnlyInvocations.delete(input); };
}
