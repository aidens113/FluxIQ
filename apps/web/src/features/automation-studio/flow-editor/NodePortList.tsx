"use client";

import { ListChecks, Trash2 } from "lucide-react";
import { Handle, Position } from "@xyflow/react";
import type { AutomationNodePort } from "fluxiq/automation-studio/nodes";
import { automationPortCaption, automationPortDisplayLabel, automationPortTitle, automationPortTone } from "../graph/ports";
import { useFlowEditorActions } from "./FlowEditorActionsContext";
export function NodePortList(props: { inputs: AutomationNodePort[]; outputs: AutomationNodePort[] }) {
  return (
    <div className="automation-node-port-list">
      <div className="automation-node-port-column input">
        {props.inputs.length ? props.inputs.map((port) => <AutomationNodePortRow key={port.id} port={port} direction="target" />) : <span className="empty">No inputs</span>}
      </div>
      <div className="automation-node-port-column output">
        {props.outputs.length ? props.outputs.map((port) => <AutomationNodePortRow key={port.id} port={port} direction="source" />) : <span className="empty">No outputs</span>}
      </div>
    </div>
  );
}

function AutomationNodePortRow(props: { port: AutomationNodePort; direction: "source" | "target" }) {
  const tone = automationPortTone(props.port, props.direction);
  const caption = automationPortCaption(props.port, props.direction);
  return (
    <span className={`tone-${tone}`} title={automationPortTitle(props.port, props.direction)}>
      <Handle
        type={props.direction}
        position={props.direction === "source" ? Position.Right : Position.Left}
        id={props.port.id}
        className={`${props.direction === "source" ? "automation-flow-handle output" : "automation-flow-handle input"} tone-${tone}`}
        aria-label={(props.direction === "source" ? "Output " : "Input ") + automationPortTitle(props.port, props.direction)}
        title={automationPortTitle(props.port, props.direction)}
      />
      <i aria-hidden />
      <strong>{automationPortDisplayLabel(props.port)}</strong>
      {caption ? <small>{caption}</small> : null}
    </span>
  );
}

export function SelectedNodeDeleteButton(props: { nodeId: string }) {
  const actions = useFlowEditorActions();
  return (
    <button
      className="automation-node-delete-button nodrag nopan"
      onClick={(event) => {
        event.stopPropagation();
        actions.deleteNode(props.nodeId);
      }}
      title="Delete node"
      aria-label="Delete node"
      type="button"
    >
      <Trash2 size={13} aria-hidden />
    </button>
  );
}

export function SelectedNodeStateButton(props: { nodeId: string }) {
  const actions = useFlowEditorActions();
  return (
    <button
      className="automation-node-state-button nodrag nopan"
      onClick={(event) => {
        event.stopPropagation();
        actions.openNodeState(props.nodeId);
      }}
      title="Open state"
      aria-label="Open state"
      type="button"
    >
      <ListChecks size={13} aria-hidden />
    </button>
  );
}
