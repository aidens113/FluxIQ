import type { AutomationStudioFlowArtifact } from "../flow/index.ts";
import type { AutomationStudioFlowSubflow } from "./subflow.ts";

/** Projects the complete authoring Flow into its initial default Subflow. */
export function defaultAutomationStudioSubflowForFlow(flow: AutomationStudioFlowArtifact): AutomationStudioFlowSubflow {
  return {
    schemaVersion: "0.1",
    subflowId: `${flow.flowId}.default-subflow`,
    flowId: flow.flowId,
    projectId: flow.projectId,
    name: flow.name,
    ...(flow.description ? { description: flow.description } : {}),
    role: "primary",
    status: "active",
    graphFlowId: flow.flowId,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    metadata: { generatedDefault: true }
  };
}
