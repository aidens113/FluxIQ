import { candidateTrialInvocations } from "./invocations.ts";
import { candidateTrialAuthority } from "./of.ts";
import { partialTrialContext } from "../partial/index.ts";
import { isCandidateTrialReadOnlyInvocation } from "./read-only.ts";

/** The original parent for an options copy; no new admission or public handle is made. */
export function candidateTrialObservationContext(input: object) {
  if (isCandidateTrialReadOnlyInvocation(input)) return undefined;
  const bound = candidateTrialInvocations.get(input);
  if (bound) return candidateTrialAuthority(bound.modeOwner.port)?.observation(bound.checkout);
  return partialTrialContext(input)?.parent;
}
