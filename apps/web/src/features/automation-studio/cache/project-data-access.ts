import {
  AutomationStudioDataCache,
  type AutomationStudioCacheScope,
  type AutomationStudioCacheStats
} from "./data-cache";

export type ProjectDataRequest<Value> = {
  projectId: string;
  scope: AutomationStudioCacheScope;
  resourceId?: string;
  maxAgeMs?: number;
  load(signal: AbortSignal): Promise<Value>;
};

export class AutomationStudioProjectDataAccess {
  private activeProjectId: string | null = null;
  private generation = 0;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly controllers = new Set<AbortController>();
  private readonly mutationRevisions = new Map<string, number>();

  constructor(private readonly cache = new AutomationStudioDataCache()) {}

  get projectId(): string | null {
    return this.activeProjectId;
  }

  open(projectId: string): void {
    const normalized = projectId.trim();
    if (!normalized) throw new Error("Project data access requires a project ID.");
    if (this.activeProjectId === normalized) return;
    this.cancelActiveRequests();
    this.activeProjectId = normalized;
    this.generation += 1;
  }

  close(expectedProjectId?: string | null): void {
    if (expectedProjectId !== undefined && this.activeProjectId !== expectedProjectId) return;
    const previous = this.activeProjectId;
    this.cancelActiveRequests();
    this.activeProjectId = null;
    this.generation += 1;
    if (previous) this.cache.invalidateProject(previous);
  }

  async readThrough<Value>(request: ProjectDataRequest<Value>): Promise<Value | undefined> {
    const resourceId = request.resourceId ?? "root";
    if (!this.isCurrent(request.projectId)) return undefined;
    const cached = this.cache.get<Value>(request.scope, request.projectId, resourceId, request.maxAgeMs);
    if (cached !== undefined) return cached;

    const key = this.key(request.projectId, request.scope, resourceId);
    const existing = this.inFlight.get(key) as Promise<Value | undefined> | undefined;
    if (existing) return existing;

    const generation = this.generation;
    const mutationRevision = this.mutationRevisions.get(key) ?? 0;
    const controller = new AbortController();
    this.controllers.add(controller);
    const pending = request.load(controller.signal).then((value) => {
      if (controller.signal.aborted || generation !== this.generation || !this.isCurrent(request.projectId)) return undefined;
      if ((this.mutationRevisions.get(key) ?? 0) !== mutationRevision) return undefined;
      return this.cache.set(request.scope, request.projectId, resourceId, value);
    }).catch((error) => {
      if (controller.signal.aborted || isAbortError(error)) return undefined;
      throw error;
    }).finally(() => {
      this.controllers.delete(controller);
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending;
  }

  remember<Value>(projectId: string, scope: AutomationStudioCacheScope, resourceId: string, value: Value): Value | undefined {
    if (!this.isCurrent(projectId)) return undefined;
    return this.cache.set(scope, projectId, resourceId, value);
  }

  invalidate(projectId: string, scopes: readonly AutomationStudioCacheScope[], resourceIds: readonly string[] = []): void {
    const ids = [...new Set(resourceIds.filter(Boolean))];
    const effectiveIds = ids.length ? ids : ["root"];
    for (const scope of scopes) {
      for (const resourceId of effectiveIds) {
        const key = this.key(projectId, scope, resourceId);
        this.mutationRevisions.set(key, (this.mutationRevisions.get(key) ?? 0) + 1);
      }
    }
    this.cache.invalidateScopes(projectId, scopes, ids);
  }

  stats(): AutomationStudioCacheStats {
    return this.cache.stats();
  }

  dispose(): void {
    this.close();
    this.cache.clear();
    this.mutationRevisions.clear();
  }

  private isCurrent(projectId: string): boolean {
    return this.activeProjectId === projectId;
  }

  private cancelActiveRequests(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.inFlight.clear();
  }

  private key(projectId: string, scope: AutomationStudioCacheScope, resourceId: string): string {
    return `${projectId}:${scope}:${resourceId}`;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}