import type { Edge, Node } from "@xyflow/react";

export type AutomationGraphViewportBounds = { x: number; y: number; width: number; height: number };
export type AutomationGraphPartitionKey = string;
export type AutomationGraphDensityState = "empty" | "loading" | "partial" | "ready" | "dense" | "capped" | "error";

export type AutomationGraphPartition<T extends Record<string, unknown>> = {
  key: AutomationGraphPartitionKey;
  flowId: string;
  gridX: number;
  gridY: number;
  revision: string;
  bounds: AutomationGraphViewportBounds;
  nodes: Array<Node<T>>;
  edges: Edge[];
  nodeCount?: number;
  edgeCount?: number;
};

export type AutomationGraphViewportDocument<T extends Record<string, unknown>> = {
  nodes: Array<Node<T>>;
  edges: Edge[];
  state: AutomationGraphDensityState;
  missingPartitionKeys: AutomationGraphPartitionKey[];
  loadingPartitionKeys: AutomationGraphPartitionKey[];
  erroredPartitionKeys: AutomationGraphPartitionKey[];
  density: {
    visibleNodes: number;
    visibleEdges: number;
    cachedNodes: number;
    cachedEdges: number;
    cachedPartitions: number;
    maxRenderedNodes: number;
    maxRenderedEdges: number;
  };
};

export type AutomationGraphViewportStoreOptions = {
  partitionSize?: number;
  maxPartitions?: number;
  maxRenderedNodes?: number;
  maxRenderedEdges?: number;
};

type PartitionState<T extends Record<string, unknown>> = {
  page: AutomationGraphPartition<T> | null;
  revision: string;
  status: "loading" | "ready" | "error";
  lastAccessed: number;
  error?: string;
};

export class AutomationGraphViewportStore<T extends Record<string, unknown>> {
  readonly partitionSize: number;
  readonly maxPartitions: number;
  readonly maxRenderedNodes: number;
  readonly maxRenderedEdges: number;
  private partitions = new Map<AutomationGraphPartitionKey, PartitionState<T>>();
  private nodes = new Map<string, Node<T>>();
  private edges = new Map<string, Edge>();
  private nodeOwners = new Map<string, Set<AutomationGraphPartitionKey>>();
  private edgeOwners = new Map<string, Set<AutomationGraphPartitionKey>>();
  private nodeSignatures = new Map<string, string>();
  private edgeSignatures = new Map<string, string>();

  constructor(options: AutomationGraphViewportStoreOptions = {}) {
    this.partitionSize = Math.max(400, options.partitionSize ?? 1_800);
    this.maxPartitions = Math.max(1, options.maxPartitions ?? 96);
    this.maxRenderedNodes = Math.max(1, options.maxRenderedNodes ?? 700);
    this.maxRenderedEdges = Math.max(1, options.maxRenderedEdges ?? 1_200);
  }

  clear(): void {
    this.partitions.clear();
    this.nodes.clear();
    this.edges.clear();
    this.nodeOwners.clear();
    this.edgeOwners.clear();
    this.nodeSignatures.clear();
    this.edgeSignatures.clear();
  }

  loadInitialViewport(input: { flowId: string; revision: string; bounds: AutomationGraphViewportBounds; nodes: Array<Node<T>>; edges: Edge[] }): AutomationGraphViewportDocument<T> {
    const [grid] = automationGraphPartitionsForViewport(input.flowId, input.bounds, { partitionSize: this.partitionSize });
    const page = grid ?? automationGraphPartitionAddress(input.flowId, 0, 0, this.partitionSize);
    this.applyPartition({ ...page, revision: input.revision, nodes: input.nodes, edges: input.edges, nodeCount: input.nodes.length, edgeCount: input.edges.length });
    return this.visibleDocument(input.flowId, input.bounds);
  }

  markLoading(flowId: string, bounds: AutomationGraphViewportBounds, prefetchRings = 0): AutomationGraphPartitionKey[] {
    const partitions = automationGraphPartitionsForViewport(flowId, bounds, { partitionSize: this.partitionSize, prefetchRings });
    const now = Date.now();
    for (const partition of partitions) {
      const current = this.partitions.get(partition.key);
      if (current?.status === "ready") continue;
      this.partitions.set(partition.key, { page: current?.page ?? null, revision: current?.revision ?? "pending", status: "loading", lastAccessed: now });
    }
    return partitions.map((partition) => partition.key);
  }

  markError(key: AutomationGraphPartitionKey, message: string): void {
    const current = this.partitions.get(key);
    this.partitions.set(key, { page: current?.page ?? null, revision: current?.revision ?? "error", status: "error", lastAccessed: Date.now(), error: message });
  }

  applyPartition(page: AutomationGraphPartition<T>): void {
    const previous = this.partitions.get(page.key)?.page;
    if (previous) this.releaseRemovedEntities(previous, page);
    const nodes = page.nodes.map((node) => this.reconcileNode(node));
    const edges = page.edges.map((edge) => this.reconcileEdge(edge));
    for (const node of nodes) this.trackOwner(this.nodeOwners, node.id, page.key);
    for (const edge of edges) this.trackOwner(this.edgeOwners, edge.id, page.key);
    this.partitions.set(page.key, { page: { ...page, nodes, edges }, revision: page.revision, status: "ready", lastAccessed: Date.now() });
    this.enforceLru();
  }

  visibleDocument(flowId: string, bounds: AutomationGraphViewportBounds, prefetchRings = 0): AutomationGraphViewportDocument<T> {
    const requested = automationGraphPartitionsForViewport(flowId, bounds, { partitionSize: this.partitionSize, prefetchRings });
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const missingPartitionKeys: string[] = [];
    const loadingPartitionKeys: string[] = [];
    const erroredPartitionKeys: string[] = [];
    let totalKnownNodes = 0;
    let totalKnownEdges = 0;
    for (const address of requested) {
      const partition = this.partitions.get(address.key);
      if (!partition) {
        missingPartitionKeys.push(address.key);
        continue;
      }
      partition.lastAccessed = Date.now();
      if (partition.status === "loading") loadingPartitionKeys.push(address.key);
      if (partition.status === "error") erroredPartitionKeys.push(address.key);
      if (!partition.page) continue;
      totalKnownNodes += partition.page.nodeCount ?? partition.page.nodes.length;
      totalKnownEdges += partition.page.edgeCount ?? partition.page.edges.length;
      for (const node of partition.page.nodes) nodeIds.add(node.id);
      for (const edge of partition.page.edges) edgeIds.add(edge.id);
    }
    const visibleNodes = [...nodeIds].map((id) => this.nodes.get(id)).filter((node): node is Node<T> => Boolean(node));
    const visibleEdges = [...edgeIds]
      .map((id) => this.edges.get(id))
      .filter((edge): edge is Edge => Boolean(edge))
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const nodeCapped = visibleNodes.length > this.maxRenderedNodes;
    const edgeCapped = visibleEdges.length > this.maxRenderedEdges;
    const nodes = nodeCapped ? visibleNodes.slice(0, this.maxRenderedNodes) : visibleNodes;
    const allowedNodeIds = new Set(nodes.map((node) => node.id));
    const edges = (edgeCapped ? visibleEdges.slice(0, this.maxRenderedEdges) : visibleEdges).filter((edge) => allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target));
    const state = this.stateFor({ nodeCount: totalKnownNodes, edgeCount: totalKnownEdges, missingPartitionKeys, loadingPartitionKeys, erroredPartitionKeys, nodeCapped, edgeCapped });
    return {
      nodes,
      edges,
      state,
      missingPartitionKeys,
      loadingPartitionKeys,
      erroredPartitionKeys,
      density: {
        visibleNodes: nodes.length,
        visibleEdges: edges.length,
        cachedNodes: this.nodes.size,
        cachedEdges: this.edges.size,
        cachedPartitions: this.partitions.size,
        maxRenderedNodes: this.maxRenderedNodes,
        maxRenderedEdges: this.maxRenderedEdges,
      },
    };
  }

  stats(): AutomationGraphViewportDocument<T>["density"] {
    return {
      visibleNodes: 0,
      visibleEdges: 0,
      cachedNodes: this.nodes.size,
      cachedEdges: this.edges.size,
      cachedPartitions: this.partitions.size,
      maxRenderedNodes: this.maxRenderedNodes,
      maxRenderedEdges: this.maxRenderedEdges,
    };
  }

  private stateFor(input: { nodeCount: number; edgeCount: number; missingPartitionKeys: string[]; loadingPartitionKeys: string[]; erroredPartitionKeys: string[]; nodeCapped: boolean; edgeCapped: boolean }): AutomationGraphDensityState {
    if (input.erroredPartitionKeys.length) return "error";
    if (input.nodeCapped || input.edgeCapped) return "capped";
    if (input.loadingPartitionKeys.length) return "loading";
    if (input.missingPartitionKeys.length) return input.nodeCount || input.edgeCount ? "partial" : "loading";
    if (!input.nodeCount && !input.edgeCount) return "empty";
    if (input.nodeCount > this.maxRenderedNodes * 0.75 || input.edgeCount > this.maxRenderedEdges * 0.75) return "dense";
    return "ready";
  }

  private reconcileNode(node: Node<T>): Node<T> {
    const signature = stableAutomationGraphEntitySignature(node);
    const current = this.nodes.get(node.id);
    if (current && this.nodeSignatures.get(node.id) === signature) return current;
    this.nodes.set(node.id, node);
    this.nodeSignatures.set(node.id, signature);
    return node;
  }

  private reconcileEdge(edge: Edge): Edge {
    const signature = stableAutomationGraphEntitySignature(edge);
    const current = this.edges.get(edge.id);
    if (current && this.edgeSignatures.get(edge.id) === signature) return current;
    this.edges.set(edge.id, edge);
    this.edgeSignatures.set(edge.id, signature);
    return edge;
  }

  private trackOwner(owners: Map<string, Set<string>>, entityId: string, partitionKey: string): void {
    const current = owners.get(entityId) ?? new Set<string>();
    current.add(partitionKey);
    owners.set(entityId, current);
  }

  private releasePartitionOwnership(page: AutomationGraphPartition<T>): void {
    for (const node of page.nodes) this.releaseOwner(this.nodeOwners, this.nodes, this.nodeSignatures, node.id, page.key);
    for (const edge of page.edges) this.releaseOwner(this.edgeOwners, this.edges, this.edgeSignatures, edge.id, page.key);
  }

  private releaseRemovedEntities(previous: AutomationGraphPartition<T>, next: AutomationGraphPartition<T>): void {
    const nextNodeIds = new Set(next.nodes.map((node) => node.id));
    const nextEdgeIds = new Set(next.edges.map((edge) => edge.id));
    for (const node of previous.nodes) {
      if (!nextNodeIds.has(node.id)) this.releaseOwner(this.nodeOwners, this.nodes, this.nodeSignatures, node.id, previous.key);
    }
    for (const edge of previous.edges) {
      if (!nextEdgeIds.has(edge.id)) this.releaseOwner(this.edgeOwners, this.edges, this.edgeSignatures, edge.id, previous.key);
    }
  }

  private releaseOwner<TEntity>(owners: Map<string, Set<string>>, entities: Map<string, TEntity>, signatures: Map<string, string>, entityId: string, partitionKey: string): void {
    const ownerSet = owners.get(entityId);
    ownerSet?.delete(partitionKey);
    if (ownerSet?.size) return;
    owners.delete(entityId);
    entities.delete(entityId);
    signatures.delete(entityId);
  }

  private enforceLru(): void {
    while (this.partitions.size > this.maxPartitions) {
      const oldest = [...this.partitions.entries()].sort((left, right) => left[1].lastAccessed - right[1].lastAccessed)[0];
      if (!oldest) return;
      const [key, state] = oldest;
      if (state.page) this.releasePartitionOwnership(state.page);
      this.partitions.delete(key);
    }
  }
}

export type AutomationGraphViewportLoader<T extends Record<string, unknown>> = (request: {
  flowId: string;
  bounds: AutomationGraphViewportBounds;
  partitionKeys: AutomationGraphPartitionKey[];
  signal: AbortSignal;
}) => Promise<Array<AutomationGraphPartition<T>>>;

export class AutomationGraphViewportCoordinator<T extends Record<string, unknown>> {
  private activeLoad: AbortController | null = null;
  private activePrefetch: AbortController | null = null;

  constructor(private readonly store: AutomationGraphViewportStore<T>) {}

  async loadViewport(input: { flowId: string; bounds: AutomationGraphViewportBounds; loader: AutomationGraphViewportLoader<T>; prefetchRings?: number }): Promise<AutomationGraphViewportDocument<T>> {
    this.activeLoad?.abort();
    const controller = new AbortController();
    this.activeLoad = controller;
    const keys = this.store.markLoading(input.flowId, input.bounds, input.prefetchRings ?? 0);
    try {
      const pages = await input.loader({ flowId: input.flowId, bounds: input.bounds, partitionKeys: keys, signal: controller.signal });
      if (!controller.signal.aborted) for (const page of pages) this.store.applyPartition(page);
    } catch (error) {
      if (!controller.signal.aborted) for (const key of keys) this.store.markError(key, error instanceof Error ? error.message : String(error));
    }
    return this.store.visibleDocument(input.flowId, input.bounds, input.prefetchRings ?? 0);
  }

  async prefetchViewport(input: { flowId: string; bounds: AutomationGraphViewportBounds; loader: AutomationGraphViewportLoader<T>; prefetchRings?: number }): Promise<void> {
    this.activePrefetch?.abort();
    const controller = new AbortController();
    this.activePrefetch = controller;
    const keys = this.store.markLoading(input.flowId, input.bounds, input.prefetchRings ?? 1);
    try {
      const pages = await input.loader({ flowId: input.flowId, bounds: input.bounds, partitionKeys: keys, signal: controller.signal });
      if (!controller.signal.aborted) for (const page of pages) this.store.applyPartition(page);
    } catch {
      // Prefetch is opportunistic. The foreground viewport request reports errors.
    }
  }

  cancel(): void {
    this.activeLoad?.abort();
    this.activePrefetch?.abort();
    this.activeLoad = null;
    this.activePrefetch = null;
  }
}

export function createAutomationGraphViewportStore<T extends Record<string, unknown>>(options: AutomationGraphViewportStoreOptions = {}): AutomationGraphViewportStore<T> {
  return new AutomationGraphViewportStore<T>(options);
}

export function createAutomationGraphViewportCoordinator<T extends Record<string, unknown>>(store: AutomationGraphViewportStore<T>): AutomationGraphViewportCoordinator<T> {
  return new AutomationGraphViewportCoordinator<T>(store);
}

export function automationGraphPartitionAddress(flowId: string, gridX: number, gridY: number, partitionSize: number): Omit<AutomationGraphPartition<Record<string, unknown>>, "revision" | "nodes" | "edges"> {
  return {
    key: automationGraphPartitionKey(flowId, gridX, gridY),
    flowId,
    gridX,
    gridY,
    bounds: { x: gridX * partitionSize, y: gridY * partitionSize, width: partitionSize, height: partitionSize },
  };
}

export function automationGraphPartitionKey(flowId: string, gridX: number, gridY: number): AutomationGraphPartitionKey {
  return encodeURIComponent(flowId) + ":" + gridX + ":" + gridY;
}

export function automationGraphPartitionsForViewport(flowId: string, bounds: AutomationGraphViewportBounds, options: { partitionSize?: number; prefetchRings?: number } = {}): Array<Omit<AutomationGraphPartition<Record<string, unknown>>, "revision" | "nodes" | "edges">> {
  const partitionSize = Math.max(400, options.partitionSize ?? 1_800);
  const rings = Math.max(0, options.prefetchRings ?? 0);
  const minX = Math.floor(bounds.x / partitionSize) - rings;
  const minY = Math.floor(bounds.y / partitionSize) - rings;
  const maxX = Math.floor((bounds.x + bounds.width) / partitionSize) + rings;
  const maxY = Math.floor((bounds.y + bounds.height) / partitionSize) + rings;
  const pages: Array<Omit<AutomationGraphPartition<Record<string, unknown>>, "revision" | "nodes" | "edges">> = [];
  for (let gridY = minY; gridY <= maxY; gridY += 1) {
    for (let gridX = minX; gridX <= maxX; gridX += 1) pages.push(automationGraphPartitionAddress(flowId, gridX, gridY, partitionSize));
  }
  return pages;
}

export function automationGraphRevisionSignature(input: { flowId?: string; revision?: string | number | null; updatedAt?: number | null; pendingOperationCount?: number; pendingOperationBytes?: number }): string {
  return [input.flowId ?? "", input.revision ?? input.updatedAt ?? "draft", input.pendingOperationCount ?? 0, input.pendingOperationBytes ?? 0].join(":");
}

export function automationGraphMiniMapNodeColor(node: Node): string {
  const metadata = node.data && typeof node.data === "object" && !Array.isArray(node.data) ? (node.data as Record<string, unknown>).metadata : null;
  const density = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? String((metadata as Record<string, unknown>).partitionDensity ?? "") : "";
  if (density === "capped" || density === "dense") return "#b35c00";
  if (density === "loading" || density === "partial") return "#5f6b7a";
  if (density === "error") return "#d13212";
  return "#0972d3";
}

function stableAutomationGraphEntitySignature(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(item as Record<string, unknown>).sort()) {
        if (key === "dragging" || key === "selected") continue;
        sorted[key] = (item as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return item;
  });
}
