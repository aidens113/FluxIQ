import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { AutomationNodePort } from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../../../programs/program-api";
import { automationEditorPalette } from "../node-palette";
import type { AutomationEditorNodeSpec, AutomationFlowNodeData } from "../node-types";
import { chooseAutomationEdgeLane } from "../../graph/edge-routing";
import { automationVisualInputPorts } from "../../graph/node-parameters";
import {
  automationPortColor,
  automationPortDisplayLabel,
  automationPortIdFromLabel,
  automationPortTone,
  uniqueAutomationPorts
} from "../../graph/ports";

export function legacyPolicyToFlowGraph(policy: any, selectedNodeId = ""): { nodes: Node<AutomationFlowNodeData>[]; edges: Edge[] } {
  const sourceNodes = policy?.nodes ?? [];
  const sourceEdges = policy?.edges ?? [];
  const positions = layoutAutomationFlowNodes(sourceNodes, sourceEdges);
  const nodes: Node<AutomationFlowNodeData>[] = sourceNodes.map((node: any, index: number) => {
    const actionDefinition = (node.actions ?? []).length ? automationNodeSpecForDefinition("builtin.policy.action") : undefined;
    const parameterValues = node.metadata?.parameterValues && typeof node.metadata.parameterValues === "object"
      ? node.metadata.parameterValues
      : legacyPolicyParameterValues(node);
    return {
      id: node.id,
      type: "policyNode",
      position: node.metadata?.position && typeof node.metadata.position === "object"
        ? { x: Number(node.metadata.position.x ?? 0), y: Number(node.metadata.position.y ?? 0) }
        : positions.get(node.id) ?? { x: index * 340, y: 160 },
      selected: node.id === selectedNodeId,
      data: {
        label: node.label ?? node.id,
        description: legacyPolicyNodeDescription(node),
        customDescription: node.metadata?.customDescription,
        nodeDefinitionId: node.metadata?.nodeDefinitionId ?? actionDefinition?.id,
        nodeDefinitionVersion: node.metadata?.nodeDefinitionVersion ?? actionDefinition?.version,
        icon: legacyPolicyNodeIcon(node, index),
        actionTypes: (node.actions ?? []).map((action: any) => action.actionType),
        recovery: node.recovery?.strategy ?? "ready",
        evidenceCount: (node.sourceEvidence?.length ?? 0) + (Array.isArray(node.metadata?.evidence) ? node.metadata.evidence.length : 0),
        readinessCount: countConditionLeaves(node.eligibility) + countConditionLeaves(node.readinessConditions),
        successCount: countConditionLeaves(node.successConditions),
        inputs: legacyPolicyInputPorts(node, index),
        outputs: legacyPolicyOutputPorts(node, sourceEdges),
        parameters: Array.isArray(node.metadata?.parameters) ? node.metadata.parameters : actionDefinition?.parameters ?? [],
        parameterValues,
        isStart: index === 0,
        confidence: node.generatedMetadata?.confidence,
        timeoutMs: node.timeout?.timeoutMs ?? node.timeoutMs,
        metadata: node.metadata ?? {}
      }
    };
  });
  const outgoingCounts = new Map<string, number>();
  const edges: Edge[] = [];
  for (const [index, edge] of sourceEdges.entries()) {
    const source = String(edge.fromNodeId ?? edge.source ?? "");
    const target = String(edge.toNodeId ?? edge.target ?? "");
    const count = outgoingCounts.get(source) ?? 0;
    outgoingCounts.set(source, count + 1);
    const fallbackLabel = edge.label ?? edge.kind ?? edge.type ?? (edge.probability !== undefined ? `${Math.round(Number(edge.probability) * 100)}%` : "Next");
    const id = edge.id ?? `${edge.fromNodeId}-${edge.toNodeId}-${index}`;
    const sourcePort = legacyPolicyEdgeSourcePort(edge, nodes.find((node) => node.id === source)?.data.outputs ?? [], fallbackLabel, count);
    const targetPort = legacyPolicyEdgeTargetPort(edge, nodes.find((node) => node.id === target)?.data.inputs ?? []);
    const label = sourcePort ? automationPortDisplayLabel(sourcePort) : String(fallbackLabel);
    const color = automationPortColor(automationPortTone(sourcePort ?? { id: automationPortIdFromLabel(label), label, valueType: "any", role: flowOutputRole(automationPortIdFromLabel(label), label) }, "source"));
    const nextEdge: Edge = {
      id,
      source,
      target,
      sourceHandle: sourcePort?.id ?? automationPortIdFromLabel(label),
      targetHandle: targetPort?.id ?? "in",
      type: "automationEdge",
      animated: false,
      data: { label, lane: chooseAutomationEdgeLane(source, target, edges, nodes, id, count), siblingIndex: count, routeIndex: count, sourcePort: sourcePort?.id ?? automationPortIdFromLabel(label), targetPort: targetPort?.id ?? "in" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 18,
        height: 18
      },
      label,
      style: { stroke: color, strokeWidth: 3 }
    };
    edges.push(nextEdge);
  }
  return { nodes, edges };
}

export function taskFlowToEditorGraph(flow: any, selectedNodeId = "", nodeDefinitions: any[] = []): { nodes: Node<AutomationFlowNodeData>[]; edges: Edge[] } {
  if (!flow) return { nodes: [], edges: [] };
  const flowNodes = flow.nodes ?? [];
  const flowEdges = flow.edges ?? [];
  const positions = layoutAutomationFlowNodes(
    flowNodes.map((node: any) => ({ id: node.id, metadata: { position: node.position } })),
    flowEdges.map((edge: any) => ({ fromNodeId: edge.sourceNodeId, toNodeId: edge.targetNodeId }))
  );
  const nodes: Node<AutomationFlowNodeData>[] = flowNodes.map((node: any, index: number) => {
    const definition = automationNodeSpecForDefinition(node.definitionId, nodeDefinitions);
    const parameterValues = node.parameterValues && typeof node.parameterValues === "object" ? node.parameterValues : {};
    const inputs = automationVisualInputPorts(definition?.inputs ?? [], node.definitionId);
    const outputs = flowNodeOutputPorts(node, flowEdges, definition?.outputs ?? []);
    return {
      id: node.id,
      type: "policyNode",
      position: node.position && typeof node.position === "object"
        ? { x: Number(node.position.x ?? 0), y: Number(node.position.y ?? 0) }
        : positions.get(node.id) ?? { x: index * 340, y: 160 },
      selected: node.id === selectedNodeId,
      data: {
        label: node.label ?? definition?.label ?? node.id,
        description: node.description ?? definition?.description ?? "Task graph node",
        customDescription: node.metadata?.customDescription,
        nodeDefinitionId: node.definitionId,
        nodeDefinitionVersion: node.definitionVersion,
        ...(definition?.icon !== undefined ? { icon: definition.icon } : {}),
        actionTypes: Array.isArray(parameterValues.actions) ? parameterValues.actions.map((action: any) => String(action.actionType ?? "")).filter(Boolean) : [],
        recovery: typeof parameterValues.recovery?.strategy === "string" ? parameterValues.recovery.strategy : definition?.family ?? "ready",
        evidenceCount: 0,
        readinessCount: inputs.length,
        successCount: outputs.length,
        inputs,
        outputs,
        parameters: definition?.parameters ?? [],
        parameterValues,
        metadata: node.metadata ?? {},
        isStart: node.definitionId === "builtin.control.start" || index === 0,
        timeoutMs: typeof parameterValues.timeout?.timeoutMs === "number" ? parameterValues.timeout.timeoutMs : undefined
      }
    };
  });
  const edges: Edge[] = [];
  const outgoingCounts = new Map<string, number>();
  for (const [index, edge] of flowEdges.entries()) {
    const source = String(edge.sourceNodeId ?? edge.source ?? "");
    const target = String(edge.targetNodeId ?? edge.target ?? "");
    const count = outgoingCounts.get(source) ?? 0;
    outgoingCounts.set(source, count + 1);
    const sourcePorts = nodes.find((node) => node.id === source)?.data.outputs ?? [];
    const targetPorts = nodes.find((node) => node.id === target)?.data.inputs ?? [];
    const sourcePort = flowEdgeSourcePort(edge, sourcePorts, count);
    const targetPort = flowEdgeTargetPort(edge, targetPorts);
    const label = sourcePort ? automationPortDisplayLabel(sourcePort) : String(edge.label ?? edge.metadata?.label ?? "Next");
    const color = automationPortColor(automationPortTone(sourcePort ?? { id: edge.sourcePortId ?? "next", label, valueType: "any", role: flowOutputRole(edge.sourcePortId ?? "next", label) }, "source"));
    edges.push({
      id: edge.id ?? `${source}-${target}-${index}`,
      source,
      target,
      sourceHandle: sourcePort?.id ?? edge.sourcePortId ?? automationPortIdFromLabel(label),
      targetHandle: targetPort?.id ?? edge.targetPortId ?? "in",
      type: "automationEdge",
      data: { ...(edge.metadata ?? {}), label, lane: chooseAutomationEdgeLane(source, target, edges, nodes, edge.id ?? `${source}-${target}-${index}`, count), siblingIndex: count, routeIndex: count, sourcePort: sourcePort?.id ?? edge.sourcePortId ?? automationPortIdFromLabel(label), targetPort: targetPort?.id ?? edge.targetPortId ?? "in" },
      label,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      style: { stroke: color, strokeWidth: 3 }
    });
  }
  return { nodes, edges };
}

function automationNodeSpecForDefinition(definitionId: string | undefined, nodeDefinitions: any[] = []): AutomationEditorNodeSpec | undefined {
  if (!definitionId) return undefined;
  const builtin = automationEditorPalette.flatMap((group) => group.nodes).find((node) => node.id === definitionId);
  if (builtin) return builtin;
  const dynamic = nodeDefinitions.find((definition) => definition?.id === definitionId);
  if (!dynamic) return undefined;
  return {
    id: dynamic.id,
    version: dynamic.version ?? "1.0.0",
    label: dynamic.label ?? dynamic.id,
    description: dynamic.description ?? "Custom automation node",
    family: dynamic.category ?? "custom",
    scope: dynamic.legacyScope ?? "both",
    nodeType: "custom",
    inputs: dynamic.inputs ?? [],
    outputs: dynamic.outputs ?? [],
    parameters: dynamic.parameters ?? [],
    ...(dynamic.icon ? { icon: dynamic.icon } : {}),
    ...(dynamic.safety?.privileged === true ? { privileged: true } : {}),
    ...(dynamic.outputAction ? { actionTypes: ["action"] } : {}),
    source: dynamic.source,
    availability: dynamic.availability
  };
}

function legacyPolicyParameterValues(node: any): JsonObject {
  const action = (node.actions ?? [])[0] ?? {};
  if (!action.outputId && !action.actionType) return {};
  return {
    outputId: action.outputId ?? action.actionType ?? "",
    parameters: action.parameters ?? {},
    confirmationInputId: action.confirmationInputId ?? "",
    confirmationTimeoutMs: action.confirmationTimeoutMs ?? 5_000,
    timeoutMs: node.timeout?.timeoutMs ?? node.timeoutMs ?? 5_000,
    requiresApproval: action.metadata?.requiresApproval === true,
    failureRoute: "failed"
  } as JsonObject;
}

function flowNodeOutputPorts(node: any, flowEdges: any[], definitionOutputs: AutomationNodePort[]): AutomationNodePort[] {
  if (definitionOutputs.length) return definitionOutputs;
  const ports = flowEdges
    .filter((edge: any) => String(edge.sourceNodeId ?? edge.source ?? "") === String(node.id))
    .map((edge: any, index: number) => {
      const label = edge.label ?? edge.metadata?.label ?? edge.sourcePortId ?? (index === 0 ? "Next" : `Branch ${index + 1}`);
      const id = String(edge.sourcePortId ?? automationPortIdFromLabel(label));
      return { id, label: String(label), valueType: "any" as const, role: flowOutputRole(id, label) };
    });
  return ports.length ? uniqueAutomationPorts(ports) : [{ id: "success", label: "Success", valueType: "any", role: "success" }];
}

function flowEdgeSourcePort(edge: any, ports: AutomationNodePort[], routeIndex: number): AutomationNodePort | undefined {
  const requestedId = String(edge.sourcePortId ?? edge.sourceHandle ?? edge.metadata?.sourcePort ?? "").trim();
  if (requestedId) {
    const byId = ports.find((port) => port.id === requestedId);
    if (byId) return byId;
  }
  return ports[routeIndex] ?? ports[0];
}

function flowEdgeTargetPort(edge: any, ports: AutomationNodePort[]): AutomationNodePort | undefined {
  const requestedId = String(edge.targetPortId ?? edge.targetHandle ?? edge.metadata?.targetPort ?? "").trim();
  return requestedId ? ports.find((port) => port.id === requestedId) : ports.find((port) => port.id === "in") ?? ports[0];
}

function legacyPolicyEdgeSourcePort(edge: any, ports: AutomationNodePort[], label: unknown, routeIndex: number): AutomationNodePort | undefined {
  const requestedId = String(edge.sourceHandle ?? edge.sourcePortId ?? edge.sourcePort ?? edge.metadata?.sourcePortId ?? edge.metadata?.sourcePort ?? edge.data?.sourcePort ?? "").trim();
  if (requestedId) {
    const byId = ports.find((port) => port.id === requestedId);
    if (byId) return byId;
  }
  const labelId = automationPortIdFromLabel(label);
  return ports.find((port) => port.id === labelId)
    ?? ports.find((port) => automationPortDisplayLabel(port).toLowerCase() === String(label ?? "").toLowerCase())
    ?? ports[routeIndex]
    ?? ports[0];
}

function legacyPolicyEdgeTargetPort(edge: any, ports: AutomationNodePort[]): AutomationNodePort | undefined {
  const requestedId = String(edge.targetHandle ?? edge.targetPortId ?? edge.targetPort ?? edge.metadata?.targetPortId ?? edge.metadata?.targetPort ?? edge.data?.targetPort ?? "").trim();
  return requestedId ? ports.find((port) => port.id === requestedId) : ports.find((port) => port.id === "in") ?? ports[0];
}

export function legacyPolicyInputPorts(node: any, index: number): AutomationNodePort[] {
  if (index === 0 || node.isStart) return [];
  return [{ id: "in", label: "In", valueType: "any", role: "control" }];
}

export function legacyPolicyNodeDescription(node: any): string {
  const actions = (node.actions ?? []).map((action: any) => action.actionType).filter(Boolean);
  if (actions.length) return actions.join(", ");
  if (node.description) return String(node.description);
  if (node.recovery?.strategy) return `Recovery: ${String(node.recovery.strategy).replace(/_/g, " ")}`;
  return "Generated Flow node";
}

export function legacyPolicyNodeIcon(node: any, index: number): string {
  if (index === 0 || node.isStart) return "workflow";
  const actions = (node.actions ?? []).map((action: any) => String(action.actionType ?? "").toLowerCase());
  if (actions.some((action: string) => action.includes("database") || action.includes("record"))) return "database";
  if (actions.some((action: string) => action.includes("random"))) return "dice-5";
  if (actions.some((action: string) => action.includes("calculate") || action.includes("math"))) return "calculator";
  if (node.recovery?.strategy) return "shield";
  return "git-branch";
}

export function legacyPolicyOutputPorts(node: any, sourceEdges: any[]): AutomationNodePort[] {
  const outgoing = sourceEdges.filter((edge) => String(edge.fromNodeId ?? edge.source ?? "") === String(node.id));
  const ports = outgoing.map((edge, index) => {
    const label = edge.label ?? edge.kind ?? edge.type ?? (edge.probability !== undefined ? `${Math.round(Number(edge.probability) * 100)}%` : index === 0 ? "Next" : `Branch ${index + 1}`);
    const id = automationPortIdFromLabel(label);
    return { id, label: String(label), valueType: "any" as const, role: flowOutputRole(id, label) };
  });
  return ports.length ? uniqueAutomationPorts(ports) : [{ id: "success", label: "Success", valueType: "any", role: "success" }];
}

export function flowOutputRole(id: string, label: unknown): NonNullable<AutomationNodePort["role"]> {
  const semantic = `${id} ${String(label ?? "")}`.toLowerCase();
  if (semantic.includes("success") || semantic.includes("pass") || semantic.includes("approved")) return "success";
  if (semantic.includes("fail") || semantic.includes("error") || semantic.includes("timeout") || semantic.includes("reject")) return "failure";
  return "branch";
}

export function layoutAutomationFlowNodes(sourceNodes: any[], sourceEdges: any[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const ids = sourceNodes.map((node) => String(node.id));
  const knownIds = new Set(ids);
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const id of ids) incomingCount.set(id, 0);
  for (const edge of sourceEdges) {
    const source = String(edge.fromNodeId ?? edge.source ?? "");
    const target = String(edge.toNodeId ?? edge.target ?? "");
    if (!knownIds.has(source) || !knownIds.has(target)) continue;
    outgoing.set(source, [...(outgoing.get(source) ?? []), target]);
    incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
  }

  const roots = ids.filter((id) => (incomingCount.get(id) ?? 0) === 0);
  const queue = roots.length ? roots.map((id) => ({ id, level: 0 })) : ids.slice(0, 1).map((id) => ({ id, level: 0 }));
  const levelById = new Map<string, number>();
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const previousLevel = levelById.get(current.id);
    if (previousLevel !== undefined) continue;
    levelById.set(current.id, current.level);
    for (const target of outgoing.get(current.id) ?? []) queue.push({ id: target, level: current.level + 1 });
  }
  for (const id of ids) {
    if (!levelById.has(id)) levelById.set(id, Math.max(0, ...levelById.values()) + 1);
  }

  const lanesByLevel = new Map<number, string[]>();
  for (const id of ids) {
    const level = levelById.get(id) ?? 0;
    lanesByLevel.set(level, [...(lanesByLevel.get(level) ?? []), id]);
  }
  for (const [level, levelIds] of lanesByLevel) {
    const centerOffset = (levelIds.length - 1) / 2;
    levelIds.forEach((id, index) => {
      positions.set(id, {
        x: level * 360,
        y: 220 + (index - centerOffset) * 190
      });
    });
  }
  return positions;
}


export function countConditionLeaves(group: any): number {
  if (!group) return 0;
  if (Array.isArray(group)) return group.reduce((total: number, condition: any) => total + countConditionLeaves(condition), 0);
  if (group.signalPath) return 1;
  if (!group.conditions) return 0;
  return group.conditions.reduce((total: number, condition: any) => total + countConditionLeaves(condition), 0);
}
