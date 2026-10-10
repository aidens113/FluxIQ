import type { Edge, Node } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";
import { automationPortTypesCompatible } from "../graph/ports";
import { automationParameterError } from "../parameters/ParameterEditor";
import { FLOW_CONTRACT_KEYS, FLOW_HANDLER_DEFINITION_ID, FLOW_HANDLER_END_DEFINITION_ID } from "../graph/handlers";
export type AutomationGraphProblem = {
  id: string;
  kind: "node" | "edge" | "graph";
  targetId: string | null;
  label: string;
  message: string;
};

/**
 * What the graph cannot say about itself: the role of the Subflow it is the
 * graph of (only a `recovery` graph may hold automation-scoped handlers), and
 * the checkpoints the automation's other graphs declare, which a Route may
 * also name. Mirrors Core's `AutomationStudioFlowValidationContext`.
 */
export type AutomationGraphValidationContext = {
  subflowRole?: string;
  externalCheckpointIds?: readonly string[];
};

type FlowNode = Node<AutomationFlowNodeData>;

// Lifecycle handlers (state-aware recovery plan, C4). The editor's mirror of
// Core's `validateFlowHandlers` in `model/validation/flow.ts`, which stays the
// authority. The events and dispositions are read off the node definitions'
// own parameter options; the ids are those definitions' (`graph/handlers/vocabulary.ts`).
const HANDLER_DEFINITION_ID = FLOW_HANDLER_DEFINITION_ID;
const HANDLER_END_DEFINITION_ID = FLOW_HANDLER_END_DEFINITION_ID;
const ENTRY_METADATA_KEY = FLOW_CONTRACT_KEYS.entry;
const CHECKPOINT_METADATA_KEY = FLOW_CONTRACT_KEYS.checkpoint;
const CLEARS_INTERFERENCE_METADATA_KEY = FLOW_CONTRACT_KEYS.clearsInterference;

export function automationFlowGraphProblems(nodes: Array<Node<AutomationFlowNodeData>>, edges: Edge[], context: AutomationGraphValidationContext = {}): AutomationGraphProblem[] {
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
    // A Handler is a registration the runtime enters without a route, as are an
    // alternative entry and a node that clears interference. A node a Handler's
    // body reaches is entered by that body's route, so it is never reported.
    if (!startNodeIds.has(node.id) && (incoming.get(node.id) ?? 0) === 0 && !enteredWithoutRoute(node)) {
      problems.push({ id: "unreachable:" + node.id, kind: "node", targetId: node.id, label: node.data.label, message: "This node has no incoming route and cannot be reached." });
    }
  }
  if (nodes.some((node) => node.data.nodeDefinitionId === HANDLER_DEFINITION_ID)) problems.push(...handlerProblems(nodes, nodesById, edges, context));
  return problems;
}

/** @deprecated Use automationFlowGraphProblems. */
export const automationPolicyGraphProblems = automationFlowGraphProblems;

function enteredWithoutRoute(node: FlowNode): boolean {
  return node.data.nodeDefinitionId === HANDLER_DEFINITION_ID
    || node.data.metadata?.[ENTRY_METADATA_KEY] !== undefined
    || node.data.metadata?.[CLEARS_INTERFERENCE_METADATA_KEY] === true;
}

function handlerProblems(nodes: FlowNode[], nodesById: Map<string, FlowNode>, edges: Edge[], context: AutomationGraphValidationContext): AutomationGraphProblem[] {
  const problems: AutomationGraphProblem[] = [];
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const leaving = outgoing.get(edge.source);
    if (leaving) leaving.push(edge);
    else outgoing.set(edge.source, [edge]);
  }
  const checkpointIds = new Set<string>(context.externalCheckpointIds ?? []);
  for (const node of nodes) {
    const checkpoint = node.data.metadata?.[CHECKPOINT_METADATA_KEY];
    if (isRecord(checkpoint) && typeof checkpoint.id === "string" && checkpoint.id.trim()) checkpointIds.add(checkpoint.id.trim());
  }
  const problem = (node: FlowNode, code: string, label: string, message: string): void => {
    problems.push({ id: "handler:" + code + ":" + node.id, kind: "node", targetId: node.id, label: node.data.label + " / " + label, message });
  };
  for (const handler of nodes) {
    if (handler.data.nodeDefinitionId !== HANDLER_DEFINITION_ID) continue;
    const values = handler.data.parameterValues ?? {};
    const events = optionValues(handler, "event");
    const event = typeof values.event === "string" && (!events || events.includes(values.event)) ? values.event : undefined;
    if (!event) problem(handler, "unknown_event", "Runs at", "Choose the lifecycle point this handler runs at.");
    const scope = isRecord(values.scope) ? values.scope : undefined;
    const scopeNodeIds = scope?.kind === "nodes" && Array.isArray(scope.nodeIds) && scope.nodeIds.length && scope.nodeIds.every((id) => typeof id === "string" && id) ? (scope.nodeIds as string[]) : undefined;
    if (!scope || (scope.kind !== "automation" && scope.kind !== "subflow" && !scopeNodeIds)) {
      problem(handler, "invalid_scope", "Applies to", "Say where the handler applies: some nodes, this part, or the whole automation.");
    } else if (scopeNodeIds) {
      const outside = scopeNodeIds.filter((id) => !nodesById.has(id));
      if (outside.length) problem(handler, "scope_node_outside_graph", "Applies to", "The handler names nodes that are not in this graph: " + outside.join(", ") + ".");
    } else if (scope.kind === "automation" && context.subflowRole !== "recovery") {
      problem(handler, "automation_scope_outside_recovery", "Applies to", "Only the automation's recovery part may hold a handler for the whole automation.");
    }
    if ((event === "before" || event === "retry") && !(Array.isArray(values.completionCheck) && values.completionCheck.length)) {
      problem(handler, "missing_completion_check", "Worked when", "A handler that runs before an attempt or a retry must say what proves it worked.");
    }
    const body = handlerBody(handler.id, nodesById, outgoing);
    if (!body.ends.length) problem(handler, "body_without_end", "Body", "The handler's body must end at a Handler End.");
    if (body.handlers.length) problem(handler, "handler_inside_body", "Body", "A handler's body cannot hold another handler: " + body.handlers.join(", ") + ".");
    const required = scopeNodeIds ? requiredOutputIds(scopeNodeIds, outgoing) : [];
    for (const end of body.ends) {
      const endValues = end.data.parameterValues ?? {};
      const disposition = typeof endValues.disposition === "string" ? endValues.disposition : "unhandled";
      const dispositions = optionValues(end, "disposition");
      if (dispositions && !dispositions.includes(disposition)) {
        problem(end, "unknown_disposition", "Then", "Choose how the run continues after this handler.");
        continue;
      }
      if (event && ((disposition === "resume" && event === "fail") || (disposition === "resolve" && event !== "fail"))) {
        problem(end, "disposition_not_allowed", "Then", disposition === "resume" ? "A failure handler cannot carry on with the failed step." : "Only a failure handler can supply outputs in place of a step's.");
      }
      if (disposition === "route") {
        const checkpointId = typeof endValues.checkpointId === "string" ? endValues.checkpointId.trim() : "";
        if (!checkpointIds.has(checkpointId)) problem(end, "unknown_checkpoint", "Checkpoint", "No part of this automation declares the checkpoint \"" + checkpointId + "\".");
      }
      if (disposition === "resolve") {
        const outputs = isRecord(endValues.outputs) ? endValues.outputs : {};
        const missing = required.filter((outputId) => outputs[outputId] === undefined);
        if (missing.length) problem(end, "resolve_missing_outputs", "Outputs", "The handler must supply the outputs the step was to produce: " + missing.join(", ") + ".");
      }
    }
  }
  return problems;
}

/** The node's parameter options, or nothing when the definition offers none (then the value is left for Core to judge). */
function optionValues(node: FlowNode, parameterId: string): string[] | undefined {
  const options = node.data.parameters?.find((parameter) => parameter.id === parameterId)?.options;
  return options?.length ? options.map((option) => option.value) : undefined;
}

function handlerBody(handlerId: string, nodesById: Map<string, FlowNode>, outgoing: Map<string, Edge[]>): { ends: FlowNode[]; handlers: string[] } {
  const seen = new Set<string>();
  const ends: FlowNode[] = [];
  const handlers: string[] = [];
  const pending = (outgoing.get(handlerId) ?? []).filter((edge) => edge.sourceHandle === "body").map((edge) => edge.target);
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (seen.has(nodeId) || nodeId === handlerId) continue;
    const node = nodesById.get(nodeId);
    if (!node) continue;
    seen.add(nodeId);
    if (node.data.nodeDefinitionId === HANDLER_END_DEFINITION_ID) {
      ends.push(node);
      continue;
    }
    if (node.data.nodeDefinitionId === HANDLER_DEFINITION_ID) handlers.push(node.id);
    for (const edge of outgoing.get(nodeId) ?? []) pending.push(edge.target);
  }
  return { ends, handlers };
}

/** Outputs another node reads from the named nodes over a data edge: what a `resolve` stands in for at node scope. */
function requiredOutputIds(nodeIds: readonly string[], outgoing: Map<string, Edge[]>): string[] {
  const required = new Set<string>();
  for (const nodeId of nodeIds) {
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (edge.sourceHandle && edge.targetHandle && edge.targetHandle !== "in") required.add(edge.sourceHandle);
    }
  }
  return [...required];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
