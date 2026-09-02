"use client";

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnConnect,
  type OnEdgesChange,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  type OnReconnect,
  type Viewport
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  createAutomationConnectionEdge,
  rebalanceAutomationEdgeLanes,
  reconnectAutomationEdge
} from "../graph/edge-routing";
import { automationConnectionIsValid } from "../graph/ports";
import { sameStringList } from "../views/view-utils";
import {
  createFlowCanvasInteractionController,
  type FlowCanvasInteractionController
} from "./flow-canvas-interaction-controller";
import type { FlowEditorProps } from "./flow-editor-types";
import {
  flowEdgeChangesAreDurable,
  flowNodeChangesAreDurable,
  ignoreProtectedEdgeRemovals,
  protectRecentlyConnectedEdge
} from "./graph-interactions";
import { automationFlowGraphProblems } from "./graph-validation";
import type { AutomationFlowNodeData } from "./node-types";
import type { FlowEditorCommands } from "./useFlowEditorCommands";
import type { FlowEditorGraphDocument } from "./useFlowEditorGraphDocument";
import type { FlowEditorPalette } from "./useFlowEditorPalette";
import type { FlowEditorSelection } from "./useFlowEditorSelection";

export function useFlowEditorCanvasInteractions(
  props: FlowEditorProps,
  graph: FlowEditorGraphDocument,
  selection: FlowEditorSelection,
  commands: FlowEditorCommands,
  palette: FlowEditorPalette
) {
  const flowDragSelectBoxRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef({ props, graph, selection, commands, palette });
  currentRef.current = { props, graph, selection, commands, palette };
  const interactionControllerRef = useRef<FlowCanvasInteractionController | null>(null);

  if (!interactionControllerRef.current) {
    interactionControllerRef.current = createFlowCanvasInteractionController({
      scheduler: {
        request: (callback) => window.requestAnimationFrame(callback),
        cancel: (handle) => window.cancelAnimationFrame(handle)
      },
      getNodes: () => currentRef.current.graph.flowNodesRef.current,
      screenToFlowPosition: (point) => currentRef.current.selection
        .flowInstance?.screenToFlowPosition(point) ?? point,
      renderNodePositions: (positions) => {
        const currentGraph = currentRef.current.graph;
        const byId = new Map(positions.map((position) => [position.id, position]));
        const currentNodes = currentGraph.flowNodesRef.current;
        let changed = false;
        const nextNodes = currentNodes.map((node) => {
          const position = byId.get(node.id);
          if (!position || node.position.x === position.x && node.position.y === position.y) return node;
          changed = true;
          return { ...node, position: { x: position.x, y: position.y }, dragging: true };
        });
        if (!changed) return;
        currentGraph.flowNodesRef.current = nextNodes;
        currentGraph.setTransientFlowNodes(nextNodes);
      },
      renderMarquee: (box) => {
        const element = flowDragSelectBoxRef.current;
        if (!element) return;
        if (!box) {
          element.hidden = true;
          return;
        }
        element.hidden = false;
        element.style.left = box.left + "px";
        element.style.top = box.top + "px";
        element.style.width = box.width + "px";
        element.style.height = box.height + "px";
      },
      renderHover: (nodeId) => {
        const frame = currentRef.current.selection.flowFrameRef.current;
        if (!frame) return;
        if (nodeId) frame.dataset.hoveredNodeId = nodeId;
        else delete frame.dataset.hoveredNodeId;
      },
      renderViewport: (viewport) => {
        const frame = currentRef.current.selection.flowFrameRef.current;
        if (!frame) return;
        frame.style.setProperty("--flow-preview-x", viewport.x + "px");
        frame.style.setProperty("--flow-preview-y", viewport.y + "px");
        frame.style.setProperty("--flow-preview-zoom", String(viewport.zoom));
      },
      settleNodeDrag: (nodes) => settleNodeDrag(
        currentRef.current.graph,
        nodes
      ),
      settleMarquee: (nodes) => settleMarquee(
        currentRef.current.graph,
        currentRef.current.selection,
        nodes
      )
    });
  }
  const interactionController = interactionControllerRef.current;
  useEffect(() => () => interactionController.dispose(), [interactionController]);

  const startFlowDragSelect = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const { graph: currentGraph, selection: currentSelection } = currentRef.current;
    if (!currentGraph.isFlowMode || event.button !== 2 || !currentSelection.flowInstance) return;
    const target = event.target as HTMLElement;
    if (target.closest(
      ".react-flow__node, .react-flow__handle, button, input, select, textarea, a"
    )) return;
    const frame = currentSelection.flowFrameRef.current;
    if (!frame) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = frame.getBoundingClientRect();
    interactionController.startMarquee({
      pointerId: event.pointerId,
      point: { x: event.clientX, y: event.clientY },
      frameLeft: bounds.left,
      frameTop: bounds.top
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [interactionController]);

  const moveFlowDragSelect = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    interactionController.moveMarquee(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
  }, [interactionController]);

  const settleFlowDragSelect = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactionController.settleMarquee(event.pointerId, {
      x: event.clientX,
      y: event.clientY
    })) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [interactionController]);

  const cancelFlowDragSelect = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactionController.cancelMarquee(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [interactionController]);

  const suppressFlowPaneContextMenu = useCallback((
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;
    event.preventDefault();
  }, []);

  const reserveFlowNodeContextMenu = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const beginFlowNodeDrag = useCallback(() => {
    const currentGraph = currentRef.current.graph;
    if (!currentGraph.isFlowMode) return;
    currentGraph.checkpointFlowGraph();
    currentGraph.flowNodeDragActiveRef.current = true;
    interactionController.beginNodeDrag();
  }, [interactionController]);

  const settleFlowNodeDrag: OnNodeDrag<Node<AutomationFlowNodeData>> = useCallback((
    _event,
    node,
    nodes
  ) => {
    interactionController.settleNodeDrag(nodes.length ? nodes : [node]);
  }, [interactionController]);

  const handleFlowNodesChange = useCallback((
    changes: Array<NodeChange<Node<AutomationFlowNodeData>>>
  ) => {
    const currentGraph = currentRef.current.graph;
    if (!currentGraph.isFlowMode) return;
    if (currentGraph.flowNodeDragActiveRef.current
      && interactionController.previewNodeChanges(changes)) return;
    const durableChange = flowNodeChangesAreDurable(changes, false);
    if (durableChange) currentGraph.checkpointFlowGraph();
    const nextNodes = applyNodeChanges(changes, currentGraph.flowNodesRef.current);
    currentGraph.flowNodesRef.current = nextNodes;
    const removedNodeIds = new Set(changes
      .filter((change) => change.type === "remove")
      .map((change) => change.id));
    if (removedNodeIds.size) {
      currentGraph.markFlowGraphDirty(true);
      const nextEdges = rebalanceAutomationEdgeLanes(
        currentGraph.flowEdgesRef.current.filter((edge) => !removedNodeIds.has(edge.source)
          && !removedNodeIds.has(edge.target)),
        nextNodes
      );
      currentGraph.flowEdgesRef.current = nextEdges;
      currentGraph.setFlowEdges(nextEdges);
      currentGraph.publishFlowGraphDraft(nextNodes, nextEdges);
    }
    if (durableChange) currentGraph.setFlowNodes(nextNodes);
    else currentGraph.setTransientFlowNodes(nextNodes);
  }, [interactionController]);

  const connectFlowNodes: OnConnect = useCallback((connection) => {
    const currentGraph = currentRef.current.graph;
    if (!currentGraph.isFlowMode) return;
    currentGraph.checkpointFlowGraph();
    currentGraph.markFlowGraphDirty(true);
    const nextEdge = createAutomationConnectionEdge(
      connection,
      currentGraph.flowEdgesRef.current,
      "policy-edge",
      currentGraph.flowNodesRef.current
    );
    protectRecentlyConnectedEdge(
      currentGraph.recentlyConnectedFlowEdgeIdsRef,
      nextEdge.id
    );
    currentGraph.setFlowEdges((edges) => {
      const nextEdges = rebalanceAutomationEdgeLanes(
        addEdge(nextEdge, edges),
        currentGraph.flowNodesRef.current
      );
      currentGraph.flowEdgesRef.current = nextEdges;
      currentGraph.publishFlowGraphDraft(
        currentGraph.flowNodesRef.current,
        nextEdges
      );
      return nextEdges;
    });
  }, []);

  const reconnectFlowEdge: OnReconnect<Edge> = useCallback((
    oldEdge,
    connection
  ) => {
    const currentGraph = currentRef.current.graph;
    if (!currentGraph.isFlowMode) return;
    currentGraph.checkpointFlowGraph();
    currentGraph.markFlowGraphDirty(true);
    currentGraph.setFlowEdges((edges) => {
      const nextEdges = reconnectAutomationEdge(
        oldEdge,
        connection,
        edges,
        currentGraph.flowNodesRef.current
      );
      currentGraph.flowEdgesRef.current = nextEdges;
      currentGraph.publishFlowGraphDraft(
        currentGraph.flowNodesRef.current,
        nextEdges
      );
      return nextEdges;
    });
  }, []);

  const handleFlowEdgesChange: OnEdgesChange<Edge> = useCallback((changes) => {
    const currentGraph = currentRef.current.graph;
    if (!currentGraph.isFlowMode) return;
    const allowedChanges = ignoreProtectedEdgeRemovals(
      changes,
      currentGraph.recentlyConnectedFlowEdgeIdsRef.current
    );
    if (!allowedChanges.length) return;
    const durableChange = flowEdgeChangesAreDurable(allowedChanges);
    if (durableChange) {
      currentGraph.checkpointFlowGraph();
      currentGraph.markFlowGraphDirty(true);
    }
    const setNextEdges = durableChange
      ? currentGraph.setFlowEdges
      : currentGraph.setTransientFlowEdges;
    setNextEdges((edges) => {
      const changedEdges = applyEdgeChanges(allowedChanges, edges);
      const nextEdges = durableChange
        ? rebalanceAutomationEdgeLanes(changedEdges, currentGraph.flowNodesRef.current)
        : changedEdges;
      currentGraph.flowEdgesRef.current = nextEdges;
      if (durableChange) {
        currentGraph.publishFlowGraphDraft(
          currentGraph.flowNodesRef.current,
          nextEdges
        );
      }
      return nextEdges;
    });
  }, []);

  const handleFlowEdgesDelete: OnEdgesDelete<Edge> = useCallback(
    (deletedEdges) => {
      const deletedIds = new Set(deletedEdges.map((edge) => edge.id));
      currentRef.current.selection.setSelectedFlowEdgeIds(
        (ids) => ids.filter((id) => !deletedIds.has(id))
      );
    },
    []
  );

  const handleFlowNodesDelete: OnNodesDelete<Node<AutomationFlowNodeData>> =
    useCallback((deletedNodes) => {
      const deletedIds = new Set(deletedNodes.map((node) => node.id));
      const currentSelection = currentRef.current.selection;
      currentSelection.setSelectedFlowNodeId(
        (id: string) => deletedIds.has(id) ? "" : id
      );
      currentSelection.setSelectedFlowNodeIds(
        (ids) => ids.filter((id) => !deletedIds.has(id))
      );
    }, []);

  const selectClickedFlowEdge: EdgeMouseHandler<Edge> = useCallback((
    event,
    edge
  ) => {
    if (event.button !== 0) return;
    const { graph: currentGraph, selection: currentSelection } = currentRef.current;
    currentSelection.setSelectedFlowNodeId("");
    currentSelection.setSelectedFlowNodeIds([]);
    currentSelection.setSelectedFlowEdgeIds(
      (current) => sameStringList(current, [edge.id]) ? current : [edge.id]
    );
    currentGraph.setTransientFlowEdges((edges) => {
      let changed = false;
      const nextEdges = edges.map((item) => {
        const selected = item.id === edge.id;
        if (item.selected === selected) return item;
        changed = true;
        return { ...item, selected };
      });
      if (!changed) return edges;
      currentGraph.flowEdgesRef.current = nextEdges;
      return nextEdges;
    });
  }, []);

  const selectClickedFlowNode: NodeMouseHandler<Node<AutomationFlowNodeData>> =
    useCallback((event, node) => {
      if (event.button !== 0) return;
      const currentSelection = currentRef.current.selection;
      currentSelection.setSelectedFlowNodeId(
        (current: string) => current === node.id ? current : node.id
      );
      currentSelection.setSelectedFlowNodeIds(
        (current) => sameStringList(current, [node.id]) ? current : [node.id]
      );
      currentSelection.setSelectedFlowEdgeIds(
        (current) => current.length ? [] : current
      );
      currentSelection.flowSelectionRef.current = `node:${node.id}`;
      currentSelection.publishFlowSelection(
        currentSelection.flowCanvasSelectionForNode(node)
      );
    }, []);

  const previewFlowViewport = useCallback((
    _event: MouseEvent | TouchEvent | null,
    viewport: Viewport
  ) => interactionController.previewViewport(viewport), [interactionController]);

  const previewHoveredFlowNode = useCallback((
    _event: ReactMouseEvent,
    node: Node<AutomationFlowNodeData>
  ) => interactionController.previewHover(node.id), [interactionController]);

  const clearHoveredFlowNode = useCallback(
    () => interactionController.previewHover(null),
    [interactionController]
  );

  const validateFlowGraph = useCallback(() => {
    const { graph: currentGraph, props: currentProps } = currentRef.current;
    const problems = automationFlowGraphProblems(
      currentGraph.flowNodesRef.current,
      currentGraph.flowEdgesRef.current
    );
    currentGraph.setFlowGraphProblems(problems);
    currentProps.setSelection({
      kind: "editor-mode",
      id: "graph-validation",
      editor: "flow",
      label: "Graph Validation",
      description: problems.length
        ? "Resolve graph problems before running this Flow."
        : "The graph passed structural validation.",
      sections: [{
        title: problems.length ? "Problems" : "Ready",
        rows: problems.length
          ? problems.map((problem) => [problem.label, problem.message])
          : [["Status", "No structural graph problems"]]
      }]
    });
    currentProps.onOpenValidation();
  }, []);

  const handleFlowCanvasKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    const {
      graph: currentGraph,
      selection: currentSelection,
      commands: currentCommands,
      palette: currentPalette
    } = currentRef.current;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "a") {
      event.preventDefault();
      currentCommands.selectAllFlowNodes();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "c") {
      event.preventDefault();
      currentCommands.copyFlowSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "v") {
      event.preventDefault();
      currentCommands.pasteFlowClipboard();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "d") {
      event.preventDefault();
      currentCommands.duplicateFlowSelection();
      return;
    }
    if (event.shiftKey
      && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
      event.preventDefault();
      currentCommands.moveFlowSelection(
        key === "arrowleft" ? -10 : key === "arrowright" ? 10 : 0,
        key === "arrowup" ? -10 : key === "arrowdown" ? 10 : 0
      );
      return;
    }
    if ((key === "delete" || key === "backspace") && currentGraph.isFlowMode) {
      event.preventDefault();
      currentCommands.deleteFlowSelection();
      return;
    }
    if (key === "c" && currentGraph.isFlowMode) {
      event.preventDefault();
      currentCommands.connectFlowSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault();
      void currentGraph.saveFlowGraph();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      currentCommands.applyFlowHistory(event.shiftKey ? "redo" : "undo");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      currentCommands.applyFlowHistory("redo");
      return;
    }
    if (key === "f") {
      void currentSelection.flowInstance?.fitView({ padding: 0.25, duration: 180 });
    } else if (key === "+" || key === "=") {
      void currentSelection.flowInstance?.zoomIn({ duration: 120 });
    } else if (key === "-") {
      void currentSelection.flowInstance?.zoomOut({ duration: 120 });
    } else if (key === "a" && currentGraph.isFlowMode) {
      currentPalette.openFlowNodePalette();
    } else {
      return;
    }
    event.preventDefault();
  }, []);

  const validateFlowConnection = useCallback(
    (connection: Connection | Edge) => automationConnectionIsValid(
      connection,
      currentRef.current.graph.flowNodesRef.current
    ),
    []
  );

  return {
    flowDragSelectBoxRef,
    startFlowDragSelect,
    moveFlowDragSelect,
    settleFlowDragSelect,
    cancelFlowDragSelect,
    suppressFlowPaneContextMenu,
    reserveFlowNodeContextMenu,
    beginFlowNodeDrag,
    settleFlowNodeDrag,
    handleFlowNodesChange,
    connectFlowNodes,
    reconnectFlowEdge,
    handleFlowEdgesChange,
    handleFlowEdgesDelete,
    handleFlowNodesDelete,
    selectClickedFlowEdge,
    selectClickedFlowNode,
    previewFlowViewport,
    previewHoveredFlowNode,
    clearHoveredFlowNode,
    handleFlowCanvasKeyDown,
    validateFlowConnection,
    validateFlowGraph
  };
}

export type FlowEditorCanvasInteractions = ReturnType<
  typeof useFlowEditorCanvasInteractions
>;

function settleNodeDrag(
  graph: FlowEditorGraphDocument,
  nodes: Array<Node<AutomationFlowNodeData>>
) {
  graph.flowNodeDragActiveRef.current = false;
  graph.flowNodesRef.current = nodes;
  graph.setFlowNodes(nodes);
  if (!graph.commitFlowGraphCheckpoint()) return;
  graph.markFlowGraphDirty(true);
  graph.publishFlowGraphDraft(nodes, graph.flowEdgesRef.current);
}

function settleMarquee(
  graph: FlowEditorGraphDocument,
  selection: FlowEditorSelection,
  nodes: Array<Node<AutomationFlowNodeData>>
) {
  const ids = new Set(nodes.map((node) => node.id));
  graph.setTransientFlowNodes((items) => items.map((node) => ({
    ...node,
    selected: ids.has(node.id)
  })));
  graph.setTransientFlowEdges((edges) => edges.map((edge) => ({
    ...edge,
    selected: false
  })));
  selection.handleFlowSelectionChange({ nodes, edges: [] });
  const primaryNode = nodes[0];
  selection.flowSelectionRef.current = primaryNode
    ? "node:" + primaryNode.id
    : "";
  if (primaryNode) {
    selection.publishFlowSelection(
      selection.flowCanvasSelectionForNode(primaryNode)
    );
  }
}
