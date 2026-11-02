import type { JsonObject } from "../../../core/index.ts";
import type { ExecutableGraph, AutomationStudioFlowNode, AutomationStudioFlowEdge } from "../graph/index.ts";
import type { AutomationStudioCompiledPlan } from "./plan.ts";
import type { AutomationStudioCompiledPlanNode } from "./node.ts";
import type { AutomationStudioCompiledPlanEdge } from "./edge.ts";

export function compiledPlanToExecutableGraph(plan: AutomationStudioCompiledPlan): ExecutableGraph & { ownerId: string; metadata: JsonObject } {
  return {
    flowId: plan.flowId,
    ownerId: plan.projectId,
    nodes: plan.nodes.map(compiledNodeToFlowNode),
    edges: plan.edges.map(compiledEdgeToFlowEdge),
    metadata: {
      compiledArtifact: true,
      compilerVersion: plan.compilerVersion,
      flowRevision: plan.flowRevision,
      graphRevision: plan.graphRevision,
      settingsRevision: plan.settingsRevision,
      instructionRevision: plan.instructionRevision,
      planDigest: plan.planDigest,
      resolvedSettings: plan.resolvedSettings,
      resolvedInstructionIds: plan.resolvedInstructions.map((instruction) => instruction.instructionId)
    }
  };
}

function compiledNodeToFlowNode(node: AutomationStudioCompiledPlanNode): AutomationStudioFlowNode {
  return {
    id: node.id,
    definitionId: node.definitionId,
    definitionVersion: node.definitionVersion,
    label: node.label,
    parameterValues: node.parameterValues,
    metadata: node.metadata
  };
}

function compiledEdgeToFlowEdge(edge: AutomationStudioCompiledPlanEdge): AutomationStudioFlowEdge {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    ...(edge.sourcePortId !== null ? { sourcePortId: edge.sourcePortId } : {}),
    ...(edge.targetPortId !== null ? { targetPortId: edge.targetPortId } : {}),
    label: edge.label,
    metadata: edge.metadata
  };
}
