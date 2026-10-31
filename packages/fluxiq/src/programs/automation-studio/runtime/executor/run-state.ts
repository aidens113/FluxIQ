import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationNodeIterationState, AutomationStudioResolvedActionEffect } from "../../nodes/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import type { AutomationStudioGraphExecutionOptions } from "./contracts.ts";
import { automationStudioDefenceLedger, type AutomationStudioDefenceLedger } from "./defensive/index.ts";
import { automationStudioPaceKeeper, type AutomationStudioPaceKeeper } from "./pacing/index.ts";
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
  /** Trusted floors for this graph frame's current node executions; never persisted. */
  actionEffects: Map<string, AutomationStudioResolvedActionEffect>;
  /** This frame's current passes that entered a callback capable of acting. */
  dispatchedActions: Set<string>;
  /**
   * Every fault the default defensive policy assessed during this run, and the
   * waiting allowance spent absorbing them. It is run-scoped because the bound it
   * enforces is a whole-run one: a per-node bound alone multiplies by the number
   * of nodes a Flow arrives at.
   */
  defence: AutomationStudioDefenceLedger;
  /** Each node's pace between starts, authored or learned from a wait hint, for this run only (`pacing/pace-keeper.ts`). */
  pace: AutomationStudioPaceKeeper;
  /**
   * The page the last node attempt ended on and when Core received it, kept
   * until the next attempt starts, which is offered it as its own starting page
   * (`host-state.ts`). Unset when that attempt captured no page.
   */
  pageEnded?: { ref: AutomationStudioHostStateSnapshotRef; receivedAt: number } | undefined;
};

export function automationStudioRunState(options: Pick<AutomationStudioGraphExecutionOptions, "variables"> = {}): AutomationStudioRunState {
  return {
    records: automationStudioRecordTraceSummary(),
    variables: new Map(Object.entries(options.variables ?? {})),
    loops: new Map(),
    actionEffects: new Map(),
    dispatchedActions: new Set(),
    defence: automationStudioDefenceLedger(),
    pace: automationStudioPaceKeeper()
  };
}
