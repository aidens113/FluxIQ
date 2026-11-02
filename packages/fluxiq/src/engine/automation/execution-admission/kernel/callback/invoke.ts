import type { ExecutionCallbackCall } from "../../../../../runtime/execution-observation/index.ts";
import { invokeObservedExecutionCallback } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../contracts/index.ts";
import { AutomationObservationBindings } from "../../bindings.ts";
import { AutomationAdmissionDriver } from "../../internal/index.ts";

export async function invokeAutomationCallback<TReceiver, TArguments extends unknown[], TResult>(options: AutomationStudioGraphExecutionOptions, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return await call.callback.apply(call.receiver, call.args);
  const driver = AutomationObservationBindings.read(observation).source;
  if (!(driver instanceof AutomationAdmissionDriver)) throw new Error("execution_observation.foreign_automation_source");
  driver.ensurePure(call);
  return await invokeObservedExecutionCallback(driver.callbackObservation(options), call, options.signal);
}
