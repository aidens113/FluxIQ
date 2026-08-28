"use client";

import { registerAutomationStudioDevelopmentSubscription } from "../development/telemetry";
import type { AutomationStudioCacheScope } from "../controllers/useAutomationStudioCache";

export type AutomationStudioProjectChangeOperation = "create" | "update" | "delete" | "touch";

export type AutomationStudioProjectChangeEvent = {
  projectId?: string;
  sequence: number;
  transactionId: string;
  entityKind: string;
  entityId: string;
  parentId?: string | null;
  operation: AutomationStudioProjectChangeOperation;
  revision: number;
  changedAt: number;
  hierarchyScope?: { kind: string; id?: string } | null;
};

export type AutomationStudioProjectChangePage = {
  events: AutomationStudioProjectChangeEvent[];
  cursor: number;
  hasMore: boolean;
  fallback?: boolean;
};

export type AutomationStudioScopedInvalidation = {
  store: AutomationStudioClientStoreKind;
  cacheScopes: AutomationStudioCacheScope[];
  cacheResourceIds: string[];
  projectId: string;
  entityKind: string;
  entityId: string;
  queryKeys: string[];
  event: AutomationStudioProjectChangeEvent;
  reconciliation: AutomationStudioFeedReconciliationPlan;
};

export type AutomationStudioFeedReconciliationPlan = {
  localAction: "delete" | "cache-only" | "recovery";
  diagnostic?: string;
};

export type AutomationStudioFeedReconciliationDiagnostic = {
  projectId: string;
  entityKind: string;
  entityId: string;
  operation: AutomationStudioProjectChangeOperation;
  sequence: number;
  reason: string;
};

export type AutomationStudioClientStoreKind = "flow" | "hierarchy" | "recording" | "runtime" | "state" | "adaptation";

export type AutomationStudioFetchChangePage = (input: { projectId: string; afterSequence: number; limit: number; signal: AbortSignal }) => Promise<AutomationStudioProjectChangePage>;

export type AutomationStudioProjectSyncClientOptions = {
  projectId: string;
  fetchPage: AutomationStudioFetchChangePage;
  onPage?: (page: AutomationStudioProjectChangePage) => void;
  onInvalidations?: (invalidations: AutomationStudioScopedInvalidation[]) => void;
  onStatus?: (status: AutomationStudioProjectSyncStatus) => void;
  initialCursor?: number;
  pageSize?: number;
  reconnectDelayMs?: number;
  registerSubscription?: typeof registerAutomationStudioDevelopmentSubscription;
  documentRef?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  windowRef?: Pick<Window, "setTimeout" | "clearTimeout">;
};

export type AutomationStudioProjectSyncStatus = {
  state: "idle" | "connecting" | "connected" | "paused" | "backpressure" | "error" | "stopped";
  cursor: number;
  inFlight: boolean;
  queued: boolean;
  error?: string;
};

export class AutomationStudioScopedStore<TValue = unknown> {
  private readonly entries = new Map<string, TValue>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  constructor(readonly kind: AutomationStudioClientStoreKind) {}

  get version(): number { return this.revision; }
  get size(): number { return this.entries.size; }

  get(key: string): TValue | undefined { return this.entries.get(key); }

  set(key: string, value: TValue): void {
    this.entries.set(key, value);
    this.bump();
  }

  delete(key: string): void {
    if (this.entries.delete(key)) this.bump();
  }

  invalidate(_keys: string[] = []): void { this.bump(); }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    if (!this.entries.size) return;
    this.entries.clear();
    this.bump();
  }

  private bump(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}

export type AutomationStudioClientStores = Record<AutomationStudioClientStoreKind, AutomationStudioScopedStore>;

export function createAutomationStudioClientStores(): AutomationStudioClientStores {
  return {
    flow: new AutomationStudioScopedStore("flow"),
    hierarchy: new AutomationStudioScopedStore("hierarchy"),
    recording: new AutomationStudioScopedStore("recording"),
    runtime: new AutomationStudioScopedStore("runtime"),
    state: new AutomationStudioScopedStore("state"),
    adaptation: new AutomationStudioScopedStore("adaptation")
  };
}

export function applyAutomationStudioInvalidations(stores: AutomationStudioClientStores, invalidations: AutomationStudioScopedInvalidation[]): void {
  const byStore = new Map<AutomationStudioClientStoreKind, string[]>();
  for (const invalidation of invalidations) {
    const keys = byStore.get(invalidation.store) ?? [];
    keys.push(...invalidation.queryKeys);
    byStore.set(invalidation.store, keys);
  }
  for (const [kind, keys] of byStore) stores[kind].invalidate([...new Set(keys)]);
}

export function automationStudioInvalidationsFromChangePage(projectId: string, page: AutomationStudioProjectChangePage): AutomationStudioScopedInvalidation[] {
  return page.events.map((event) => {
    const store = storeKindForEntity(event.entityKind);
    const normalizedEvent = { ...event, projectId: event.projectId ?? projectId };
    return {
      store,
      cacheScopes: cacheScopesForStore(store, event.entityKind),
      cacheResourceIds: cacheResourceIdsForEvent(normalizedEvent),
      projectId: normalizedEvent.projectId ?? projectId,
      entityKind: event.entityKind,
      entityId: event.entityId,
      queryKeys: queryKeysForEvent(projectId, store, normalizedEvent),
      event: normalizedEvent,
      reconciliation: reconciliationPlanForEvent(normalizedEvent)
    };
  });
}

export function emitAutomationStudioFeedReconciliationDiagnostic(diagnostic: AutomationStudioFeedReconciliationDiagnostic): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("automation-studio:change-feed-reconciliation", { detail: diagnostic }));
}

export class AutomationStudioProjectSyncClient {
  private cursor: number;
  private stopped = true;
  private paused = false;
  private inFlight = false;
  private queued = false;
  private retryTimer: ReturnType<Window["setTimeout"]> | null = null;
  private controller: AbortController | null = null;
  private unregisterSubscription: (() => void) | null = null;
  private readonly options: Required<Pick<AutomationStudioProjectSyncClientOptions, "pageSize" | "reconnectDelayMs">> & AutomationStudioProjectSyncClientOptions;

  constructor(options: AutomationStudioProjectSyncClientOptions) {
    this.options = { pageSize: 100, reconnectDelayMs: 1_000, ...options };
    this.cursor = Math.max(0, Math.trunc(options.initialCursor ?? 0));
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  get status(): AutomationStudioProjectSyncStatus {
    return {
      state: this.stopped ? "stopped" : this.paused ? "paused" : this.inFlight && this.queued ? "backpressure" : this.inFlight ? "connecting" : "connected",
      cursor: this.cursor,
      inFlight: this.inFlight,
      queued: this.queued
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.paused = this.visibilityState() === "hidden";
    this.unregisterSubscription = (this.options.registerSubscription ?? registerAutomationStudioDevelopmentSubscription)({ id: `project-change-feed:${this.options.projectId}`, kind: "push" });
    this.options.documentRef?.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.emit();
    if (!this.paused) void this.fetchNext();
  }

  stop(): void {
    this.stopped = true;
    this.paused = false;
    this.queued = false;
    this.controller?.abort();
    this.controller = null;
    this.clearRetry();
    this.options.documentRef?.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.unregisterSubscription?.();
    this.unregisterSubscription = null;
    this.emit({ state: "stopped" });
  }

  notifyMutation(): void {
    if (this.stopped || this.paused) {
      this.queued = true;
      this.emit();
      return;
    }
    if (this.inFlight) {
      this.queued = true;
      this.emit({ state: "backpressure" });
      return;
    }
    void this.fetchNext();
  }

  private async fetchNext(): Promise<void> {
    if (this.stopped || this.paused || this.inFlight) return;
    this.inFlight = true;
    this.queued = false;
    this.controller = new AbortController();
    this.emit({ state: "connecting" });
    try {
      const page = await this.options.fetchPage({ projectId: this.options.projectId, afterSequence: this.cursor, limit: this.options.pageSize, signal: this.controller.signal });
      if (this.stopped || this.controller.signal.aborted) return;
      this.cursor = Math.max(this.cursor, Math.trunc(page.cursor));
      this.options.onPage?.(page);
      const invalidations = automationStudioInvalidationsFromChangePage(this.options.projectId, page);
      if (invalidations.length) this.options.onInvalidations?.(invalidations);
      this.emit({ state: "connected" });
      if (page.hasMore || this.queued) void this.fetchNextSoon(0);
    } catch (error) {
      if (this.stopped || this.controller.signal.aborted) return;
      this.emit({ state: "error", error: error instanceof Error ? error.message : "Project sync failed." });
      this.fetchNextSoon(this.options.reconnectDelayMs);
    } finally {
      this.inFlight = false;
      this.controller = null;
      this.emit();
    }
  }

  private fetchNextSoon(delayMs: number): void {
    if (this.stopped || this.paused) return;
    this.clearRetry();
    const windowRef = this.options.windowRef ?? window;
    this.retryTimer = windowRef.setTimeout(() => void this.fetchNext(), Math.max(0, delayMs));
  }

  private clearRetry(): void {
    if (!this.retryTimer) return;
    const windowRef = this.options.windowRef ?? window;
    windowRef.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private handleVisibilityChange(): void {
    const hidden = this.visibilityState() === "hidden";
    if (hidden) {
      this.paused = true;
      this.controller?.abort();
      this.clearRetry();
      this.emit({ state: "paused" });
      return;
    }
    this.paused = false;
    this.emit({ state: "connected" });
    if (this.queued || !this.inFlight) void this.fetchNext();
  }

  private visibilityState(): DocumentVisibilityState {
    return this.options.documentRef?.visibilityState ?? (typeof document === "undefined" ? "visible" : document.visibilityState);
  }

  private emit(override: Partial<AutomationStudioProjectSyncStatus> = {}): void {
    this.options.onStatus?.({ ...this.status, ...override });
  }
}

export function storeKindForEntity(entityKind: string): AutomationStudioClientStoreKind {
  const kind = entityKind.toLowerCase();
  if (kind.includes("hierarchy") || kind.includes("category")) return "hierarchy";
  if (kind.includes("recording") || kind.includes("timeline")) return "recording";
  if (kind.includes("runtime") || kind.includes("run") || kind.includes("action")) return "runtime";
  if (kind.includes("state") || kind.includes("snapshot")) return "state";
  if (kind.includes("adaptation") || kind.includes("proposal")) return "adaptation";
  return "flow";
}

function cacheScopesForStore(store: AutomationStudioClientStoreKind, entityKind: string): AutomationStudioCacheScope[] {
  if (store === "hierarchy") return ["summary"];
  if (store === "recording") return ["recording", "timeline", "summary"];
  if (store === "runtime") return ["summary"];
  if (store === "state") return ["recording", "timeline"];
  if (store === "adaptation") return ["proposal", "summary"];
  return entityKind.includes("subflow") ? ["flow", "subflow", "summary", "flow-metadata"] : ["flow", "summary", "flow-metadata"];
}

function queryKeysForEvent(projectId: string, store: AutomationStudioClientStoreKind, event: AutomationStudioProjectChangeEvent): string[] {
  return [projectId, `${store}:${projectId}`, `${event.entityKind}:${event.entityId}`, `${event.entityKind}:list`];
}

function cacheResourceIdsForEvent(event: AutomationStudioProjectChangeEvent): string[] {
  const ids = [
    event.entityId,
    event.parentId ?? undefined,
    event.parentId && event.entityId ? `${event.parentId}:${event.entityId}` : undefined,
    event.hierarchyScope?.id
  ].filter((value): value is string => Boolean(value));
  return [...new Set(ids)];
}

function reconciliationPlanForEvent(event: AutomationStudioProjectChangeEvent): AutomationStudioFeedReconciliationPlan {
  if (event.operation === "delete") {
    if (deleteEventHasLocalReconciliation(event.entityKind)) return { localAction: "delete" };
    return {
      localAction: "recovery",
      diagnostic: `${event.entityKind}:delete requires an explicit recovery refresh because this feed entity has no local reconciliation handler.`
    };
  }
  if (event.operation === "touch") return { localAction: "cache-only" };
  if (event.operation === "update") return { localAction: "cache-only" };
  return {
    localAction: "recovery",
    diagnostic: `${event.entityKind}:${event.operation} requires an explicit recovery refresh because the change-feed event does not include entity payload data.`
  };
}

function deleteEventHasLocalReconciliation(entityKind: string): boolean {
  const kind = entityKind.toLowerCase();
  return kind.includes("flow")
    || kind.includes("subflow")
    || kind.includes("folder")
    || kind.includes("category")
    || kind.includes("hierarchy")
    || kind.includes("recording")
    || kind.includes("timeline")
    || kind.includes("instruction")
    || kind.includes("adaptation")
    || kind.includes("proposal")
    || kind.includes("runtime")
    || kind.includes("run");
}
