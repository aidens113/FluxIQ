"use client";

import { Plus, Redo2, Save, Scan, Undo2 } from "lucide-react";
import { NodeSelectionActions } from "./NodeSelectionActions";
import { FlowGraphToolsMenu } from "./FlowGraphToolsMenu";
import type { FlowEditorController } from "./useFlowEditorController";

export function FlowGraphToolbar({ controller, outlineId, paletteId }: { controller: FlowEditorController; outlineId: string; paletteId: string }) {
  const {
    applyFlowHistory, canRedoFlowGraph, canUndoFlowGraph, connectFlowSelection,
    connectionSourceNodeId, deleteFlowSelection, duplicateFlowSelection,
    flowGraphProblems, flowInstance, flowOutlineOpen, isFlowMode, paletteCollapsed,
    openFlowNodePalette, saveFlowGraph, saveState, selectedFlowEdgeIds,
    selectedFlowNodeId, selectedFlowNodeIds, setFlowOutlineOpen, setShowMiniMap,
    showMiniMap, validateFlowGraph
  } = controller;
  return (
    <div aria-label="Canvas tools" className="automation-canvas-toolbar" role="toolbar">
      <div className="automation-canvas-tool-group">
        <button aria-keyshortcuts="F" aria-label="Fit graph" className="icon-button" onClick={() => void flowInstance?.fitView({ padding: 0.25, duration: 180 })} title="Fit graph (F)" type="button"><Scan size={14} aria-hidden /></button>
      </div>
      <div className="automation-canvas-tool-group">
        <button aria-keyshortcuts="Control+Z Meta+Z" aria-label="Undo graph change" className="icon-button" disabled={!canUndoFlowGraph || !isFlowMode} onClick={() => applyFlowHistory("undo")} title="Undo" type="button"><Undo2 size={14} aria-hidden /></button>
        <button aria-keyshortcuts="Control+Y Meta+Shift+Z" aria-label="Redo graph change" className="icon-button" disabled={!canRedoFlowGraph || !isFlowMode} onClick={() => applyFlowHistory("redo")} title="Redo" type="button"><Redo2 size={14} aria-hidden /></button>
        <button aria-keyshortcuts="Control+S Meta+S" aria-label="Save graph" className="icon-button" disabled={!isFlowMode || saveState === "saving" || saveState === "saved"} onClick={() => void saveFlowGraph()} title="Save" type="button"><Save size={14} aria-hidden /></button>
      </div>
      {selectedFlowNodeIds.length || selectedFlowEdgeIds.length || connectionSourceNodeId ? <NodeSelectionActions canEdit={isFlowMode} connectionPending={Boolean(connectionSourceNodeId)} edgeCount={selectedFlowEdgeIds.length} nodeCount={selectedFlowNodeIds.length} selectedNodeId={selectedFlowNodeId} onConnect={connectFlowSelection} onDelete={deleteFlowSelection} onDuplicate={duplicateFlowSelection} /> : null}
      <div className="automation-canvas-tool-group">
        <button aria-controls={paletteId} aria-expanded={!paletteCollapsed} aria-keyshortcuts="A" aria-label="Add node" className="icon-button" disabled={!isFlowMode} onClick={openFlowNodePalette} title="Add node (A)" type="button"><Plus size={14} aria-hidden /></button>
        <FlowGraphToolsMenu
          flowInstance={flowInstance}
          flowOutlineOpen={flowOutlineOpen}
          outlineId={outlineId}
          problemCount={flowGraphProblems.length}
          showMiniMap={showMiniMap}
          onToggleOutline={() => setFlowOutlineOpen((open) => !open)}
          onToggleMiniMap={() => setShowMiniMap((visible) => !visible)}
          onValidate={validateFlowGraph}
        />
      </div>
    </div>
  );
}
