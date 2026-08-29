import type { Edge, Node } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";
import { automationPortTypesCompatible } from "../graph/ports";
import { automationParameterError } from "../parameters/ParameterEditor";
export type AutomationGraphProblem = {
  id: string;
  kind: "node" | "edge" | "graph";
  targetId: string | null;
  label: string;
  message: string;
};

export function automationFlowGraphProblems(nodes: Array<Node<AutomationFlowNodeData>>, edges: Edge[]): AutomationGraphProblem[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const problems: AutomationGraphProblem[] = [];
  for (const edge of edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      problems.push({ id: "dangling:" + edge.id, kind: "edge", targetId: edge.id, label: "Dangling edge", message: "This connection references a node that no longer exists." });
      continue;
    }
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    const sourcePort = source.data.outputs?.find((port) => port.id === edge.sourceHandle);
    const targetPort = target.data.inputs?.find((port) => port.id === edge.targetHandle);
    if (edge.source === edge.target || !sourcePort || !targetPort || !automationPortTypesCompatible(sourcePort.valueType, targetPort.valueType)) {
      problems.push({ id: "incompatible:" + edge.id, kind: "edge", targetId: edge.id, label: "Incompatible connection", message: "The connected ports use incompatible value types." });
    }
  }
  const startNodes = nodes.filter((node) => node.data.isStart || node.data.nodeDefinitionId === "builtin.control.start");
  const startNodeIds = new Set(startNodes.map((node) => node.id));
  if (!startNodes.length) problems.push({ id: "start:missing", kind: "graph", targetId: null, label: "Start node", message: "Add one Start node to define where execution begins." });
  if (startNodes.length > 1) problems.push({ id: "start:multiple", kind: "graph", targetId: null, label: "Start nodes", message: "Keep one Start node so execution has an unambiguous entry point." });
  for (const node of nodes) {
    for (const parameter of node.data.parameters ?? []) {
      const error = automationParameterError(parameter, node.data.parameterValues?.[parameter.id]);
      if (error) problems.push({ id: "parameter:" + node.id + ":" + parameter.id, kind: "node", targetId: node.id, label: node.data.label + " / " + parameter.label, message: error });
    }
    if (!startNodeIds.has(node.id) && (incoming.get(node.id) ?? 0) === 0) {
      problems.push({ id: "unreachable:" + node.id, kind: "node", targetId: node.id, label: node.data.label, message: "This node has no incoming route and cannot be reached." });
    }
  }
  return problems;
}

/** @deprecated Use automationFlowGraphProblems. */
export const automationPolicyGraphProblems = automationFlowGraphProblems;
