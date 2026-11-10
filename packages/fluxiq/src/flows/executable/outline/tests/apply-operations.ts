// Applies graph patch operations to a graph in memory, the way the graph store
// applies them (`framework/persistence/automation/project/graph-store.ts`):
// `set_node_parameters` replaces the whole object, `delete_node` removes the
// node's edges with it, and an edge must name nodes that exist.
import type { GraphPatchOperation } from "../../../../api-contracts/automation/index.ts";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../graph/index.ts";
import type { FixtureGraph } from "./graph-fixture.ts";

export function applyOperations(graph: FixtureGraph, operations: readonly GraphPatchOperation[]): FixtureGraph {
  let nodes = [...graph.nodes];
  let edges = [...graph.edges];
  for (const operation of operations) {
    switch (operation.op) {
      case "add_node": {
        const record = operation.node;
        const added: AutomationStudioFlowNode = {
          id: String(record.nodeId),
          definitionId: String(record.definitionId),
          ...(record.label ? { label: String(record.label) } : {}),
          parameterValues: record.parameterValues as JsonObject
        };
        nodes = [...nodes.filter((existing) => existing.id !== added.id), added];
        break;
      }
      case "set_node_parameters":
        nodes = nodes.map((existing) => (existing.id === operation.nodeId ? { ...existing, parameterValues: operation.values } : existing));
        break;
      case "set_node_label":
        nodes = nodes.map((existing) => (existing.id === operation.nodeId ? { ...existing, label: operation.label } : existing));
        break;
      case "delete_node":
        if (!nodes.some((existing) => existing.id === operation.nodeId)) throw new Error(`Unknown node: ${operation.nodeId}`);
        nodes = nodes.filter((existing) => existing.id !== operation.nodeId);
        edges = edges.filter((existing) => existing.sourceNodeId !== operation.nodeId && existing.targetNodeId !== operation.nodeId);
        break;
      case "add_edge": {
        const record = operation.edge;
        const added: AutomationStudioFlowEdge = {
          id: String(record.edgeId),
          sourceNodeId: String(record.sourceNodeId),
          targetNodeId: String(record.targetNodeId),
          ...(record.sourcePortId ? { sourcePortId: String(record.sourcePortId) } : {}),
          ...(record.targetPortId ? { targetPortId: String(record.targetPortId) } : {})
        };
        for (const end of [added.sourceNodeId, added.targetNodeId]) if (!nodes.some((existing) => existing.id === end)) throw new Error(`Unknown node: ${end}`);
        edges = [...edges.filter((existing) => existing.id !== added.id), added];
        break;
      }
      case "delete_edge":
        if (!edges.some((existing) => existing.id === operation.edgeId)) throw new Error(`Unknown edge: ${operation.edgeId}`);
        edges = edges.filter((existing) => existing.id !== operation.edgeId);
        break;
      default:
        throw new Error(`Not applied in this test: ${operation.op}`);
    }
  }
  return { ...graph, nodes, edges };
}
