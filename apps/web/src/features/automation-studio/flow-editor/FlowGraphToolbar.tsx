"use client";

import { CheckCircle2, ListTree, Plus, Redo2, Save, Scan, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { NodeSelectionActions } from "./NodeSelectionActions";
import type { FlowEditorController } from "./useFlowEditorController";

export function FlowGraphToolbar({ controller }: { controller: FlowEditorController }) {
  const {
    applyFlowHistory, canRedoFlowGraph, canUndoFlowGraph, connectFlowSelection,
    connectionSourceNodeId, deleteFlowSelection, duplicateFlowSelection,
    flowGraphProblems, flowInstance, flowOutlineOpen, isFlowMode,
    openFlowNodePalette, saveFlowGraph, saveState, selectedFlowEdgeIds,
    selectedFlowNodeId, selectedFlowNodeIds, setFlowOutlineOpen, validateFlowGraph
  } = controller;
  return (
    <div aria-label="Canvas tools" className="automation-canvas-toolbar" role="toolbar">
      <div className="automation-canvas-tool-group">
        <button aria-keyshortcuts="F" aria-label="Fit graph" className="icon-button" onClick={() => void flowInstance?.fitView({ padding: 0.25, duration: 180 })} title="Fit graph (F)" type="button"><Scan size={14} aria-hidden /></button>
        <button aria-keyshortcuts="+" aria-label="Zoom in" className="icon-button" onClick={() => void flowInstance?.zoomIn({ duration: 120 })} title="Zoom in (+)" type="button"><ZoomIn size={14} aria-hidden /></button>
        <button aria-keyshortcuts="-" aria-label="Zoom out" className="icon-button" onClick={() => void flowInstance?.zoomOut({ duration: 120 })} title="Zoom out (-)" type="button"><ZoomOut size={14} aria-hidden /></button>
      </div>
      <div className="automation-canvas-tool-group">
        <button aria-keyshortcuts="Control+Z Meta+Z" aria-label="Undo graph change" className="icon-button" disabled={!canUndoFlowGraph || !isFlowMode} onClick={() => applyFlowHistory("undo")} title="Undo" type="button"><Undo2 size={14} aria-hidden /></button>
        <button aria-keyshortcuts="Control+Y Meta+Shift+Z" aria-label="Redo graph change" className="icon-button" disabled={!canRedoFlowGraph || !isFlowMode} onClick={() => applyFlowHistory("redo")} title="Redo" type="button"><Redo2 size={14} aria-hidden /></button>
        <button aria-keyshortcuts="Control+S Meta+S" aria-label="Save graph" className="icon-button" disabled={!isFlowMode || saveState === "saving" || saveState === "saved"} onClick={() => void saveFlowGraph()} title="Save" type="button"><Save size={14} aria-hidden /></button>
      </div>
      <NodeSelectionActions canEdit={isFlowMode} connectionPending={Boolean(connectionSourceNodeId)} edgeCount={selectedFlowEdgeIds.length} nodeCount={selectedFlowNodeIds.length} selectedNodeId={selectedFlowNodeId} onConnect={connectFlowSelection} onDelete={deleteFlowSelection} onDuplicate={duplicateFlowSelection} />
      <div className="automation-canvas-tool-group">
        <button aria-label="Validate graph" className="automation-canvas-command" onClick={validateFlowGraph} title="Validate graph" type="button"><CheckCircle2 size={14} aria-hidden /><span>{flowGraphProblems.length}</span></button>
        <button aria-expanded={flowOutlineOpen} aria-label="Toggle graph outline" className="icon-button" onClick={() => setFlowOutlineOpen((open) => !open)} title="Graph outline" type="button"><ListTree size={14} aria-hidden /></button>
        <button aria-keyshortcuts="A" aria-label="Add node" className="icon-button" disabled={!isFlowMode} onClick={openFlowNodePalette} title="Add node (A)" type="button"><Plus size={14} aria-hidden /></button>
      </div>
    </div>
  );
}