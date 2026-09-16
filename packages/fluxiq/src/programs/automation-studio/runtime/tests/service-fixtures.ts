import { type StateSnapshot } from "../../model/index.ts";
import { AutomationStudioService } from "../service.ts";
import type { JsonObject } from "../../../../core/index.ts";

export function stateFixture(id: string, timestamp: number, title: string): StateSnapshot {
  return {
    id,
    timestamp,
    namespaces: {
      web: {
        schemaId: "web",
        schemaVersion: "0.1",
        values: { title: { type: "string", value: title, observedAt: timestamp } }
      }
    }
  };
}

export async function getPrimarySubflowGraph(
  service: AutomationStudioService,
  projectId: string,
  flowId: string
) {
  const page = await service.listFlowSubflowSummaries({ projectId, flowId, role: "primary", limit: 10, offset: 0 });
  const primary = page.subflows[0];
  if (!primary?.graphFlowId) throw new Error(`Flow ${flowId} does not have a primary Subflow graph.`);
  return service.getFlow(projectId, primary.graphFlowId);
}

export async function installPrimaryRouter(
  service: AutomationStudioService,
  projectId: string,
  flowId: string,
  graph: { nodes: any[]; edges: any[]; regions?: any[] }
) {
  const subflow = await service.createFlowSubflow({ projectId, flowId, name: "Primary", role: "primary" });
  const blankGraph = await service.getFlow(projectId, subflow.graphFlowId!);
  const savedGraph = await service.saveFlow({ projectId, flow: { ...blankGraph, ...graph } });
  await service.setFlowMapFallback({ projectId, flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  return { subflow, graph: savedGraph };
}

export async function createRunnableCanonicalFlow(
  service: AutomationStudioService,
  projectId: string,
  input: { flowId: string; metadata?: JsonObject }
) {
  const flow = await service.createFlow({ projectId, flowId: input.flowId, name: input.flowId });
  const runnable = await service.saveFlow({ projectId, flow: {
    ...flow,
    metadata: { ...(flow.metadata ?? {}), ...(input.metadata ?? {}) }
  } });
  await installPrimaryRouter(service, projectId, runnable.flowId, {
    nodes: [
      { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
      { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
    ],
    edges: [
      { id: "start.constant", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "constant", targetPortId: "in" },
      { id: "constant.end", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
    ]
  });
  return runnable;
}

export async function createFailingCanonicalFlow(
  service: AutomationStudioService,
  projectId: string,
  input: { flowId: string; metadata?: JsonObject }
) {
  const flow = await service.createFlow({ projectId, flowId: input.flowId, name: input.flowId });
  const failing = await service.saveFlow({ projectId, flow: {
    ...flow,
    metadata: { ...(flow.metadata ?? {}), ...(input.metadata ?? {}) }
  } });
  await installPrimaryRouter(service, projectId, failing.flowId, {
    nodes: [
      { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
      { id: "divide", definitionId: "builtin.math.divide", parameterValues: {} }
    ],
    edges: [
      { id: "start.divide", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "divide", targetPortId: "in" }
    ]
  });
  return failing;
}

export function adaptiveTrainingMetadata(): JsonObject {
  return {
    adaptationModeVersion: 1,
    adaptationMode: "fully_adaptive",
    adaptationPolicySettings: {
      preset: "adaptive",
      proposalMode: "auto",
      allowRuntimeRecovery: true,
      allowCreateRecoveryPaths: true,
      allowModifySubflows: true,
      allowCreateSubflows: true,
      allowModifyRouter: true,
      allowModifyExpectations: true,
      allowModifyActionTargets: true
    },
    trainingModeSettings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "auto",
      allowPromotion: true,
      requireFirstManualReviewBeforeAutoPromotion: false,
      budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
    }
  };
}
