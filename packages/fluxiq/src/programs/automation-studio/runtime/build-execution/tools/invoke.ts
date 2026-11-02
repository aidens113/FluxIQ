import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioBuildToolRequests } from "./request.ts";

/** The unadapted path retains its original return; observed calls enter before invocation. */
export function invokeAutomationStudioBuildToolCallback<TReceiver, TArguments extends unknown[], TResult>(
  request: object,
  call: ExecutionCallbackCall<TReceiver, TArguments, TResult>,
  signal?: AbortSignal
): TResult | Promise<Awaited<TResult>> {
  const original = AutomationStudioBuildToolRequests.of(request);
  if (!original) return call.callback.apply(call.receiver, call.args);
  return original.observer.invokeCallback(request, call, signal);
}
