import type { ExecutionObservationContext } from "../execution-admission/index.ts";
import type { ExecutionCallbackObservation, PreparedExecutionCallback } from "./contracts/index.ts";
import type { ExecutionObservationSource } from "./source.ts";

type Observation = { readonly kind: "observation"; readonly source: ExecutionObservationSource; readonly parent: ExecutionObservationContext };
type Carrier = {
  readonly kind: "carrier";
  readonly owner: object;
  readonly observation: ExecutionCallbackObservation;
  readonly source: ExecutionObservationSource;
  readonly prepared: PreparedExecutionCallback;
  readonly receiver: unknown;
  readonly callback: object;
  readonly previous: Carrier | undefined;
  active: boolean;
  retired: boolean;
};

export class ExecutionObservationBindings {
  private static readonly states = new WeakMap<object, Observation | Carrier>();
  static create(source: ExecutionObservationSource, parent: ExecutionObservationContext): ExecutionCallbackObservation {
    const observation = Object.freeze({}) as ExecutionCallbackObservation;
    this.states.set(observation, { kind: "observation", source, parent: Object.freeze({ reservation: parent.reservation, parent: parent.parent }) });
    return observation;
  }
  static read(observation: ExecutionCallbackObservation) {
    const state = this.states.get(observation);
    if (!state || state.kind !== "observation") throw new Error("execution_observation.foreign_binding");
    return state;
  }

  static isFrom(observation: ExecutionCallbackObservation | undefined, source: ExecutionObservationSource): boolean {
    const state = observation && this.states.get(observation);
    return state?.kind === "observation" && state.source === source;
  }

  static bindCarrier(carrier: object, owner: object, source: ExecutionObservationSource, prepared: PreparedExecutionCallback, observation: ExecutionCallbackObservation, parent: ExecutionCallbackObservation, receiver: unknown, callback: object): void {
    const earlier = this.states.get(carrier);
    if (earlier) {
      if (earlier.kind !== "carrier" || !earlier.active || earlier.retired || earlier.source !== source || source.completion(earlier.prepared) !== "pending") throw new Error("execution_observation.carrier_reused");
      const actualParent = this.read(parent);
      const expected = source.context(earlier.prepared);
      if (actualParent.source !== source || actualParent.parent.reservation !== expected.reservation || actualParent.parent.parent !== expected.parent) throw new Error("execution_observation.carrier_parent_mismatch");
    }
    const actual = this.read(observation);
    const expected = source.context(prepared);
    if (actual.source !== source || actual.parent.reservation !== expected.reservation || actual.parent.parent !== expected.parent) throw new Error("execution_observation.carrier_child_mismatch");
    this.states.set(carrier, { kind: "carrier", owner, source, prepared, observation, receiver, callback, previous: earlier?.kind === "carrier" ? earlier : undefined, active: false, retired: false });
  }

  static activateCarrier(carrier: object, owner: object): void {
    const state = this.carrier(carrier, owner);
    if (state.active || state.retired || state.source.completion(state.prepared) !== "pending") throw new Error("execution_observation.carrier_inactive");
    state.active = true;
  }

  static retireCarrier(carrier: object, owner: object): void {
    const state = this.carrier(carrier, owner);
    state.active = false;
    state.retired = true;
    if (state.previous) this.states.set(carrier, state.previous);
  }

  static readCarrier(carrier: object, receiver: unknown, callback: object): ExecutionCallbackObservation | undefined {
    const state = this.states.get(carrier);
    if (!state) return undefined;
    if (state.kind !== "carrier" || state.receiver !== receiver || state.callback !== callback) throw new Error("execution_observation.carrier_foreign_call");
    if (!state.active || state.retired || state.source.completion(state.prepared) !== "pending") throw new Error("execution_observation.carrier_inactive");
    return state.observation;
  }

  private static carrier(carrier: object, owner: object): Carrier {
    const state = this.states.get(carrier);
    if (!state || state.kind !== "carrier" || state.owner !== owner) throw new Error("execution_observation.carrier_owner_mismatch");
    return state;
  }
}
