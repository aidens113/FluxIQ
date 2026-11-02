import type { TrialOfflineInvocation } from "./offline-invocation.ts";
import { trialOfflineInvocations } from "./offline-invocations.ts";

export function bindTrialOfflineInvocation(input: object, invocation: TrialOfflineInvocation): void {
  if (trialOfflineInvocations.has(input)) throw new Error("candidate.trial_offline_invocation_rebound");
  trialOfflineInvocations.set(input, invocation);
}
