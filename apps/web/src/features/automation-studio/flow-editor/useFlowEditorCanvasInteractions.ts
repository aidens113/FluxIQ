"use client";

import type { Connection, Edge } from "@xyflow/react";
import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { startAutomationNodeMarquee } from "../graph/interaction-geometry";
import { automationConnectionIsValid } from "../graph/ports";
import type { AutomationDragSelectBox } from "../workspace/layout";
import type { FlowEditorProps } from "./flow-editor-types";
import { automationFlowGraphProblems } from "./graph-validation";
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

  const setFlowDragSelectBox = (box: AutomationDragSelectBox | null) => {
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
  };

  const startFlowDragSelect = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!graph.isFlowMode) return;
    startAutomationNodeMarquee({
      event,
      flow: selection.flowInstance,
      frame: selection.flowFrameRef.current,
      nodes: graph.flowNodesRef.current,
      setDragBox: setFlowDragSelectBox,
      setEdges: (updater) => graph.setTransientFlowEdges(
        (edges) => updater(edges)
      ),
      setNodes: (updater) => graph.setTransientFlowNodes(
        (nodes) => updater(nodes)
      ),
      onSelected: (nodes) => {
        const ids = nodes.map((node) => node.id);
        const primaryNode = nodes[0];
        selection.setSelectedFlowNodeIds(ids);
        selection.setSelectedFlowNodeId(primaryNode?.id ?? "");
        selection.setSelectedFlowEdgeIds([]);
        const key = primaryNode ? "node:" + primaryNode.id : "";
        selection.flowSelectionRef.current = key;
        if (primaryNode) {
          selection.publishFlowSelection(
            selection.flowCanvasSelectionForNode(primaryNode)
          );
        }
      }
    });
  };

  const suppressFlowPaneContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    const target = event.target as HTMLElement;
    if (!target.closest(
      ".react-flow__node, .react-flow__handle, button, input, select, textarea, a"
    )) {
      event.preventDefault();
    }
  };

  const validateFlowGraph = () => {
    const problems = automationFlowGraphProblems(
      graph.flowNodesRef.current,
      graph.flowEdgesRef.current
    );
    graph.setFlowGraphProblems(problems);
    props.setSelection({
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
    props.onOpenProblems();
  };

  const handleFlowCanvasKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable=true]")) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "a") {
      event.preventDefault();
      commands.selectAllFlowNodes();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "c") {
      event.preventDefault();
      commands.copyFlowSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "v") {
      event.preventDefault();
      commands.pasteFlowClipboard();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "d") {
      event.preventDefault();
      commands.duplicateFlowSelection();
      return;
    }
    if (event.shiftKey
      && ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
      event.preventDefault();
      commands.moveFlowSelection(
        key === "arrowleft" ? -10 : key === "arrowright" ? 10 : 0,
        key === "arrowup" ? -10 : key === "arrowdown" ? 10 : 0
      );
      return;
    }
    if ((key === "delete" || key === "backspace") && graph.isFlowMode) {
      event.preventDefault();
      commands.deleteFlowSelection();
      return;
    }
    if (key === "c" && graph.isFlowMode) {
      event.preventDefault();
      commands.connectFlowSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault();
      void graph.saveFlowGraph();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      commands.applyFlowHistory(event.shiftKey ? "redo" : "undo");
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      commands.applyFlowHistory("redo");
      return;
    }
    if (key === "f") {
      void selection.flowInstance?.fitView({ padding: 0.25, duration: 180 });
    } else if (key === "+" || key === "=") {
      void selection.flowInstance?.zoomIn({ duration: 120 });
    } else if (key === "-") {
      void selection.flowInstance?.zoomOut({ duration: 120 });
    } else if (key === "a" && graph.isFlowMode) {
      palette.openFlowNodePalette();
    } else {
      return;
    }
    event.preventDefault();
  };

  const validateFlowConnection = useCallback(
    (connection: Connection | Edge) => automationConnectionIsValid(
      connection,
      graph.flowNodesRef.current
    ),
    [graph.flowNodesRef]
  );

  return {
    flowDragSelectBoxRef,
    startFlowDragSelect,
    suppressFlowPaneContextMenu,
    handleFlowCanvasKeyDown,
    validateFlowConnection,
    validateFlowGraph
  };
}

export type FlowEditorCanvasInteractions = ReturnType<
  typeof useFlowEditorCanvasInteractions
>;