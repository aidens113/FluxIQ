import type { ConfiguredExecutionSource, ExecutionObservationContext } from "../../execution-admission/index.ts";
import type { NativeExecutionObservation } from "./observation.ts";
import type { NativeManagedCompletionRegistration } from "./registration.ts";
import type { ExecutionRetrySeries } from "../../execution-observation/index.ts";

export interface NativeExecutionAdmissionSource extends ConfiguredExecutionSource {
  forParent(parent: ExecutionObservationContext, retrySeries?: ExecutionRetrySeries): NativeExecutionObservation;
  bindRuntime(originalRuntime: object, registrations?: readonly NativeManagedCompletionRegistration[]): void;
  flush(): Promise<void>;
}
