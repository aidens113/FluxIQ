import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { NativeClock } from "../../../../framework/clock/native/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";
import { automationExecutionProperty, markAutomationCallbackFrameUnknownSync } from "./callback/index.ts";

/** Preserve custom clocks and refuse mutable native delegates in an observed frame. */
export function automationExecutionClock(options: AutomationStudioGraphExecutionOptions, operation: "now" | "random", receiver: unknown): number {
  const callback = automationExecutionProperty(options, options, operation);
  const value = callback?.call(receiver);
  if (value !== undefined && value !== null) return value;
  if (!AutomationObservationBindings.of(options)) return operation === "now" ? Date.now() : Math.random();
  try {
    return operation === "now" ? NativeClock.now() : NativeClock.random();
  } catch (error) {
    markAutomationCallbackFrameUnknownSync(options);
    throw error;
  }
}
