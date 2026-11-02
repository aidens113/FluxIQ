import type { ExecutionObservationContext, ExecutionScope, ExecutionSourcePorts } from "../../execution-admission/index.ts";
import { ExecutionObservationSource, type ExecutionRetrySeries } from "../../execution-observation/index.ts";
import type { NativeManagedCompletionRegistration } from "./registration.ts";
import type { NativeExecutionAdmissionSource } from "./port.ts";
import { NativeAdmissionState } from "./state.ts";

/** Runtime identity pins its immutable, constructor-copied effective grants. */
export function createNativeExecutionAdmissionSource(scope: ExecutionScope, originalRuntime?: object, registrations: readonly NativeManagedCompletionRegistration[] = []): NativeExecutionAdmissionSource {
  const source = new ExecutionObservationSource(scope, "runtime.native");
  const state = new NativeAdmissionState(source, scope);
  if (originalRuntime) state.bindRuntime(originalRuntime, registrations);
  return Object.freeze({
    owner: source.owner,
    registration: (delegatesTo: readonly object[]) => source.registration(delegatesTo),
    connect: (ports: ExecutionSourcePorts) => source.connect(ports),
    forParent: (parent: ExecutionObservationContext, retrySeries?: ExecutionRetrySeries) => state.forParent(parent, retrySeries),
    bindRuntime: (runtime: object, contracts: readonly NativeManagedCompletionRegistration[] = []) => state.bindRuntime(runtime, contracts),
    flush: () => source.flush()
  });
}
