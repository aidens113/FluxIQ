import { candidateTrialInvocations } from "./invocations.ts";
import { candidateTrialAuthority } from "./of.ts";
import { trialExecutionObservation } from "../observation/index.ts";
import { isCandidateTrialReadOnlyInvocation } from "./read-only.ts";
import { partialTrialContext } from "../partial/index.ts";

export function candidateTrialExecutionObservation(input: object) {
  if (isCandidateTrialReadOnlyInvocation(input)) return undefined;
  const bound = candidateTrialInvocations.get(input);
  if (bound) return candidateTrialAuthority(bound.modeOwner.port)?.executionObservation(bound.checkout);
  const original = trialExecutionObservation(input);
  if (original) return original.automation.forParent(original.parent);
  const partial = partialTrialContext(input);
  return partial?.automation?.forParent(partial.parent);
}
