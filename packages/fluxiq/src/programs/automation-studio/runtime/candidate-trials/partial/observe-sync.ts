import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { partialTrialContext } from "./of.ts";

/** Synchronous policy calls keep their original return timing and method receiver. */
export function observePartialTrialSync<TReceiver, TArguments extends unknown[], TResult>(input: object, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult {
  const original = partialTrialContext(input);
  return original ? original.callbacks.invokeSync(original.callbacks.forParent(original.parent), call) : call.callback.apply(call.receiver, call.args);
}
