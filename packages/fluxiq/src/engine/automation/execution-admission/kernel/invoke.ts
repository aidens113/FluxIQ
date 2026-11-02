import type { ExecutionCallbackCall } from "../../../../runtime/execution-observation/index.ts";
import type { PreparedAutomationFrame } from "./frame.ts";

export function invokeAutomationFrame<TReceiver, TArguments extends unknown[], TResult>(frame: PreparedAutomationFrame, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
  return frame.driver.callbacks.invoke(frame.invocation, { ...call, binding: frame.binding });
}
