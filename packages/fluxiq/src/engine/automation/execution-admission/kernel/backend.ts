import type { ExecutionCallbackCall } from "../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { AutomationAdmissionDriver } from "../internal/index.ts";
import { AutomationRetrySeries } from "./series.ts";

/** Outside-graph attempts share this one actual invocation's private series. */
export async function invokeAutomationBackend<TReceiver, TArguments extends unknown[], TResult>(options: AutomationStudioGraphExecutionOptions, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
  const callback = call.callback;
  const receiver = call.receiver;
  const args = [...call.args] as TArguments;
  const pinned = { receiver, callback, args, ...(call.binding ? { binding: call.binding } : {}) };
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return await callback.apply(receiver, args);
  const driver = AutomationObservationBindings.read(observation).source;
  if (!(driver instanceof AutomationAdmissionDriver)) throw new Error("execution_observation.foreign_automation_source");
  driver.ensurePure(pinned);
  const series = driver.series.forInvocation(AutomationRetrySeries.original(options));
  driver.backends.begin(series);
  const invocation = await driver.callbacks.prepare(driver.callbackObservation(options), pinned, options.signal);
  driver.backends.entered(series, invocation);
  return await driver.callbacks.invoke(invocation, pinned);
}
