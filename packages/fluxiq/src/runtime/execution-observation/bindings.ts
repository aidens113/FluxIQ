import type { ExecutionObservationContext } from "../execution-admission/index.ts";
import type { ExecutionCallbackObservation } from "./contracts/index.ts";
import type { ExecutionObservationSource } from "./source.ts";

export class ExecutionObservationBindings {
  private static readonly states = new WeakMap<object, { readonly source: ExecutionObservationSource; readonly parent: ExecutionObservationContext }>();
  static create(source: ExecutionObservationSource, parent: ExecutionObservationContext): ExecutionCallbackObservation {
    const observation = Object.freeze({}) as ExecutionCallbackObservation;
    this.states.set(observation, { source, parent: Object.freeze({ reservation: parent.reservation, parent: parent.parent }) });
    return observation;
  }
  static read(observation: ExecutionCallbackObservation) {
    const state = this.states.get(observation);
    if (!state) throw new Error("execution_observation.foreign_binding");
    return state;
  }
}
