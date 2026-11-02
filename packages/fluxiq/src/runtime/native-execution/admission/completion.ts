import type { ExecutionObservationContext } from "../../execution-admission/index.ts";
import type { ExecutionCallbackCompletionState } from "../../execution-observation/index.ts";
import { NativeInvocationResults } from "./results.ts";

export function observedNativeResultCompletion(result: object, parent: ExecutionObservationContext): ExecutionCallbackCompletionState | undefined {
  return NativeInvocationResults.read(result, parent);
}
