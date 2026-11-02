import type { JsonObject, JsonValue } from "../../../core/index.ts";
import {
  AUTOMATION_STUDIO_HANDLER_DEFINITION_ID,
  AUTOMATION_STUDIO_HANDLER_DISPOSITIONS,
  AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID,
  AUTOMATION_STUDIO_HANDLER_SCOPE_KINDS,
  AUTOMATION_STUDIO_LIFECYCLE_EVENTS,
  AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS,
  automationStudioDispositionAllowedAt,
  automationStudioLifecycleEventApplies,
  type AutomationStudioHandlerDispositionKind,
  type AutomationStudioLifecycleEvent
} from "../../../components/automation/control-flow/index.ts";
import type { ExecutableGraph, AutomationStudioFlowNode } from "../graph/index.ts";
import type { ExecutableGraphValidationContext } from "./graph-context.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";
import { isSemanticVersion } from "./semantic-version.ts";

/** Validate actual graph structure and handlers with the enclosing output contract supplied explicitly. */
export function validateExecutableGraph(graph: ExecutableGraph, context: ExecutableGraphValidationContext): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  validateFlowGraph(graph, issues);
  validateFlowHandlers(graph, issues, context);
  validateFlowReachability(graph, issues);
  return result(issues);
}

const LIFECYCLE_EVENTS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_LIFECYCLE_EVENTS);
const HANDLER_SCOPE_KINDS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_HANDLER_SCOPE_KINDS);
const HANDLER_DISPOSITIONS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_HANDLER_DISPOSITIONS);
const CLEARS_INTERFERENCE_METADATA_KEY = "clearsInterference";
const BODY_PORT_ID = "body";
type HandlerScope = { kind: "automation" } | { kind: "subflow" } | { kind: "nodes"; nodeIds: string[] };

function validateFlowGraph(flow: ExecutableGraph, issues: AutomationStudioValidationIssue[]): void {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const [index, node] of flow.nodes.entries()) {
    const path = `nodes.${index}`;
    if (!node.id.trim()) addIssue(issues, "error", "flow.node_missing_id", "Flow node must have an id.", `${path}.id`);
    if (!node.definitionId.trim()) addIssue(issues, "error", "flow.node_missing_definition", "Flow node must have a definitionId.", `${path}.definitionId`);
    if (node.definitionVersion !== undefined && !isSemanticVersion(node.definitionVersion)) addIssue(issues, "error", "flow.node_invalid_definition_version", "Flow node definitionVersion must use major.minor.patch semantic versioning.", `${path}.definitionVersion`);
    if (nodeIds.has(node.id)) addIssue(issues, "error", "flow.duplicate_node_id", `Duplicate Flow node id "${node.id}".`, `${path}.id`);
    nodeIds.add(node.id);
  }
  for (const [index, edge] of flow.edges.entries()) {
    const path = `edges.${index}`;
    if (!edge.id.trim()) addIssue(issues, "error", "flow.edge_missing_id", "Flow edge must have an id.", `${path}.id`);
    if (edgeIds.has(edge.id)) addIssue(issues, "error", "flow.duplicate_edge_id", `Duplicate Flow edge id "${edge.id}".`, `${path}.id`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.sourceNodeId)) addIssue(issues, "error", "flow.edge_missing_source_node", `Flow edge references missing source node "${edge.sourceNodeId}".`, `${path}.sourceNodeId`);
    if (!nodeIds.has(edge.targetNodeId)) addIssue(issues, "error", "flow.edge_missing_target_node", `Flow edge references missing target node "${edge.targetNodeId}".`, `${path}.targetNodeId`);
    if ((edge.sourcePortId === undefined) !== (edge.targetPortId === undefined)) {
      addIssue(issues, "error", "flow.edge_incomplete_port_binding", "Flow edge must declare both sourcePortId and targetPortId or neither.", path);
    }
  }
}

/**
 * Refuses a handler the runtime could not dispatch as written: an unknown
 * event; a scope that is not one of the three shapes, names a node outside the
 * graph, names Core plumbing the event never fires at
 * (`runtime/executor/lifecycle/event-applies.ts`), or is `automation` outside
 * the recovery Subflow; a `before`/`retry`
 * handler without a `completionCheck`; a body with no Handler End, or with a
 * Handler inside it; a Handler End whose disposition is unknown or not allowed
 * at the event (`resume` at `fail`, `resolve` anywhere else), whose Route names
 * no known checkpoint, or whose `resolve` does not cover the outputs it stands
 * in for.
 */
function validateFlowHandlers(flow: ExecutableGraph, issues: AutomationStudioValidationIssue[], context: ExecutableGraphValidationContext): void {
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  const checkpointIds = new Set<string>(context.externalCheckpointIds ?? []);
  for (const node of flow.nodes) {
    const checkpoint = node.metadata?.[AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.checkpoint];
    if (isJsonObject(checkpoint) && typeof checkpoint.id === "string" && checkpoint.id.trim()) checkpointIds.add(checkpoint.id.trim());
  }
  for (const [index, node] of flow.nodes.entries()) {
    if (node.definitionId !== AUTOMATION_STUDIO_HANDLER_DEFINITION_ID) continue;
    const path = `nodes.${index}.parameterValues`;
    const parameters = node.parameterValues ?? {};
    const event = typeof parameters.event === "string" && LIFECYCLE_EVENTS.has(parameters.event) ? (parameters.event as AutomationStudioLifecycleEvent) : undefined;
    if (!event) addIssue(issues, "error", "flow.handler_unknown_event", `Handler "${node.id}" must run at one of ${AUTOMATION_STUDIO_LIFECYCLE_EVENTS.join(", ")}.`, `${path}.event`);
    const scope = handlerScope(parameters.scope);
    if (!scope) {
      addIssue(issues, "error", "flow.handler_invalid_scope", `Handler "${node.id}" must apply to { kind: "automation" }, { kind: "subflow" } or { kind: "nodes", nodeIds }.`, `${path}.scope`);
    } else if (scope.kind === "nodes") {
      for (const nodeId of scope.nodeIds.filter((id) => !nodesById.has(id))) {
        addIssue(issues, "error", "flow.handler_scope_node_outside_graph", `Handler "${node.id}" names node "${nodeId}", which is not in this graph.`, `${path}.scope.nodeIds`);
      }
      for (const named of scope.nodeIds.map((id) => nodesById.get(id)).filter((named) => named && event && !automationStudioLifecycleEventApplies(event, named))) {
        addIssue(issues, "error", "flow.handler_scope_plumbing_node", `Handler "${node.id}" names node "${named!.id}" (${named!.definitionId}), which neither acts on nor reads the host, so "${event}" never fires there.`, `${path}.scope.nodeIds`);
      }
    } else if (scope.kind === "automation" && context.subflowRole !== "recovery") {
      addIssue(issues, "error", "flow.handler_automation_scope_outside_recovery", `Handler "${node.id}" applies to the whole automation, which only the automation's recovery Subflow graph may declare.`, `${path}.scope.kind`);
    }
    if ((event === "before" || event === "retry") && !(Array.isArray(parameters.completionCheck) && parameters.completionCheck.length)) {
      addIssue(issues, "error", "flow.handler_missing_completion_check", `Handler "${node.id}" runs ${event === "before" ? "before an attempt" : "before a retry"}, so it must say what proves it worked (completionCheck).`, `${path}.completionCheck`);
    }
    const body = handlerBody(flow, node.id);
    if (!body.ends.length) addIssue(issues, "error", "flow.handler_body_without_end", `Handler "${node.id}" has no body ending at a Handler End.`, `nodes.${index}`);
    for (const nested of body.handlers) {
      addIssue(issues, "error", "flow.handler_inside_body", `Handler "${nested}" is inside the body of handler "${node.id}"; a handler body never registers another.`, `nodes.${index}`);
    }
    for (const end of body.ends) validateHandlerEnd(flow, node.id, event, scope, end, checkpointIds, context.requiredSubflowOutputIds, issues);
  }
}

function validateHandlerEnd(
  flow: ExecutableGraph,
  handlerId: string,
  event: AutomationStudioLifecycleEvent | undefined,
  scope: HandlerScope | undefined,
  end: AutomationStudioFlowNode,
  checkpointIds: ReadonlySet<string>,
  requiredSubflowOutputIds: readonly string[],
  issues: AutomationStudioValidationIssue[]
): void {
  const index = flow.nodes.indexOf(end);
  const path = `nodes.${index}.parameterValues`;
  const parameters = end.parameterValues ?? {};
  const written = parameters.disposition ?? "unhandled";
  if (typeof written !== "string" || !HANDLER_DISPOSITIONS.has(written)) {
    addIssue(issues, "error", "flow.handler_end_unknown_disposition", `Handler End "${end.id}" must end with one of ${AUTOMATION_STUDIO_HANDLER_DISPOSITIONS.join(", ")}.`, `${path}.disposition`);
    return;
  }
  const disposition = written as AutomationStudioHandlerDispositionKind;
  if (event && !automationStudioDispositionAllowedAt(event, disposition)) {
    addIssue(issues, "error", "flow.handler_disposition_not_allowed", `Handler End "${end.id}" ends handler "${handlerId}" with "${disposition}", which a ${event} handler may not: ${disposition === "resume" ? "no success continues a failure" : "only a failure can be resolved"}.`, `${path}.disposition`);
  }
  if (disposition === "route") {
    const checkpointId = typeof parameters.checkpointId === "string" ? parameters.checkpointId.trim() : "";
    if (!checkpointIds.has(checkpointId)) {
      addIssue(issues, "error", "flow.handler_unknown_checkpoint", `Handler End "${end.id}" routes to checkpoint "${checkpointId}", which no graph of this automation declares.`, `${path}.checkpointId`);
    }
  }
  if (disposition === "resolve" && scope) {
    const outputs = isJsonObject(parameters.outputs) ? parameters.outputs : {};
    const missing = requiredOutputIds(flow, scope, requiredSubflowOutputIds).filter((outputId) => outputs[outputId] === undefined);
    if (missing.length) {
      addIssue(issues, "error", "flow.handler_resolve_missing_outputs", `Handler End "${end.id}" resolves handler "${handlerId}" without the required output${missing.length === 1 ? "" : "s"} ${missing.join(", ")}.`, `${path}.outputs`);
    }
  }
}

function handlerScope(value: JsonValue | undefined): HandlerScope | undefined {
  if (!isJsonObject(value) || typeof value.kind !== "string" || !HANDLER_SCOPE_KINDS.has(value.kind)) return undefined;
  if (value.kind === "automation") return { kind: "automation" };
  if (value.kind === "subflow") return { kind: "subflow" };
  const nodeIds = value.nodeIds;
  if (!Array.isArray(nodeIds) || !nodeIds.length || !nodeIds.every((id) => typeof id === "string" && id.length > 0)) return undefined;
  return { kind: "nodes", nodeIds: nodeIds as string[] };
}

/**
 * The nodes a handler's body reaches from its `body` port, by any route,
 * stopping at each Handler End: the Handler Ends it can finish at, and any
 * Handler met on the way.
 */
function handlerBody(flow: ExecutableGraph, handlerId: string): { ends: AutomationStudioFlowNode[]; handlers: string[] } {
  const nodesById = new Map(flow.nodes.map((node) => [node.id, node]));
  const nodeIds = new Set<string>();
  const ends: AutomationStudioFlowNode[] = [];
  const handlers: string[] = [];
  const pending = flow.edges.filter((edge) => edge.sourceNodeId === handlerId && edge.sourcePortId === BODY_PORT_ID).map((edge) => edge.targetNodeId);
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (nodeIds.has(nodeId) || nodeId === handlerId) continue;
    const node = nodesById.get(nodeId);
    if (!node) continue;
    nodeIds.add(nodeId);
    if (node.definitionId === AUTOMATION_STUDIO_HANDLER_END_DEFINITION_ID) {
      ends.push(node);
      continue;
    }
    if (node.definitionId === AUTOMATION_STUDIO_HANDLER_DEFINITION_ID) handlers.push(node.id);
    for (const edge of flow.edges) if (edge.sourceNodeId === nodeId) pending.push(edge.targetNodeId);
  }
  return { ends, handlers };
}

/**
 * What a `resolve` must supply. At node scope, every output another node of
 * the graph reads from a named node over a data edge, plus any a node lists in
 * `metadata.requiredOutputs`. At subflow scope, the graph's required interface
 * outputs. At automation scope the failing frame is not known here, so the
 * runtime checks the contract when it resolves.
 */
function requiredOutputIds(flow: ExecutableGraph, scope: HandlerScope, requiredSubflowOutputIds: readonly string[]): string[] {
  if (scope.kind === "subflow") return [...requiredSubflowOutputIds];
  if (scope.kind === "automation") return [];
  const required = new Set<string>();
  for (const nodeId of scope.nodeIds) {
    for (const edge of flow.edges) {
      if (edge.sourceNodeId !== nodeId || !edge.sourcePortId || !edge.targetPortId || edge.targetPortId === "in") continue;
      required.add(edge.sourcePortId);
    }
    const declared = flow.nodes.find((node) => node.id === nodeId)?.metadata?.requiredOutputs;
    if (Array.isArray(declared)) for (const outputId of declared) if (typeof outputId === "string" && outputId) required.add(outputId);
  }
  return [...required];
}

/**
 * Warns about a node no route enters, when the graph declares its Start. A
 * node the runtime enters without a route is not one: the Start, a Handler (a
 * registration, never walked into), a node declaring an alternative entry, and
 * a node that clears interference (an implicit registration). A node a
 * Handler's body reaches is entered by that body's route, so it is not
 * reported either. Without a Start node the runtime chooses the start from
 * the graph's roots (`runtime/executor/start-node.ts`) and says itself when it
 * cannot.
 */
function validateFlowReachability(flow: ExecutableGraph, issues: AutomationStudioValidationIssue[]): void {
  if (!flow.nodes.some((node) => node.definitionId === "builtin.control.start")) return;
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const entered = new Set(flow.edges.filter((edge) => edge.sourceNodeId !== edge.targetNodeId && nodeIds.has(edge.sourceNodeId)).map((edge) => edge.targetNodeId));
  for (const [index, node] of flow.nodes.entries()) {
    if (entered.has(node.id) || enteredWithoutRoute(node)) continue;
    addIssue(issues, "warning", "flow.node_unreachable", `Node "${node.id}" has no incoming route and cannot be reached.`, `nodes.${index}`);
  }
}

function enteredWithoutRoute(node: AutomationStudioFlowNode): boolean {
  return node.definitionId === "builtin.control.start"
    || node.definitionId === AUTOMATION_STUDIO_HANDLER_DEFINITION_ID
    || node.metadata?.[AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.entry] !== undefined
    || node.metadata?.[CLEARS_INTERFERENCE_METADATA_KEY] === true;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
