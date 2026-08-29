import type { AutomationStudioProjectDataAccess } from "../cache/project-data-access";
import type { AutomationHierarchyNode } from "../hierarchy/model";
import type { AutomationProjectApi } from "../project/project-api";
import type { AutomationStudioStores } from "../stores/studio-stores";
import type { AutomationStudioScopedInvalidation } from "./project-sync";

export type AutomationProjectRevalidationHierarchy = {
  replace(nodes: AutomationHierarchyNode[], deletedIds: string[]): void;
};

type RevalidationTarget =
  | { kind: "flow"; id: string }
  | { kind: "recording"; id: string }
  | { kind: "timeline"; id: string }
  | { kind: "runtime"; id: string }
  | { kind: "adaptation"; id: string; flowId?: string }
  | { kind: "hierarchy"; id: string };

export class AutomationProjectRevalidator {
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly options: {
    api: AutomationProjectApi;
    data: AutomationStudioProjectDataAccess;
    stores: AutomationStudioStores;
    hierarchy: AutomationProjectRevalidationHierarchy;
  }) {}

  async revalidate(projectId: string, invalidations: readonly AutomationStudioScopedInvalidation[]): Promise<void> {
    const targets = new Map<string, RevalidationTarget>();
    for (const invalidation of invalidations) {
      if (invalidation.event.operation === "delete") continue;
      const target = revalidationTarget(invalidation);
      if (target) targets.set(targetKey(projectId, target), target);
    }
    for (const [key, target] of targets) await this.run(key, projectId, target);
  }

  private run(key: string, projectId: string, target: RevalidationTarget): Promise<void> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const pending = this.loadAndCommit(projectId, target)
      .catch(() => undefined)
      .finally(() => {
        if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
      });
    this.inFlight.set(key, pending);
    return pending;
  }

  private async loadAndCommit(projectId: string, target: RevalidationTarget): Promise<void> {
    if (target.kind === "flow") {
      const flow = await this.options.data.readThrough({
        projectId, scope: "flow", resourceId: target.id, maxAgeMs: 60_000,
        load: async (signal) => payload(this.options.api.post<{ flow?: any }>("get-flow", { projectId, flowId: target.id }, { signal }), "flow")
      });
      if (flow && this.isCurrent(projectId)) this.options.stores.projectData.upsert("flows", target.id, { source: "canonical", readOnly: false, flow });
      return;
    }
    if (target.kind === "recording") {
      const recording = await this.options.data.readThrough({
        projectId, scope: "recording", resourceId: target.id, maxAgeMs: 60_000,
        load: async (signal) => payload(this.options.api.post<{ recording?: any }>("get-recording", { projectId, recordingId: target.id }, { signal }), "recording")
      });
      if (recording && this.isCurrent(projectId)) this.options.stores.projectData.upsert("recordings", target.id, recording);
      return;
    }
    if (target.kind === "timeline") {
      const timeline = await this.options.data.readThrough({
        projectId, scope: "timeline", resourceId: target.id, maxAgeMs: 60_000,
        load: async (signal) => payload(this.options.api.post<{ normalizedTimeline?: any }>("get-normalized-timeline", { projectId, normalizedTimelineId: target.id }, { signal }), "normalizedTimeline")
      });
      if (timeline && this.isCurrent(projectId)) this.options.stores.projectData.upsert("timelines", target.id, timeline);
      return;
    }
    if (target.kind === "runtime") {
      const run = await this.options.data.readThrough({
        projectId, scope: "summary", resourceId: target.id, maxAgeMs: 30_000,
        load: async (signal) => payload(this.options.api.post<{ runDetail?: any }>("get-flow-run-detail", { projectId, runId: target.id }, { signal }), "runDetail")
      });
      if (run && this.isCurrent(projectId)) this.options.stores.projectData.upsert("runs", target.id, run);
      return;
    }
    if (target.kind === "adaptation") {
      const adaptation = await this.options.data.readThrough({
        projectId, scope: "proposal", resourceId: target.id, maxAgeMs: 30_000,
        load: async (signal) => payload(this.options.api.post<{ adaptation?: any }>("get-flow-adaptation", {
          projectId,
          adaptationId: target.id,
          ...(target.flowId ? { flowId: target.flowId } : {})
        }, { signal }), "adaptation")
      });
      if (adaptation && this.isCurrent(projectId)) this.options.stores.projectData.upsert("adaptations", target.id, adaptation);
      return;
    }
    const hierarchy = await this.options.data.readThrough({
      projectId, scope: "summary", resourceId: target.id, maxAgeMs: 10_000,
      load: async (signal) => payload(this.options.api.post<{ hierarchy?: { customHierarchyNodes?: AutomationHierarchyNode[]; deletedHierarchyIds?: string[] } }>(
        "get-project-hierarchy", { projectId }, { signal }
      ), "hierarchy")
    });
    if (hierarchy && this.isCurrent(projectId)) this.options.hierarchy.replace(hierarchy.customHierarchyNodes ?? [], hierarchy.deletedHierarchyIds ?? []);
  }

  private isCurrent(projectId: string): boolean {
    return this.options.data.projectId === projectId && this.options.stores.projectData.getState().activeProjectId === projectId;
  }
}

function revalidationTarget(invalidation: AutomationStudioScopedInvalidation): RevalidationTarget | null {
  const kind = invalidation.entityKind.toLowerCase();
  const parentId = invalidation.event.parentId ?? undefined;
  const flowScopeId = invalidation.event.hierarchyScope?.kind === "flow"
    ? invalidation.event.hierarchyScope.id
    : undefined;
  if (kind.includes("hierarchy") || kind.includes("folder") || kind.includes("category")) return { kind: "hierarchy", id: invalidation.entityId };
  if (kind.includes("timeline")) return { kind: "timeline", id: invalidation.entityId };
  if (kind.includes("recording")) return { kind: "recording", id: invalidation.entityId };
  if (kind.includes("runtime") || kind.includes("run") || kind.includes("action")) return { kind: "runtime", id: parentId ?? invalidation.entityId };
  if (kind.includes("adaptation") || kind.includes("proposal")) return { kind: "adaptation", id: invalidation.entityId, ...(parentId ? { flowId: parentId } : {}) };
  if (kind.includes("subflow") || kind.includes("instruction")) {
    const flowId = parentId ?? flowScopeId;
    return flowId ? { kind: "flow", id: flowId } : null;
  }
  if (kind === "flow" || kind.includes("flow_")) return { kind: "flow", id: invalidation.entityId };
  if (kind.includes("graph") || kind.includes("node") || kind.includes("edge")) {
    const flowId = parentId ?? flowScopeId;
    return flowId ? { kind: "flow", id: flowId } : null;
  }
  return null;
}

function targetKey(projectId: string, target: RevalidationTarget): string {
  return `${projectId}:${target.kind}:${target.id}`;
}

async function payload<Result extends Record<string, any>, Key extends keyof Result>(
  request: Promise<{ ok: boolean; payload?: Result; error?: string; aborted?: boolean }>,
  key: Key
): Promise<NonNullable<Result[Key]>> {
  const result = await request;
  if (result.aborted) throw abortError();
  if (!result.ok || !result.payload?.[key]) throw new Error(result.error ?? "Project entity could not be revalidated.");
  return result.payload[key] as NonNullable<Result[Key]>;
}

function abortError(): Error {
  const error = new Error("Project revalidation was cancelled.");
  error.name = "AbortError";
  return error;
}