import type { CandidateTrialModeOwner, CandidateTrialCheckout } from "../contracts/index.ts";
import { candidateTrialInvocations } from "./invocations.ts";

export function bindCandidateTrialInvocation(input: object, modeOwner: CandidateTrialModeOwner, checkout: CandidateTrialCheckout): void {
  if (!modeOwner.read(checkout)) throw new Error("candidate.trial_checkout_lost");
  const prior = candidateTrialInvocations.get(input);
  if (prior && (prior.modeOwner !== modeOwner || prior.checkout !== checkout)) throw new Error("candidate.trial_invocation_rebound");
  candidateTrialInvocations.set(input, { modeOwner, checkout });
}
