import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createAutomationGraphOperationHistory, diffAutomationGraphDocuments, type AutomationGraphDocument, type AutomationGraphHistoryState } from "./operation-history";
import { createAutomationGraphViewportStore, type AutomationGraphDensityState } from "./viewport-store";
import { scheduleAutomationGraphIdleTask, type AutomationGraphIdleTaskCancel } from "./worker-tasks";

export type AutomationGraphController<T extends Record<string, unknown>> = AutomationGraphDocument<T> & {
  nodesRef: { current: Array<Node<T>> };
  edgesRef: { current: Edge[] };
  setNodes: Dispatch<SetStateAction<Array<Node<T>>>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setTransientNodes: Dispatch<SetStateAction<Array<Node<T>>>>;
  setTransientEdges: Dispatch<SetStateAction<Edge[]>>;
  replaceGraph(document: AutomationGraphDocument<T>): void;
  snapshot(): AutomationGraphDocument<T>;
  checkpoint(): void;
  commitCheckpoint(): boolean;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  historyState: AutomationGraphHistoryState;
  viewportState: AutomationGraphDensityState;
  viewportStats: { cachedNodes: number; cachedEdges: number; cachedPartitions: number; maxRenderedNodes: number; maxRenderedEdges: number; visibleNodes: number; visibleEdges: number };
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
  const historyRef = useRef(createAutomationGraphOperationHistory<T>({ maxBytes: 1_500_000 }));
  const viewportStoreRef = useRef(createAutomationGraphViewportStore<T>());
  const pendingCheckpointRef = useRef<AutomationGraphDocument<T> | null>(null);
  const pendingHistoryFlushRef = useRef(false);
  const pendingHistoryFlushCancelRef = useRef<AutomationGraphIdleTaskCancel | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [viewportState, setViewportState] = useState<AutomationGraphDensityState>(initialNodes.length || initialEdges.length ? "ready" : "empty");

  const reconcileThroughViewport = useCallback((document: AutomationGraphDocument<T>): AutomationGraphDocument<T> => {
    const bounds = graphDocumentBounds(document);
    const visible = viewportStoreRef.current.loadInitialViewport({ flowId: "client-draft", revision: String(historyVersion), bounds, nodes: document.nodes, edges: document.edges });
    setViewportState(visible.state);
    return { nodes: visible.nodes, edges: visible.edges };
  }, [historyVersion]);

  const commitCheckpoint = useCallback(() => {
    const before = pendingCheckpointRef.current;
    pendingCheckpointRef.current = null;
    if (!before) return false;
    const after = { nodes: nodesRef.current, edges: edgesRef.current };
    const batch = diffAutomationGraphDocuments(before, after, { baseRevision: String(historyVersion) });
    if (!batch.operations.length) return false;
    historyRef.current.push(batch);
    setHistoryVersion((version) => version + 1);
    return true;
  }, [historyVersion]);

  const flushPendingHistory = useCallback(() => {
    if (pendingHistoryFlushRef.current) return;
    pendingHistoryFlushRef.current = true;
    pendingHistoryFlushCancelRef.current = scheduleAutomationGraphIdleTask(() => {
      pendingHistoryFlushRef.current = false;
      pendingHistoryFlushCancelRef.current = null;
      commitCheckpoint();
    }, { delayMs: 48, timeoutMs: 750 });
  }, [commitCheckpoint]);

  useEffect(() => () => {
    pendingHistoryFlushCancelRef.current?.();
    pendingHistoryFlushCancelRef.current = null;
  }, []);

  const applyGraphDocument = useCallback((document: AutomationGraphDocument<T>, durable: boolean) => {
    nodesRef.current = document.nodes;
    edgesRef.current = document.edges;
    const visible = reconcileThroughViewport(document);
    setNodeState(visible.nodes);
    setEdgeState(visible.edges);
    if (durable) flushPendingHistory();
  }, [flushPendingHistory, reconcileThroughViewport]);

  const setNodes: Dispatch<SetStateAction<Array<Node<T>>>> = useCallback((update) => {
    const nextNodes = resolveAutomationGraphUpdate(nodesRef.current, update);
    applyGraphDocument({ nodes: nextNodes, edges: edgesRef.current }, true);
  }, [applyGraphDocument]);

  const setEdges: Dispatch<SetStateAction<Edge[]>> = useCallback((update) => {
    const nextEdges = resolveAutomationGraphUpdate(edgesRef.current, update);
    applyGraphDocument({ nodes: nodesRef.current, edges: nextEdges }, true);
  }, [applyGraphDocument]);

  const setTransientNodes: Dispatch<SetStateAction<Array<Node<T>>>> = useCallback((update) => {
    const nextNodes = resolveAutomationGraphUpdate(nodesRef.current, update);
    nodesRef.current = nextNodes;
    setNodeState((visibleNodes) => reconcileVisibleGraphEntities(visibleNodes, nextNodes));
  }, []);

  const setTransientEdges: Dispatch<SetStateAction<Edge[]>> = useCallback((update) => {
    const nextEdges = resolveAutomationGraphUpdate(edgesRef.current, update);
    edgesRef.current = nextEdges;
    setEdgeState((visibleEdges) => reconcileVisibleGraphEntities(visibleEdges, nextEdges));
  }, []);

  const replaceGraph = useCallback((document: AutomationGraphDocument<T>) => {
    nodesRef.current = document.nodes;
    edgesRef.current = document.edges;
    const visible = reconcileThroughViewport(document);
    setNodeState(visible.nodes);
    setEdgeState(visible.edges);
    pendingCheckpointRef.current = null;
    historyRef.current.clear();
    setHistoryVersion((version) => version + 1);
  }, [reconcileThroughViewport]);

  const snapshot = useCallback(() => ({
    nodes: nodesRef.current,
    edges: edgesRef.current
  }), []);

  const checkpoint = useCallback(() => {
    pendingCheckpointRef.current = snapshot();
  }, [snapshot]);

  const applyHistoryDocument = useCallback((document: AutomationGraphDocument<T>) => {
    nodesRef.current = document.nodes;
    edgesRef.current = document.edges;
    const visible = reconcileThroughViewport(document);
    setNodeState(visible.nodes);
    setEdgeState(visible.edges);
    setHistoryVersion((version) => version + 1);
  }, [reconcileThroughViewport]);

  const undo = useCallback(() => {
    applyHistoryDocument(historyRef.current.undo(snapshot()));
  }, [applyHistoryDocument, snapshot]);

  const redo = useCallback(() => {
    applyHistoryDocument(historyRef.current.redo(snapshot()));
  }, [applyHistoryDocument, snapshot]);

  const historyState = historyRef.current.state();
  const viewportStats = viewportStoreRef.current.stats();

  return {
    nodes,
    edges,
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    setTransientNodes,
    setTransientEdges,
    replaceGraph,
    snapshot,
    checkpoint,
    commitCheckpoint,
    undo,
    redo,
    canUndo: historyVersion >= 0 && historyState.undoDepth > 0,
    canRedo: historyVersion >= 0 && historyState.redoDepth > 0,
    historyState,
    viewportState,
    viewportStats
  };
}

function graphDocumentBounds<T extends Record<string, unknown>>(document: AutomationGraphDocument<T>): { x: number; y: number; width: number; height: number } {
  if (!document.nodes.length) return { x: 0, y: 0, width: 1_800, height: 1_800 };
  const left = Math.min(...document.nodes.map((node) => node.position.x));
  const top = Math.min(...document.nodes.map((node) => node.position.y));
  const right = Math.max(...document.nodes.map((node) => node.position.x + (typeof node.measured?.width === "number" ? node.measured.width : 280)));
  const bottom = Math.max(...document.nodes.map((node) => node.position.y + (typeof node.measured?.height === "number" ? node.measured.height : 196)));
  return { x: left - 120, y: top - 120, width: Math.max(1, right - left + 240), height: Math.max(1, bottom - top + 240) };
}

function reconcileVisibleGraphEntities<TEntity extends { id: string }>(visibleEntities: TEntity[], nextEntities: TEntity[]): TEntity[] {
  if (!visibleEntities.length) return visibleEntities;
  const visibleIds = new Set(visibleEntities.map((entity) => entity.id));
  const nextVisibleById = new Map<string, TEntity>();
  for (const entity of nextEntities) {
    if (visibleIds.has(entity.id)) nextVisibleById.set(entity.id, entity);
    if (nextVisibleById.size === visibleIds.size) break;
  }
  let changed = false;
  const nextVisible: TEntity[] = [];
  for (const entity of visibleEntities) {
    const next = nextVisibleById.get(entity.id);
    if (!next) {
      changed = true;
      continue;
    }
    if (next !== entity) changed = true;
    nextVisible.push(next);
  }
  return changed ? nextVisible : visibleEntities;
}
