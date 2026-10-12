"use client";

// A Handler as the canvas draws it: a card in the Handlers area saying, in
// plain words, when it runs, where it applies, what it waits for and what
// happens after. Its `body` port is drawn like any output so its steps stay
// wired to it and editable.

import type { NodeProps } from "@xyflow/react";
import { LifeBuoy } from "lucide-react";
import type { AutomationFlowNodeData } from "../node-types";
import { useFlowHandlerView } from "./FlowHandlerViewContext";
import { NodePortList, SelectedNodeDeleteButton } from "./NodePortList";

export function FlowHandlerNode({ id, data, selected }: NodeProps) {
  const node = data as AutomationFlowNodeData;
  const card = useFlowHandlerView().view.cards.get(id);
  const title = node.customDescription || node.label || card?.title || "Handler";
  const rows: Array<[string, string]> = card
    ? [
      ["Runs", card.eventWords],
      ["Applies to", card.scopeWords],
      ["Only when", card.conditionWords],
      ["Then", card.thenWords.length ? card.thenWords.join("; ") : "No ending yet"]
    ]
    : [];
  return (
    <div className={`automation-flow-node automation-handler-node${selected ? " selected" : ""}${card && !card.readable ? " unreadable" : ""}`}>
      {selected ? <SelectedNodeDeleteButton nodeId={id} /> : null}
      <div className="node-badges">
        <span className="node-badge handler">Handler</span>
        {card ? <span className="node-badge category">{card.stepCount === 1 ? "1 step" : `${card.stepCount} steps`}</span> : null}
      </div>
      <div className="automation-flow-node-main">
        <span className="node-icon" title="Handler">
          <LifeBuoy size={18} strokeWidth={2.2} />
        </span>
        <div>
          <strong title={title}>{title}</strong>
          <span>{card?.readable === false ? "Its settings could not be read" : "Steps the run takes when something gets in the way"}</span>
        </div>
      </div>
      <dl className="automation-handler-facts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd title={value}>{value}</dd>
          </div>
        ))}
      </dl>
      <NodePortList definitionId={node.nodeDefinitionId} inputs={node.inputs} outputs={node.outputs} />
    </div>
  );
}
