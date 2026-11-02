import type { ConfiguredExecutionSource, ExecutionObservationContext } from "../../../runtime/execution-admission/index.ts";
import type { AutomationExecutionObservation } from "./observation.ts";
import type { ManagedExecutionCallbackRegistration } from "../../../runtime/execution-observation/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../runtime/output-dispatch/admission/index.ts";

export interface AutomationExecutionAdmissionSource extends ConfiguredExecutionSource {
  forParent(parent: ExecutionObservationContext): AutomationExecutionObservation;
  forRun(parent: ExecutionObservationContext, originalProof: object, reader: OrdinaryExecutionRunBindingReader): AutomationExecutionObservation;
  manage<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void;
  flush(): Promise<void>;
}
