import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { candidateTrialInvocation } from "../../candidate-trials/authority/index.ts";
import { candidateTrialSuppressesWrites } from "../../candidate-trials/index.ts";
import { partialTrialContext } from "../../candidate-trials/partial/index.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "./policies.ts";
import { observeAutomationStudioTrialPolicy } from "./policy-call.ts";
import { automationStudioSiteResetTrialContext } from "./trial-context.ts";

/** Only the ongoing trial's post-result data callback may continue without another entry or any completion credit. */
export async function observeAutomationStudioTrialResultPolicy<TReceiver, TArguments extends unknown[], TResult>(invocation: object, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, carrier?: object): Promise<Awaited<TResult>> {
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(call.binding ? { binding: call.binding } : {}) };
  if (carrier && pinned.receiver !== carrier && !pinned.args.includes(carrier)) throw new Error("site_reset.policy_carrier_missing");
  if (candidateTrialSuppressesWrites(invocation)) throw new Error("candidate.trial_readonly_side_effect_phase");
  const enteredTrial = candidateTrialInvocation(invocation) !== undefined || partialTrialContext(invocation) !== undefined;
  const original = enteredTrial ? automationStudioSiteResetTrialContext(invocation) : undefined;
  if (original?.originalRoot) {
    AutomationStudioSiteResetCallbackPolicies.manage(original.callbacks, pinned);
    if (original.callbacks.isReadOnly(pinned)) return await original.callbacks.invokeReadOnly(pinned);
  }
  return await observeAutomationStudioTrialPolicy(invocation, "reset", pinned, carrier);
}
