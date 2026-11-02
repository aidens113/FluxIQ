import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioBuildToolAuxiliaryCalls } from "./auxiliary-calls.ts";

/** Each actual internal call owns its private invocation; a retry reuses the original handle. */
export async function invokeAutomationStudioBuildToolAuxiliary<TReceiver, TArguments extends unknown[], TResult>(originalCoreAnchor: object, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, signal?: AbortSignal): Promise<Awaited<TResult>> {
  const invocation = AutomationStudioBuildToolAuxiliaryCalls.create(originalCoreAnchor);
  return await AutomationStudioBuildToolAuxiliaryCalls.invoke(invocation, call, signal);
}
