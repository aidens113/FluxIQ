import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { OutputObservationBindings } from "../../../../runtime/output-dispatch/admission/internal/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { AutomationAdmissionDriver } from "../internal/index.ts";
import { AutomationRetrySeries } from "./series.ts";
import { automationExecutionProperty } from "./callback/index.ts";

export async function invokeAutomationEffect(options: AutomationStudioGraphExecutionOptions, effect: Parameters<NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>>[0], context: Parameters<NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>>[1], attemptId: string, effectOrdinal: number) {
  const callback = automationExecutionProperty(options, options, "effectDispatcher");
  if (!callback) return undefined;
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return await callback.call(options, effect, context);
  const observed = AutomationObservationBindings.read(observation);
  const driver = observed.source;
  if (!(driver instanceof AutomationAdmissionDriver)) throw new Error("execution_observation.foreign_automation_source");
  const placed = context ?? {};
  const call = { receiver: options, callback, args: [effect, placed] as [typeof effect, typeof placed] };
  driver.ensurePure(call);
  const series = driver.series.forEffect(driver.series.forInvocation(AutomationRetrySeries.original(options)), effectOrdinal);
  driver.backends.begin(series);
  const prepared = await driver.callbacks.prepare(driver.callbackObservation(options), call, options.signal);
  driver.backends.entered(series, prepared);
  const output = driver.collaborators.output;
  const invocationId = options.invocation?.frame.invocationId;
  if (output && invocationId) OutputObservationBindings.bind(placed, output.forParent(driver.callbacks.context(prepared), {
    invocationId, attemptId, effectOrdinal,
    ...(placed.commandContext ? { commandContext: placed.commandContext } : {}),
    ...(observed.run ? { run: observed.run } : {})
  }, series));
  return await driver.callbacks.invoke(prepared, call);
}
