import type { AutomationStudioGraphExecutionOptions } from "../../../contracts/index.ts";
import { ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";
import { AutomationObservationBindings } from "../../bindings.ts";

/** Checks the original entered caller without probing by running a callback. */
export function hasAutomationCallbackFrame(options: AutomationStudioGraphExecutionOptions): boolean {
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return false;
  const state = AutomationObservationBindings.read(observation);
  const source = state.source.owner;
  if (!(source instanceof ExecutionObservationSource)) throw new Error("execution_observation.foreign_automation_source");
  return source.hasFrame(source.forParent(state.parent));
}
