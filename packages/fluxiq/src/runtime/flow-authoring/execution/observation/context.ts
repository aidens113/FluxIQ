import type { ExecutionEntry, ExecutionObservationContext } from "../../../execution-admission/index.ts";
import type { ExecutionObservationSource } from "../../../execution-observation/index.ts";
import type { AutomationExecutionAdmissionSource } from "../../../../engine/automation/execution-admission/index.ts";
import type { AuthoringExecutionToolPort } from "./tool-port.ts";

/** An original admitted invocation, never a newly inferred grant or scope. */
export interface AuthoringExecutionContext {
  readonly parent: ExecutionObservationContext;
  readonly callbacks: ExecutionObservationSource;
  readonly automation: AutomationExecutionAdmissionSource | undefined;
  readonly originalRoot?: ExecutionEntry | undefined;
  readonly toolObserver?: AuthoringExecutionToolPort | undefined;
  readonly toolRequest?: object | undefined;
  readonly prepareToolParent?: ((request: object, parent: ExecutionObservationContext, originalRoot: ExecutionEntry) => Promise<void>) | undefined;
}
