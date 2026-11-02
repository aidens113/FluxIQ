import type { ExecutionCallbackCall } from "../../../execution-observation/index.ts";
import type { AuthoringExecutionToolPort } from "./tool-port.ts";
import { AuthoringExecutionScope } from "./scope.ts";
import { invokeAuthoringExecutionCallback } from "./invoke.ts";

/** Raw host calls keep their unchanged tuple and use the same real tool observer. */
export async function invokeAuthoringExecutionProducer<TReceiver, TArguments extends unknown[], TResult>(invocation: object | undefined, configured: AuthoringExecutionToolPort | undefined, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, request: object, signal?: AbortSignal): Promise<Awaited<TResult>> {
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(call.binding ? { binding: call.binding } : {}) };
  const original = AuthoringExecutionScope.of(invocation);
  if (configured && original?.context.toolObserver && configured !== original.context.toolObserver) throw new Error("site_reset.tool_observer_changed");
  const observer = original?.context.toolObserver ?? configured;
  if (!observer) return await invokeAuthoringExecutionCallback(invocation, pinned, signal);
  const bindParent = observer.bindParent;
  const invoke: (actualCall: ExecutionCallbackCall<TReceiver, TArguments, TResult>, actualRequest: object, actualSignal?: AbortSignal) => Promise<Awaited<TResult>> = observer.invoke;
  if (original) bindParent.call(observer, request, original.context.parent, original.options);
  return await invoke.call(observer, pinned, request, signal);
}
