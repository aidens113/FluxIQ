import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioBuildToolCallbackContexts } from "./callback-context.ts";
import { AutomationStudioBuildToolRequests } from "./request.ts";
import { invokeAutomationStudioBuildToolCallback } from "./invoke.ts";

/** A supplied callback is observed by its original identity before it can do IO. */
export async function invokeAutomationStudioBuildToolDelegate<TReceiver, TArguments extends unknown[], TResult>(originalCoreAnchor: object, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal): Promise<Awaited<TResult>> {
  const binding = call.binding;
  const pinned = { receiver: call.receiver, callback: call.callback, args: [...call.args] as TArguments, ...(binding ? { binding } : {}) };
  const request = AutomationStudioBuildToolRequests.of(originalCoreAnchor) ? originalCoreAnchor : AutomationStudioBuildToolCallbackContexts.request(originalCoreAnchor);
  if (request && AutomationStudioBuildToolRequests.of(request)) return await invokeAutomationStudioBuildToolCallback(request, pinned, signal);
  return await pinned.callback.apply(pinned.receiver, pinned.args);
}
