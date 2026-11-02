import type { ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";
import type { PartialTrialReadOnlyOwner } from "./read-only-owner.ts";

export const partialTrialReadOnlyBindings = new WeakMap<object, {
  readonly owner: PartialTrialReadOnlyOwner;
  readonly callbacks: ExecutionObservationSource;
  readonly pin: PartialTrialReadOnlyOwner["pin"];
  readonly current: PartialTrialReadOnlyOwner["current"];
  readonly run: PartialTrialReadOnlyOwner["run"];
}>();
