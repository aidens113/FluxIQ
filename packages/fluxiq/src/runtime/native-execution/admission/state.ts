import type { ExecutionObservationContext, ExecutionScope } from "../../execution-admission/index.ts";
import { ExecutionObservationSource, ExecutionRetrySeriesOwner, ExecutionBackendAttempts, type ExecutionRetrySeries } from "../../execution-observation/index.ts";
import type { NativeManagedCompletionRegistration } from "./registration.ts";
import type { NativeExecutionObservation } from "./observation.ts";
import { pinNativeExecutionCompletions } from "./pin.ts";

export class NativeAdmissionState {
  static readonly observations = new WeakMap<object, { readonly state: NativeAdmissionState; readonly parent: ExecutionObservationContext; readonly series: ExecutionRetrySeries }>();
  readonly managed = new WeakSet<object>();
  readonly registrations = new WeakMap<object, readonly NativeManagedCompletionRegistration[]>();
  readonly series: ExecutionRetrySeriesOwner;
  readonly backends: ExecutionBackendAttempts;
  constructor(readonly source: ExecutionObservationSource, scope: ExecutionScope) {
    this.series = new ExecutionRetrySeriesOwner(scope);
    this.backends = new ExecutionBackendAttempts(scope, source);
  }
  bindRuntime(runtime: object, registrations: readonly NativeManagedCompletionRegistration[]): void {
    if (this.registrations.has(runtime)) throw new Error("execution_observation.runtime_already_bound");
    this.registrations.set(runtime, pinNativeExecutionCompletions(registrations));
  }
  forParent(parent: ExecutionObservationContext, retrySeries?: ExecutionRetrySeries): NativeExecutionObservation {
    const observation = Object.freeze({}) as NativeExecutionObservation;
    NativeAdmissionState.observations.set(observation, { state: this, parent, series: retrySeries ?? this.series.forInvocation(observation) });
    return observation;
  }
}
