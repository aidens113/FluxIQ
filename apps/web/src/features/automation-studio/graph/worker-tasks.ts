import type { Edge, Node } from "@xyflow/react";

export type AutomationGraphWorkerTask<T extends Record<string, unknown> = Record<string, unknown>> =
  | { kind: "selection-bounds"; nodes: Array<Node<T>>; selectedNodeIds: string[] }
  | { kind: "serialize-graph"; graph: { nodes: Array<Node<T>>; edges: Edge[] } }
  | { kind: "revision-signature"; flowId: string; revision: string | number; pendingOperationCount: number; pendingOperationBytes: number }
  | { kind: "validate-shape"; graph: { nodes: Array<Node<T>>; edges: Edge[] } };

export type AutomationGraphWorkerResult =
  | { kind: "selection-bounds"; bounds: { x: number; y: number; width: number; height: number } | null }
  | { kind: "serialize-graph"; json: string; bytes: number }
  | { kind: "revision-signature"; signature: string }
  | { kind: "validate-shape"; problems: Array<{ id: string; message: string }> };

export type AutomationGraphWorkerQueueOptions = {
  queueId?: string;
  useWorker?: boolean;
};

export type AutomationGraphIdleTaskCancel = () => void;

export type AutomationGraphIdleTaskOptions = {
  delayMs?: number;
  timeoutMs?: number;
};

let activeTasks = 0;
let queuedTasks = 0;

export async function runAutomationGraphWorkerTask<T extends Record<string, unknown>>(task: AutomationGraphWorkerTask<T>, options: AutomationGraphWorkerQueueOptions = {}): Promise<AutomationGraphWorkerResult> {
  const queueId = options.queueId ?? "automation-graph-worker";
  queuedTasks += 1;
  emitWorkerQueueMetric(queueId);
  try {
    queuedTasks -= 1;
    activeTasks += 1;
    emitWorkerQueueMetric(queueId);
    if (options.useWorker !== false && canUseBrowserWorker()) return await runInBrowserWorker(task);
    return await new Promise((resolve) => queueMicrotask(() => resolve(runAutomationGraphWorkerTaskInline(task))));
  } finally {
    activeTasks = Math.max(0, activeTasks - 1);
    emitWorkerQueueMetric(queueId);
  }
}

export function scheduleAutomationGraphIdleTask(callback: () => void, options: AutomationGraphIdleTaskOptions = {}): AutomationGraphIdleTaskCancel {
  if (typeof window === "undefined") {
    const timer = setTimeout(callback, options.delayMs ?? 0);
    return () => clearTimeout(timer);
  }
  const delayMs = Math.max(0, options.delayMs ?? 0);
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let idleId: number | null = null;
  const requestIdle = (window as Window & { requestIdleCallback?: (handler: IdleRequestCallback, options?: IdleRequestOptions) => number }).requestIdleCallback;
  const cancelIdle = (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback;
  const run = () => {
    if (cancelled) return;
    callback();
  };
  const scheduleIdle = () => {
    if (cancelled) return;
    if (requestIdle) idleId = requestIdle(() => run(), { timeout: Math.max(50, options.timeoutMs ?? 750) });
    else timeoutId = setTimeout(run, 0);
  };
  timeoutId = setTimeout(scheduleIdle, delayMs);
  return () => {
    cancelled = true;
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (idleId !== null && cancelIdle) cancelIdle(idleId);
  };
}

export function runAutomationGraphWorkerTaskInline<T extends Record<string, unknown>>(task: AutomationGraphWorkerTask<T>): AutomationGraphWorkerResult {
  if (task.kind === "selection-bounds") {
    const selected = new Set(task.selectedNodeIds);
    const nodes = task.nodes.filter((node) => selected.has(node.id));
    if (!nodes.length) return { kind: task.kind, bounds: null };
    const left = Math.min(...nodes.map((node) => node.position.x));
    const top = Math.min(...nodes.map((node) => node.position.y));
    const right = Math.max(...nodes.map((node) => node.position.x + measuredNodeWidth(node)));
    const bottom = Math.max(...nodes.map((node) => node.position.y + measuredNodeHeight(node)));
    return { kind: task.kind, bounds: { x: left, y: top, width: right - left, height: bottom - top } };
  }
  if (task.kind === "serialize-graph") {
    const json = JSON.stringify(task.graph);
    return { kind: task.kind, json, bytes: new TextEncoder().encode(json).byteLength };
  }
  if (task.kind === "revision-signature") {
    return { kind: task.kind, signature: [task.flowId, task.revision, task.pendingOperationCount, task.pendingOperationBytes].join(":") };
  }
  const nodeIds = new Set(task.graph.nodes.map((node) => node.id));
  const problems = task.graph.edges
    .filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))
    .map((edge) => ({ id: "dangling:" + edge.id, message: "Connection references an unloaded or missing node." }));
  return { kind: task.kind, problems };
}

function runInBrowserWorker<T extends Record<string, unknown>>(task: AutomationGraphWorkerTask<T>): Promise<AutomationGraphWorkerResult> {
  const source = `
    self.onmessage = function(event) {
      const task = event.data;
      const width = function(node) { return node && node.measured && typeof node.measured.width === 'number' ? node.measured.width : 280; };
      const height = function(node) { return node && node.measured && typeof node.measured.height === 'number' ? node.measured.height : 196; };
      if (task.kind === 'selection-bounds') {
        const selected = new Set(task.selectedNodeIds || []);
        const nodes = (task.nodes || []).filter(function(node) { return selected.has(node.id); });
        if (!nodes.length) { self.postMessage({ kind: task.kind, bounds: null }); return; }
        const left = Math.min.apply(null, nodes.map(function(node) { return node.position.x; }));
        const top = Math.min.apply(null, nodes.map(function(node) { return node.position.y; }));
        const right = Math.max.apply(null, nodes.map(function(node) { return node.position.x + width(node); }));
        const bottom = Math.max.apply(null, nodes.map(function(node) { return node.position.y + height(node); }));
        self.postMessage({ kind: task.kind, bounds: { x: left, y: top, width: right - left, height: bottom - top } });
        return;
      }
      if (task.kind === 'serialize-graph') {
        const json = JSON.stringify(task.graph);
        self.postMessage({ kind: task.kind, json, bytes: new TextEncoder().encode(json).byteLength });
        return;
      }
      if (task.kind === 'revision-signature') {
        self.postMessage({ kind: task.kind, signature: [task.flowId, task.revision, task.pendingOperationCount, task.pendingOperationBytes].join(':') });
        return;
      }
      const nodeIds = new Set((task.graph.nodes || []).map(function(node) { return node.id; }));
      const problems = (task.graph.edges || []).filter(function(edge) { return !nodeIds.has(edge.source) || !nodeIds.has(edge.target); }).map(function(edge) { return { id: 'dangling:' + edge.id, message: 'Connection references an unloaded or missing node.' }; });
      self.postMessage({ kind: task.kind, problems });
    };
  `;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(url);
    worker.onmessage = (event) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(event.data as AutomationGraphWorkerResult);
    };
    worker.onerror = (event) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      reject(new Error(event.message || "Automation graph worker failed."));
    };
    worker.postMessage(task);
  });
}

function canUseBrowserWorker(): boolean {
  return typeof Worker !== "undefined" && typeof URL !== "undefined" && typeof Blob !== "undefined";
}

function measuredNodeWidth(node: Node): number {
  return typeof node.measured?.width === "number" ? node.measured.width : 280;
}

function measuredNodeHeight(node: Node): number {
  return typeof node.measured?.height === "number" ? node.measured.height : 196;
}

function emitWorkerQueueMetric(id: string): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  window.dispatchEvent(new CustomEvent("automation-studio:worker-queue-metric", { detail: { id, queued: queuedTasks, active: activeTasks } }));
}
