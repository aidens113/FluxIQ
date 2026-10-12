// Every handler registration one graph declares, explicit or implicit
// (state-aware recovery plan, C4).
//
// This module owns reading a graph into registrations. Handler nodes are read
// from their parameters; the authored `failed` edge, `error.<id>` ports and
// the optional way-on are read as node-scoped On Fail registrations; and each
// `metadata.clearsInterference` node is read as an implicit automation-scope
// `retry` registration. Reading them describes them: the step loop still runs
// them as it does today until the dispatcher is wired in (R2).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_HANDLER_DEFINITION_ID, AUTOMATION_STUDIO_LIFECYCLE_EVENTS, type AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import { automationStudioOptionalStepWayOn } from "../step-skip/index.ts";
import { parseAutomationStudioFactConditions } from "./fact-conditions-parse.ts";
import type { AutomationStudioHandlerRegistration, AutomationStudioHandlerScope } from "./registration.ts";

/** The node metadata that marks a node as one that clears interference (`../ladder-run.ts`). */
const CLEARS_INTERFERENCE_METADATA_KEY = "clearsInterference";

/**
 * The `order` an authored path takes. An authored `failed` edge or way-on
 * always applies, so it comes after every conditional handler at its level;
 * otherwise a node-scoped handler whose `when` holds would never be reached.
 */
export const AUTOMATION_STUDIO_AUTHORED_PATH_ORDER = Number.MAX_SAFE_INTEGER;

const EVENTS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_LIFECYCLE_EVENTS);

/** The graph a registration list is read from: its nodes and edges, and which graph and Subflow it is. */
export type AutomationStudioRegistrationGraph = {
  graphFlowId: string;
  subflowId: string | null;
  nodes: readonly AutomationStudioFlowNode[];
  edges: readonly AutomationStudioFlowEdge[];
};

/**
 * The graph's registrations in document order: Handler nodes first in node
 * order, then each node's authored On Fail paths, then the implicit
 * interference registrations. `problems` names each Handler whose parameters
 * could not be read; such a Handler is left out rather than run half-read.
 */
export function automationStudioGraphHandlerRegistrations(graph: AutomationStudioRegistrationGraph): { registrations: AutomationStudioHandlerRegistration[]; problems: string[] } {
  const registrations: AutomationStudioHandlerRegistration[] = [];
  const problems: string[] = [];
  const base = { graphFlowId: graph.graphFlowId, subflowId: graph.subflowId };
  graph.nodes.forEach((node, index) => {
    if (node.definitionId !== AUTOMATION_STUDIO_HANDLER_DEFINITION_ID) return;
    const read = handlerNodeRegistration(graph, node, index, problems);
    if (read) registrations.push(read);
  });
  const authoredOffset = graph.nodes.length;
  // The way-on reader takes mutable lists; one copy serves every node.
  const flow = { nodes: [...graph.nodes], edges: [...graph.edges] };
  graph.nodes.forEach((node, index) => {
    if (node.definitionId === AUTOMATION_STUDIO_HANDLER_DEFINITION_ID) return;
    for (const path of authoredOnFailPaths(flow, node)) {
      registrations.push({
        ...base,
        handlerId: `${graph.graphFlowId}/${path.edge.id}`,
        event: "fail",
        scope: { kind: "nodes", nodeIds: [node.id] },
        when: [],
        order: AUTOMATION_STUDIO_AUTHORED_PATH_ORDER,
        completionCheck: [],
        maxRuns: 1,
        documentIndex: authoredOffset + index,
        source: path.wayOn
          ? { kind: "optional_way_on", nodeId: node.id, edgeId: path.edge.id, targetNodeId: path.edge.targetNodeId }
          : { kind: "failed_edge", nodeId: node.id, edgeId: path.edge.id, portId: path.edge.sourcePortId ?? "failed", targetNodeId: path.edge.targetNodeId },
        budgetFree: path.wayOn
      });
    }
  });
  graph.nodes.forEach((node, index) => {
    if (node.metadata?.[CLEARS_INTERFERENCE_METADATA_KEY] !== true) return;
    const readyState = plainObject(node.parameterValues?.readyState) ?? plainObject(node.metadata?.readyState);
    registrations.push({
      ...base,
      handlerId: `${graph.graphFlowId}/${node.id}#clears_interference`,
      event: "retry",
      scope: { kind: "automation" },
      when: [],
      order: 0,
      completionCheck: [],
      maxRuns: 1,
      documentIndex: index,
      source: { kind: "clears_interference", nodeId: node.id, ...(readyState ? { readyState } : {}) },
      budgetFree: false
    });
  });
  return { registrations, problems };
}

function handlerNodeRegistration(graph: AutomationStudioRegistrationGraph, node: AutomationStudioFlowNode, index: number, problems: string[]): AutomationStudioHandlerRegistration | undefined {
  const parameters = node.parameterValues ?? {};
  const path = `nodes.${node.id}.parameterValues`;
  const before = problems.length;
  const event = typeof parameters.event === "string" && EVENTS.has(parameters.event) ? (parameters.event as AutomationStudioLifecycleEvent) : undefined;
  if (!event) problems.push(`${path}.event must be one of ${AUTOMATION_STUDIO_LIFECYCLE_EVENTS.join(", ")}.`);
  const scope = handlerScope(parameters.scope);
  if (!scope) problems.push(`${path}.scope must be { kind: "automation" }, { kind: "subflow", inherit? } or { kind: "nodes", nodeIds }.`);
  const when = parseAutomationStudioFactConditions(parameters.when, `${path}.when`);
  const completionCheck = parseAutomationStudioFactConditions(parameters.completionCheck, `${path}.completionCheck`);
  problems.push(...when.problems, ...completionCheck.problems);
  if (problems.length > before || !event || !scope) return undefined;
  const body = graph.edges.find((edge) => edge.sourceNodeId === node.id && edge.sourcePortId === "body");
  return {
    handlerId: `${graph.graphFlowId}/${node.id}`,
    graphFlowId: graph.graphFlowId,
    subflowId: graph.subflowId,
    event,
    scope,
    when: when.conditions,
    order: finiteNumber(parameters.order) ?? 0,
    completionCheck: completionCheck.conditions,
    maxRuns: Math.max(1, Math.floor(finiteNumber(parameters.maxRuns) ?? 1)),
    documentIndex: index,
    source: { kind: "handler_node", nodeId: node.id, ...(body ? { bodyNodeId: body.targetNodeId } : {}) },
    budgetFree: false
  };
}

/** A Handler's stored `scope`, or nothing when it is not one of the three shapes. */
function handlerScope(value: JsonValue | undefined): AutomationStudioHandlerScope | undefined {
  const scope = plainObject(value);
  if (!scope) return undefined;
  if (scope.kind === "automation") return { kind: "automation" };
  if (scope.kind === "subflow") return { kind: "subflow", inherit: scope.inherit !== false };
  if (scope.kind === "nodes" && Array.isArray(scope.nodeIds) && scope.nodeIds.length && scope.nodeIds.every((id) => typeof id === "string" && id.length > 0)) {
    return { kind: "nodes", nodeIds: scope.nodeIds as string[] };
  }
  return undefined;
}

/**
 * The node's authored On Fail paths, as the recovery ladder offers them today
 * (`../recovery-ladder.ts`): an optional step's way on takes the place of its
 * `failed` edge, which for the optional shape is the same edge; otherwise the
 * `failed` edge to another node. Every `error.<id>` port to another node is a
 * path of its own.
 */
function authoredOnFailPaths(graph: { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[] }, node: AutomationStudioFlowNode): Array<{ edge: AutomationStudioFlowEdge; wayOn: boolean }> {
  const paths: Array<{ edge: AutomationStudioFlowEdge; wayOn: boolean }> = [];
  const wayOn = automationStudioOptionalStepWayOn(graph, node);
  if (wayOn) paths.push({ edge: wayOn, wayOn: true });
  for (const edge of graph.edges) {
    if (edge.sourceNodeId !== node.id || edge.targetNodeId === node.id) continue;
    const port = edge.sourcePortId ?? "";
    if (port === "failed" && !wayOn) paths.push({ edge, wayOn: false });
    else if (port.startsWith("error.")) paths.push({ edge, wayOn: false });
  }
  return paths;
}

function plainObject(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length ? value : undefined;
}

function finiteNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
