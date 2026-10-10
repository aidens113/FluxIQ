import type { AutomationStudioFlowArtifact, AutomationStudioFlowSubflow, AutomationStudioFlowValidationContext } from "../../../model/index.ts";
import { isAutomationStudioSubflowGraphMetadata } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_HANDLER_DEFINITION_ID } from "../../../nodes/control-flow/index.ts";

/**
 * What a graph cannot say about itself when it is validated for saving: the
 * role of the Subflow it is the graph of, which decides whether it may hold a
 * handler for the whole automation (`model/validation/flow.ts`, t398). A role
 * the caller already knows wins -- a graph saved before its Subflow record
 * exists has no record to read -- and otherwise it is read from the Subflow
 * the graph names. Only a graph with a handler is looked up, because nothing
 * else in validation reads the role.
 */
export async function automationStudioFlowValidationContext(
  flow: AutomationStudioFlowArtifact,
  readSubflow: (parentFlowId: string, subflowId: string) => Promise<AutomationStudioFlowSubflow | null>,
  given: AutomationStudioFlowValidationContext = {}
): Promise<AutomationStudioFlowValidationContext> {
  if (given.subflowRole !== undefined) return given;
  if (!flow.nodes.some((node) => node.definitionId === AUTOMATION_STUDIO_HANDLER_DEFINITION_ID)) return given;
  if (!isAutomationStudioSubflowGraphMetadata(flow.metadata)) return given;
  const parentFlowId = String(flow.metadata!.parentFlowId).trim();
  const subflowId = String(flow.metadata!.parentSubflowId).trim();
  const subflow = await readSubflow(parentFlowId, subflowId);
  if (!subflow || subflow.graphFlowId !== flow.flowId) return given;
  return { ...given, subflowRole: subflow.role };
}
