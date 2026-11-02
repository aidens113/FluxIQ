import type { ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";
import type { PartialTrialReadOnlyOwner } from "./read-only-owner.ts";
import { partialTrialReadOnlyBindings } from "./read-only-bindings.ts";

const owners = new WeakMap<ExecutionObservationSource, WeakMap<PartialTrialReadOnlyOwner, NonNullable<ReturnType<typeof partialTrialReadOnlyBindings.get>>>>();

/** Binding grants no callback contract. The actual owner must separately register its exact pure methods. */
export function bindPartialTrialReadOnly(target: object, callbacks: ExecutionObservationSource, owner: PartialTrialReadOnlyOwner): void {
  const prior = partialTrialReadOnlyBindings.get(target);
  if (prior) {
    if (prior.owner !== owner || prior.callbacks !== callbacks || prior.pin !== owner.pin || prior.current !== owner.current || prior.run !== owner.run) throw new Error("subflow.trial_readonly_rebound");
    return;
  }
  const { pin, current, run } = owner;
  const known = owners.get(callbacks) ?? new WeakMap();
  const original = known.get(owner);
  if (original) {
    if (original.pin !== pin || original.current !== current || original.run !== run) throw new Error("subflow.trial_readonly_owner_changed");
    partialTrialReadOnlyBindings.set(target, original);
    return;
  }
  const binding = { owner, callbacks, pin, current, run };
  known.set(owner, binding);
  owners.set(callbacks, known);
  partialTrialReadOnlyBindings.set(target, binding);
}
