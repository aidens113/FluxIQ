import type { AutomationStudioSubflowTrialRequest } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { partialTrialReadOnlyBindings } from "./read-only-bindings.ts";
import type { ExecutionCallbackCall, ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";

/** An exact retained lease; losing it can never select a live invocation. */
export class PartialTrialReadOnlyCheckout {
  private static readonly frames = new WeakMap<ExecutionObservationSource, { receiver: unknown; callback: object; binding: object }[]>();
  private used = false;
  private readonly key;

  private constructor(readonly binding: NonNullable<ReturnType<typeof partialTrialReadOnlyBindings.get>>, private readonly lease: object, request: AutomationStudioSubflowTrialRequest) {
    this.key = JSON.stringify([request.scope, request.proposal]);
  }

  static pin(target: object, request: AutomationStudioSubflowTrialRequest): PartialTrialReadOnlyCheckout | undefined {
    const binding = partialTrialReadOnlyBindings.get(target);
    if (!binding) return undefined;
    if (binding.owner.pin !== binding.pin || binding.owner.current !== binding.current || binding.owner.run !== binding.run) throw new Error("subflow.trial_readonly_owner_changed");
    const lease = binding.callbacks.invokeReadOnlySync({ receiver: binding.owner, callback: binding.pin, args: [request] }, request.signal);
    if (!lease) throw new Error("subflow.trial_readonly_unavailable");
    const checkout = new PartialTrialReadOnlyCheckout(binding, lease, request);
    checkout.assert(request);
    return checkout;
  }

  private assert(request: AutomationStudioSubflowTrialRequest): void {
    const { owner, callbacks, pin, current, run } = this.binding;
    if (owner.pin !== pin || owner.current !== current || owner.run !== run || this.key !== JSON.stringify([request.scope, request.proposal]) || !callbacks.invokeReadOnlySync({ receiver: owner, callback: current, args: [this.lease, request] }, request.signal)) throw new Error("subflow.trial_readonly_checkout_lost");
  }

  async invoke(request: AutomationStudioSubflowTrialRequest) {
    if (this.used) throw new Error("subflow.trial_readonly_checkout_spent");
    this.assert(request);
    this.used = true;
    const { owner, callbacks, run } = this.binding;
    const result = await callbacks.invokeReadOnly({ receiver: owner, callback: run, args: [this.lease, request] }, request.signal);
    this.assert(request);
    return result;
  }

  async invokeFrame<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal: AbortSignal): Promise<Awaited<TResult>> {
    const { callbacks } = this.binding;
    const identity = { receiver: call.receiver, callback: call.callback, binding: this.lease };
    const known = PartialTrialReadOnlyCheckout.frames.get(callbacks) ?? [];
    if (!known.some(row => row.receiver === identity.receiver && row.callback === identity.callback && row.binding === identity.binding)) {
      callbacks.manage({ ...identity, contract: "no_direct_effects" });
      known.push(identity);
      PartialTrialReadOnlyCheckout.frames.set(callbacks, known);
    }
    return await callbacks.invokeReadOnly({ ...identity, args: call.args }, signal);
  }
}
