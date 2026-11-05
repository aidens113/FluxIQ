// Whether the Subflow graph a Router selected really belongs to the Flow being
// run: a graph is run only when it is persisted as a Subflow graph and names
// this Flow and this Subflow as its owners, so a stale or foreign graph id in a
// Router rule never runs as if it were this Flow's own.
//
// A saved part a step pins belongs to no Flow, and proves something else: that it is
// the very version the step named, as the library read it for this run. A graph that
// merely says it is a part does not get through the first check, and one that a step
// did not pin never reaches the second.

import { automationStudioPinnedSubflowId, type AutomationStudioPartPin } from "../../../../engine/automation/frames/index.ts";

/** The Router's selection, as far as ownership needs it. */
export type AutomationStudioSelectedSubflowRef = { subflowId: string } | null | undefined;

/**
 * True only when `graph` is a persisted Subflow graph owned by `parentFlowId`
 * and the selected Subflow. `representationOf` is the Flow writer's reading of
 * how a graph is persisted.
 */
export function automationStudioSubflowGraphIsOwned<T extends { metadata?: Record<string, unknown> }>(
  selected: AutomationStudioSelectedSubflowRef,
  graph: T | undefined,
  parentFlowId: string,
  representationOf: (graph: T) => string | undefined
): boolean {
  return Boolean(selected && graph
    && representationOf(graph) === "subflow_graph"
    && graph.metadata?.subflowGraph === true
    && graph.metadata?.parentFlowId === parentFlowId
    && graph.metadata?.parentSubflowId === selected.subflowId);
}

/** True only when `graph` is the version `pin` names, made a graph of this run by the library (`../project-parts/run/part-graph.ts`). */
export function automationStudioPinnedGraphIsOwned<T extends { metadata?: Record<string, unknown> }>(pin: AutomationStudioPartPin, graph: T | undefined, parentFlowId: string): boolean {
  const named = graph?.metadata?.projectPart as Partial<AutomationStudioPartPin> | undefined;
  return Boolean(graph
    && graph.metadata?.subflowGraph === true
    && graph.metadata?.parentFlowId === parentFlowId
    && graph.metadata?.parentSubflowId === automationStudioPinnedSubflowId(pin)
    && named?.partId === pin.partId
    && named?.version === pin.version);
}
