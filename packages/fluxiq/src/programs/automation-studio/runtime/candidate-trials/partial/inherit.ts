import { inheritTrialExecutionObservation, inheritTrialExecutionSource } from "../observation/index.ts";
import { bindPartialTrialContext } from "./bind.ts";
import { partialTrialContext } from "./of.ts";
import { partialTrialReadOnlyBindings } from "./read-only-bindings.ts";

/** Explicit copies forward only the original private companions. */
export function inheritPartialTrialContext(source: object, target: object): void {
  inheritTrialExecutionSource(source, target);
  inheritTrialExecutionObservation(source, target);
  const original = partialTrialContext(source);
  if (original) bindPartialTrialContext(target, original);
  const readOnly = partialTrialReadOnlyBindings.get(source);
  if (readOnly) {
    const prior = partialTrialReadOnlyBindings.get(target);
    if (prior && prior !== readOnly) throw new Error("subflow.trial_readonly_rebound");
    partialTrialReadOnlyBindings.set(target, readOnly);
  }
}
