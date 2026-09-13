/** The node definition that declares where a Flow begins. */
const START_DEFINITION_ID = "builtin.control.start";

/** The node definition that finishes a run where it is reached. */
const END_DEFINITION_ID = "builtin.control.end";

/** How many node ids a refusal names before it counts the rest. */
const NAMED_NODE_LIMIT = 5;

/**
 * Where a run of a graph begins when its caller names no node, or why it cannot
 * begin. `declared` and `root` carry the node. Every other status carries the
 * message a run fails with, and no node.
 */
export type AutomationStudioStartNodeChoice<Node> =
  | { status: "declared" | "root"; node: Node; message?: undefined }
  | { status: "empty" | "several_declared" | "no_root" | "several_roots"; node?: undefined; message: string };

/**
 * Chooses where a run begins from the graph itself, never from the order its
 * nodes are listed in. The project graph index hands a Flow's nodes back sorted
 * by id, and a recorded node's id carries an unpadded timeline number, so a
 * list position says nothing about which node an author or a recording put
 * first.
 *
 * - Exactly one `builtin.control.start` node is the start.
 * - With no Start node, the start is the one node no edge from another node of
 *   the graph enters. A node's edge to itself, and an edge from a node the graph
 *   does not hold, never make a node reachable, so neither counts. An End node
 *   no edge enters is a root only when no other node is: a run that begins at
 *   End finishes there, so an End node left unwired beside the nodes that do
 *   the work is not where a run begins.
 * - Several Start nodes, several roots, no root, or no nodes at all have no
 *   start. The run refuses rather than guessing, because a guess executes
 *   actions from a node nobody chose.
 *
 * It reads only ids, definition ids and edge endpoints, so a compiled plan's
 * nodes and edges answer it exactly as a Flow document's do.
 */
export function chooseAutomationStudioStartNode<Node extends { id: string; definitionId: string }>(graph: {
  nodes: readonly Node[];
  edges: readonly { sourceNodeId: string; targetNodeId: string }[];
}): AutomationStudioStartNodeChoice<Node> {
  const { nodes, edges } = graph;
  if (!nodes.length) return { status: "empty", message: "No start node is available in this flow." };
  const declared = nodes.filter((node) => node.definitionId === START_DEFINITION_ID);
  if (declared.length === 1) return { status: "declared", node: declared[0]! };
  if (declared.length > 1) {
    return { status: "several_declared", message: `This Flow has ${declared.length} Start nodes (${namedNodes(declared)}), so where a run begins is ambiguous. Keep one Start node.` };
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const entered = new Set(edges.filter((edge) => edge.sourceNodeId !== edge.targetNodeId && nodeIds.has(edge.sourceNodeId)).map((edge) => edge.targetNodeId));
  const roots = nodes.filter((node) => !entered.has(node.id));
  const startable = roots.some((node) => node.definitionId !== END_DEFINITION_ID) ? roots.filter((node) => node.definitionId !== END_DEFINITION_ID) : roots;
  if (startable.length === 1) return { status: "root", node: startable[0]! };
  if (!startable.length) {
    return { status: "no_root", message: "This Flow has no Start node, and every node has an edge into it from another node, so no node is where a run begins. Add a Start node." };
  }
  return { status: "several_roots", message: `This Flow has no Start node, and ${startable.length} nodes have no edge into them (${namedNodes(startable)}), so where a run begins is ambiguous. Add a Start node, or connect those nodes.` };
}

function namedNodes(nodes: readonly { id: string }[]): string {
  const named = nodes.slice(0, NAMED_NODE_LIMIT).map((node) => node.id).join(", ");
  return nodes.length > NAMED_NODE_LIMIT ? `${named}, and ${nodes.length - NAMED_NODE_LIMIT} more` : named;
}
