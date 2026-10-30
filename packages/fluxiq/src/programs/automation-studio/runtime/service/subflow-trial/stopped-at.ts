// Which of the proposal's own steps a run stopped at, and which it passed, by
// plan key (t804). Shared by the partial trial (`./run.ts`, `stoppedAtKey`) and
// the from-step run (`./from-step.ts`), so a trial's stop and the step a
// from-step run must pass are named the same way.
//
// The proposal's own steps are its subflow's: the nodes of the graph that
// normalization stamps with the subflow's key (`metadata.bootstrapSymbolicKey`,
// `flow-bootstrap/adaptation.ts`), each node carrying its own plan key the same
// way. The run's attempts of those nodes are found in whichever frame ran them:
// the root (a Subflow the router runs, after any predecessors' run) or a Call
// Subflow child (a callable target, after its predecessors' calls). A step that
// failed inside one of the subflow's `part` helpers is named by the step of the
// subflow that called it, the step a from-step run can start at. A stop before
// the subflow ran (a predecessor, the arrival) or between steps (a graph-level
// ending) names none.

import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";

/** A run as the partial runners answer it: its trace and the graphs that ran. */
export type AutomationStudioSubflowTrialRan = { trace?: AutomationStudioGraphExecutionTrace | undefined; graph?: AutomationStudioFlowArtifact | undefined; candidateGraphs?: readonly AutomationStudioFlowArtifact[] | undefined };

/** The subflow's own attempts in the order they ran, each with its step's plan key (header); empty when it never ran. */
export function automationStudioSubflowTrialOwnAttempts(ran: AutomationStudioSubflowTrialRan, subflowKey: string): Array<{ key: string; attempt: AutomationStudioNodeAttemptTrace }> {
  const graph = ownGraph(ran, subflowKey);
  if (!graph || !ran.trace) return [];
  const keys = new Map(graph.nodes.flatMap((node) => typeof node.metadata?.bootstrapSymbolicKey === "string" ? [[node.id, node.metadata.bootstrapSymbolicKey] as const] : []));
  return (frameOf(ran.trace, keys) ?? []).map((attempt) => ({ key: keys.get(attempt.nodeId)!, attempt }));
}

/** The plan key of the subflow's step the run stopped at, where its last step failed (header); undefined otherwise. */
export function automationStudioSubflowTrialStoppedAtKey(ran: AutomationStudioSubflowTrialRan, subflowKey: string): string | undefined {
  const last = automationStudioSubflowTrialOwnAttempts(ran, subflowKey).at(-1);
  return last && automationStudioAttemptSettled(last.attempt).status === "failed" ? last.key : undefined;
}

/** The plan keys of the subflow's steps that completed, each once, in the order they first did (header). */
export function automationStudioSubflowTrialPassedKeys(ran: AutomationStudioSubflowTrialRan, subflowKey: string): string[] {
  const passed = automationStudioSubflowTrialOwnAttempts(ran, subflowKey).filter(({ attempt }) => automationStudioAttemptSettled(attempt).status === "succeeded").map(({ key }) => key);
  return [...new Set(passed)];
}

/** The graph normalization made of the subflow: among the topology's graphs, or the one that ran. */
function ownGraph(ran: AutomationStudioSubflowTrialRan, subflowKey: string): AutomationStudioFlowArtifact | undefined {
  const own = (graph: AutomationStudioFlowArtifact | undefined) => graph?.metadata?.subflowGraph === true && graph.metadata.bootstrapSymbolicKey === subflowKey;
  return (ran.candidateGraphs ?? []).find(own) ?? (own(ran.graph) ? ran.graph : undefined);
}

/** The attempts of the first frame, outermost first, that ran any of `nodes`, only those. */
function frameOf(trace: AutomationStudioGraphExecutionTrace, nodes: ReadonlyMap<string, string>): AutomationStudioNodeAttemptTrace[] | undefined {
  const own = trace.attempts.filter((attempt) => nodes.has(attempt.nodeId));
  if (own.length) return own;
  for (const attempt of trace.attempts) {
    const child = attempt.childTrace ? frameOf(attempt.childTrace, nodes) : undefined;
    if (child) return child;
  }
  return undefined;
}
