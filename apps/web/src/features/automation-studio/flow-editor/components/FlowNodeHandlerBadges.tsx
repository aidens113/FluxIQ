"use client";

// A step's entry and checkpoint markers and its hook ports: one small button
// per handler registered for this step, labelled by when it runs, that opens
// the Handler. A hook port is the registration seen from the step it covers;
// it stores nothing.

import { Flag, LifeBuoy, LogIn } from "lucide-react";
import { useFlowHandlerView } from "./FlowHandlerViewContext";

export function FlowNodeHandlerBadges(props: { nodeId: string }) {
  const { view, openNode } = useFlowHandlerView();
  const markers = view.markers.get(props.nodeId) ?? [];
  const hookPorts = view.hookPorts.get(props.nodeId) ?? [];
  const handlerStep = view.areaNodeIds.has(props.nodeId);
  if (!markers.length && !hookPorts.length && !handlerStep) return null;
  return (
    <div className="node-handler-badges">
      {handlerStep ? <span className="node-state-marker handler-step" title="A step of a handler: it runs only when its handler does">Handler step</span> : null}
      {markers.map((marker) => (
        <span className={`node-state-marker ${marker.kind}`} key={marker.kind + marker.label} title={marker.detail}>
          {marker.kind === "entry" ? <LogIn size={12} aria-hidden /> : <Flag size={12} aria-hidden />}
          {marker.label}
        </span>
      ))}
      {hookPorts.map((port) => (
        <button
          aria-label={`${port.eventWords}: open handler ${port.handlerTitle}`}
          className={`node-hook-port nodrag nopan event-${port.event}`}
          key={port.event + ":" + port.handlerNodeId}
          onClick={(event) => {
            event.stopPropagation();
            openNode(port.handlerNodeId);
          }}
          title={`${port.eventWords}: the handler “${port.handlerTitle}” covers this step. Click to open it.`}
          type="button"
        >
          <LifeBuoy size={12} aria-hidden />
          {port.eventWords}
        </button>
      ))}
    </div>
  );
}
