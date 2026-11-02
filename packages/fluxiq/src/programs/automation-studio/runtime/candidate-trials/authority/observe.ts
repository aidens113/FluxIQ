import { candidateTrialInvocations } from "./invocations.ts";
import { candidateTrialAuthority } from "./of.ts";
import type { CandidateTrialInvocationPhase } from "../contracts/index.ts";
import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { isCandidateTrialReadOnlyInvocation } from "./read-only.ts";
import { observePartialTrialCallback } from "../partial/index.ts";
import type { ExecutionObservationContext } from "../../../../../runtime/execution-admission/index.ts";

export async function observeCandidateTrialCallback<TReceiver, TArguments extends unknown[], TResult>(input: object, phase: CandidateTrialInvocationPhase, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, prepared?: (originalContext: ExecutionObservationContext) => void | Promise<void>): Promise<Awaited<TResult>> {
  if (isCandidateTrialReadOnlyInvocation(input)) {
    if (phase !== "execute") throw new Error("candidate.trial_readonly_side_effect_phase");
    return await call.callback.apply(call.receiver, call.args);
  }
  const bound = candidateTrialInvocations.get(input);
  const authority = bound ? candidateTrialAuthority(bound.modeOwner.port) : undefined;
  return bound && authority ? await authority.invoke(bound.checkout, phase, call, prepared) : await observePartialTrialCallback(input, call, undefined, undefined, prepared);
}
