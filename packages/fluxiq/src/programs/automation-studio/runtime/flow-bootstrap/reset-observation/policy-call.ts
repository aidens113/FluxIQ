import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import type { CandidateTrialInvocationPhase } from "../../candidate-trials/contracts/index.ts";
import { observeCandidateTrialCallback } from "../../candidate-trials/authority/index.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "./policies.ts";
import { AutomationStudioSiteResetObservation } from "./scope.ts";
import { automationStudioSiteResetTrialContext } from "./trial-context.ts";
import { invokeAutomationStudioSiteResetCallback } from "./invoke.ts";

/** Policy hooks are awaited under their actual child; existing argument objects carry no new fields. */
export async function observeAutomationStudioTrialPolicy<TReceiver, TArguments extends unknown[], TResult>(invocation: object, phase: CandidateTrialInvocationPhase, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, carrier?: object): Promise<Awaited<TResult>> {
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(call.binding ? { binding: call.binding } : {}) };
  if (carrier && pinned.receiver !== carrier && !pinned.args.includes(carrier)) throw new Error("site_reset.policy_carrier_missing");
  if (AutomationStudioSiteResetObservation.of(invocation)) return await invokeAutomationStudioSiteResetCallback(invocation, pinned, undefined, carrier);
  const original = automationStudioSiteResetTrialContext(invocation);
  const previous = AutomationStudioSiteResetObservation.of(carrier);
  if (original) AutomationStudioSiteResetCallbackPolicies.manage(original.callbacks, pinned);
  let scope: AutomationStudioSiteResetObservation | undefined;
  try {
    return await observeCandidateTrialCallback(invocation, phase, pinned, parent => {
      if (original && carrier) scope = new AutomationStudioSiteResetObservation(carrier, { ...original, parent }, original.toolRequest ?? carrier, previous);
    });
  } finally { scope?.close(); }
}
