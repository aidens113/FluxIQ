import type { ExecutionCallbackCall, ExecutionCallbackObservation } from "../contracts/index.ts";
import { ExecutionObservationBindings } from "../bindings.ts";
import { ExecutionCallbackPolicies } from "../policies/index.ts";

/** An owning caller preserves sync timing and fences unsupported coverage in its actual frame. */
export function invokeOwnedExecutionCallbackSync<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
  const binding = call.binding;
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(binding ? { binding } : {}) };
  if (!observation) return pinned.callback.apply(pinned.receiver, pinned.args);
  const source = ExecutionObservationBindings.read(observation).source;
  ExecutionCallbackPolicies.manage(source, pinned);
  const supported = source.isReadOnly(pinned);
  const result = source.invokeSync(observation, pinned);
  if (!supported) source.markFrameUnknown(observation);
  return result;
}
