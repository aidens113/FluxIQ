import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationNodeIterationState } from "../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "./contracts.ts";
import { automationStudioRecordTraceSummary, type AutomationStudioRecordTraceSummary } from "./record-summary.ts";

/**
 * What one graph run keeps beside its `values` for as long as it executes.
 * Nodes are executed one at a time and share this object; nothing in it is
 * persisted as it is.
 */
export type AutomationStudioRunState = {
  /** The rows the run captured, which its saved trace replaces with markers. */
  records: AutomationStudioRecordTraceSummary;
  /**
   * The run's variables, seeded once from `options.variables`. Every node of
   * the run reads and writes this one map, so a write reaches the nodes after
   * it. A Call Flow child is a graph run of its own, with a map of its own.
   */
  variables: Map<string, JsonValue>;
  /** Iteration state by node id, for a node such as For Each that keeps its place between passes. */
  loops: Map<string, AutomationNodeIterationState>;
};

export function automationStudioRunState(options: Pick<AutomationStudioGraphExecutionOptions, "variables"> = {}): AutomationStudioRunState {
  return {
    records: automationStudioRecordTraceSummary(),
    variables: new Map(Object.entries(options.variables ?? {})),
    loops: new Map()
  };
}
