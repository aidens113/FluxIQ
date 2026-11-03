import type { AutomationExecutionObservation } from "../../observation.ts";
import { AutomationObservationBindings } from "../../bindings.ts";
import { AutomationAdmissionDriver } from "../../internal/index.ts";

/** Converts only an original engine binding; no parent/source/context is copied. */
export function automationCallbackFromObservation(observation: AutomationExecutionObservation | undefined, required = false) {
  if (!observation) {
    if (required) throw new Error("execution_observation.required_environment_observation_missing");
    return undefined;
  }
  const state = AutomationObservationBindings.read(observation);
  if (!(state.source instanceof AutomationAdmissionDriver)) throw new Error("execution_observation.foreign_automation_source");
  return state.source.callbacks.forParent(state.parent);
}
