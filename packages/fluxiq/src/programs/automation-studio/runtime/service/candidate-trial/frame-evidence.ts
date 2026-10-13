import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace, AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import { automationStudioRunDetailAttemptsInRunOrder } from "../summaries/index.ts";

/** Project only invoked candidate siblings, retaining normal trace screens and unique run-local attempt IDs. */
export function automationStudioCandidateFrameEvidence(attempts: readonly AutomationStudioNodeAttemptTrace[], graph?: AutomationStudioFlowArtifact, siblings: readonly AutomationStudioFlowArtifact[] = []): { attempts: AutomationStudioNodeAttemptTrace[]; graph: AutomationStudioFlowArtifact | undefined; frames: Array<{ trace: AutomationStudioGraphExecutionTrace; graph: AutomationStudioFlowArtifact }> } {
  const placed = automationStudioRunDetailAttemptsInRunOrder(attempts);
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const edges = new Map((graph?.edges ?? []).map((edge) => [edge.id, edge]));
  const frames: Array<{ trace: AutomationStudioGraphExecutionTrace; graph: AutomationStudioFlowArtifact }> = [];
  for (const { attempt } of placed) {
    const target = attempt.subflowTarget;
    if (!target || !graph) continue;
    const child = siblings.find((candidate) => candidate.flowId === target.graphFlowId && candidate.projectId === graph.projectId
      && candidate.metadata?.parentFlowId === graph.metadata?.parentFlowId && candidate.metadata?.parentSubflowId === target.subflowId
      && candidate.metadata?.subflowGraph === true);
    if (!child) continue;
    if (attempt.childTrace) frames.push({ trace: attempt.childTrace, graph: child });
    for (const node of child.nodes) nodes.set(node.id, node);
    for (const edge of child.edges) edges.set(edge.id, edge);
  }
  return {
    attempts: placed.map(({ attempt, attemptId, parentAttemptId }) => {
      const { childTrace: _childTrace, ...own } = attempt;
      return { ...own, attemptId, ...(attempt.framePath === undefined && parentAttemptId ? { framePath: [parentAttemptId] } : {}) };
    }),
    graph: graph ? { ...graph, nodes: [...nodes.values()], edges: [...edges.values()] } : undefined,
    frames
  };
}
