import type { Edge, Node } from "@xyflow/react";

export type AutomationGraphDocument<T extends Record<string, unknown>> = {
  nodes: Array<Node<T>>;
  edges: Edge[];
};

export type AutomationGraphOperation<T extends Record<string, unknown>> =
  | { kind: "node.add"; entityId: string; after: Node<T> }
  | { kind: "node.update"; entityId: string; before: Node<T>; after: Node<T> }
  | { kind: "node.delete"; entityId: string; before: Node<T> }
  | { kind: "edge.add"; entityId: string; after: Edge }
  | { kind: "edge.update"; entityId: string; before: Edge; after: Edge }
  | { kind: "edge.delete"; entityId: string; before: Edge };

export type AutomationGraphOperationBatch<T extends Record<string, unknown>> = {
  batchId: string;
  baseRevision: string;
  createdAt: number;
  operations: Array<AutomationGraphOperation<T>>;
  estimatedBytes: number;
};

export type AutomationGraphHistoryState = {
  undoDepth: number;
  redoDepth: number;
  estimatedBytes: number;
  maxBytes: number;
};

export function diffAutomationGraphDocuments<T extends Record<string, unknown>>(
  before: AutomationGraphDocument<T>,
  after: AutomationGraphDocument<T>,
  options: { batchId?: string; baseRevision?: string; now?: number } = {},
): AutomationGraphOperationBatch<T> {
  const operations: Array<AutomationGraphOperation<T>> = [];
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));

  for (const [id, node] of afterNodes) {
    const previous = beforeNodes.get(id);
    if (!previous) operations.push({ kind: "node.add", entityId: id, after: automationGraphDurableEntity(node) });
    else if (automationGraphEntitySignature(previous) !== automationGraphEntitySignature(node)) operations.push({ kind: "node.update", entityId: id, before: automationGraphDurableEntity(previous), after: automationGraphDurableEntity(node) });
  }
  for (const [id, node] of beforeNodes) {
    if (!afterNodes.has(id)) operations.push({ kind: "node.delete", entityId: id, before: automationGraphDurableEntity(node) });
  }
  for (const [id, edge] of afterEdges) {
    const previous = beforeEdges.get(id);
    if (!previous) operations.push({ kind: "edge.add", entityId: id, after: automationGraphDurableEntity(edge) });
    else if (automationGraphEntitySignature(previous) !== automationGraphEntitySignature(edge)) operations.push({ kind: "edge.update", entityId: id, before: automationGraphDurableEntity(previous), after: automationGraphDurableEntity(edge) });
  }
  for (const [id, edge] of beforeEdges) {
    if (!afterEdges.has(id)) operations.push({ kind: "edge.delete", entityId: id, before: automationGraphDurableEntity(edge) });
  }

  const batch = {
    batchId: options.batchId ?? "graph-batch-" + (options.now ?? Date.now()).toString(36),
    baseRevision: options.baseRevision ?? "draft",
    createdAt: options.now ?? Date.now(),
    operations,
    estimatedBytes: 0,
  };
  return { ...batch, estimatedBytes: estimateAutomationGraphOperationBytes(batch) };
}

export function applyAutomationGraphOperationBatch<T extends Record<string, unknown>>(
  document: AutomationGraphDocument<T>,
  batch: AutomationGraphOperationBatch<T>,
  direction: "forward" | "reverse",
): AutomationGraphDocument<T> {
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const edges = new Map(document.edges.map((edge) => [edge.id, edge]));
  const operations = direction === "forward" ? batch.operations : [...batch.operations].reverse();
  for (const operation of operations) {
    if (operation.kind === "node.add") direction === "forward" ? nodes.set(operation.entityId, operation.after) : nodes.delete(operation.entityId);
    else if (operation.kind === "node.update") nodes.set(operation.entityId, direction === "forward" ? operation.after : operation.before);
    else if (operation.kind === "node.delete") direction === "forward" ? nodes.delete(operation.entityId) : nodes.set(operation.entityId, operation.before);
    else if (operation.kind === "edge.add") direction === "forward" ? edges.set(operation.entityId, operation.after) : edges.delete(operation.entityId);
    else if (operation.kind === "edge.update") edges.set(operation.entityId, direction === "forward" ? operation.after : operation.before);
    else if (operation.kind === "edge.delete") direction === "forward" ? edges.delete(operation.entityId) : edges.set(operation.entityId, operation.before);
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

export class AutomationGraphOperationHistory<T extends Record<string, unknown>> {
  private readonly maxBytes: number;
  private undoBatches: Array<AutomationGraphOperationBatch<T>> = [];
  private redoBatches: Array<AutomationGraphOperationBatch<T>> = [];
  private estimatedBytes = 0;

  constructor(options: { maxBytes?: number } = {}) {
    this.maxBytes = Math.max(16_384, options.maxBytes ?? 1_500_000);
  }

  push(batch: AutomationGraphOperationBatch<T>): void {
    if (!batch.operations.length) return;
    this.undoBatches.push(batch);
    this.redoBatches = [];
    this.estimatedBytes += batch.estimatedBytes;
    this.prune();
  }

  clear(): void {
    this.undoBatches = [];
    this.redoBatches = [];
    this.estimatedBytes = 0;
  }

  undo(document: AutomationGraphDocument<T>): AutomationGraphDocument<T> {
    const batch = this.undoBatches.pop();
    if (!batch) return document;
    this.estimatedBytes -= batch.estimatedBytes;
    this.redoBatches.push(batch);
    this.estimatedBytes += batch.estimatedBytes;
    return applyAutomationGraphOperationBatch(document, batch, "reverse");
  }

  redo(document: AutomationGraphDocument<T>): AutomationGraphDocument<T> {
    const batch = this.redoBatches.pop();
    if (!batch) return document;
    this.estimatedBytes -= batch.estimatedBytes;
    this.undoBatches.push(batch);
    this.estimatedBytes += batch.estimatedBytes;
    this.prune();
    return applyAutomationGraphOperationBatch(document, batch, "forward");
  }

  state(): AutomationGraphHistoryState {
    return {
      undoDepth: this.undoBatches.length,
      redoDepth: this.redoBatches.length,
      estimatedBytes: Math.max(0, this.estimatedBytes),
      maxBytes: this.maxBytes,
    };
  }

  private prune(): void {
    while (this.undoBatches.length > 1 && this.estimatedBytes > this.maxBytes) {
      const removed = this.undoBatches.shift();
      this.estimatedBytes -= removed?.estimatedBytes ?? 0;
    }
  }
}

export function createAutomationGraphOperationHistory<T extends Record<string, unknown>>(options: { maxBytes?: number } = {}): AutomationGraphOperationHistory<T> {
  return new AutomationGraphOperationHistory<T>(options);
}

export function estimateAutomationGraphOperationBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function automationGraphEntitySignature(value: unknown): string {
  const durable = automationGraphDurableEntity(value);
  return JSON.stringify(durable, (_key, item) => {
    if (item instanceof Map) return [...item.entries()];
    if (item instanceof Set) return [...item.values()];
    return item;
  });
}

function automationGraphDurableEntity<T>(value: T): T {
  return automationGraphStripTransientFields(value) as T;
}

function automationGraphStripTransientFields(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (value instanceof Map) return new Map([...value.entries()].map(([key, item]) => [key, automationGraphStripTransientFields(item)]));
  if (value instanceof Set) return new Set([...value.values()].map((item) => automationGraphStripTransientFields(item)));
  if (Array.isArray(value)) return value.map((item) => automationGraphStripTransientFields(item));
  const stripPresentationFields = isAutomationGraphElementObject(value);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (stripPresentationFields && automationGraphTransientKeys.has(key)) continue;
    output[key] = automationGraphStripTransientFields(item);
  }
  return output;
}

const automationGraphTransientKeys = new Set(["selected", "dragging", "measured", "resizing", "width", "height", "positionAbsolute"]);

function isAutomationGraphElementObject(value: object): boolean {
  const item = value as Partial<Node<Record<string, unknown>>> & Partial<Edge>;
  return typeof item.id === "string" && ((item.position && typeof item.position === "object" && "data" in item) || (typeof item.source === "string" && typeof item.target === "string"));
}
