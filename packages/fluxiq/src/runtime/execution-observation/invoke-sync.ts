import type { ExecutionCallbackCall, ExecutionCallbackObservation } from "./contracts/index.ts";
import { ExecutionObservationBindings } from "./bindings.ts";

export function invokeObservedExecutionCallbackSync<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
  if (!observation) return call.callback.apply(call.receiver, call.args);
  return ExecutionObservationBindings.read(observation).source.invokeSync(observation, call);
}
