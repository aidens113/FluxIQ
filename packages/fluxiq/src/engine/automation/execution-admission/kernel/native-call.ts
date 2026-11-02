import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { AutomationAdmissionDriver } from "../internal/index.ts";
import { AutomationNativeObservationBindings } from "./native-bindings.ts";
import { AutomationRetrySeries } from "./series.ts";

export async function invokeAutomationNative(options: AutomationStudioGraphExecutionOptions, request: Parameters<NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>>[0]) {
  const callback = options.nativeNodeExecutor;
  if (!callback) return undefined;
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return await callback.call(options, request);
  const driver = AutomationObservationBindings.read(observation).source;
  if (!(driver instanceof AutomationAdmissionDriver)) throw new Error("execution_observation.foreign_automation_source");
  const call = { receiver: options, callback, args: [request] as [typeof request] };
  driver.ensurePure(call);
  const series = driver.series.forInvocation(AutomationRetrySeries.original(options));
  driver.backends.begin(series);
  const prepared = await driver.callbacks.prepare(driver.callbackObservation(options), call, options.signal);
  driver.backends.entered(series, prepared);
  const native = driver.collaborators.native;
  if (native) AutomationNativeObservationBindings.bind(request, native.forParent(driver.callbacks.context(prepared), series));
  return await driver.callbacks.invoke(prepared, call);
}
