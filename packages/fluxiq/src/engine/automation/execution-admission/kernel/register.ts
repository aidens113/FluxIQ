import type { AutomationExecutionKernel } from "./handle.ts";
import { AutomationKernelState } from "./state.ts";

export function registerAutomationExecutionKernel<TReceiver, TArguments extends unknown[], TResult>(receiver: TReceiver, callback: (this: TReceiver, ...args: TArguments) => TResult, kind: "graph" | "attempt" | "children"): AutomationExecutionKernel {
  return AutomationKernelState.create(receiver, callback, kind);
}
