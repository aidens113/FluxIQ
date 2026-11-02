import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { AutomationObservationBindings } from "../bindings.ts";

export function hasAutomationExecutionObservation(options: AutomationStudioGraphExecutionOptions): boolean {
  return AutomationObservationBindings.of(options) !== undefined;
}
