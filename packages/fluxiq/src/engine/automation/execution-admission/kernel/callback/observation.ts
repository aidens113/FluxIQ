import type { AutomationStudioGraphExecutionOptions } from "../../../contracts/index.ts";
import { AutomationObservationBindings } from "../../bindings.ts";
import { AutomationAdmissionDriver } from "../../internal/index.ts";

export function automationCallbackObservation(options: AutomationStudioGraphExecutionOptions) {
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return undefined;
  const driver = AutomationObservationBindings.read(observation).source;
  if (!(driver instanceof AutomationAdmissionDriver)) throw new Error("execution_observation.foreign_automation_source");
  return driver.callbackObservation(options);
}
