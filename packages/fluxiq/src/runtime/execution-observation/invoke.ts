import type { ExecutionCallbackCall, ExecutionCallbackObservation } from "./contracts/index.ts";
import { ExecutionObservationBindings } from "./bindings.ts";

/** Invokes exactly the pinned typed method, never an unrelated operation thunk. */
export async function invokeObservedExecutionCallback<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal): Promise<Awaited<TResult>> {
  const binding = call.binding;
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(binding ? { binding } : {}) };
  if (!observation) return await pinned.callback.apply(pinned.receiver, pinned.args);
  const source = ExecutionObservationBindings.read(observation).source;
  const prepared = await source.prepare(observation, pinned, signal);
  return await source.invoke(prepared, pinned);
}
