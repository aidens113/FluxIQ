"use client";

import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emitAutomationStudioGraphMetric } from "../development/telemetry";
import { rebalanceAutomationEdgeLanes } from "../graph/edge-routing";
import { syncGraphNodes } from "../graph/interaction-geometry";
import { useAutomationGraphController } from "../graph/useAutomationGraphController";
import { scheduleAutomationGraphIdleTask, type AutomationGraphIdleTaskCancel } from "../graph/worker-tasks";
import type { AutomationFlowNodeData } from "./node-types";
import type { FlowEditorProps } from "./flow-editor-types";
import {
  automationNativeNodeDefinitionSignature,
  legacyPolicySourceSignature,
  automationTaskGraphSourceSignature,
  graphSignature
} from "./graph-signatures";
import { automationFlowGraphProblems, type AutomationGraphProblem } from "./graph-validation";
import { legacyPolicyToFlowGraph, taskFlowToEditorGraph } from "./model/flow-graph";

type SaveState = "saved" | "unsaved" | "saving" | "failed" | "conflict";
type GraphDraft = { nodes: Array<Node<AutomationFlowNodeData>>; edges: Edge[] };

export function useFlowEditorGraphDocument(props: FlowEditorProps) {
  const taskGraphSignature = useMemo(
    () => props.taskGraph ? automationTaskGraphSourceSignature(props.taskGraph) : "",
    [props.taskGraph]
  );
  const legacyPolicyGraphSignature = useMemo(
    () => props.taskGraph ? "" : legacyPolicySourceSignature(props.policy),
    [props.taskGraph, props.policy]
  );
  const nativeNodeDefinitionSignature = useMemo(
    () => automationNativeNodeDefinitionSignature(props.nativeNodeDefinitions),
    [props.nativeNodeDefinitions]
  );
  const taskGraphDraftSignature = useMemo(
    () => props.taskGraphDraft
      ? graphSignature(props.taskGraphDraft.nodes, props.taskGraphDraft.edges)
      : "",
    [props.taskGraphDraft]
  );
  const sourceRevision = [
    taskGraphSignature,
    legacyPolicyGraphSignature,
    nativeNodeDefinitionSignature,
    taskGraphDraftSignature
  ].join(":");
  const graph = useMemo(
    () => props.taskGraphDraft
      ?? (props.taskGraph
        ? taskFlowToEditorGraph(props.taskGraph, "", props.nativeNodeDefinitions)
        : legacyPolicyToFlowGraph(props.policy, "")),
    [sourceRevision]
  );
  const controller = useAutomationGraphController<AutomationFlowNodeData>(graph.nodes, graph.edges);
  const {
    nodes: flowNodes,
    edges: flowEdges,
    nodesRef: flowNodesRef,
    edgesRef: flowEdgesRef,
    setNodes: setFlowNodes,
    setEdges: setFlowEdges,
    setTransientNodes: setTransientFlowNodes,
    setTransientEdges: setTransientFlowEdges,
    replaceGraph: replaceFlowGraph,
    checkpoint: checkpointFlowGraph,
    commitCheckpoint: commitFlowGraphCheckpoint,
    undo: undoFlowGraph,
    redo: redoFlowGraph,
    canUndo: canUndoFlowGraph,
    canRedo: canRedoFlowGraph,
    historyState: flowHistoryState,
    viewportState: flowViewportState,
    viewportStats: flowViewportStats
  } = controller;
  const codeOwned = props.taskGraph?.source?.mode === "code";
  const isFlowMode = !codeOwned && props.editable;
  const savedGraphSignatureRef = useRef("");
  const flowGraphDirtyRef = useRef(Boolean(props.taskGraphDraft));
  const flowNodeDragActiveRef = useRef(false);
  const recentlyConnectedFlowEdgeIdsRef = useRef<Set<string>>(new Set());
  const pendingFlowGraphDraftRef = useRef<GraphDraft | null>(null);
  const flowGraphDraftFlushCancelRef = useRef<AutomationGraphIdleTaskCancel | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(
    props.taskGraphDraft ? "unsaved" : "saved"
  );
  const [flowGraphProblems, setFlowGraphProblems] = useState<AutomationGraphProblem[]>([]);
  const [flowGraphValidationRevision, setFlowGraphValidationRevision] = useState(0);

  const scheduleFlowGraphValidation = useCallback(() => {
    setFlowGraphValidationRevision((revision) => revision + 1);
  }, []);

  const markFlowGraphDirty = useCallback((dirty: boolean) => {
    if (flowGraphDirtyRef.current === dirty) return;
    flowGraphDirtyRef.current = dirty;
    if (props.activeRef.current) props.onDirtyChange(dirty);
    setSaveState((current) => dirty
      ? (current === "saving" || current === "conflict" ? current : "unsaved")
      : "saved");
  }, [props.activeRef, props.onDirtyChange]);

  const publishFlowGraphDraft = useCallback((
    nodes: Array<Node<AutomationFlowNodeData>>,
    edges: Edge[]
  ) => {
    scheduleFlowGraphValidation();
    if (!props.taskGraph || !isFlowMode) return;
    pendingFlowGraphDraftRef.current = { nodes, edges };
    flowGraphDraftFlushCancelRef.current?.();
    flowGraphDraftFlushCancelRef.current = scheduleAutomationGraphIdleTask(() => {
      flowGraphDraftFlushCancelRef.current = null;
      const draft = pendingFlowGraphDraftRef.current;
      if (!draft) return;
      pendingFlowGraphDraftRef.current = null;
      props.onGraphDraftChange(draft);
    }, { delayMs: 160, timeoutMs: 1_000 });
  }, [isFlowMode, props.onGraphDraftChange, props.taskGraph, scheduleFlowGraphValidation]);

  useEffect(() => {
    const nextNodes = syncGraphNodes(flowNodesRef.current, graph.nodes);
    const nextEdges = rebalanceAutomationEdgeLanes(graph.edges, nextNodes);
    replaceFlowGraph({ nodes: nextNodes, edges: nextEdges });
    savedGraphSignatureRef.current = graphSignature(nextNodes, nextEdges);
    flowGraphDirtyRef.current = Boolean(props.taskGraphDraft);
    if (props.activeRef.current) props.onDirtyChange(Boolean(props.taskGraphDraft));
    setSaveState(props.taskGraphDraft ? "unsaved" : "saved");
    scheduleFlowGraphValidation();
  }, [sourceRevision]);

  useEffect(() => {
    if (props.activeRef.current) props.onDirtyChange(flowGraphDirtyRef.current);
  }, [props.onDirtyChange]);

  useEffect(() => {
    if (!props.activeRef.current) return;
    emitAutomationStudioGraphMetric({
      graphId: String(props.taskGraph?.flowId ?? props.policy?.policyId ?? "active-graph"),
      nodesMounted: flowNodes.length,
      edgesMounted: flowEdges.length,
      nodesCached: flowNodes.length,
      edgesCached: flowEdges.length
    });
  }, [flowNodes.length, flowEdges.length, props.taskGraph?.flowId, props.policy?.policyId]);

  useEffect(() => {
    const nodeId = props.selectedNode?.id;
    if (!nodeId) return;
    const currentNode = flowNodesRef.current.find((node) => node.id === nodeId);
    if (!currentNode) return;
    const parametersChanged = props.selectedNode?.parameterValues !== undefined
      && JSON.stringify(currentNode.data.parameterValues ?? {})
        !== JSON.stringify(props.selectedNode.parameterValues);
    const descriptionChanged = props.selectedNode?.customDescription !== undefined
      && currentNode.data.customDescription !== props.selectedNode.customDescription;
    if (!parametersChanged && !descriptionChanged) return;
    checkpointFlowGraph();
    const nextNodes = flowNodesRef.current.map((node) => node.id === nodeId ? {
      ...node,
      data: {
        ...node.data,
        ...(parametersChanged
          ? { parameterValues: props.selectedNode.parameterValues }
          : {}),
        ...(descriptionChanged
          ? { customDescription: props.selectedNode.customDescription }
          : {})
      }
    } : node);
    flowNodesRef.current = nextNodes;
    setFlowNodes(nextNodes);
    publishFlowGraphDraft(nextNodes, flowEdgesRef.current);
  }, [
    props.selectedNode?.id,
    props.selectedNode?.parameterValues,
    props.selectedNode?.customDescription
  ]);

  useEffect(() => () => {
    flowGraphDraftFlushCancelRef.current?.();
    flowGraphDraftFlushCancelRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const nodes = flowNodesRef.current;
    const edges = flowEdgesRef.current;
    const cancel = scheduleAutomationGraphIdleTask(() => {
      const problems = automationFlowGraphProblems(nodes, edges);
      if (!cancelled) setFlowGraphProblems(problems);
    }, { delayMs: 80, timeoutMs: 1_000 });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [flowGraphValidationRevision]);

  const invalidFlowNodeIds = useMemo(
    () => new Set(flowGraphProblems
      .filter((problem) => problem.kind === "node" && problem.targetId)
      .map((problem) => problem.targetId)),
    [flowGraphProblems]
  );
  const invalidFlowEdgeIds = useMemo(
    () => new Set(flowGraphProblems
      .filter((problem) => problem.kind === "edge" && problem.targetId)
      .map((problem) => problem.targetId)),
    [flowGraphProblems]
  );
  const validatedFlowNodes = useMemo(
    () => flowNodes.map((node) => invalidFlowNodeIds.has(node.id)
      ? {
        ...node,
        className: [node.className, "automation-validation-invalid"].filter(Boolean).join(" ")
      }
      : node),
    [flowNodes, invalidFlowNodeIds]
  );
  const validatedFlowEdges = useMemo(
    () => flowEdges.map((edge) => invalidFlowEdgeIds.has(edge.id)
      ? {
        ...edge,
        className: [edge.className, "automation-validation-invalid"].filter(Boolean).join(" ")
      }
      : edge),
    [flowEdges, invalidFlowEdgeIds]
  );

  const saveFlowGraph = useCallback(async () => {
    if (!props.activeRef.current || !props.editable || codeOwned) return;
    setSaveState("saving");
    const result = await props.onSaveGraph({
      nodes: flowNodesRef.current,
      edges: flowEdgesRef.current
    });
    setSaveState(result.state);
    if (!result.ok) return;
    savedGraphSignatureRef.current = graphSignature(
      flowNodesRef.current,
      flowEdgesRef.current
    );
    flowGraphDirtyRef.current = false;
    props.onDirtyChange(false);
  }, [codeOwned, props.activeRef, props.editable, props.onDirtyChange, props.onSaveGraph]);

  return {
    sourceRevision,
    saveState,
    saveFlowGraph,
    flowNodes,
    flowEdges,
    flowNodesRef,
    flowEdgesRef,
    setFlowNodes,
    setFlowEdges,
    setTransientFlowNodes,
    setTransientFlowEdges,
    checkpointFlowGraph,
    commitFlowGraphCheckpoint,
    undoFlowGraph,
    redoFlowGraph,
    canUndoFlowGraph,
    canRedoFlowGraph,
    flowHistoryState,
    flowViewportState,
    flowViewportStats,
    flowNodeDragActiveRef,
    recentlyConnectedFlowEdgeIdsRef,
    flowGraphProblems,
    setFlowGraphProblems,
    scheduleFlowGraphValidation,
    publishFlowGraphDraft,
    markFlowGraphDirty,
    validatedFlowNodes,
    validatedFlowEdges,
    codeOwned,
    isFlowMode
  };
}

export type FlowEditorGraphDocument = ReturnType<typeof useFlowEditorGraphDocument>;