// A part's steps in the order a run reaches them, each read the way its kind says:
// a recorded step (`builtin.policy.action`) is what its output id says, with its
// payload for parameters; any other node is its own definition and parameters.
import type { JsonObject } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../components/automation/control-flow/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../components/automation/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioPartGraph } from "./types.ts";

const POLICY_ACTION = "builtin.policy.action";
const CORE_PREFIX = "builtin.";

export type AutomationStudioPartStep = {
  node: AutomationStudioFlowNode;
  /** What the step is: its definition, or the output a recorded step dispatches. */
  kind: string;
  /** What it was given: its parameters, or a recorded step's payload. */
  params: JsonObject;
  /** It can act on a page or a site, directly or by calling a part. Core's own control and data nodes do not. */
  acting: boolean;
  /** It calls another Subflow or a part. */
  isCall: boolean;
};

/**
 * Every node of the graph in the order a run reaches them: from the nodes nothing
 * enters, breadth first, each node's edges in the order the graph lists them,
 * then any a walk did not reach in the graph's own order.
 */
export function partStepsOf(graph: Pick<AutomationStudioPartGraph, "nodes" | "edges">): AutomationStudioPartStep[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const entered = new Set(graph.edges.map((edge) => edge.targetNodeId));
  const queue = graph.nodes.filter((node) => !entered.has(node.id)).map((node) => node.id);
  const seen = new Set<string>();
  const ordered: AutomationStudioFlowNode[] = [];
  for (let at = 0; at < queue.length; at += 1) {
    const id = queue[at]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    ordered.push(node);
    for (const edge of graph.edges) if (edge.sourceNodeId === id && !seen.has(edge.targetNodeId)) queue.push(edge.targetNodeId);
  }
  for (const node of graph.nodes) if (!seen.has(node.id)) ordered.push(node);
  return ordered.map(stepOf);
}

function stepOf(node: AutomationStudioFlowNode): AutomationStudioPartStep {
  const own = node.parameterValues ?? {};
  const isCall = node.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID;
  if (node.definitionId === POLICY_ACTION) {
    const payload = own.parameters;
    const params = payload && typeof payload === "object" && !Array.isArray(payload) && !isAutomationNodeParameterStateBinding(payload) ? payload : {};
    return { node, kind: typeof own.outputId === "string" && own.outputId ? own.outputId : node.definitionId, params, acting: true, isCall: false };
  }
  return { node, kind: node.definitionId, params: own, acting: isCall || !node.definitionId.startsWith(CORE_PREFIX), isCall };
}
