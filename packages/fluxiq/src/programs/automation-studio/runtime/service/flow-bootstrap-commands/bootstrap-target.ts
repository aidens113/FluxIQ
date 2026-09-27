import type { AutomationStudioFlowArtifact, AutomationStudioFlowRepresentationKind } from "../../../model/index.ts";
import { automationStudioBootstrapTargetRefusal, type AutomationStudioBootstrapAdaptationMode } from "../../flow-bootstrap/index.ts";

export async function assertAutomationStudioBootstrapTarget(input: {
  projectId: string;
  flowId: string;
  mode: AutomationStudioBootstrapAdaptationMode;
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
  representation(flow: AutomationStudioFlowArtifact): AutomationStudioFlowRepresentationKind;
  hasRouter(projectId: string, flowId: string): Promise<boolean>;
  subflowCount(projectId: string, flowId: string): Promise<number>;
}): Promise<AutomationStudioFlowArtifact> {
  const parent = await input.getFlow(input.projectId, input.flowId);
  const refusal = automationStudioBootstrapTargetRefusal({
    mode: input.mode,
    representation: input.representation(parent),
    parentNodeCount: parent.nodes.length,
    parentEdgeCount: parent.edges.length,
    hasRouter: await input.hasRouter(input.projectId, input.flowId),
    subflowCount: await input.subflowCount(input.projectId, input.flowId)
  });
  if (refusal) throw new Error(refusal);
  return parent;
}
