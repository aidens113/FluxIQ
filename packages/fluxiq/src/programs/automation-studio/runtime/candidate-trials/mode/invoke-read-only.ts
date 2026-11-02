import type { AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialRequest } from "../../flow-bootstrap/candidate/index.ts";
import { candidateTrialInvocation } from "../authority/index.ts";

/** A known wrapper forwards only the exact leased no-dispatch callback, never the mutable original port. */
export async function invokeCandidateTrialReadOnly(port: AutomationStudioCandidateTrialPort, request: AutomationStudioCandidateTrialRequest) {
  const original = candidateTrialInvocation(request);
  const call = original?.modeOwner.readOnlyCall(original.checkout, port, undefined, request);
  if (!call) throw new Error("candidate.trial_readonly_checkout_lost");
  return call.kind === "owned" ? await call.callbacks.invokeReadOnly(call.call) : await call.call.callback.apply(call.call.receiver, call.call.args);
}
