import type { ExecutionCallbackCall, ExecutionCallbackObservation } from "../contracts/index.ts";
import { OwnedExecutionCallback } from "./invocation.ts";

/** Pins the original call before awaiting admission; the argument objects keep their identities. */
export async function prepareObservedExecutionCallback<TReceiver, TArguments extends unknown[], TResult>(observation: ExecutionCallbackObservation | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal): Promise<OwnedExecutionCallback<TReceiver, TArguments, TResult>> {
  return await OwnedExecutionCallback.prepare(observation, call, signal);
}
