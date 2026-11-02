import type { ExecutionObservationContext } from "../../../runtime/execution-admission/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import { AutomationObservationBindings } from "./bindings.ts";
import { AutomationRetrySeries } from "./kernel/series.ts";

export function inheritAutomationExecutionObservation(source: AutomationStudioGraphExecutionOptions, target: AutomationStudioGraphExecutionOptions, parent?: ExecutionObservationContext): void {
  AutomationRetrySeries.inherit(source, target);
  const observation = AutomationObservationBindings.of(source);
  if (!observation) return;
  const state = AutomationObservationBindings.read(observation);
  const inherited = parent ? state.run ? state.source.forRun(parent, state.run.proof, state.run.reader) : state.source.forParent(parent) : observation;
  AutomationObservationBindings.bind(target, inherited);
}
