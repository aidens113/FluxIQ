import type { ExecutionCallbackIdentity, ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";

const registrations = new WeakMap<ExecutionObservationSource, { receiver: unknown; callback: object; binding: object | undefined; requiredDescendantOwner: object | undefined }[]>();

/** Only canonical orchestration frames use this; actual children must close independently. */
export function managePartialTrialFrame<TReceiver, TArguments extends unknown[], TResult>(callbacks: ExecutionObservationSource, identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>, requiredDescendantOwner?: object): void {
  const known = registrations.get(callbacks) ?? [];
  const prior = known.find(row => row.receiver === identity.receiver && row.callback === identity.callback && row.binding === identity.binding);
  if (prior) {
    if (prior.requiredDescendantOwner !== requiredDescendantOwner) throw new Error("subflow.trial_frame_owner_changed");
    return;
  }
  callbacks.manage({ ...identity, contract: "managed_direct_effects", consumeCompletion: ({ invocation }) => callbacks.frameCompletion(invocation, requiredDescendantOwner) });
  known.push({ receiver: identity.receiver, callback: identity.callback, binding: identity.binding, requiredDescendantOwner });
  registrations.set(callbacks, known);
}
