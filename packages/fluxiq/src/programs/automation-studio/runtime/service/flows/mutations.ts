import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import { createRecord, SQLiteRepository } from "../../../../database-manager/storage/sqlite-repository.ts";
import {
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowSubflow,
  createBlankAutomationStudioFlowArtifact,
  validateAutomationStudioFlowRouter,
  validateAutomationStudioFlowSubflow
} from "../../../model/index.ts";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import type { AutomationStudioFlowStore } from "./store.ts";
import type { AutomationStudioFlowWriter } from "./writer.ts";
import type { AutomationStudioRouterSummary, AutomationStudioSubflowSummary } from "../indexes/index.ts";
import { mapWithConcurrency, uniqueStrings, upsertBy } from "../collections.ts";
import { flowSummaryFromFlow, removeUndefinedSubflowFields, subflowParentCategoryId } from "./mapping.ts";

// The durable Subflow and Router mutations: saving one, creating one, undoing
// a creation, and the summary rows and change-feed entries each write leaves
// behind. Adaptation patch application drives these; so does the public API.
export type CreateFlowSubflowInput = {
  projectId: string;
  flowId: string;
  name: string;
  description?: string;
  role?: AutomationStudioFlowSubflow["role"];
  parentCategoryId?: string | null;
  routeTags?: string[];
};

export class AutomationStudioFlowMutations {
  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly indexes: AutomationStudioServiceIndexes,
    private readonly flows: AutomationStudioFlowStore,
    private readonly flowWriter: AutomationStudioFlowWriter
  ) {}

  async saveFlowRouter(router: AutomationStudioFlowRouter): Promise<AutomationStudioFlowRouter> {
    const ownerFlow = await this.flows.getFlow(router.projectId, router.flowId);
    if (this.flowWriter.persistedFlowRepresentation(ownerFlow) === "subflow_graph") {
      throw new Error("Router is only available for a top-level Flow.");
    }
    const subflowIndex = await this.indexes.readFlowSubflowIndex(router.projectId);
    const subflows = (await Promise.all(
      (subflowIndex.subflows ?? [])
        .filter((summary) => summary.flowId === router.flowId)
        .map((summary) => this.flows.getFlowSubflow(router.projectId, router.flowId, summary.subflowId))
    )).filter((subflow): subflow is AutomationStudioFlowSubflow => Boolean(subflow));
    const validation = validateAutomationStudioFlowRouter(router, subflows);
    if (!validation.ok) throw new Error(`Invalid Automation Studio router: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    await this.projects.ensureProjectStructure(router.projectId);
    await new ProgramJsonStore<JsonObject>(this.flowPaths.flowRouterFile(router.projectId, router.flowId), () => ({})).write(router as unknown as JsonObject);
    await this.flows.writeSqlFlowRouterProjection(router).catch((error) => {
      if (!String(error).includes("references missing subflows.subflow_id")) throw error;
    });
    await this.indexes.writeFlowRouterIndex(router.projectId, (index) => ({ schemaVersion: "0.1", routers: upsertBy(index.routers ?? [], "routerId", routerSummaryFromRouter(router)) }));
    return router;
  }

  async saveFlowSubflow(subflow: AutomationStudioFlowSubflow): Promise<AutomationStudioFlowSubflow> {
    const parentFlow = await this.flows.getFlow(subflow.projectId, subflow.flowId);
    if (this.flowWriter.persistedFlowRepresentation(parentFlow) === "subflow_graph") {
      throw new Error("Subflows can only be owned by a top-level Flow.");
    }
    if (!subflow.graphFlowId?.trim()) throw new Error("Subflow graph Flow is required.");
    const persistedSubflow = { ...subflow, graphFlowId: subflow.graphFlowId.trim() };
    const existingSubflow = await this.flows.getFlowSubflow(subflow.projectId, subflow.flowId, subflow.subflowId);
    if (existingSubflow?.graphFlowId && existingSubflow.graphFlowId !== persistedSubflow.graphFlowId) {
      throw new Error("A Subflow graph Flow cannot be reassigned; create or duplicate a Subflow instead.");
    }
    const validation = validateAutomationStudioFlowSubflow(persistedSubflow);
    if (!validation.ok) throw new Error(`Invalid Automation Studio subflow: ${validation.issues.map((issue) => `${issue.path} (${issue.code})`).join(", ")}`);
    const declaredGraph = await this.flows.getFlow(persistedSubflow.projectId, persistedSubflow.graphFlowId!).catch(() => null);
    if (declaredGraph) {
      if (this.flowWriter.persistedFlowRepresentation(declaredGraph) !== "subflow_graph"
        || declaredGraph.metadata?.subflowGraph !== true
        || declaredGraph.metadata?.parentFlowId !== persistedSubflow.flowId
        || declaredGraph.metadata?.parentSubflowId !== persistedSubflow.subflowId) {
        throw new Error("Subflow graph Flow does not prove matching parent and Subflow ownership.");
      }
    } else {
      throw new Error("Subflow graph Flow does not exist.");
    }
    await this.projects.ensureProjectStructure(persistedSubflow.projectId);
    await this.flows.writeSqlFlowSubflow(persistedSubflow.projectId, persistedSubflow);
    await new ProgramJsonStore<JsonObject>(this.flowPaths.flowSubflowFile(persistedSubflow.projectId, persistedSubflow.flowId, persistedSubflow.subflowId), () => ({})).write(persistedSubflow as unknown as JsonObject);
    await this.indexes.writeFlowSubflowIndex(persistedSubflow.projectId, (index) => ({ schemaVersion: "0.1", summaryVersion: 2, subflows: upsertBy(index.subflows ?? [], "subflowId", subflowSummaryFromSubflow(persistedSubflow)) }));
    await this.writeFlowSubflowSummary(persistedSubflow.projectId, subflowSummaryFromSubflow(persistedSubflow));
    const router = await this.flows.getFlowRouter(persistedSubflow.projectId, persistedSubflow.flowId);
    if (router) await this.flows.writeSqlFlowRouterProjection(router).catch((error) => {
      if (!String(error).includes("references missing subflows.subflow_id")) throw error;
    });
    return persistedSubflow;
  }

  async createFlowSubflow(input: CreateFlowSubflowInput): Promise<AutomationStudioFlowSubflow> {
    const parentFlow = await this.flows.getFlow(input.projectId, input.flowId);
    if (this.flowWriter.persistedFlowRepresentation(parentFlow) === "subflow_graph") {
      throw new Error("Subflows can only be owned by a top-level Flow.");
    }
    const now = Date.now();
    const subflowId = `subflow.${randomUUID()}`;
    const graphFlowId = `${input.flowId}.${subflowId}.graph`;
    let createdGraph = false;
      await this.flowWriter.saveFlowInternal({
        projectId: input.projectId,
        flow: createBlankAutomationStudioFlowArtifact({
          flowId: graphFlowId,
          projectId: input.projectId,
          name: `${input.name.trim()} Graph`,
          scope: parentFlow.scope,
          description: `Isolated graph for subflow ${input.name.trim()}.`,
          origin: "manual",
          now,
          metadata: { parentFlowId: input.flowId, parentSubflowId: subflowId, subflowGraph: true }
        })
      }, false, "subflow_graph");
      createdGraph = true;
    const subflow: AutomationStudioFlowSubflow = {
      schemaVersion: "0.1",
      subflowId,
      projectId: input.projectId,
      flowId: input.flowId,
      name: input.name.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      role: input.role ?? "utility",
      status: "active",
      ...(input.parentCategoryId ? { metadata: { parentCategoryId: input.parentCategoryId, subflowCategoryId: input.parentCategoryId } } : {}),
      ...(input.routeTags?.length ? { routeTags: uniqueStrings(input.routeTags.map((tag) => tag.trim()).filter(Boolean)) } : {}),
      graphFlowId,
      createdAt: now,
      updatedAt: now,
      stability: { runCount: 0, successCount: 0, failureCount: 0 }
    };
    let saved: AutomationStudioFlowSubflow;
    try {
      saved = await this.saveFlowSubflow(subflow);
    } catch (error) {
      await ProgramJsonStore.deletePath(this.flowPaths.flowSubflowFile(input.projectId, input.flowId, subflowId)).catch(() => undefined);
      await this.indexes.writeFlowSubflowIndex(input.projectId, (index) => ({ schemaVersion: "0.1", summaryVersion: 2, subflows: (index.subflows ?? []).filter((item) => item.subflowId !== subflowId) })).catch(() => undefined);
      if (this.paths.root) await this.flowSubflowSummaryRepository(input.projectId).delete(subflowId).catch(() => undefined);
      await this.flows.markSqlFlowSubflowDeleted(input.projectId, subflow, Date.now()).catch(() => undefined);
      if (createdGraph) await this.flowWriter.deleteFlowArtifact({ projectId: input.projectId, flowId: graphFlowId }, true).catch(() => undefined);
      throw error;
    }
    await this.appendFlowSubflowMutationChangeFeed(saved, "create");
    return saved;
  }

  async deleteCreatedFlowSubflow(projectId: string, flowId: string, subflowId: string, graphFlowId: string | undefined, deleteGraphFlow: boolean): Promise<void> {
    const existing = flowId && subflowId ? await this.flows.getFlowSubflow(projectId, flowId, subflowId).catch(() => null) : null;
    const deletedAt = Date.now();
    if (existing) await this.flows.markSqlFlowSubflowDeleted(projectId, existing, deletedAt);
    if (deleteGraphFlow && graphFlowId) await this.flowWriter.deleteFlowArtifact({ projectId, flowId: graphFlowId }, true).catch(() => ({ deletedFlowId: graphFlowId }));
    if (flowId && subflowId) {
      const subflowFile = this.flowPaths.flowSubflowFile(projectId, flowId, subflowId);
      await ProgramJsonStore.deletePath(subflowFile);
      await rm(subflowFile, { force: true });
      await this.indexes.writeFlowSubflowIndex(projectId, (index) => ({ schemaVersion: "0.1", summaryVersion: 2, subflows: (index.subflows ?? []).filter((item) => item.subflowId !== subflowId) }));
      if (this.paths.root) await this.flowSubflowSummaryRepository(projectId).delete(subflowId);
    }
    if (existing) await this.flowWriter.appendProjectMutationChangeFeed({
      projectId,
      entityKind: "subflow",
      entityId: subflowId,
      parentId: flowId,
      operation: "delete",
      revision: subflowFeedRevision(existing),
      changedAt: deletedAt,
      hierarchyScope: { kind: "flow", id: flowId }
    });
  }

  async writeFlowSubflowSummary(projectId: string, summary: AutomationStudioSubflowSummary): Promise<void> {
    if (!this.paths.root) return;
    await this.flowSubflowSummaryRepository(projectId).put(createRecord({ id: summary.subflowId, kind: "flow.subflows", data: summary as unknown as JsonObject, nowMs: summary.updatedAt }));
  }

  async appendFlowSubflowMutationChangeFeed(subflow: AutomationStudioFlowSubflow, operation: "create" | "update" | "delete"): Promise<void> {
    await this.flowWriter.appendProjectMutationChangeFeed({
      projectId: subflow.projectId,
      entityKind: "subflow",
      entityId: subflow.subflowId,
      parentId: subflow.flowId,
      operation,
      revision: subflowFeedRevision(subflow),
      changedAt: subflow.updatedAt,
      hierarchyScope: { kind: "flow", id: subflow.flowId }
    });
  }

  flowSubflowSummaryRepository(projectId: string): SQLiteRepository<JsonObject> {
    return new SQLiteRepository<JsonObject>({ rootDir: this.paths.projectFile(projectId, "runtime", "sqlite"), kind: "flow.subflows", layoutVersion: 1 });
  }

  async getFlowSubflowsForValidation(projectId: string, flowId: string): Promise<AutomationStudioFlowSubflow[]> {
    const index = await this.indexes.readFlowSubflowIndex(projectId);
    return (await Promise.all(
      (index.subflows ?? [])
        .filter((summary) => summary.flowId === flowId)
        .map((summary) => this.flows.getFlowSubflow(projectId, flowId, summary.subflowId))
    )).filter((subflow): subflow is AutomationStudioFlowSubflow => Boolean(subflow));
  }
}

export function subflowFeedRevision(subflow: Pick<AutomationStudioFlowSubflow, "updatedAt" | "createdAt">): number {
  return Math.max(1, Math.trunc(Math.max(subflow.updatedAt, subflow.createdAt ?? 1)));
}

export function subflowSummaryFromSubflow(subflow: AutomationStudioFlowSubflow): AutomationStudioSubflowSummary {
  const parentCategoryId = subflowParentCategoryId(subflow);
  return {
    subflowId: subflow.subflowId,
    summaryVersion: 2,
    ...(subflow.graphFlowId ? { graphFlowId: subflow.graphFlowId } : {}),
    flowId: subflow.flowId,
    projectId: subflow.projectId,
    name: subflow.name,
    role: subflow.role,
    status: subflow.status,
    ...(parentCategoryId ? { parentCategoryId } : {}),
    updatedAt: subflow.updatedAt
  };
}
function routerSummaryFromRouter(router: AutomationStudioFlowRouter): AutomationStudioRouterSummary {
  return {
    routerId: router.routerId,
    flowId: router.flowId,
    projectId: router.projectId,
    name: router.name,
    status: router.status,
    ruleCount: router.rules.length,
    updatedAt: router.updatedAt
  };
}
