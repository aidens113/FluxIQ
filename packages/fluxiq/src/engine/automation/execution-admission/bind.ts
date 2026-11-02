import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import { AutomationObservationBindings } from "./bindings.ts";
import type { AutomationExecutionObservation } from "./observation.ts";

export function bindAutomationExecutionObservation(options: AutomationStudioGraphExecutionOptions, observation: AutomationExecutionObservation): void {
  AutomationObservationBindings.bind(options, observation);
}
