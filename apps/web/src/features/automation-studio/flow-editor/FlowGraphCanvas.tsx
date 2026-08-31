"use client";

import { Background, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";
import { automationGraphMiniMapNodeColor } from "../graph/viewport-store";
import { FlowNodePalette } from "./FlowNodePalette";
import { FlowOutline } from "./FlowOutline";
import { FlowGraphStatus } from "./FlowGraphStatus";
import { FlowGraphToolbar } from "./FlowGraphToolbar";
import { FlowEditorActionsProvider } from "./FlowEditorActionsContext";
import {
  automationGraphDeleteKeyCode,
  automationGraphFitViewOptions,
  automationGraphMiddleMousePanButtons,
  automationNodeEditorConnectionRadius,
  automationNodeEditorReconnectRadius,
} from "./graph-interactions";
import { automationEdgeTypes, automationNodeTypes } from "./renderer-registry";
import type { FlowEditorProps } from "./flow-editor-types";
import type { FlowEditorController } from "./useFlowEditorController";

export function FlowGraphCanvas({ controller, props }: { controller: FlowEditorController; props: FlowEditorProps }) {
  const {
    flowNodes,
    paletteCollapsed,
    paletteFocusRevision,
    suppressFlowPaneContextMenu,
    handleFlowCanvasKeyDown,
    startFlowDragSelect,
    moveFlowDragSelect,
    settleFlowDragSelect,
    cancelFlowDragSelect,
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
    flowFrameRef,
    isFlowMode,
    selectedFlowNodeId,
    deleteFlowNode,
    deleteFlowEdge,
    selectFlowEdge,
    flowOutlineOpen,
    setFlowOutlineOpen,
    validatedFlowNodes,
    validatedFlowEdges,
    setFlowInstance,
    validateFlowConnection,
    handleFlowSelectionChange,
    flowDragSelectBoxRef,
    selectFlowOutlineNode,
    palette,
    addFlowNode,
    setPaletteCollapsed
  } = controller;
  return (
    <section className="automation-policy-canvas">
      <FlowGraphStatus controller={controller} props={props} />
      <div className={paletteCollapsed ? "automation-policy-editor-grid palette-collapsed" : "automation-policy-editor-grid"}>
        <div aria-label="Nodes whiteboard" className="automation-react-flow-frame" onContextMenu={suppressFlowPaneContextMenu} onKeyDown={handleFlowCanvasKeyDown} onPointerCancelCapture={cancelFlowDragSelect} onPointerDownCapture={startFlowDragSelect} onPointerMoveCapture={moveFlowDragSelect} onPointerUpCapture={settleFlowDragSelect} ref={flowFrameRef} tabIndex={0}>
          <FlowGraphToolbar controller={controller} />
          <FlowEditorActionsProvider actions={{ deleteNode: deleteFlowNode, deleteEdge: deleteFlowEdge, selectEdge: selectFlowEdge, openNodeState: props.onOpenNodeState }}>
          <ReactFlow<Node<AutomationFlowNodeData>, Edge>
            fitView
            fitViewOptions={automationGraphFitViewOptions}
            nodes={validatedFlowNodes}
            edges={validatedFlowEdges}
            edgeTypes={automationEdgeTypes}
            nodeTypes={automationNodeTypes}
            nodesDraggable={isFlowMode}
            nodesConnectable={isFlowMode}
            edgesReconnectable={isFlowMode}
            connectionRadius={automationNodeEditorConnectionRadius}
            elementsSelectable
            nodesFocusable
            edgesFocusable
            onlyRenderVisibleElements
            panOnDrag={automationGraphMiddleMousePanButtons}
            selectionOnDrag={false}
            deleteKeyCode={isFlowMode ? automationGraphDeleteKeyCode : null}
            minZoom={0.1}
            reconnectRadius={automationNodeEditorReconnectRadius}
            onInit={setFlowInstance}
            onMove={previewFlowViewport}
            isValidConnection={validateFlowConnection}
            onConnect={connectFlowNodes}
            onReconnect={reconnectFlowEdge}
            onEdgesChange={handleFlowEdgesChange}
            onEdgesDelete={handleFlowEdgesDelete}
            onNodesDelete={handleFlowNodesDelete}
            onNodesChange={handleFlowNodesChange}
            onEdgeClick={selectClickedFlowEdge}
            onNodeDragStart={beginFlowNodeDrag}
            onNodeDragStop={settleFlowNodeDrag}
            onNodeMouseEnter={previewHoveredFlowNode}
            onNodeMouseLeave={clearHoveredFlowNode}
            onNodeContextMenu={reserveFlowNodeContextMenu}
            onNodeClick={selectClickedFlowNode}
            onSelectionChange={handleFlowSelectionChange}
          >
            <Background gap={24} size={1} />
            <MiniMap nodeColor={automationGraphMiniMapNodeColor} pannable zoomable />

          </ReactFlow>
          </FlowEditorActionsProvider>
          <div className="automation-node-marquee" hidden ref={flowDragSelectBoxRef} />
          {flowOutlineOpen ? <FlowOutline nodes={flowNodes} selectedNodeId={selectedFlowNodeId} onClose={() => setFlowOutlineOpen(false)} onSelect={selectFlowOutlineNode} /> : null}
        </div>
        <FlowNodePalette collapsed={paletteCollapsed} focusRevision={paletteFocusRevision} disabled={!isFlowMode} groups={palette} title="Flow Nodes" onAddNode={addFlowNode} onCollapsedChange={setPaletteCollapsed} />
      </div>
    </section>
  );
}
