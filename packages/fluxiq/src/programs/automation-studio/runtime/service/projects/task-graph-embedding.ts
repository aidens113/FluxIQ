import type { AutomationStudioFlowDocument, AutomationStudioTaskArtifact } from "../../../model/index.ts";

/**
 * Each task with its Flow graph embedded: the graph it names, else the Flow
 * that Flow owns for it. A task that already carries a graph is left alone.
 */
export async function embedAutomationStudioTaskGraphs(projectId: string, tasks: AutomationStudioTaskArtifact[], flows: AutomationStudioFlowDocument[]): Promise<AutomationStudioTaskArtifact[]> {
  const flowsById = new Map(flows.map((flow) => [flow.flowId, flow]));
  const nextTasks: AutomationStudioTaskArtifact[] = [];
  for (const task of tasks) {
    if (task.graph?.nodes && task.graph?.edges) {
      nextTasks.push(task);
      continue;
    }
    const graph = (typeof task.graphId === "string" ? flowsById.get(task.graphId) : undefined)
      ?? (typeof task.policyFlowId === "string" ? flowsById.get(task.policyFlowId) : undefined)
      ?? flows.find((flow) => flow.ownerKind === "task" && flow.ownerId === task.taskId);
    if (!graph) {
      nextTasks.push(task);
      continue;
    }
    const nextTask: AutomationStudioTaskArtifact = {
      ...task,
      graphId: graph.flowId,
      policyFlowId: graph.flowId,
      graph,
      metadata: {
        ...(task.metadata ?? {}),
        graphEmbeddedAt: Date.now()
      }
    };
    nextTasks.push(nextTask);
  }
  return nextTasks;
}
