"use client";

import { ListTree, X } from "lucide-react";
import { useState } from "react";
import type { Node } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";
export function FlowOutline(props: {
  id: string;
  nodes: Array<Node<AutomationFlowNodeData>>;
  selectedNodeId: string;
  onClose(): void;
  onSelect(node: Node<AutomationFlowNodeData>): void;
}) {
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(0, props.nodes.findIndex((node) => node.id === props.selectedNodeId)));
  const focusNodeAt = (index: number) => {
    const bounded = Math.max(0, Math.min(props.nodes.length - 1, index));
    setFocusedIndex(bounded);
    document.getElementById("automation-outline-node-" + props.nodes[bounded]?.id)?.focus();
  };
  return (
    <aside aria-label="Graph outline" className="automation-graph-outline" id={props.id}>
      <header><div><ListTree size={14} aria-hidden /><strong>Graph Outline</strong><span>{props.nodes.length}</span></div><button aria-label="Close graph outline" className="icon-button" onClick={props.onClose} title="Close outline" type="button"><X size={13} aria-hidden /></button></header>
      <div aria-label="Graph nodes" role="tree">
        {props.nodes.map((node, index) => (
          <button
            aria-level={1}
            aria-selected={node.id === props.selectedNodeId}
            className={node.id === props.selectedNodeId ? "selected" : ""}
            id={"automation-outline-node-" + node.id}
            key={node.id}
            onClick={() => props.onSelect(node)}
            onFocus={() => setFocusedIndex(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); focusNodeAt(index + 1); }
              else if (event.key === "ArrowUp") { event.preventDefault(); focusNodeAt(index - 1); }
              else if (event.key === "Home") { event.preventDefault(); focusNodeAt(0); }
              else if (event.key === "End") { event.preventDefault(); focusNodeAt(props.nodes.length - 1); }
              else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelect(node); }
            }}
            role="treeitem"
            tabIndex={index === focusedIndex ? 0 : -1}
            type="button"
          >
            <span>{index + 1}</span>
            <strong>{node.data.label}</strong>
            <small>{node.data.nodeDefinitionId ?? node.type ?? "node"}</small>
          </button>
        ))}
      </div>
      {!props.nodes.length ? <p>No nodes in this graph.</p> : null}
    </aside>
  );
}
