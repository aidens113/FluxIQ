// The run's handler registry (state-aware recovery plan, C4).
//
// This module owns which registrations a dispatch may resolve from: those of
// the graphs the active frames are running, plus the automation's
// `recovery`-role Subflow graph. Each graph is read into registrations once
// per run (`../lifecycle/graph-registrations.ts`) and cached on the run's
// lifecycle state; a graph whose frame has ended stays cached but is not
// offered, so a handler in a graph no frame runs never runs.

import { type AutomationStudioHandlerRegistration, automationStudioGraphHandlerRegistrations } from "../lifecycle/index.ts";
import type { AutomationStudioRunFrames, AutomationStudioSubflowGraphSource } from "../frames/index.ts";
import type { AutomationStudioLifecycleGraph, AutomationStudioLifecycleRunState, AutomationStudioRegisteredLifecycleGraph } from "./run-state.ts";

/**
 * Reads `graph` into the run's registry, or returns the copy already read.
 * A graph is cached by its graph Flow id and read again only when the
 * document itself was replaced -- an in-run repair overlays a new document on
 * the run -- so a run reads each graph it executes once.
 *
 * Graph-run registers each frame's graph when the frame starts, so an
 * ancestor's inherited handlers are known before the child dispatches.
 */
export function automationStudioRegisterLifecycleGraph(state: AutomationStudioLifecycleRunState, graph: AutomationStudioLifecycleGraph): AutomationStudioRegisteredLifecycleGraph {
  const cached = state.graphs.get(graph.graph.flowId);
  if (cached && cached.graph === graph.graph) return cached;
  const registered = read(graph);
  state.graphs.set(graph.graph.flowId, registered);
  return registered;
}

/**
 * The registrations a dispatch in `run` may resolve from, with the graphs
 * they came from by graph Flow id: every registration of a graph an active
 * frame runs, and every registration of the automation's recovery Subflow
 * graph, which is loaded through `subflowGraphs.recovery()` at most once per
 * run. A recovery graph that cannot be loaded is reported once in the run's
 * `problems` and offers nothing.
 */
export async function automationStudioActiveLifecycleRegistrations(
  run: AutomationStudioRunFrames,
  subflowGraphs: AutomationStudioSubflowGraphSource | undefined
): Promise<{ registrations: AutomationStudioHandlerRegistration[]; graphs: ReadonlyMap<string, AutomationStudioRegisteredLifecycleGraph> }> {
  const state = run.lifecycle;
  const recovery = await recoveryGraph(state, subflowGraphs);
  const graphs = new Map<string, AutomationStudioRegisteredLifecycleGraph>();
  for (const frame of run.stack) {
    const registered = state.graphs.get(frame.graphFlowId);
    if (registered) graphs.set(frame.graphFlowId, registered);
  }
  if (recovery && !graphs.has(recovery.graph.flowId)) graphs.set(recovery.graph.flowId, recovery);
  return { registrations: [...graphs.values()].flatMap((graph) => graph.registrations), graphs };
}

async function recoveryGraph(state: AutomationStudioLifecycleRunState, subflowGraphs: AutomationStudioSubflowGraphSource | undefined): Promise<AutomationStudioRegisteredLifecycleGraph | undefined> {
  if (state.recovery.loaded) return state.recovery.graph;
  state.recovery.loaded = true;
  if (!subflowGraphs?.recovery) return undefined;
  try {
    const loaded = await subflowGraphs.recovery();
    if (!loaded) return undefined;
    state.recovery.graph = read(loaded);
  } catch (error) {
    state.problems.push(`The automation's recovery Subflow could not be loaded, so its handlers are not offered in this run: ${error instanceof Error ? error.message : String(error)}`);
  }
  return state.recovery.graph;
}

function read(graph: AutomationStudioLifecycleGraph): AutomationStudioRegisteredLifecycleGraph {
  const { registrations, problems } = automationStudioGraphHandlerRegistrations({ graphFlowId: graph.graph.flowId, subflowId: graph.subflowId, nodes: graph.graph.nodes, edges: graph.graph.edges });
  return { ...graph, registrations, problems };
}
