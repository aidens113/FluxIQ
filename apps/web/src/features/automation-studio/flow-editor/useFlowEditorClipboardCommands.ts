"use client";

import type { Edge, Node } from "@xyflow/react";
import { useRef } from "react";
import { rebalanceAutomationEdgeLanes } from "../graph/edge-routing";
import type { AutomationFlowNodeData } from "./node-types";
import type { FlowEditorGraphDocument } from "./useFlowEditorGraphDocument";
import type { FlowEditorSelection } from "./useFlowEditorSelection";

export function useFlowEditorClipboardCommands(
  graph: FlowEditorGraphDocument,
  selection: FlowEditorSelection
) {
  const flowClipboardRef = useRef<{
    nodes: Array<Node<AutomationFlowNodeData>>;
    edges: Edge[];
  } | null>(null);

  const copyFlowSelection = () => {
    const selectedIds = new Set(selection.selectedFlowNodeIds);
    if (!selectedIds.size) return;
    flowClipboardRef.current = {
      nodes: graph.flowNodesRef.current.filter((node) => selectedIds.has(node.id)),
      edges: graph.flowEdgesRef.current.filter(
        (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)
      )
    };
  };

  const pasteFlowClipboard = () => {
    const copied = flowClipboardRef.current;
    if (!graph.isFlowMode || !copied?.nodes.length) return;
    graph.checkpointFlowGraph();
    const stamp = Date.now().toString(36);
    const idMap = new Map(copied.nodes.map((node, index) => [
      node.id,
      node.id + "-copy-" + stamp + "-" + index
    ]));
    const pastedNodes = copied.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) ?? node.id,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: true
    }));
    const pastedEdges = copied.edges.map((edge, index) => ({
      ...edge,
      id: edge.id + "-copy-" + stamp + "-" + index,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: false
    }));
    const pastedIds = pastedNodes.map((node) => node.id);
    const nextNodes = [
      ...graph.flowNodesRef.current.map((node) => ({ ...node, selected: false })),
      ...pastedNodes
    ];
    const nextEdges = rebalanceAutomationEdgeLanes([
      ...graph.flowEdgesRef.current.map((edge) => ({ ...edge, selected: false })),
      ...pastedEdges
    ], nextNodes);
    graph.flowNodesRef.current = nextNodes;
    graph.flowEdgesRef.current = nextEdges;
    graph.setFlowNodes(nextNodes);
    graph.setFlowEdges(nextEdges);
    selection.setSelectedFlowNodeIds(pastedIds);
    selection.setSelectedFlowNodeId(pastedIds[0] ?? "");
    selection.setSelectedFlowEdgeIds([]);
    graph.publishFlowGraphDraft(nextNodes, nextEdges);
    if (pastedNodes[0]) {
      selection.publishFlowSelection(
        selection.flowCanvasSelectionForNode(pastedNodes[0])
      );
    }
  };

  const duplicateFlowSelection = () => {
    copyFlowSelection();
    pasteFlowClipboard();
  };

  return { copyFlowSelection, pasteFlowClipboard, duplicateFlowSelection };
}