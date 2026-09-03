"use client";

import { addEdge, type Node } from "@xyflow/react";
import { createAutomationConnectionEdge, rebalanceAutomationEdgeLanes } from "../graph/edge-routing";
import { roundedAutomationPosition, spawnAutomationNodePosition } from "../graph/interaction-geometry";
import { automationConnectionIsValid } from "../graph/ports";
import { automationVisualInputPorts, defaultAutomationParameterValues } from "../graph/node-parameters";
import {
  withAutomationFlowNodeDimensions,
  automationFlowNodeDimensions,
  type AutomationEditorNodeSpec,
  type AutomationFlowNodeData
} from "./node-types";
import type { FlowEditorProps } from "./flow-editor-types";
import { automationCompositeCallMetadata } from "./graph-interactions";
import { flowEditorSelection } from "./selection-model";
import type { FlowEditorGraphDocument } from "./useFlowEditorGraphDocument";
import { useFlowEditorClipboardCommands } from "./useFlowEditorClipboardCommands";
import type { FlowEditorSelection } from "./useFlowEditorSelection";

export function useFlowEditorCommands(
  props: FlowEditorProps,
  graph: FlowEditorGraphDocument,
  selection: FlowEditorSelection
) {
  const clipboardCommands = useFlowEditorClipboardCommands(graph, selection);


  const addFlowNode = (spec: AutomationEditorNodeSpec) => {
    if (!graph.isFlowMode) return;
    graph.checkpointFlowGraph();
    graph.markFlowGraphDirty(true);
    const id = "policy-" + spec.id + "-" + Date.now().toString(36);
    const compositeMetadata = automationCompositeCallMetadata(spec);
    const data: AutomationFlowNodeData = {
      nodeDefinitionId: spec.id,
      nodeDefinitionVersion: spec.version,
      label: spec.label,
      description: spec.description,
      ...(spec.icon !== undefined ? { icon: spec.icon } : {}),
      actionTypes: spec.actionTypes ?? [],
      recovery: spec.family,
      evidenceCount: 0,
      readinessCount: spec.inputs.length,
      successCount: spec.outputs.length,
      inputs: automationVisualInputPorts(spec.inputs, spec.id),
      outputs: spec.outputs,
      parameters: spec.parameters,
      parameterValues: defaultAutomationParameterValues(spec.parameters),
      ...(compositeMetadata ? { metadata: compositeMetadata } : {}),
      isStart: spec.id === "builtin.control.start"
    };
    const node = withAutomationFlowNodeDimensions({
      id,
      type: "policyNode",
      position: roundedAutomationPosition(spawnAutomationNodePosition(
        selection.selectedFlowNodeId,
        graph.flowNodesRef.current,
        graph.flowEdgesRef.current,
        selection.flowInstance,
        selection.flowFrameRef.current,
        automationFlowNodeDimensions(data)
      )),
      data
    } satisfies Node<AutomationFlowNodeData>);
    const nextNodes = [
      ...graph.flowNodesRef.current.map((item) => item.selected ? { ...item, selected: false } : item),
      { ...node, selected: true }
    ];
    graph.flowNodesRef.current = nextNodes;
    graph.setFlowNodes(nextNodes);
    graph.publishFlowGraphDraft(nextNodes, graph.flowEdgesRef.current);
    selection.setSelectedFlowNodeId(id);
    selection.setSelectedFlowNodeIds([id]);
    selection.setSelectedFlowEdgeIds([]);
    selection.publishFlowSelection(flowEditorSelection(id, data, props.taskGraph?.flowId));
    selection.flowSelectionRef.current = "node:" + id;
  };

  const deleteFlowSelection = () => {
    if (!graph.isFlowMode || (!selection.selectedFlowNodeIds.length && !selection.selectedFlowEdgeIds.length)) return;
    graph.checkpointFlowGraph();
    graph.markFlowGraphDirty(true);
    const nodeIds = new Set(selection.selectedFlowNodeIds);
    const edgeIds = new Set(selection.selectedFlowEdgeIds);
    const nextNodes = graph.flowNodesRef.current.filter(
      (node) => !nodeIds.has(node.id)
    );
    const nextEdges = rebalanceAutomationEdgeLanes(
      graph.flowEdgesRef.current.filter(
        (edge) => !edgeIds.has(edge.id)
          && !nodeIds.has(edge.source)
          && !nodeIds.has(edge.target)
      ),
      nextNodes
    );
    graph.flowNodesRef.current = nextNodes;
    graph.flowEdgesRef.current = nextEdges;
    graph.setFlowNodes(nextNodes);
    graph.setFlowEdges(nextEdges);
    graph.publishFlowGraphDraft(nextNodes, nextEdges);
    selection.setSelectedFlowNodeId("");
    selection.setSelectedFlowNodeIds([]);
    selection.setSelectedFlowEdgeIds([]);
  };

  const deleteFlowNode = (nodeId: string) => {
    if (!graph.isFlowMode || !nodeId) return;
    graph.checkpointFlowGraph();
    graph.markFlowGraphDirty(true);
    const nextNodes = graph.flowNodesRef.current.filter(
      (node) => node.id !== nodeId
    );
    const nextEdges = rebalanceAutomationEdgeLanes(
      graph.flowEdgesRef.current.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
      nextNodes
    );
    graph.flowNodesRef.current = nextNodes;
    graph.flowEdgesRef.current = nextEdges;
    graph.setFlowNodes(nextNodes);
    graph.setFlowEdges(nextEdges);
    graph.publishFlowGraphDraft(nextNodes, nextEdges);
    selection.setSelectedFlowNodeId(
      (current: string) => current === nodeId ? "" : current
    );
    selection.setSelectedFlowNodeIds(
      (ids) => ids.filter((id) => id !== nodeId)
    );
  };

  const deleteFlowEdge = (edgeId: string) => {
    if (!graph.isFlowMode || !edgeId) return;
    graph.checkpointFlowGraph();
    graph.markFlowGraphDirty(true);
    graph.setFlowEdges((edges) => {
      const nextEdges = rebalanceAutomationEdgeLanes(
        edges.filter((edge) => edge.id !== edgeId),
        graph.flowNodesRef.current
      );
      graph.flowEdgesRef.current = nextEdges;
      graph.publishFlowGraphDraft(graph.flowNodesRef.current, nextEdges);
      return nextEdges;
    });
    selection.setSelectedFlowEdgeIds(
      (ids) => ids.filter((id) => id !== edgeId)
    );
  };

  const applyFlowHistory = (direction: "undo" | "redo") => {
    if (!graph.isFlowMode) return;
    if (direction === "undo") graph.undoFlowGraph();
    else graph.redoFlowGraph();
    graph.reconcileFlowGraphDirty();
    graph.publishFlowGraphDraft(
      graph.flowNodesRef.current,
      graph.flowEdgesRef.current
    );
  };


  const moveFlowSelection = (x: number, y: number) => {
    graph.checkpointFlowGraph();
    graph.markFlowGraphDirty(true);
    const selectedIds = new Set(selection.selectedFlowNodeIds);
    const nextNodes = graph.flowNodesRef.current.map((node) => (
      selectedIds.has(node.id)
        ? {
          ...node,
          position: roundedAutomationPosition({
            x: node.position.x + x,
            y: node.position.y + y
          })
        }
        : node
    ));
    graph.flowNodesRef.current = nextNodes;
    graph.setFlowNodes(nextNodes);
    graph.publishFlowGraphDraft(nextNodes, graph.flowEdgesRef.current);
  };

  const connectFlowSelection = () => {
    if (!graph.isFlowMode || !selection.selectedFlowNodeId) return;
    if (!selection.connectionSourceNodeId) {
      selection.setConnectionSourceNodeId(selection.selectedFlowNodeId);
      return;
    }
    if (selection.connectionSourceNodeId === selection.selectedFlowNodeId) {
      selection.setConnectionSourceNodeId("");
      return;
    }
    const source = graph.flowNodesRef.current.find(
      (node) => node.id === selection.connectionSourceNodeId
    );
    const target = graph.flowNodesRef.current.find(
      (node) => node.id === selection.selectedFlowNodeId
    );
    if (!source || !target) {
      selection.setConnectionSourceNodeId("");
      return;
    }
    const compatible = source.data.outputs
      .flatMap((output) => target.data.inputs.map((input) => ({ output, input })))
      .find(({ output, input }) => automationConnectionIsValid({
        source: source.id,
        target: target.id,
        sourceHandle: output.id,
        targetHandle: input.id
      }, graph.flowNodesRef.current));
    if (!compatible) {
      selection.setConnectionSourceNodeId("");
      return;
    }
    graph.checkpointFlowGraph();
    graph.markFlowGraphDirty(true);
    const edge = createAutomationConnectionEdge({
      source: source.id,
      target: target.id,
      sourceHandle: compatible.output.id,
      targetHandle: compatible.input.id
    }, graph.flowEdgesRef.current, "policy-edge", graph.flowNodesRef.current);
    const nextEdges = rebalanceAutomationEdgeLanes(
      addEdge(edge, graph.flowEdgesRef.current),
      graph.flowNodesRef.current
    );
    graph.flowEdgesRef.current = nextEdges;
    graph.setFlowEdges(nextEdges);
    graph.publishFlowGraphDraft(graph.flowNodesRef.current, nextEdges);
    selection.setConnectionSourceNodeId("");
  };

  const selectAllFlowNodes = () => {
    const ids = graph.flowNodesRef.current.map((node) => node.id);
    graph.setTransientFlowNodes(
      (nodes) => nodes.map((node) => ({ ...node, selected: true }))
    );
    graph.setTransientFlowEdges(
      (edges) => edges.map((edge) => ({ ...edge, selected: false }))
    );
    selection.setSelectedFlowNodeIds(ids);
    selection.setSelectedFlowNodeId(ids[0] ?? "");
    selection.setSelectedFlowEdgeIds([]);
  };

  return {
    addFlowNode,
    deleteFlowSelection,
    deleteFlowNode,
    deleteFlowEdge,
    applyFlowHistory,
    ...clipboardCommands,
    moveFlowSelection,
    connectFlowSelection,
    selectAllFlowNodes
  };
}

export type FlowEditorCommands = ReturnType<typeof useFlowEditorCommands>;
