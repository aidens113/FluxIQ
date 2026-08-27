import type { Edge, Node } from "@xyflow/react";
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

export type AutomationGraphDocument<T extends Record<string, unknown>> = {
  nodes: Array<Node<T>>;
  edges: Edge[];
};

export type AutomationGraphController<T extends Record<string, unknown>> = AutomationGraphDocument<T> & {
  nodesRef: { current: Array<Node<T>> };
  edgesRef: { current: Edge[] };
  setNodes: Dispatch<SetStateAction<Array<Node<T>>>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  replaceGraph(document: AutomationGraphDocument<T>): void;
  snapshot(): AutomationGraphDocument<T>;
  checkpoint(): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
};

export function resolveAutomationGraphUpdate<T>(current: T, update: SetStateAction<T>): T {
  return typeof update === "function" ? (update as (value: T) => T)(current) : update;
}

export function useAutomationGraphController<T extends Record<string, unknown>>(
  initialNodes: Array<Node<T>>,
  initialEdges: Edge[]
): AutomationGraphController<T> {
  const [nodes, setNodeState] = useState(initialNodes);
  const [edges, setEdgeState] = useState(initialEdges);
  const nodesRef = useRef(initialNodes);
  const edgesRef = useRef(initialEdges);
  const undoRef = useRef<Array<AutomationGraphDocument<T>>>([]);
  const redoRef = useRef<Array<AutomationGraphDocument<T>>>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const setNodes: Dispatch<SetStateAction<Array<Node<T>>>> = useCallback((update) => {
    setNodeState((current) => {
      const next = resolveAutomationGraphUpdate(current, update);
      nodesRef.current = next;
      return next;
    });
  }, []);

  const setEdges: Dispatch<SetStateAction<Edge[]>> = useCallback((update) => {
    setEdgeState((current) => {
      const next = resolveAutomationGraphUpdate(current, update);
      edgesRef.current = next;
      return next;
    });
  }, []);

  const replaceGraph = useCallback((document: AutomationGraphDocument<T>) => {
    nodesRef.current = document.nodes;
    edgesRef.current = document.edges;
    setNodeState(document.nodes);
    setEdgeState(document.edges);
    undoRef.current = [];
    redoRef.current = [];
    setHistoryVersion((version) => version + 1);
  }, []);

  const snapshot = useCallback(() => ({
    nodes: nodesRef.current,
    edges: edgesRef.current
  }), []);

  const checkpoint = useCallback(() => {
    undoRef.current = [...undoRef.current.slice(-49), snapshot()];
    redoRef.current = [];
    setHistoryVersion((version) => version + 1);
  }, [snapshot]);

  const applyHistoryDocument = useCallback((document: AutomationGraphDocument<T>) => {
    nodesRef.current = document.nodes;
    edgesRef.current = document.edges;
    setNodeState(document.nodes);
    setEdgeState(document.edges);
    setHistoryVersion((version) => version + 1);
  }, []);

  const undo = useCallback(() => {
    const previous = undoRef.current.at(-1);
    if (!previous) return;
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, snapshot()];
    applyHistoryDocument(previous);
  }, [applyHistoryDocument, snapshot]);

  const redo = useCallback(() => {
    const next = redoRef.current.at(-1);
    if (!next) return;
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, snapshot()];
    applyHistoryDocument(next);
  }, [applyHistoryDocument, snapshot]);

  return {
    nodes,
    edges,
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    replaceGraph,
    snapshot,
    checkpoint,
    undo,
    redo,
    canUndo: historyVersion >= 0 && undoRef.current.length > 0,
    canRedo: historyVersion >= 0 && redoRef.current.length > 0
  };
}