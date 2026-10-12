"use client";

// The canvas's handler view, handed to every node it draws: which steps are in
// the Handlers area, each Handler's card, each step's hook ports and its entry
// and checkpoint markers, and how to open a Handler from a hook port. Node
// data is left as stored; this is the only place the view travels.

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { EMPTY_FLOW_HANDLER_CANVAS_VIEW, type FlowHandlerCanvasView } from "../../graph/handlers";

export type FlowHandlerViewValue = {
  view: FlowHandlerCanvasView;
  /** Selects a node and brings it into view, as the outline does. */
  openNode(nodeId: string): void;
};

const FlowHandlerViewContext = createContext<FlowHandlerViewValue>({ view: EMPTY_FLOW_HANDLER_CANVAS_VIEW, openNode: () => undefined });

export function FlowHandlerViewProvider(props: { view: FlowHandlerCanvasView; openNode(nodeId: string): void; children: ReactNode }) {
  const openRef = useRef(props.openNode);
  openRef.current = props.openNode;
  const value = useMemo<FlowHandlerViewValue>(() => ({ view: props.view, openNode: (nodeId) => openRef.current(nodeId) }), [props.view]);
  return <FlowHandlerViewContext.Provider value={value}>{props.children}</FlowHandlerViewContext.Provider>;
}

export function useFlowHandlerView(): FlowHandlerViewValue {
  return useContext(FlowHandlerViewContext);
}
