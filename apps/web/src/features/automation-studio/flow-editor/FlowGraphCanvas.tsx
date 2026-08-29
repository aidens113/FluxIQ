"use client";

import { Background, MiniMap, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, type Edge, type EdgeChange, type Node, type NodeChange } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";
import { automationGraphMiniMapNodeColor } from "../graph/viewport-store";
import { createAutomationConnectionEdge, rebalanceAutomationEdgeLanes, reconnectAutomationEdge } from "../graph/edge-routing";
import { sameStringList } from "../views/view-utils";
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
  ignoreProtectedEdgeRemovals,
  flowEdgeChangesAreDurable,
  flowNodeChangesAreDurable,
  protectRecentlyConnectedEdge
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
    checkpointFlowGraph,
    markFlowGraphDirty,
    recentlyConnectedFlowEdgeIdsRef,
    setFlowEdges,
    flowNodesRef,
    flowEdgesRef,
    publishFlowGraphDraft,
    setTransientFlowEdges,
    setSelectedFlowEdgeIds,
    setSelectedFlowNodeId,
    setSelectedFlowNodeIds,
    setFlowNodes,
    setTransientFlowNodes,
    flowNodeDragActiveRef,
    commitFlowGraphCheckpoint,
    flowSelectionRef,
    publishFlowSelection,
    flowCanvasSelectionForNode,
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
        <div aria-label="Nodes whiteboard" className="automation-react-flow-frame" onContextMenu={suppressFlowPaneContextMenu} onKeyDown={handleFlowCanvasKeyDown} onPointerDownCapture={startFlowDragSelect} ref={flowFrameRef} tabIndex={0}>
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
            isValidConnection={validateFlowConnection}
            onConnect={(connection) => {
              if (!isFlowMode) return;
              checkpointFlowGraph();
              markFlowGraphDirty(true);
              const nextEdge = createAutomationConnectionEdge(connection, flowEdgesRef.current, "policy-edge", flowNodesRef.current);
              protectRecentlyConnectedEdge(recentlyConnectedFlowEdgeIdsRef, nextEdge.id);
              setFlowEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(addEdge(nextEdge, edges), flowNodesRef.current);
                flowEdgesRef.current = nextEdges;
                publishFlowGraphDraft(flowNodesRef.current, nextEdges);
                return nextEdges;
              });
            }}
            onReconnect={(oldEdge, connection) => {
              if (!isFlowMode) return;
              checkpointFlowGraph();
              markFlowGraphDirty(true);
              setFlowEdges((edges) => {
                const nextEdges = reconnectAutomationEdge(oldEdge, connection, edges, flowNodesRef.current);
                flowEdgesRef.current = nextEdges;
                publishFlowGraphDraft(flowNodesRef.current, nextEdges);
                return nextEdges;
              });
            }}
            onEdgesChange={(changes: EdgeChange[]) => {
              if (!isFlowMode) return;
              const allowedChanges = ignoreProtectedEdgeRemovals(changes, recentlyConnectedFlowEdgeIdsRef.current);
              if (!allowedChanges.length) return;
              const durableChange = flowEdgeChangesAreDurable(allowedChanges);
              if (durableChange) {
                checkpointFlowGraph();
                markFlowGraphDirty(true);
              }
              const setNextEdges = durableChange ? setFlowEdges : setTransientFlowEdges;
              setNextEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(applyEdgeChanges(allowedChanges, edges), flowNodesRef.current);
                flowEdgesRef.current = nextEdges;
                if (durableChange) publishFlowGraphDraft(flowNodesRef.current, nextEdges);
                return nextEdges;
              });
            }}
            onEdgesDelete={(deletedEdges) => setSelectedFlowEdgeIds((ids) => ids.filter((id) => !deletedEdges.some((edge) => edge.id === id)))}
            onNodesDelete={(deletedNodes) => {
              checkpointFlowGraph();
              markFlowGraphDirty(true);
              const deletedIds = new Set(deletedNodes.map((node) => node.id));
              setFlowEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target)), flowNodesRef.current);
                flowEdgesRef.current = nextEdges;
                publishFlowGraphDraft(flowNodesRef.current.filter((node) => !deletedIds.has(node.id)), nextEdges);
                return nextEdges;
              });
              if (deletedIds.has(selectedFlowNodeId)) setSelectedFlowNodeId("");
              setSelectedFlowNodeIds((ids) => ids.filter((id) => !deletedIds.has(id)));
            }}
            onNodesChange={(changes: NodeChange<Node<AutomationFlowNodeData>>[]) => {
              if (!isFlowMode) return;
              const durableChange = flowNodeChangesAreDurable(changes, flowNodeDragActiveRef.current);
              if (durableChange) checkpointFlowGraph();
              const nextNodes = applyNodeChanges(changes, flowNodesRef.current);
              flowNodesRef.current = nextNodes;
              const removedNodeIds = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
              if (removedNodeIds.size) {
                markFlowGraphDirty(true);
                const nextEdges = rebalanceAutomationEdgeLanes(flowEdgesRef.current.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)), nextNodes);
                flowEdgesRef.current = nextEdges;
                setFlowEdges(nextEdges);
                publishFlowGraphDraft(nextNodes, nextEdges);
              }
              if (durableChange) setFlowNodes(nextNodes);
              else setTransientFlowNodes(nextNodes);
            }}
            onEdgeClick={(event, edge) => {
              if (event.button !== 0) return;
              setSelectedFlowNodeId("");
              setSelectedFlowNodeIds([]);
              setSelectedFlowEdgeIds([edge.id]);
              setTransientFlowEdges((edges) => {
                const nextEdges = edges.map((item) => ({ ...item, selected: item.id === edge.id }));
                flowEdgesRef.current = nextEdges;
                return nextEdges;
              });
            }}
            onNodeDragStart={() => {
              checkpointFlowGraph();
              flowNodeDragActiveRef.current = true;
            }}
            onNodeDragStop={() => {
              flowNodeDragActiveRef.current = false;
              const nodes = flowNodesRef.current;
              setTransientFlowEdges((edges) => {
                const nextEdges = rebalanceAutomationEdgeLanes(edges, nodes);
                flowEdgesRef.current = nextEdges;
                return nextEdges;
              });
              const committed = commitFlowGraphCheckpoint();
              if (committed) {
                markFlowGraphDirty(true);
                publishFlowGraphDraft(nodes, flowEdgesRef.current);
              }
            }}
            onNodeClick={(event, node) => {
              if (event.button !== 0) return;
              setSelectedFlowNodeId((current: string) => current === node.id ? current : node.id);
              setSelectedFlowNodeIds((current) => sameStringList(current, [node.id]) ? current : [node.id]);
              setSelectedFlowEdgeIds((current) => current.length ? [] : current);
              flowSelectionRef.current = `node:${node.id}`;
              publishFlowSelection(flowCanvasSelectionForNode(node));
            }}
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
