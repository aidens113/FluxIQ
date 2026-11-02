import { candidateTrialAuthority, candidateTrialInvocation, isCandidateTrialReadOnlyInvocation } from "../../candidate-trials/authority/index.ts";
import { partialTrialContext, type PartialTrialContext } from "../../candidate-trials/partial/index.ts";
import { AutomationStudioSiteResetObservation } from "./scope.ts";

/** Read only the current original invocation's private authority or scoped companion. */
export function automationStudioSiteResetTrialContext(invocation: object | undefined): PartialTrialContext | undefined {
  if (!invocation || isCandidateTrialReadOnlyInvocation(invocation)) return undefined;
  const bound = candidateTrialInvocation(invocation);
  return (bound ? candidateTrialAuthority(bound.modeOwner.port)?.callbackObservation(bound.checkout) : undefined) ?? partialTrialContext(invocation) ?? AutomationStudioSiteResetObservation.of(invocation)?.context;
}
