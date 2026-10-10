// Whether a run has any Handler to dispatch (state-aware recovery plan, C3, C4).
//
// This module owns the one question graph-run asks before it pays for a
// dispatch or stamps a lifecycle record: does any graph an active frame runs,
// or the automation's recovery Subflow graph, hold a Handler node? A run that
// holds none behaves, and is traced, exactly as it was before handlers existed.

import type { AutomationStudioRunFrames } from "../frames/index.ts";
import type { AutomationStudioRegisteredLifecycleGraph } from "./run-state.ts";

/**
 * True when a Handler node is registered in a graph an active frame of `run`
 * runs, or in the recovery Subflow graph once it was loaded. Authored paths
 * (a `failed` edge, an optional way on, a clears-interference node) are not
 * Handlers: today's ladder runs them.
 */
export function automationStudioLifecycleHasHandlers(run: AutomationStudioRunFrames): boolean {
  const state = run.lifecycle;
  if (holdsHandler(state.recovery.graph)) return true;
  return run.stack.some((frame) => holdsHandler(state.graphs.get(frame.graphFlowId)));
}

function holdsHandler(graph: AutomationStudioRegisteredLifecycleGraph | undefined): boolean {
  return Boolean(graph?.registrations.some((registration) => registration.source.kind === "handler_node"));
}
