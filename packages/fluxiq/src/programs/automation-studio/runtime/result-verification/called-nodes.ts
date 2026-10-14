// The nodes of each graph a run's Call Subflow steps ran, for the judge to be
// told a part's read by its own authored node (t574).
//
// **Why.** A run of an assembled Flow -- a root that calls its parts -- is
// judged with the root's nodes only (`run-outcome.ts`, `flow.nodes`), so every
// read a part made reached the judge by its counts alone: no condition wording,
// no tested value beside a left-out row, no `leftOutNamingTheItem`, no dedupe.
// Live run `run-mv7vor5f-ea4d08b4` showed what that costs in a subflow trial,
// where three of five verdicts were wrong; the judged whole run of a project
// Flow is the same shape.
//
// **Exact, or nothing.** Each Call Subflow attempt records the Subflow it ran,
// that Subflow's graph and the revision it ran at (`subflowTarget`). The graph
// is read through the run's own Subflow source -- the one the run's Call
// Subflow steps loaded it from, which reads each graph once per run -- and is
// taken only when it is that very graph at that very revision. Anything else,
// a graph since changed, one the source no longer offers, or a source that
// cannot read it, leaves that frame out, and its reads are told as before.

import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../model/index.ts";

/** The run's Subflow source as the verification reads it: the executor's `subflowGraphs`, by Subflow id. */
export type AutomationStudioResultCalledGraphSource = {
  load(subflowId: string): Promise<{ graph: { flowId: string; nodes: readonly AutomationStudioFlowNode[] }; graphRevision: number | null } | undefined>;
};

/** The nodes of each called graph read at the revision it ran, keyed by its Call Subflow attempt's id (header). */
export async function automationStudioResultCalledNodes(
  attempts: readonly AutomationStudioFlowRunActionAttemptRecord[],
  source: AutomationStudioResultCalledGraphSource | undefined
): Promise<Map<string, readonly AutomationStudioFlowNode[]>> {
  const called = new Map<string, readonly AutomationStudioFlowNode[]>();
  if (!source) return called;
  for (const attempt of attempts) {
    const target = attempt.subflowTarget;
    if (!target) continue;
    const loaded = await readable(source, target.subflowId);
    if (loaded.graph?.graph.flowId === target.graphFlowId && loaded.graph.graphRevision === target.graphRevision) called.set(attempt.attemptId, loaded.graph.graph.nodes);
  }
  return called;
}

/**
 * The graph the source gives for a Subflow, or why there is none. A source
 * that throws reads as no graph: the frame is told by its counts, as every
 * part's read was before, and the verification itself goes on -- a judgement
 * is never lost to a richer account of it that could not be had.
 */
async function readable(source: AutomationStudioResultCalledGraphSource, subflowId: string): Promise<{ graph?: Awaited<ReturnType<AutomationStudioResultCalledGraphSource["load"]>>; failed?: true }> {
  try {
    return { graph: await source.load(subflowId) };
  } catch {
    return { failed: true };
  }
}
