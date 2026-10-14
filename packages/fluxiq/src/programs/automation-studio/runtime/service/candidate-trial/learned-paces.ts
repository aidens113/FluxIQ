import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialLearnedPace } from "./contracts.ts";
import { automationStudioCandidateFrameEvidence } from "./frame-evidence.ts";

/**
 * The paces a trial's run learned, named by the candidate plan's keys rather
 * than by the run's node ids.
 *
 * The trial ran a graph materialised from the plan (`normalizeAutomationStudioFlowBuildPlan`),
 * whose node ids are the trial's own; each node and the graph keep the plan's
 * symbolic keys under `metadata.bootstrapSymbolicKey`. A pace on a node that
 * carries no key is not the plan's, and is left out.
 */
export function automationStudioTrialLearnedPaces(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined, siblings: readonly AutomationStudioFlowArtifact[] = []): AutomationStudioCandidateTrialLearnedPace[] {
  if (!trace || !graph) return [];
  const frames = [{ trace, graph }, ...automationStudioCandidateFrameEvidence(trace.attempts, graph, siblings).frames];
  const learned = new Map<string, AutomationStudioCandidateTrialLearnedPace>();
  for (const frame of frames) {
    const subflowKey = frame.graph.metadata?.bootstrapSymbolicKey;
    if (typeof subflowKey !== "string" || !subflowKey) continue;
    const nodes = new Map(frame.graph.nodes.map((node) => [node.id, node]));
    for (const pace of frame.trace.pace ?? []) {
      const nodeKey = nodes.get(pace.nodeId)?.metadata?.bootstrapSymbolicKey;
      if (pace.learnedMs === undefined || typeof nodeKey !== "string" || !nodeKey) continue;
      const key = JSON.stringify([subflowKey, nodeKey]);
      const previous = learned.get(key);
      if (!previous || pace.paceMs > previous.paceMs) learned.set(key, { subflowKey, nodeKey, paceMs: pace.paceMs });
    }
  }
  return [...learned.values()];
}
