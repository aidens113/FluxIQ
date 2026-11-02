import { isTrialReadOnlyInvocation } from "../observation/index.ts";
import { candidateTrialInvocations } from "./invocations.ts";
import { candidateTrialAuthority } from "./of.ts";

export function isCandidateTrialReadOnlyInvocation(input: object): boolean {
  if (!isTrialReadOnlyInvocation(input)) return false;
  const bound = candidateTrialInvocations.get(input);
  if (bound && !candidateTrialAuthority(bound.modeOwner.port)?.isOfflineDiagnostic(bound.checkout)) throw new Error("candidate.trial_readonly_context_mismatch");
  return true;
}
