"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

export type FlowEditorActions = {
  deleteNode(nodeId: string): void;
  deleteEdge(edgeId: string): void;
  selectEdge(edgeId: string): void;
  openNodeState(nodeId: string): void;
};

const noActions: FlowEditorActions = {
  deleteNode: () => undefined,
  deleteEdge: () => undefined,
  selectEdge: () => undefined,
  openNodeState: () => undefined
};

const FlowEditorActionsContext = createContext<FlowEditorActions>(noActions);

export function FlowEditorActionsProvider(props: { actions: FlowEditorActions; children: ReactNode }) {
  const actionsRef = useRef(props.actions);
  actionsRef.current = props.actions;
  const stableActions = useMemo<FlowEditorActions>(() => ({
    deleteNode: (nodeId) => actionsRef.current.deleteNode(nodeId),
    deleteEdge: (edgeId) => actionsRef.current.deleteEdge(edgeId),
    selectEdge: (edgeId) => actionsRef.current.selectEdge(edgeId),
    openNodeState: (nodeId) => actionsRef.current.openNodeState(nodeId)
  }), []);
  return <FlowEditorActionsContext.Provider value={stableActions}>{props.children}</FlowEditorActionsContext.Provider>;
}

export function useFlowEditorActions(): FlowEditorActions {
  return useContext(FlowEditorActionsContext);
}