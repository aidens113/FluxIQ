// The node and edge records a graph patch adds, in the graph store's shape
// (`framework/persistence/automation/project/graph-store.ts`), the same fields
// a Flow document's nodes and edges are written into the store with.
import type { JsonObject } from "../../../../core/index.ts";
import type { GraphPatchOperation } from "../../../../api-contracts/automation/index.ts";

/** A new node, near `near`'s place on the canvas. */
export type OutlineNewNode = { nodeId: string; definitionId: string; label: string; parameterValues: JsonObject; near?: { x: number; y: number } };

/** Mints ids for what an edit adds, none equal to an id the graph already holds. */
export type OutlineIdMint = (stem: string) => string;

/** Records for a patch on the Flow `flowId`. */
export type OutlineGraphRecords = {
  mint: OutlineIdMint;
  addNode(node: OutlineNewNode): GraphPatchOperation;
  addEdge(edge: OutlineNewEdge): GraphPatchOperation;
};

/** A new edge; a port left out is the node's default way out or in. */
export type OutlineNewEdge = { sourceNodeId: string; targetNodeId: string; sourcePortId?: string | undefined; targetPortId?: string | undefined };

/** Record builders for one patch, minting ids unused by `taken` and by each other. */
export function outlineGraphRecords(flowId: string, taken: Iterable<string>): OutlineGraphRecords {
  const used = new Set(taken);
  const mint: OutlineIdMint = (stem) => {
    let index = 1;
    while (used.has(`${stem}-${index}`)) index += 1;
    used.add(`${stem}-${index}`);
    return `${stem}-${index}`;
  };
  return {
    mint,
    addNode: (node) => ({
      op: "add_node",
      node: {
        nodeId: node.nodeId, flowId, definitionId: node.definitionId, definitionVersion: "", label: node.label, description: "",
        x: node.near?.x ?? 0, y: (node.near?.y ?? 0) + 120, width: 240, height: 96, zIndex: 0, disabled: false,
        parameterValues: node.parameterValues, metadata: {}
      }
    }),
    addEdge: (edge) => ({
      op: "add_edge",
      edge: {
        edgeId: mint("outline-edge"), flowId, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId,
        sourcePortId: edge.sourcePortId ?? null, targetPortId: edge.targetPortId ?? null, label: "", metadata: {}
      }
    })
  };
}
