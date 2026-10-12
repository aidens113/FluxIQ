import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialLearnedPace } from "./contracts.ts";

/**
 * The paces a trial's run learned, named by the candidate plan's keys rather
 * than by the run's node ids.
 *
 * The trial ran a graph materialised from the plan (`normalizeAutomationStudioFlowBuildPlan`),
 * whose node ids are the trial's own; each node and the graph keep the plan's
 * symbolic keys under `metadata.bootstrapSymbolicKey`. A pace on a node that
 * carries no key is not the plan's, and is left out.
 */
export function automationStudioTrialLearnedPaces(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): AutomationStudioCandidateTrialLearnedPace[] {
  const subflowKey = graph?.metadata?.bootstrapSymbolicKey;
  if (typeof subflowKey !== "string" || !subflowKey) return [];
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  return (trace?.pace ?? []).flatMap((pace) => {
    const nodeKey = nodes.get(pace.nodeId)?.metadata?.bootstrapSymbolicKey;
    return pace.learnedMs !== undefined && typeof nodeKey === "string" && nodeKey ? [{ subflowKey, nodeKey, paceMs: pace.paceMs }] : [];
  });
}
