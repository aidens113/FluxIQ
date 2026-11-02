import type { ExecutionCallbackIdentity } from "../../../../../runtime/execution-observation/index.ts";
import { AutomationStudioLlmBindingOrigins } from "./origins.ts";

export function automationStudioLlmBindingFieldOrigin<TReceiver extends object, TArguments extends unknown[], TResult>(snapshot: TReceiver, field: PropertyKey, pinnedCallback: (this: TReceiver, ...args: TArguments) => TResult): ExecutionCallbackIdentity<TReceiver, TArguments, TResult> {
  return AutomationStudioLlmBindingOrigins.of(snapshot, field, pinnedCallback);
}
