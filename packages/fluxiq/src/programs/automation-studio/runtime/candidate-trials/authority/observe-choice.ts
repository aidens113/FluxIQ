import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { invokeExecutionCallbackRoot } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioCandidateTrialSource } from "./configured-source.ts";
import { candidateTrialInvocations } from "./invocations.ts";
import { candidateTrialAuthority } from "./of.ts";
import { bindPartialTrialContext, observePartialTrialCallback, partialTrialContext } from "../partial/index.ts";
import type { ExecutionObservationContext } from "../../../../../runtime/execution-admission/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/policies/index.ts";

/** A public live-or-cache choice is an unknown actual callback, never a readonly credential. */
export async function observeCandidateTrialChoice<TReceiver, TArguments extends unknown[], TResult>(source: AutomationStudioCandidateTrialSource | undefined, input: object, operationKey: string, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal: AbortSignal): Promise<Awaited<TResult>> {
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(call.binding ? { binding: call.binding } : {}) };
  const bound = candidateTrialInvocations.get(input);
  const authority = bound ? candidateTrialAuthority(bound.modeOwner.port) : undefined;
  if (bound && authority) {
    const context = authority.callbackObservation(bound.checkout);
    if (context) ExecutionCallbackPolicies.manage(context.callbacks, pinned);
    return await authority.invoke(bound.checkout, "prepare", pinned);
  }
  const parent = partialTrialContext(input);
  if (parent) {
    if (source && source.callbacks !== parent.callbacks) throw new Error("candidate.trial_observation_source_mismatch");
    ExecutionCallbackPolicies.manage(parent.callbacks, pinned);
    return await observePartialTrialCallback(input, pinned, signal, input);
  }
  if (!source) return await pinned.callback.apply(pinned.receiver, pinned.args);
  const callbacks = source.callbacks;
  ExecutionCallbackPolicies.manage(callbacks, pinned);
  const managed = callbacks.isManaged(pinned);
  const prepareTools = source.prepareToolParent.bind(source);
  const toolObserver = source.toolObserver;
  let originalChild: ExecutionObservationContext | undefined;
  const { origin, record } = source.original(operationKey);
  const completionDigest = record.invocationId;
  if (!completionDigest) throw new Error("candidate.trial_origin_invalid");
  return await invokeExecutionCallbackRoot({
    callbacks,
    reserve: originalSignal => source.reserve(origin, originalSignal ?? signal),
    finish: root => source.finish(root, origin, completionDigest),
    unverified: async root => {
      if (!managed) {
        if (!originalChild) throw new Error("candidate.trial_choice_child_missing");
        callbacks.markFrameUnknown(callbacks.forParent(originalChild));
        await callbacks.flush();
      }
      await source.unverified(root, origin, completionDigest);
    },
    interrupted: (root, reason) => source.connected().producer.interrupted(root, reason),
    release: reservation => source.consumer.release(reservation),
    prepared: async (parent, originalRoot) => {
      originalChild = parent;
      await prepareTools(input, parent, originalRoot);
      bindPartialTrialContext(input, { parent, callbacks, automation: source.automation, originalRoot, toolObserver, toolRequest: input, prepareToolParent: prepareTools });
    }
  }, pinned, signal);
}
