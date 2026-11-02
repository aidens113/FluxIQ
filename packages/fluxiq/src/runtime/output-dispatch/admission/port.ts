import type { ConfiguredExecutionSource, ExecutionObservationContext } from "../../execution-admission/index.ts";
import type { ManagedExecutionCallbackRegistration, ExecutionRetrySeries } from "../../execution-observation/index.ts";
import type { OutputExecutionObservation } from "./observation.ts";
import type { OutputInvocationOrigin } from "./origin.ts";
import type { ObservedGatewayProvenanceReader } from "./gateway/index.ts";

export interface OutputExecutionAdmissionSource extends ConfiguredExecutionSource {
  forParent(parent: ExecutionObservationContext, origin?: OutputInvocationOrigin, retrySeries?: ExecutionRetrySeries): OutputExecutionObservation;
  readonly provenanceReader: ObservedGatewayProvenanceReader;
  markGatewayTarget(originalTarget: object, originalCallback: object): void;
  manage<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void;
  flush(): Promise<void>;
}
