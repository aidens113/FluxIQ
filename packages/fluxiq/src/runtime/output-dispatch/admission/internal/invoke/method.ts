import type { ExecutionCallbackCall } from "../../../../execution-observation/index.ts";
import type { OutputExecutionObservation } from "../../observation.ts";
import { OutputObservationBindings } from "../bindings.ts";
import { prepareOutputInvocation } from "../prepare.ts";
import { outputInvocationChild } from "../child.ts";
import { invokeOutputInvocation } from "./invocation.ts";
import { OutputOrchestrationCallbacks } from "../callbacks.ts";

export async function invokeObservedOutputMethod<TReceiver, TArguments extends unknown[], TResult>(observation: OutputExecutionObservation | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal, companion?: object): Promise<Awaited<TResult>> {
  const receiver = call.receiver;
  const callback = call.callback;
  const args = [...call.args] as TArguments;
  const pinned = { receiver, callback, args, ...(call.binding ? { binding: call.binding } : {}) };
  if (!observation) return await callback.apply(receiver, args);
  const invocation = await prepareOutputInvocation(observation, pinned, signal);
  if (companion && OutputOrchestrationCallbacks.has(receiver, callback)) OutputObservationBindings.bind(companion, outputInvocationChild(invocation));
  return await invokeOutputInvocation(invocation, pinned);
}
