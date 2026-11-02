import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import { NativeInvocationResults } from "./results.ts";

export function bindObservedNativeResult<T extends object>(execution: Promise<AutomationNodeExecutionResult>, result: T): T {
  return NativeInvocationResults.bind(execution, result);
}
