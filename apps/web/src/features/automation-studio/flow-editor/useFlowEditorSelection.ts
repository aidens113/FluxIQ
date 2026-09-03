"use client";

import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AutomationFlowNodeData } from "./node-types";
import type { AutomationSelection } from "../shared/selection-contracts";
import { sameStringList } from "../views/view-utils";
import type { FlowEditorProps } from "./flow-editor-types";
import type { AutomationGraphProblem } from "./graph-validation";
import { flowEditorSelection } from "./selection-model";
import type { FlowEditorGraphDocument } from "./useFlowEditorGraphDocument";

export function useFlowEditorSelection(
  props: FlowEditorProps,
  graph: FlowEditorGraphDocument
) {
  const [selectedFlowNodeId, setSelectedFlowNodeId] = useState(
    props.selectedNode?.id ?? ""
  );
  const [selectedFlowNodeIds, setSelectedFlowNodeIds] = useState<string[]>(
    props.selectedNode?.id ? [props.selectedNode.id] : []
  );
  const [selectedFlowEdgeIds, setSelectedFlowEdgeIds] = useState<string[]>([]);
  const [connectionSourceNodeId, setConnectionSourceNodeId] = useState("");
  const [flowOutlineOpen, setFlowOutlineOpen] = useState(false);
  const [flowInstance, setFlowInstance] = useState<
    ReactFlowInstance<Node<AutomationFlowNodeData>, Edge> | null
  >(null);
  const flowFrameRef = useRef<HTMLDivElement>(null);
  const flowSelectionRef = useRef("");

  useEffect(() => {
    const id = props.selectedNode?.id ?? "";
    setSelectedFlowNodeId(id);
    setSelectedFlowNodeIds(id ? [id] : []);
  }, [props.selectedNode?.id]);

  useEffect(() => {
    setSelectedFlowEdgeIds([]);
  }, [graph.sourceRevision]);

  const flowCanvasSelectionForNode = useCallback((
    node: Node<AutomationFlowNodeData>
  ): AutomationSelection => {
    if (props.taskGraph) return flowEditorSelection(node.id, node.data, props.taskGraph.flowId);
    return props.policy?.nodes?.some((policyNode: any) => policyNode.id === node.id)
      ? { kind: "node", id: node.id }
      : flowEditorSelection(node.id, node.data, props.taskGraph?.flowId);
  }, [props.policy, props.taskGraph]);

  const publishFlowSelection = useCallback((selection: AutomationSelection) => {
    props.setSelection(selection);
  }, [props.setSelection]);

  const selectFlowEdge = useCallback((edgeId: string) => {
    if (!graph.isFlowMode
      || !edgeId
      || !graph.flowEdgesRef.current.some((edge) => edge.id === edgeId)) return;
    setSelectedFlowNodeId("");
    setSelectedFlowNodeIds([]);
    setSelectedFlowEdgeIds([edgeId]);
    const nextEdges = graph.flowEdgesRef.current.map((edge) => ({
      ...edge,
      selected: edge.id === edgeId
    }));
    graph.flowEdgesRef.current = nextEdges;
    graph.setFlowEdges(nextEdges);
  }, [graph.isFlowMode, graph.flowEdgesRef, graph.setFlowEdges]);

  const selectFlowOutlineNode = useCallback((
    node: Node<AutomationFlowNodeData>
  ) => {
    setSelectedFlowNodeId(node.id);
    setSelectedFlowEdgeIds([]);
    graph.setTransientFlowNodes((nodes) => nodes.map((item) => ({
      ...item,
      selected: item.id === node.id
    })));
    publishFlowSelection(flowCanvasSelectionForNode(node));
    void flowInstance?.fitView({ nodes: [node], padding: 0.8, duration: 180 });
  }, [
    graph.setTransientFlowNodes,
    flowCanvasSelectionForNode,
    flowInstance,
    publishFlowSelection
  ]);

  const focusFlowGraphProblem = useCallback((problem: AutomationGraphProblem) => {
    if (problem.kind === "node" && problem.targetId) {
      const node = graph.flowNodesRef.current.find(
        (item) => item.id === problem.targetId
      );
      if (node) selectFlowOutlineNode(node);
      return;
    }
    if (problem.kind === "edge" && problem.targetId) {
      const edge = graph.flowEdgesRef.current.find(
        (item) => item.id === problem.targetId
      );
      if (!edge) return;
      setSelectedFlowNodeId("");
      setSelectedFlowNodeIds([]);
      setSelectedFlowEdgeIds([edge.id]);
      graph.setTransientFlowEdges((edges) => edges.map((item) => ({
        ...item,
        selected: item.id === edge.id
      })));
      const endpoints = graph.flowNodesRef.current.filter(
        (node) => node.id === edge.source || node.id === edge.target
      );
      if (endpoints.length) {
        void flowInstance?.fitView({ nodes: endpoints, padding: 0.8, duration: 180 });
      }
      return;
    }
    void flowInstance?.fitView({ padding: 0.25, duration: 180 });
  }, [
    graph.flowEdgesRef,
    graph.flowNodesRef,
    graph.setTransientFlowEdges,
    flowInstance,
    selectFlowOutlineNode
  ]);

  useEffect(() => {
    if (!props.activeRef.current || !props.focusRequest?.problem) return;
    focusFlowGraphProblem(props.focusRequest.problem);
  }, [focusFlowGraphProblem, props.activeRef, props.focusRequest?.revision]);

  const handleFlowSelectionChange = useCallback(({
    nodes,
    edges
  }: {
    nodes: Array<Node<AutomationFlowNodeData>>;
    edges: Edge[];
  }) => {
    const selectedNode = nodes[0];
    const nodeId = selectedNode?.id ?? "";
    const nodeIds = nodes.map((node) => node.id);
    const edgeIds = edges.map((edge) => edge.id);
    setSelectedFlowNodeId((current: string) => current === nodeId ? current : nodeId);
    setSelectedFlowNodeIds(
      (current) => sameStringList(current, nodeIds) ? current : nodeIds
    );
    setSelectedFlowEdgeIds(
      (current) => sameStringList(current, edgeIds) ? current : edgeIds
    );
    flowSelectionRef.current = selectedNode
      ? "node:" + selectedNode.id
      : edgeIds.length
        ? "edges:" + edgeIds.join(",")
        : "";
  }, []);

  return {
    selectedFlowNodeId,
    setSelectedFlowNodeId,
    selectedFlowNodeIds,
    setSelectedFlowNodeIds,
    selectedFlowEdgeIds,
    setSelectedFlowEdgeIds,
    connectionSourceNodeId,
    setConnectionSourceNodeId,
    flowOutlineOpen,
    setFlowOutlineOpen,
    flowInstance,
    setFlowInstance,
    flowFrameRef,
    flowSelectionRef,
    flowCanvasSelectionForNode,
    publishFlowSelection,
    selectFlowEdge,
    selectFlowOutlineNode,
    handleFlowSelectionChange
  };
}

export type FlowEditorSelection = ReturnType<typeof useFlowEditorSelection>;
