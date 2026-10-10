"use client";

// The labelled outline around the Handlers and their steps, drawn in flow
// coordinates behind the nodes so it moves and zooms with them. It takes no
// pointer input: everything inside it stays selectable and draggable.

import { ViewportPortal, type Node } from "@xyflow/react";
import { flowHandlerAreaBounds } from "../../graph/handlers";
import { useFlowHandlerView } from "./FlowHandlerViewContext";

export function FlowHandlerArea(props: { nodes: ReadonlyArray<Node<any>> }) {
  const { view } = useFlowHandlerView();
  const bounds = view.areaNodeIds.size ? flowHandlerAreaBounds(props.nodes, view.areaNodeIds) : null;
  if (!bounds) return null;
  const count = view.registrationNodeIds.size;
  return (
    <ViewportPortal>
      <section
        aria-label="Handlers"
        className="automation-handler-area"
        style={{ transform: `translate(${bounds.x}px, ${bounds.y}px)`, width: bounds.width, height: bounds.height }}
      >
        <header>
          <strong>Handlers</strong>
          <span>{count === 1 ? "1 handler" : `${count} handlers`}. The run turns to these only when something gets in the way; they are not steps of the main path.</span>
        </header>
      </section>
    </ViewportPortal>
  );
}
