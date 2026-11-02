import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";

export interface AutomationStudioFlowExecutionBindingPorts {
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
  getExecutionDigest(projectId: string, flowId: string): Promise<string>;
  canonicalSettingsRevision?: (projectId: string, flowId: string) => Promise<number>;
}
