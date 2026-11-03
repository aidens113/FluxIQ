import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { originalNativeClockFunctions } from "../../../../framework/clock/native/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { markAutomationCallbackFrameUnknownSync } from "./callback/index.ts";
import { automationExecutionClock } from "./clock.ts";

/** A failed clock is fenced; diagnostic time never replaces the original action failure. */
export function automationFailureTimestamp(options: AutomationStudioGraphExecutionOptions): number {
  try {
    return automationExecutionClock(options, "now", options);
  } catch (error) {
    if (!AutomationObservationBindings.of(options)) throw error;
    markAutomationCallbackFrameUnknownSync(options);
    if (typeof originalNativeClockFunctions.now !== "function") throw error;
    const value: unknown = Reflect.apply(originalNativeClockFunctions.now, originalNativeClockFunctions.date, []);
    if (typeof value !== "number") throw error;
    return value;
  }
}
