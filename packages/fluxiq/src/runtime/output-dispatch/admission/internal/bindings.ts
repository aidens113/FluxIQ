import type { OutputExecutionObservation } from "../observation.ts";
import { OutputAdmissionState } from "./state.ts";

/** Framework companions; adapter requests never acquire capability fields. */
export class OutputObservationBindings {
  private static readonly values = new WeakMap<object, { readonly observation: OutputExecutionObservation; consumed: boolean }>();

  static bind(value: object, observation: OutputExecutionObservation): void {
    if (!OutputAdmissionState.observations.has(observation)) throw new Error("execution_observation.foreign_output_binding");
    const existing = this.values.get(value);
    if (existing && existing.observation !== observation) throw new Error("execution_observation.output_already_bound");
    if (!existing) this.values.set(value, { observation, consumed: false });
  }

  static of(value: object | undefined): OutputExecutionObservation | undefined {
    const binding = value ? this.values.get(value) : undefined;
    return binding && !binding.consumed ? binding.observation : undefined;
  }

  static take(value: object | undefined): OutputExecutionObservation | undefined {
    const binding = value ? this.values.get(value) : undefined;
    if (binding) binding.consumed = true;
    // A reused framework request stays observed; consumption cannot downgrade it to legacy.
    return binding?.observation;
  }
}
