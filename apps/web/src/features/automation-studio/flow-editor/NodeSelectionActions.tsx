"use client";

import { Copy, Network, Trash2 } from "lucide-react";

export function NodeSelectionActions(props: {
  canEdit: boolean;
  connectionPending: boolean;
  edgeCount: number;
  nodeCount: number;
  selectedNodeId: string;
  onConnect(): void;
  onDelete(): void;
  onDuplicate(): void;
}) {
  return (
    <div className="automation-canvas-tool-group">
      <button aria-keyshortcuts="Control+D Meta+D" aria-label="Duplicate selected nodes" className="icon-button" disabled={!props.nodeCount || !props.canEdit} onClick={props.onDuplicate} title="Duplicate selected" type="button"><Copy size={14} aria-hidden /></button>
      <button aria-keyshortcuts="C" aria-label="Connect selected node" aria-pressed={props.connectionPending} className="icon-button" disabled={!props.selectedNodeId || !props.canEdit} onClick={props.onConnect} title={props.connectionPending ? "Connect to selected node" : "Start keyboard connection"} type="button"><Network size={14} aria-hidden /></button>
      <button aria-label="Delete graph selection" className="icon-button" disabled={(!props.nodeCount && !props.edgeCount) || !props.canEdit} onClick={props.onDelete} title="Delete selection" type="button"><Trash2 size={14} aria-hidden /></button>
    </div>
  );
}