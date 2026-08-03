import type { JsonObject } from "../../programs/program-api";

export function createStudioSmokeFlow(projectId: string, projectName: string): JsonObject {
  const now = Date.now();
  return {
    schemaVersion: "0.1",
    flowId: `flow.${projectId}.manual-run`,
    ownerKind: "routine",
    ownerId: projectId,
    name: `${projectName} Manual Run`,
    nodes: [
      { id: "start", definitionId: "builtin.control.start", label: "Start", parameterValues: {} },
      { id: "status", definitionId: "builtin.data.constant", label: "Project Status", parameterValues: { value: "Automation Studio runtime is connected." } },
      { id: "end", definitionId: "builtin.control.end", label: "End", parameterValues: { status: "success" } }
    ],
    edges: [
      { id: "edge.start.status", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "status", targetPortId: "in", label: "Next" },
      { id: "edge.status.end", sourceNodeId: "status", sourcePortId: "success", targetNodeId: "end", targetPortId: "in", label: "Done" }
    ],
    createdAt: now,
    updatedAt: now,
    metadata: { createdFrom: "automation-studio-ui" }
  };
}
