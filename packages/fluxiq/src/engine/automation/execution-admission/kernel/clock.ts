import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { NativeClock, originalNativeClockFunctions } from "../../../../framework/clock/native/index.ts";
import { automationStudioLiveRunEnvironment } from "../../../../runtime/environment/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { automationExecutionProperty, markAutomationCallbackFrameUnknownSync, hasAutomationCallbackFrame, invokeAutomationCallbackSync } from "./callback/index.ts";

/** Preserve custom clocks and refuse mutable native delegates in an observed frame. */
export function automationExecutionClock(options: AutomationStudioGraphExecutionOptions, operation: "now" | "random", receiver: unknown): number {
  const observed = AutomationObservationBindings.of(options) !== undefined;
  if (observed && !hasAutomationCallbackFrame(options)) throw new Error("execution_observation.durable_frame_missing");
  const callback = automationExecutionProperty(options, options, operation);
  let value: number | undefined;
  try {
    const native = callback === originalNativeClockFunctions[operation] || callback === automationStudioLiveRunEnvironment[operation];
    value = callback && (observed && !native
      ? invokeAutomationCallbackSync(options, { receiver, callback, args: [] })
      : callback.call(receiver));
  } catch (error) {
    if (observed) markAutomationCallbackFrameUnknownSync(options);
    throw error;
  }
  if (value !== undefined && value !== null) return value;
  if (!observed) return operation === "now" ? Date.now() : Math.random();
  try {
    return operation === "now" ? NativeClock.now() : NativeClock.random();
  } catch (error) {
    markAutomationCallbackFrameUnknownSync(options);
    throw error;
  }
}
