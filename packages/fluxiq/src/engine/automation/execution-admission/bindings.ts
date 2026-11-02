import type { ExecutionObservationContext } from "../../../runtime/execution-admission/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationExecutionObservation } from "./observation.ts";
import type { AutomationExecutionAdmissionSource } from "./port.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../runtime/output-dispatch/admission/index.ts";
import type { PreparedExecutionCallback } from "../../../runtime/execution-observation/index.ts";

/** Private framework companions; options and implementation contexts gain no fields. */
export class AutomationObservationBindings {
  private static readonly observations = new WeakMap<object, { readonly source: AutomationExecutionAdmissionSource; readonly parent: ExecutionObservationContext; readonly run: { readonly proof: object; readonly reader: OrdinaryExecutionRunBindingReader } | undefined; readonly invocation: PreparedExecutionCallback | undefined }>();
  private static readonly options = new WeakMap<object, AutomationExecutionObservation>();

  static create(source: AutomationExecutionAdmissionSource, parent: ExecutionObservationContext, run?: { readonly proof: object; readonly reader: OrdinaryExecutionRunBindingReader }, invocation?: PreparedExecutionCallback): AutomationExecutionObservation {
    const observation = Object.freeze({}) as AutomationExecutionObservation;
    this.observations.set(observation, { source, parent, run, invocation });
    return observation;
  }

  static read(observation: AutomationExecutionObservation) {
    const state = this.observations.get(observation);
    if (!state) throw new Error("execution_observation.foreign_automation_binding");
    return state;
  }

  static bind(options: AutomationStudioGraphExecutionOptions, observation: AutomationExecutionObservation): void {
    this.read(observation);
    const existing = this.options.get(options);
    if (existing && existing !== observation) throw new Error("execution_observation.options_already_bound");
    this.options.set(options, observation);
  }

  static of(options: AutomationStudioGraphExecutionOptions): AutomationExecutionObservation | undefined {
    return this.options.get(options);
  }
}
