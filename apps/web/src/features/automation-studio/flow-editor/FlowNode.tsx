"use client";

import type { NodeProps } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";
import { automationNodeIcon } from "./palette-icons";
import { NodePortList, SelectedNodeDeleteButton, SelectedNodeStateButton } from "./NodePortList";
export function FlowNode({ id, data, selected }: NodeProps) {
  const node = data as AutomationFlowNodeData;
  const Icon = automationNodeIcon(node.icon, node.recovery);
  const description = node.customDescription || node.description || node.actionTypes.join(", ") || "Flow node";
  const toneClass = node.reviewTone ? ` ${node.reviewTone}` : "";
  return (
    <div className={selected ? `automation-flow-node selected${toneClass}` : `automation-flow-node${toneClass}`}>
      {selected ? <SelectedNodeDeleteButton nodeId={id} /> : null}
      {selected ? <SelectedNodeStateButton nodeId={id} /> : null}
      <div className="node-badges">
        {node.isStart ? <span className="node-badge start">Start</span> : null}
        <span className="node-badge category">{node.nodeDefinitionId ? "Base" : "Generated"}</span>
        <span className="node-badge category">{node.recovery.replace(/_/g, " ")}</span>
        {node.regionName ? <span className={`node-badge region-${node.regionKind}`}>{node.regionName}</span> : null}
        {node.confidence !== undefined ? <span className="node-badge confidence">{Math.round(node.confidence * 100)}%</span> : null}
      </div>
      <div className="automation-flow-node-main">
        <span className="node-icon" title={node.nodeDefinitionId ? node.label : "Generated Flow node"}>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong>{node.label}</strong>
          <span>{description}</span>
        </div>
      </div>
      <div className="node-definition-lines">
        <span>Eligible: {node.readinessCount || 0} signals</span>
        <span>Success: {node.successCount || 0} expectations</span>
        <span>Timeout: {node.timeoutMs ? `${(node.timeoutMs / 1000).toFixed(1)}s` : "default"}</span>
      </div>
      <NodePortList inputs={node.inputs} outputs={node.outputs} />
      <div className="node-state-indicators">
        <span className={node.readinessCount ? "node-state-chip has-state" : "node-state-chip empty-state"}>Ready {node.readinessCount}</span>
        <span className={node.successCount ? "node-state-chip has-state" : "node-state-chip empty-state"}>Success {node.successCount}</span>
        <span className="node-state-chip has-state">Evidence {node.evidenceCount}</span>
      </div>
      <footer className="node-runtime-line">12 successes - 1 retry</footer>
    </div>
  );
}

