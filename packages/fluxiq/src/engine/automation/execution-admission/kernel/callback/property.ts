import type { AutomationStudioGraphExecutionOptions } from "../../../contracts/index.ts";
import { AutomationObservationBindings } from "../../bindings.ts";
import { automationDataProperty } from "../../options/index.ts";
import { markAutomationCallbackFrameUnknownSync } from "./unknown-sync.ts";
import { assertAutomationClockCallback } from "./clock.ts";

/** An observed read cannot evaluate a newly installed getter before callback admission. */
export function automationExecutionProperty<T extends object, K extends keyof T>(options: AutomationStudioGraphExecutionOptions, receiver: T, key: K): T[K] {
  if (!AutomationObservationBindings.of(options)) return receiver[key];
  try {
    const value = automationDataProperty(receiver, key);
    assertAutomationClockCallback(options, value);
    return value;
  } catch (error) {
    markAutomationCallbackFrameUnknownSync(options);
    throw error;
  }
}
