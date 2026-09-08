import { createHash } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import {
  createBlankAutomationStudioFlowArtifact,
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowExpansionReferences,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowSubflow
} from "../model/index.ts";
import type {
  AutomationStudioFlowBuildPlan,
  AutomationStudioFlowBootstrapRisk
} from "./flow-bootstrap.ts";

export type AutomationStudioBootstrapAdaptationStatus =
  | "proposed"
  | "validated"
  | "applied"
  | "rejected"
  | "reverted";

export type AutomationStudioBootstrapParentState = {
  metadata?: JsonObject;
  expansion?: AutomationStudioFlowExpansionReferences;
  updatedAt: number;
};

export type AutomationStudioBootstrapTopology = {
  router: AutomationStudioFlowRouter;
  subflows: Array<{
    subflow: AutomationStudioFlowSubflow;
    graphFlow: AutomationStudioFlowArtifact;
  }>;
};

export type AutomationStudioBootstrapApplication = {
  appliedAt: number;
  appliedBy: string;
  appliedDependencyDigest: string;
  parentBefore: AutomationStudioBootstrapParentState;
};

export type AutomationStudioBootstrapAccounting = {
  requestId: string;
  estimatedInputTokens: number;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
};

export type AutomationStudioBootstrapAuditEvent = {
  eventId: string;
  adaptationId: string;
  eventType: "created" | "approved" | "rejected" | "applied" | "rollback";
  actorId: string | null;
  fromStatus: AutomationStudioBootstrapAdaptationStatus | null;
  toStatus: AutomationStudioBootstrapAdaptationStatus | null;
  reason: string;
  detail: JsonObject;
  detailObjectId: null;
  createdAt: number;
};

export type AutomationStudioBootstrapAdaptation = {
  schemaVersion: "0.1";
  kind: "flow_bootstrap";
  adaptationId: string;
  projectId: string;
  flowId: string;
  baseDependencyDigest: string;
  baseSettingsRevision: number;
  sourceInstructionIds: string[];
  summary: string;
  riskLevel: AutomationStudioFlowBootstrapRisk;
  accounting?: AutomationStudioBootstrapAccounting;
  buildPlan: AutomationStudioFlowBuildPlan;
  topology: AutomationStudioBootstrapTopology;
  status: AutomationStudioBootstrapAdaptationStatus;
  createdAt: number;
  updatedAt: number;
  auditEvents: AutomationStudioBootstrapAuditEvent[];
  application?: AutomationStudioBootstrapApplication;
  revert?: { revertedAt: number; revertedBy: string };
};

export function normalizeAutomationStudioFlowBuildPlan(input: {
  adaptationId: string;
  parentFlow: AutomationStudioFlowArtifact;
  buildPlan: AutomationStudioFlowBuildPlan;
  sourceInstructionIds: string[];
  now: number;
}): AutomationStudioBootstrapTopology {
  const namespace = createHash("sha256").update(input.adaptationId).digest("hex").slice(0, 16);
  const subflowIds = new Map(input.buildPlan.subflows.map((entry) => [
    entry.key,
    `subflow.bootstrap.${namespace}.${entry.key}`
  ]));
  const routerId = `router.bootstrap.${namespace}`;
  const subflows = input.buildPlan.subflows.map((entry) => {
    const subflowId = subflowIds.get(entry.key)!;
    const graphFlowId = `${input.parentFlow.flowId}.bootstrap.${namespace}.${entry.key}.graph`;
    const primary = entry.role === "primary";
    const graphFlow = createBlankAutomationStudioFlowArtifact({
      flowId: graphFlowId,
      projectId: input.parentFlow.projectId,
      name: `${entry.name} Graph`,
      scope: input.parentFlow.scope,
      description: `Instruction-built graph for ${entry.name}.`,
      origin: "manual",
      now: input.now,
      metadata: {
        parentFlowId: input.parentFlow.flowId,
        parentSubflowId: subflowId,
        subflowGraph: true,
        bootstrapAdaptationId: input.adaptationId,
        bootstrapSymbolicKey: entry.key
      }
    });
    const nodeIds = new Map(entry.nodes.map((node) => [
      node.key,
      `node.bootstrap.${namespace}.${entry.key}.${node.key}`
    ]));
    const materializedGraph: AutomationStudioFlowArtifact = {
      ...graphFlow,
      interface: primary ? structuredClone(input.parentFlow.interface) : { inputs: [], outputs: [] },
      nodes: entry.nodes.map((node) => ({
        id: nodeIds.get(node.key)!,
        definitionId: node.definitionId,
        definitionVersion: node.definitionVersion,
        ...(node.parameters ? { parameterValues: structuredClone(node.parameters) } : {}),
        position: { ...node.position },
        metadata: {
          bootstrapAdaptationId: input.adaptationId,
          bootstrapSymbolicKey: node.key,
          ...(node.outputActionId ? { outputActionId: node.outputActionId } : {})
        }
      })),
      edges: entry.edges.map((edge) => ({
        id: `edge.bootstrap.${namespace}.${entry.key}.${edge.key}`,
        sourceNodeId: nodeIds.get(edge.source.nodeKey)!,
        targetNodeId: nodeIds.get(edge.target.nodeKey)!,
        sourcePortId: edge.source.portId,
        targetPortId: edge.target.portId,
        metadata: {
          bootstrapAdaptationId: input.adaptationId,
          bootstrapSymbolicKey: edge.key
        }
      }))
    };
    const subflow: AutomationStudioFlowSubflow = {
      schemaVersion: "0.1",
      subflowId,
      flowId: input.parentFlow.flowId,
      projectId: input.parentFlow.projectId,
      name: entry.name,
      role: entry.role,
      status: "active",
      graphFlowId,
      ...(primary && input.parentFlow.interface.inputs.length ? {
        inputMapping: input.parentFlow.interface.inputs.map((port) => ({
          flowInputId: port.id,
          subflowInputId: port.id,
          ...(port.required ? { required: true } : {})
        }))
      } : {}),
      ...(primary && input.parentFlow.interface.outputs.length ? {
        outputMapping: input.parentFlow.interface.outputs.map((port) => ({
          subflowOutputId: port.id,
          flowOutputId: port.id,
          ...(port.required ? { required: true } : {})
        }))
      } : {}),
      ...(input.sourceInstructionIds.length ? { localInstructionIds: [...input.sourceInstructionIds] } : {}),
      createdAt: input.now,
      updatedAt: input.now,
      stability: { runCount: 0, successCount: 0, failureCount: 0 },
      metadata: {
        bootstrapAdaptationId: input.adaptationId,
        bootstrapSymbolicKey: entry.key
      }
    };
    return { subflow, graphFlow: materializedGraph };
  });
  const routeTagsBySubflow = new Map<string, Set<string>>();
  for (const rule of input.buildPlan.plan.router.rules) {
    const tags = routeTagsBySubflow.get(rule.targetSubflowKey) ?? new Set<string>();
    rule.routeTags.forEach((tag) => tags.add(tag));
    routeTagsBySubflow.set(rule.targetSubflowKey, tags);
  }
  for (const entry of subflows) {
    const symbolic = String(entry.subflow.metadata?.bootstrapSymbolicKey ?? "");
    const routeTags = [...(routeTagsBySubflow.get(symbolic) ?? [])].sort();
    if (routeTags.length) entry.subflow.routeTags = routeTags;
  }
  const router: AutomationStudioFlowRouter = {
    schemaVersion: "0.1",
    routerId,
    flowId: input.parentFlow.flowId,
    projectId: input.parentFlow.projectId,
    name: input.buildPlan.plan.router.name,
    rules: input.buildPlan.plan.router.rules.map((rule, index) => ({
      schemaVersion: "0.1",
      ruleId: `route.bootstrap.${namespace}.${rule.key}`,
      routerId,
      name: rule.name,
      target: { kind: "subflow", subflowId: subflowIds.get(rule.targetSubflowKey)! },
      order: index * 10,
      status: "active",
      createdAt: input.now,
      updatedAt: input.now,
      metadata: {
        bootstrapAdaptationId: input.adaptationId,
        bootstrapSymbolicKey: rule.key,
        routeTags: [...rule.routeTags]
      }
    })),
    fallback: input.buildPlan.plan.router.fallback.kind === "subflow"
      ? { kind: "subflow", subflowId: subflowIds.get(input.buildPlan.plan.router.fallback.targetSubflowKey)! }
      : { kind: "fail", message: "No instruction-built route matched." },
    status: "active",
    createdAt: input.now,
    updatedAt: input.now,
    metadata: { bootstrapAdaptationId: input.adaptationId }
  };
  return { router, subflows };
}

export function assertAutomationStudioBootstrapHasNoRecordingProvenance(value: unknown): void {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current as object)) continue;
    seen.add(current as object);
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (/recording|timeline/i.test(key)) throw new Error("Bootstrap Adaptations cannot contain recording or timeline provenance.");
      stack.push(child);
    }
  }
}
