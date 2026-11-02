import type { ExecutionEntry, ExecutionObservationContext } from "../../../execution-admission/index.ts";
import type { ExecutionCallbackCall } from "../../../execution-observation/index.ts";

/** The original configured observer forwards an admitted parent without exposing an implementation context. */
export interface AuthoringExecutionToolPort {
  prepareParent(request: object, parent: ExecutionObservationContext, originalRoot: ExecutionEntry): Promise<void>;
  bindParent(request: object, parent: ExecutionObservationContext, inheritedRequest?: object): void;
  invoke<TReceiver, TArguments extends unknown[], TResult>(call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, originalRequest: object, signal?: AbortSignal): Promise<Awaited<TResult>>;
}
