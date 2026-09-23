// The Flow as a graph, with the failing node in place in it.
//
// Until now a repair was handed the Flow as a list: `resultSummary.flowShape`
// gives node ids and definition ids in authored order, and `route_context`
// gives the route decisions a run happened to take. Neither is the Flow. A
// model shown a straight line cannot author a branch, cannot edit the router
// rule that chose the wrong Subflow, and cannot even tell that a branch exists
// -- and Core's own patch kinds (`temporary_reroute`, a router mutation, a
// recovery Subflow call) are exactly the repairs that need one.
//
// So the section carries the three things a graph is: its nodes, its edges, and
// the router's rules. Beside them it carries where the failure sits in that
// structure -- the edges into and out of the failing node -- because "the node
// that failed" and "the node that failed, here, between these two" are
// different pieces of evidence and only the second supports inserting a step
// ahead of it.
//
// **Authored data, carried as authored.** A node's parameters are not here;
// they are `step-parameters.ts`'s, screened. What is here is structure --
// ids, ports, labels, rule order and status -- plus each rule's condition,
// which is carried whole for the same reason `context.ts` carries
// `expectedState` whole: it is authored Flow-document data, the user or the
// build wrote it, it is in the document the model is being asked to change, and
// without it a rule is a name with no meaning. Every string here still goes
// through the context's locator screen with the rest of the sections.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioFlowDocument,
  AutomationStudioFlowRouter
} from "../../../model/index.ts";

/** How much of a graph the section carries. Small enough to sit beside the failure inside one byte budget. */
export const AUTOMATION_STUDIO_REPAIR_CONTEXT_GRAPH_LIMITS = Object.freeze({
  maxNodes: 24,
  maxEdges: 32,
  maxRouters: 2,
  maxRulesPerRouter: 12,
  maxLabelLength: 60
});

/**
 * The Flow's structure, or nothing when neither a Flow document nor a router
 * was available -- a repair driven from a run whose Flow could not be read.
 */
export function automationStudioFlowGraphSection(input: {
  flow?: AutomationStudioFlowDocument | undefined;
  routers?: readonly AutomationStudioFlowRouter[] | undefined;
  failedNodeId?: string | undefined;
}): JsonObject | undefined {
  const limits = AUTOMATION_STUDIO_REPAIR_CONTEXT_GRAPH_LIMITS;
  const routers = (input.routers ?? []).slice(0, limits.maxRouters).map(compactRouter);
  if (!input.flow && !routers.length) return undefined;
  const nodes = (input.flow?.nodes ?? []).slice(0, limits.maxNodes)
    .map((node) => compact({
      nodeId: node.id,
      definitionId: node.definitionId,
      ...(node.label ? { label: node.label.slice(0, limits.maxLabelLength) } : {})
    }));
  const edges = (input.flow?.edges ?? []).slice(0, limits.maxEdges)
    .map((edge) => compact({
      edgeId: edge.id,
      from: edge.sourceNodeId,
      to: edge.targetNodeId,
      ...(edge.sourcePortId ? { fromPort: edge.sourcePortId } : {}),
      ...(edge.targetPortId ? { toPort: edge.targetPortId } : {})
    }));
  return compact({
    ...(input.flow ? { flowId: input.flow.flowId } : {}),
    ...(nodes.length ? { nodes } : {}),
    ...((input.flow?.nodes.length ?? 0) > nodes.length ? { nodeCount: input.flow!.nodes.length } : {}),
    ...(edges.length ? { edges } : {}),
    ...((input.flow?.edges.length ?? 0) > edges.length ? { edgeCount: input.flow!.edges.length } : {}),
    ...(routers.length ? { routers } : {}),
    ...(failingNode(input.flow, input.failedNodeId) ?? {})
  });
}

/**
 * Where the failure sits in the graph: the node, and the edges either side of
 * it named by id so a repair can say which one it is rerouting.
 *
 * A node id the Flow does not hold is said so rather than silently dropped. A
 * refuted result names the last step that stored records, and a Flow that has
 * since been patched may no longer have it; a repair reasoning about a node
 * that is not in the graph it was shown has to be able to tell.
 */
function failingNode(flow: AutomationStudioFlowDocument | undefined, nodeId: string | undefined): JsonObject | undefined {
  if (!nodeId) return undefined;
  if (!flow) return { failingNode: { nodeId } };
  const present = flow.nodes.some((node) => node.id === nodeId);
  const incoming = flow.edges.filter((edge) => edge.targetNodeId === nodeId).map((edge) => edge.id).slice(0, 8);
  const outgoing = flow.edges.filter((edge) => edge.sourceNodeId === nodeId).map((edge) => edge.id).slice(0, 8);
  return {
    failingNode: compact({
      nodeId,
      ...(present ? {} : { inFlow: false }),
      ...(incoming.length ? { incomingEdgeIds: incoming } : {}),
      ...(outgoing.length ? { outgoingEdgeIds: outgoing } : {})
    })
  };
}

function compactRouter(router: AutomationStudioFlowRouter): JsonObject {
  const limits = AUTOMATION_STUDIO_REPAIR_CONTEXT_GRAPH_LIMITS;
  const rules = [...router.rules]
    .sort((left, right) => left.order - right.order)
    .slice(0, limits.maxRulesPerRouter)
    .map((rule) => compact({
      ruleId: rule.ruleId,
      name: rule.name.slice(0, limits.maxLabelLength),
      order: rule.order,
      status: rule.status,
      target: rule.target as unknown as JsonValue,
      ...(rule.confidence !== undefined ? { confidence: rule.confidence } : {}),
      ...(rule.condition ? { condition: rule.condition as unknown as JsonValue } : {})
    }));
  return compact({
    routerId: router.routerId,
    name: router.name.slice(0, limits.maxLabelLength),
    status: router.status,
    ...(rules.length ? { rules } : {}),
    ...(router.rules.length > rules.length ? { ruleCount: router.rules.length } : {}),
    ...(router.fallback ? { fallback: router.fallback as unknown as JsonValue } : {})
  });
}

function compact(fields: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as JsonObject;
}
