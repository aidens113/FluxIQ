import type { AutomationStudioRuntimeRunSummary, AutomationStudioRuntimeRunSummaryPage } from "../../../storage/index.ts";
import type { AutomationStudioBootstrapAdaptationStore } from "../bootstrap-adaptations.ts";
import { compareFlowAdaptationSummaries, compareFlowRunSummaries } from "./ordering.ts";
import { bootstrapAdaptationSummary } from "./conversions.ts";
import { adaptationSummaryFromTypedStore } from "./sql-conversions.ts";
import type { AutomationStudioSqlInstructionSummary, AutomationStudioSqlSubflow } from "../../../storage/index.ts";
import { clampInteger } from "../numbers.ts";
import { sqlInstructionRequirement, sqlInstructionStatus } from "../flows/index.ts";
import { instructionSummaryFromSql, sqlInstructionScopeKind, subflowSummaryFromSql } from "./sql-conversions.ts";
import type { AutomationStudioInstructionSummaryPage, AutomationStudioSubflowSummaryPage } from "./types.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import { createRecord, SQLiteRepository } from "../../../../database-manager/storage/sqlite-repository.ts";
import type {
  AutomationStudioFlowInstruction,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowRunSummary,
  AutomationStudioFlowSubflow,
  AutomationStudioRuntimeSession
} from "../../../model/index.ts";
import {
  AutomationStudioProjectAdaptationStore,
  AutomationStudioProjectDatabasePool,
  AutomationStudioProjectRuntimeStreamStore
} from "../../../storage/index.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioServiceIndexes } from "../indexes/index.ts";
import type { AutomationStudioFlowMutations, AutomationStudioFlowStore } from "../flows/index.ts";
import { AutomationStudioSqlSummaryPaging } from "./sql-paging.ts";
import { SUBFLOW_SUMMARY_MIGRATION_IO_CONCURRENCY, adaptiveRuntimeMetricsFromRunDetail, flowRunSummaryWithInterventionSummaries, instructionSummaryFromInstruction, runtimeSessionToFlowRunDetail, runtimeSummaryFromSession } from "./conversions.ts";
import type { AutomationStudioAdaptationSummary, AutomationStudioInstructionSummary, AutomationStudioRouterSummary, AutomationStudioSubflowSummary } from "../indexes/index.ts";
import { mapWithConcurrency, uniqueStrings, upsertBy } from "../collections.ts";
import { emptyFlowAdaptationIndex, emptyFlowRunIndex, emptyFlowSubflowIndex, type FlowAdaptationIndex, type FlowInstructionIndex, type FlowRunIndex, type FlowSubflowIndex, type RuntimeIndex } from "../indexes/index.ts";
import { subflowSummaryFromSubflow } from "../flows/index.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";

// The summary indexes every list view reads, their SQL-backed repositories and
// paging, and the JSONL stream store that run details are appended to. The four
// public methods here are the readers those writers call; they keep their names
// on the facade.
export type AutomationStudioFlowRunSummaryPage = {
  runs: AutomationStudioFlowRunSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type AutomationStudioAdaptationSummaryPage = {
  adaptations: AutomationStudioAdaptationSummary[];
  total: number;
  limit: number;
  offset: number;
};

export class AutomationStudioSummaryStore {
  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly indexes: AutomationStudioServiceIndexes,
    private readonly flows: AutomationStudioFlowStore,
    private readonly flowMutations: AutomationStudioFlowMutations,
    private readonly bootstrapAdaptations: AutomationStudioBootstrapAdaptationStore,
    // Calls into the service's public surface go through this port, never
    // through the collaborator that owns the method, so an override or a stub
    // on the public method is still honoured. See service/facade-ports.ts.
    private readonly facade: AutomationStudioFacadePorts,
    private readonly runtimeProjectDatabasePool?: AutomationStudioProjectDatabasePool
  ) {}

  private readonly paging = new AutomationStudioSqlSummaryPaging();

  async listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]> {
    const index = await this.indexes.readRuntimeIndex(projectId);
    const sessions: AutomationStudioRuntimeSession[] = [];
    for (const item of index.sessions ?? []) {
      const session = await this.getRuntimeSession(projectId, item.runId);
      if (session) sessions.push(session);
    }
    return sessions.sort((left, right) => (right.startedAt ?? right.queuedAt) - (left.startedAt ?? left.queuedAt));
  }

  async getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> {
    await this.projects.findProject(projectId);
    const stored = await new ProgramJsonStore<JsonObject>(this.paths.projectFile(projectId, "runtime", "sessions", `${safeSegment(runId)}.json`), () => ({})).read();
    return stored.session as unknown as AutomationStudioRuntimeSession | undefined ?? null;
  }

  async saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail> {
    const detailWithMetrics: AutomationStudioFlowRunDetail = {
      ...detail,
      metadata: {
        ...(detail.metadata ?? {}),
        adaptiveMetrics: adaptiveRuntimeMetricsFromRunDetail(detail)
      }
    };
    const normalizedDetail = { ...detailWithMetrics, summary: flowRunSummaryWithInterventionSummaries(detailWithMetrics) };
    const { projectId, runId } = normalizedDetail.summary;
    await this.projects.ensureProjectStructure(projectId);
    if (await this.tryPersistRuntimeRunDetail(normalizedDetail)) return normalizedDetail;
    await new ProgramJsonStore<JsonObject>(this.flowPaths.flowRunDetailFile(projectId, runId), () => ({})).write(normalizedDetail as unknown as JsonObject);
    await Promise.all([
      this.writeJsonLines(this.flowPaths.flowRunActionsFile(projectId, runId), normalizedDetail.actionAttempts ?? []),
      this.writeJsonLines(this.flowPaths.flowRunRouteDecisionsFile(projectId, runId), normalizedDetail.routeDecisions),
      this.writeJsonLines(this.flowPaths.flowRunSubflowsFile(projectId, runId), normalizedDetail.subflows),
      this.writeJsonLines(this.flowPaths.flowRunInterventionsFile(projectId, runId), normalizedDetail.interventions)
    ]);
    await this.indexes.writeFlowRunIndex(projectId, (index) => ({ schemaVersion: "0.1", runs: upsertBy(index.runs ?? [], "runId", normalizedDetail.summary) }));
    if (this.paths.root) await this.writeFlowRunSummary(projectId, normalizedDetail.summary);
    return normalizedDetail;
  }

  async getFlowInstruction(projectId: string, instructionId: string): Promise<AutomationStudioFlowInstruction | null> {
    const index = await this.indexes.readFlowInstructionIndex(projectId);
    const summary = (index.instructions ?? []).find((item) => item.instructionId === instructionId);
    if (!summary) return null;
    const stored = await new ProgramJsonStore<JsonObject>(summary.flowId ? this.flowPaths.flowInstructionFile(projectId, summary.flowId, instructionId) : this.paths.projectInstructionFile(projectId, instructionId), () => ({})).read();
    return typeof stored.instructionId === "string" ? stored as unknown as AutomationStudioFlowInstruction : null;
  }

  async ensureFlowAdaptationSummaryIndex(projectId: string): Promise<void> {
    await this.projects.findProject(projectId);
    if (!this.paths.root) return;
    const index = await this.indexes.readFlowAdaptationIndex(projectId).catch(emptyFlowAdaptationIndex);
    if (!(index.adaptations ?? []).length) {
      await this.flowAdaptationSummaryRepository(projectId).listPage({}, { limit: 1, offset: 0 }).catch(() => undefined);
      return;
    }
    const repository = this.flowAdaptationSummaryRepository(projectId);
    const page = await repository.listPage({}, { limit: 1, offset: 0 });
    if (page.total >= (index.adaptations ?? []).length) return;
    for (const summary of index.adaptations ?? []) await this.writeFlowAdaptationSummary(projectId, summary);
  }

  async ensureFlowInstructionSummaryIndex(projectId: string): Promise<void> {
    await this.projects.findProject(projectId);
    if (!this.paths.root) return;
    let index: FlowInstructionIndex = await this.indexes.readFlowInstructionIndex(projectId).catch(() => ({ schemaVersion: "0.1", instructions: [] }));
    if (index.summaryVersion !== 2 || (index.instructions ?? []).some((summary) => summary.summaryVersion !== 2)) {
      const details = (await Promise.all((index.instructions ?? []).map((summary) => this.getFlowInstruction(projectId, summary.instructionId))))
        .filter((instruction): instruction is AutomationStudioFlowInstruction => Boolean(instruction));
      index = await this.indexes.writeFlowInstructionIndex(projectId, () => ({ schemaVersion: "0.1", summaryVersion: 2, instructions: details.map(instructionSummaryFromInstruction) }));
    }
    const repository = this.flowInstructionSummaryRepository(projectId);
    const page = await repository.listPage({}, { limit: 1, offset: 0 });
    const legacyRow = await repository.transaction({}, (transaction) => transaction.get<{ total: number }>(
      "select count(*) as total from " + repository.tableName + " where json_extract(data, '$.summaryVersion') is null"
    ));
    if (page.total >= (index.instructions ?? []).length && (legacyRow?.total ?? 0) === 0) return;
    for (const summary of index.instructions ?? []) await this.writeFlowInstructionSummary(projectId, summary);
  }

  async ensureFlowRunSummaryIndex(projectId: string): Promise<void> {
    await this.projects.findProject(projectId);
    if (!this.paths.root) return;
    const index = await this.indexes.readFlowRunIndex(projectId).catch(emptyFlowRunIndex);
    if (!(index.runs ?? []).length) {
      const sessions = await this.listRuntimeSessions(projectId).catch(() => []);
      for (const session of sessions) await this.saveFlowRunDetail(runtimeSessionToFlowRunDetail(session, projectId));
      await this.flowRunSummaryRepository(projectId).listPage({}, { limit: 1, offset: 0 }).catch(() => undefined);
      return;
    }
    const repository = this.flowRunSummaryRepository(projectId);
    const page = await repository.listPage({}, { limit: 1, offset: 0 });
    if (page.total >= (index.runs ?? []).length) return;
    for (const summary of index.runs ?? []) await this.writeFlowRunSummary(projectId, summary);
  }

  async ensureFlowSubflowSummaryIndex(projectId: string): Promise<void> {
    await this.projects.findProject(projectId);
    if (!this.paths.root) return;
    let index: FlowSubflowIndex = await this.indexes.readFlowSubflowIndex(projectId).catch(() => ({ schemaVersion: "0.1", subflows: [] }));
    const repository = this.flowMutations.flowSubflowSummaryRepository(projectId);
    const page = await repository.listPage({}, { limit: 1, offset: 0 });
    const legacyRow = await repository.transaction({}, (transaction) => transaction.get<{ total: number }>(
      "select count(*) as total from " + repository.tableName + " where json_extract(data, '$.summaryVersion') is null"
    ));
    if (page.total >= (index.subflows ?? []).length && (legacyRow?.total ?? 0) === 0) return;
    if (index.summaryVersion !== 2 || (index.subflows ?? []).some((summary) => summary.summaryVersion !== 2)) {
      const summaries = await mapWithConcurrency(index.subflows ?? [], SUBFLOW_SUMMARY_MIGRATION_IO_CONCURRENCY, async (summary) => {
        const detail = await this.facade.getFlowSubflow(projectId, summary.flowId, summary.subflowId);
        return detail ? subflowSummaryFromSubflow(detail) : summary;
      });
      const fullyMigrated = summaries.every((summary) => summary.summaryVersion === 2);
      index = await this.indexes.writeFlowSubflowIndex(projectId, () => ({
        schemaVersion: "0.1",
        ...(fullyMigrated ? { summaryVersion: 2 as const } : {}),
        subflows: summaries
      }));
    }
    for (const summary of index.subflows ?? []) await this.flowMutations.writeFlowSubflowSummary(projectId, summary);
  }

  async ensureRuntimeSummaryIndex(projectId: string): Promise<void> {
    await this.projects.findProject(projectId);
    if (!this.paths.root) return;
    const index = await this.indexes.readRuntimeIndex(projectId).catch(() => ({ sessions: [] }));
    if (!(index.sessions ?? []).length) {
      await this.runtimeSummaryRepository(projectId).listPage({}, { limit: 1, offset: 0 }).catch(() => undefined);
      return;
    }
    const repository = this.runtimeSummaryRepository(projectId);
    const page = await repository.listPage({}, { limit: 1, offset: 0 });
    if (page.total >= (index.sessions ?? []).length) return;
    for (const item of index.sessions ?? []) {
      const session = await this.getRuntimeSession(projectId, item.runId);
      if (session) await this.writeRuntimeSummary(projectId, session);
    }
  }

  flowAdaptationSummaryRepository(projectId: string): SQLiteRepository<JsonObject> {
    return new SQLiteRepository<JsonObject>({ rootDir: this.paths.projectFile(projectId, "runtime", "sqlite"), kind: "flow.adaptations", layoutVersion: 1 });
  }

  flowInstructionSummaryRepository(projectId: string): SQLiteRepository<JsonObject> {
    return new SQLiteRepository<JsonObject>({ rootDir: this.paths.projectFile(projectId, "runtime", "sqlite"), kind: "flow.instructions", layoutVersion: 1 });
  }

  flowRunSummaryRepository(projectId: string): SQLiteRepository<JsonObject> {
    return new SQLiteRepository<JsonObject>({ rootDir: this.paths.projectFile(projectId, "runtime", "sqlite"), kind: "flow.runs", layoutVersion: 1 });
  }

  async listSqlFlowAdaptationSummaryPage(
    repository: SQLiteRepository<JsonObject>,
    input: { flowId?: string; subflowId?: string; status?: string; risk?: string; search?: string; sort: "updated" | "status" | "risk" | "trigger"; direction: "asc" | "desc"; limit: number; offset: number }
  ): Promise<AutomationStudioAdaptationSummaryPage> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.flowId) {
      clauses.push("json_extract(data, '$.flowId') = ?");
      params.push(input.flowId);
    }
    if (input.subflowId) {
      clauses.push("json_extract(data, '$.subflowId') = ?");
      params.push(input.subflowId);
    }
    if (input.status) {
      clauses.push("json_extract(data, '$.status') = ?");
      params.push(input.status);
    }
    if (input.risk) {
      clauses.push("json_extract(data, '$.riskLevel') = ?");
      params.push(input.risk);
    }
    if (input.search) {
      clauses.push("(lower(id) like ? or lower(coalesce(json_extract(data, '$.trigger'), '')) like ?)");
      params.push('%' + input.search + '%', '%' + input.search + '%');
    }
    const sortExpressions = {
      updated: "updated_at_ms",
      status: "lower(coalesce(json_extract(data, '$.status'), ''))",
      risk: "case lower(coalesce(json_extract(data, '$.riskLevel'), '')) when 'destructive' then 4 when 'high' then 3 when 'medium' then 2 else 1 end",
      trigger: "lower(coalesce(json_extract(data, '$.trigger'), ''))"
    } as const;
    const where = clauses.length ? 'where ' + clauses.join(' and ') : '';
    const result = await repository.transaction({}, async (transaction) => {
      const totalRow = await transaction.get<{ total: number }>('select count(*) as total from ' + repository.tableName + ' ' + where, params);
      const rows = await transaction.all<{ data: string }>(
        'select data from ' + repository.tableName + ' ' + where + ' order by ' + sortExpressions[input.sort] + ' ' + input.direction + ', id ' + input.direction + ' limit ? offset ?',
        [...params, input.limit, input.offset]
      );
      return { total: totalRow?.total ?? 0, adaptations: rows.map((row) => JSON.parse(row.data) as unknown as AutomationStudioAdaptationSummary) };
    });
    return { adaptations: result.adaptations, total: result.total, limit: input.limit, offset: input.offset };
  }

  async listSqlFlowRunSummaryPage(
    repository: SQLiteRepository<JsonObject>,
    input: { flowId?: string; status?: string; search?: string; sort: "updated" | "started" | "duration" | "actions" | "status"; direction: "asc" | "desc"; limit: number; offset: number }
  ): Promise<AutomationStudioFlowRunSummaryPage> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.flowId) {
      clauses.push("json_extract(data, '$.flowId') = ?");
      params.push(input.flowId);
    }
    if (input.status) {
      clauses.push("json_extract(data, '$.status') = ?");
      params.push(input.status);
    }
    if (input.search) {
      clauses.push("(lower(id) like ? or lower(json_extract(data, '$.flowId')) like ?)");
      params.push(`%${input.search}%`, `%${input.search}%`);
    }
    const sortExpressions = {
      updated: "updated_at_ms",
      started: "coalesce(cast(json_extract(data, '$.startedAt') as integer), 0)",
      duration: "coalesce(cast(json_extract(data, '$.finishedAt') as integer), updated_at_ms) - coalesce(cast(json_extract(data, '$.startedAt') as integer), updated_at_ms)",
      actions: "coalesce(cast(json_extract(data, '$.actionAttemptCount') as integer), 0)",
      status: "lower(coalesce(json_extract(data, '$.status'), ''))"
    } as const;
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const orderBy = sortExpressions[input.sort];
    const result = await repository.transaction({}, async (transaction) => {
      const totalRow = await transaction.get<{ total: number }>(`select count(*) as total from ${repository.tableName} ${where}`, params);
      const rows = await transaction.all<{ data: string }>(
        `select data from ${repository.tableName} ${where} order by ${orderBy} ${input.direction}, id ${input.direction} limit ? offset ?`,
        [...params, input.limit, input.offset]
      );
      return { total: totalRow?.total ?? 0, runs: rows.map((row) => JSON.parse(row.data) as unknown as AutomationStudioFlowRunSummary) };
    });
    return { runs: result.runs, total: result.total, limit: input.limit, offset: input.offset };
  }

  runtimeSummaryRepository(projectId: string): SQLiteRepository<JsonObject> {
    return new SQLiteRepository<JsonObject>({ rootDir: this.paths.projectFile(projectId, "runtime", "sqlite"), kind: "runtime.sessions", layoutVersion: 1 });
  }

  async tryPersistRuntimeRunDetail(detail: AutomationStudioFlowRunDetail): Promise<boolean> {
    const { projectId, flowId } = detail.summary;
    const written = await this.tryWithRuntimeStreamStore(projectId, async (store) => {
      await store.ensureRuntimeFlowProjection({ flowId, name: flowId, now: detail.summary.startedAt ?? detail.summary.updatedAt });
      await store.putRunDetail(detail);
      return true;
    });
    return written === true;
  }

  async tryWithAdaptationStore<T>(projectId: string, operation: (store: AutomationStudioProjectAdaptationStore) => Promise<T>): Promise<T | null> {
    if (!this.runtimeProjectDatabasePool || !this.paths.root) return null;
    try {
      await this.projects.findProject(projectId);
      const store = await AutomationStudioProjectAdaptationStore.open({ pool: this.runtimeProjectDatabasePool, projectId });
      try {
        return await operation(store);
      } finally {
        await store.close();
      }
    } catch {
      return null;
    }
  }

  async tryWithRuntimeStreamStore<T>(projectId: string, operation: (store: AutomationStudioProjectRuntimeStreamStore) => Promise<T>): Promise<T | null> {
    if (!this.runtimeProjectDatabasePool || !this.paths.root) return null;
    try {
      await this.projects.findProject(projectId);
      const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool: this.runtimeProjectDatabasePool, projectId });
      try {
        return await operation(store);
      } finally {
        await store.close();
      }
    } catch {
      return null;
    }
  }

  async writeFlowAdaptationSummary(projectId: string, summary: AutomationStudioAdaptationSummary): Promise<void> {
    if (!this.paths.root) return;
    await this.flowAdaptationSummaryRepository(projectId).put(createRecord({
      id: summary.adaptationId,
      kind: "flow.adaptations",
      data: summary as unknown as JsonObject,
      nowMs: summary.updatedAt
    }));
  }

  async writeFlowInstructionSummary(projectId: string, summary: AutomationStudioInstructionSummary): Promise<void> {
    if (!this.paths.root) return;
    await this.flowInstructionSummaryRepository(projectId).put(createRecord({ id: summary.instructionId, kind: "flow.instructions", data: summary as unknown as JsonObject, nowMs: summary.updatedAt }));
  }

  async writeFlowRunSummary(projectId: string, summary: AutomationStudioFlowRunSummary): Promise<void> {
    if (!this.paths.root) return;
    await this.flowRunSummaryRepository(projectId).put(createRecord({
      id: summary.runId,
      kind: "flow.runs",
      data: summary as unknown as JsonObject,
      nowMs: summary.updatedAt
    }));
  }

  async writeJsonLines(filePath: string, rows: unknown[]): Promise<void> {
    if (!this.paths.root) return;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, rows.map((row) => JSON.stringify(row)).join("\n"), "utf8");
  }

  async writeRuntimeSummary(projectId: string, session: AutomationStudioRuntimeSession): Promise<void> {
    if (!this.paths.root) return;
    const summary = runtimeSummaryFromSession(session);
    await this.runtimeSummaryRepository(projectId).put(createRecord({
      id: session.runId,
      kind: "runtime.sessions",
      data: summary as unknown as JsonObject,
      nowMs: summary.updatedAt
    }));
  }

  async listFlowSubflowSummaries(input: { projectId: string; flowId?: string; status?: string; role?: string; search?: string; sort?: "updated" | "name" | "status" | "role"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioSubflowSummaryPage> {
    const limit = clampInteger(input.limit, 1, 100, 25);
    const offset = clampInteger(input.offset, 0, 1_000_000, 0);
    const search = input.search?.trim().toLowerCase();
    if (!this.paths.root) {
      const index = await this.indexes.readFlowSubflowIndex(input.projectId);
      const scoped = (index.subflows ?? []).filter((item) =>
        (!input.flowId || item.flowId === input.flowId)
        && (!input.status || item.status === input.status)
        && (!input.role || item.role === input.role)
        && (!search || item.name.toLowerCase().includes(search) || item.subflowId.toLowerCase().includes(search))
      );
      return { subflows: scoped.slice(offset, offset + limit), total: scoped.length, limit, offset };
    }
    const typedPage = await this.flows.tryWithFlowResourceRepository(input.projectId, async (repository) => await repository.listSubflowSummariesPage({
      ...(input.flowId ? { flowId: input.flowId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(search ? { search } : {}),
      ...(input.sort ? { sort: input.sort } : {}),
      ...(input.direction ? { direction: input.direction } : {}),
      limit,
      offset
    }));
    if (typedPage) {
      const hasFilter = Boolean(input.flowId || input.status || input.role || search);
      const typedInventory = hasFilter
        ? await this.flows.tryWithFlowResourceRepository(input.projectId, async (repository) => await repository.listSubflowSummariesPage({ limit: 1, offset: 0 }))
        : typedPage;
      const summaryInventory = await this.flowMutations.flowSubflowSummaryRepository(input.projectId).listPage({}, { limit: 1, offset: 0 }).catch(() => null);
      const typedProjectionIsComplete = Boolean(
        typedInventory
        && summaryInventory
        && summaryInventory.total > 0
        && typedInventory.total >= summaryInventory.total
      );
      if (typedProjectionIsComplete) {
        return {
          subflows: typedPage.items.map((item) => subflowSummaryFromSql(item, input.projectId)),
          total: typedPage.total,
          limit: typedPage.limit,
          offset: typedPage.offset
        };
      }
    }
    await this.ensureFlowSubflowSummaryIndex(input.projectId);
    const repository = this.flowMutations.flowSubflowSummaryRepository(input.projectId);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.flowId) { clauses.push("json_extract(data, '$.flowId') = ?"); params.push(input.flowId); }
    if (input.status) { clauses.push("json_extract(data, '$.status') = ?"); params.push(input.status); }
    if (input.role) { clauses.push("json_extract(data, '$.role') = ?"); params.push(input.role); }
    if (search) {
      clauses.push("(lower(json_extract(data, '$.name')) like ? or lower(json_extract(data, '$.subflowId')) like ?)");
      params.push("%" + search + "%", "%" + search + "%");
    }
    const where = clauses.length ? "where " + clauses.join(" and ") : "";
    const sortColumn = input.sort === "name" ? "lower(json_extract(data, '$.name'))" : input.sort === "status" ? "json_extract(data, '$.status')" : input.sort === "role" ? "json_extract(data, '$.role')" : "updated_at_ms";
    const direction = input.direction === "asc" ? "asc" : "desc";
    const result = await repository.transaction({}, async (transaction) => {
      const totalRow = await transaction.get<{ total: number }>("select count(*) as total from " + repository.tableName + " " + where, params);
      const rows = await transaction.all<{ data: string }>("select data from " + repository.tableName + " " + where + " order by " + sortColumn + " " + direction + ", id asc limit ? offset ?", [...params, limit, offset]);
      return { total: totalRow?.total ?? 0, items: rows.map((row) => JSON.parse(row.data) as unknown as AutomationStudioSubflowSummary) };
    });
    return { subflows: result.items, total: result.total, limit, offset };
  }

  async listFlowInstructionSummaries(input: { projectId: string; flowId?: string; subflowId?: string; status?: string; scopeKind?: string; requirement?: string; search?: string; sort?: "updated" | "title" | "status" | "scope" | "priority"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioInstructionSummaryPage> {
    const limit = clampInteger(input.limit, 1, 100, 25);
    const offset = clampInteger(input.offset, 0, 1_000_000, 0);
    const search = input.search?.trim().toLowerCase();
    const matchesScope = (item: AutomationStudioInstructionSummary) =>
      (!input.flowId || item.flowId === input.flowId || item.scopeKind === "global" || item.scopeKind === "project")
      && (!input.subflowId || item.subflowId === input.subflowId || item.scopeKind === "flow" || item.scopeKind === "project" || item.scopeKind === "global");
    if (!this.paths.root) {
      const index = await this.indexes.readFlowInstructionIndex(input.projectId);
      const scoped = (index.instructions ?? []).filter((item) => matchesScope(item)
        && (!input.status || item.status === input.status)
        && (!input.scopeKind || item.scopeKind === input.scopeKind)
        && (!input.requirement || item.requirement === input.requirement)
        && (!search || item.title.toLowerCase().includes(search) || item.instructionId.toLowerCase().includes(search)));
      const direction = input.direction === "asc" ? 1 : -1;
      scoped.sort((left, right) => {
        const comparison = input.sort === "title" ? left.title.localeCompare(right.title)
          : input.sort === "status" ? left.status.localeCompare(right.status)
          : input.sort === "scope" ? left.scopeKind.localeCompare(right.scopeKind)
          : input.sort === "priority" ? left.priority - right.priority
          : left.updatedAt - right.updatedAt;
        return comparison * direction || left.instructionId.localeCompare(right.instructionId);
      });
      return { instructions: scoped.slice(offset, offset + limit), total: scoped.length, limit, offset };
    }
    const typedPage = await this.flows.tryWithFlowResourceRepository(input.projectId, async (repository) => await repository.listInstructionSummariesPage({
      ...(input.flowId ? { flowId: input.flowId } : {}),
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      ...(input.scopeKind ? { scopeKind: sqlInstructionScopeKind(input.scopeKind) } : {}),
      ...(input.status ? { status: sqlInstructionStatus(input.status) } : {}),
      ...(input.requirement ? { requirement: sqlInstructionRequirement(input.requirement) } : {}),
      ...(search ? { search } : {}),
      ...(input.sort ? { sort: input.sort } : {}),
      ...(input.direction ? { direction: input.direction } : {}),
      limit,
      offset
    }));
    if (typedPage && typedPage.total > 0) return { instructions: typedPage.items.map((item) => instructionSummaryFromSql(item, input.projectId)), total: typedPage.total, limit: typedPage.limit, offset: typedPage.offset };
    await this.ensureFlowInstructionSummaryIndex(input.projectId);
    const repository = this.flowInstructionSummaryRepository(input.projectId);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.flowId) { clauses.push("(json_extract(data, '$.flowId') = ? or json_extract(data, '$.scopeKind') in ('global', 'project'))"); params.push(input.flowId); }
    if (input.subflowId) { clauses.push("(json_extract(data, '$.subflowId') = ? or json_extract(data, '$.scopeKind') in ('global', 'project', 'flow'))"); params.push(input.subflowId); }
    if (input.status) { clauses.push("json_extract(data, '$.status') = ?"); params.push(input.status); }
    if (input.scopeKind) { clauses.push("json_extract(data, '$.scopeKind') = ?"); params.push(input.scopeKind); }
    if (input.requirement) { clauses.push("json_extract(data, '$.requirement') = ?"); params.push(input.requirement); }
    if (search) { clauses.push("(lower(json_extract(data, '$.title')) like ? or lower(json_extract(data, '$.instructionId')) like ?)"); params.push("%" + search + "%", "%" + search + "%"); }
    const where = clauses.length ? "where " + clauses.join(" and ") : "";
    const sortColumn = input.sort === "title" ? "lower(json_extract(data, '$.title'))" : input.sort === "status" ? "json_extract(data, '$.status')" : input.sort === "scope" ? "json_extract(data, '$.scopeKind')" : input.sort === "priority" ? "cast(json_extract(data, '$.priority') as integer)" : "updated_at_ms";
    const direction = input.direction === "asc" ? "asc" : "desc";
    const result = await repository.transaction({}, async (transaction) => {
      const totalRow = await transaction.get<{ total: number }>("select count(*) as total from " + repository.tableName + " " + where, params);
      const rows = await transaction.all<{ data: string }>("select data from " + repository.tableName + " " + where + " order by " + sortColumn + " " + direction + ", id asc limit ? offset ?", [...params, limit, offset]);
      return { total: totalRow?.total ?? 0, items: rows.map((row) => JSON.parse(row.data) as unknown as AutomationStudioInstructionSummary) };
    });
    return { instructions: result.items, total: result.total, limit, offset };
  }

  async listRuntimeSessionSummaries(projectId: string, options: { limit?: unknown; offset?: unknown } = {}): Promise<AutomationStudioRuntimeRunSummaryPage> {
    await this.ensureRuntimeSummaryIndex(projectId);
    const limit = clampInteger(options.limit, 1, 100, 25);
    const offset = clampInteger(options.offset, 0, 1_000_000, 0);
    if (!this.paths.root) {
      const sessions = await this.facade.listRuntimeSessions(projectId);
      const runs = sessions.map((session) => runtimeSummaryFromSession(session)).slice(offset, offset + limit);
      return { runs, total: sessions.length, limit, offset };
    }
    const page = await this.runtimeSummaryRepository(projectId).listPage({}, { limit, offset, orderBy: "updated_at_ms", direction: "desc" });
    return {
      runs: page.records.map((record) => record.data as unknown as AutomationStudioRuntimeRunSummary),
      total: page.total,
      limit: page.limit,
      offset: page.offset
    };
  }

  async listFlowRunSummaries(input: { projectId: string; flowId?: string; status?: string; search?: string; sort?: "updated" | "started" | "duration" | "actions" | "status"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioFlowRunSummaryPage> {
    const limit = clampInteger(input.limit, 1, 100, 25);
    const offset = clampInteger(input.offset, 0, 1_000_000, 0);
    const search = input.search?.trim().toLowerCase();
    const direction = input.direction === "asc" ? "asc" : "desc";
    const sort = input.sort ?? "updated";
    if (!this.paths.root) {
      const index = await this.indexes.readFlowRunIndex(input.projectId);
      const scoped = (index.runs ?? []).filter((item) =>
        (!input.flowId || item.flowId === input.flowId)
        && (!input.status || item.status === input.status)
        && (!search || item.runId.toLowerCase().includes(search) || item.flowId.toLowerCase().includes(search))
      ).sort((left, right) => compareFlowRunSummaries(left, right, sort, direction));
      return { runs: scoped.slice(offset, offset + limit), total: scoped.length, limit, offset };
    }
    const typedPage = await this.tryWithRuntimeStreamStore(input.projectId, async (store) => await store.listRunSummaries({
      ...(input.flowId ? { flowId: input.flowId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(search ? { search } : {}),
      sort,
      direction,
      limit,
      offset
    }));
    if (typedPage && typedPage.total > 0) return typedPage;
    await this.ensureFlowRunSummaryIndex(input.projectId);
    return await this.listSqlFlowRunSummaryPage(this.flowRunSummaryRepository(input.projectId), {
      ...(input.flowId ? { flowId: input.flowId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(search ? { search } : {}),
      sort,
      direction,
      limit,
      offset
    });
  }

  async listFlowAdaptationSummaries(input: { projectId: string; flowId?: string; subflowId?: string; status?: string; risk?: string; search?: string; sort?: "updated" | "status" | "risk" | "trigger"; direction?: "asc" | "desc"; limit?: unknown; offset?: unknown }): Promise<AutomationStudioAdaptationSummaryPage> {
    const limit = clampInteger(input.limit, 1, 100, 25);
    const offset = clampInteger(input.offset, 0, 1_000_000, 0);
    const search = input.search?.trim().toLowerCase();
    const sort = input.sort ?? "updated";
    const direction = input.direction === "asc" ? "asc" : "desc";
    const bootstrap = (await this.bootstrapAdaptations.listProjectFlowBootstrapAdaptations(input.projectId, input.flowId))
      .map(bootstrapAdaptationSummary)
      .filter((item) =>
        (!input.subflowId || item.subflowId === input.subflowId)
        && (!input.status || item.status === input.status)
        && (!input.risk || item.riskLevel === input.risk)
        && (!search || item.adaptationId.toLowerCase().includes(search) || item.trigger.toLowerCase().includes(search))
      );
    if (!bootstrap.length) return await this.listOrdinaryFlowAdaptationSummaries(input, { limit, offset, ...(search ? { search } : {}), sort, direction });

    const ordinary = await this.listAllOrdinaryFlowAdaptationSummaries(input, { ...(search ? { search } : {}), sort, direction });
    const merged = new Map<string, AutomationStudioAdaptationSummary>();
    for (const item of ordinary) merged.set(item.adaptationId, item);
    for (const item of bootstrap) merged.set(item.adaptationId, item);
    const adaptations = [...merged.values()].sort((left, right) => compareFlowAdaptationSummaries(left, right, sort, direction));
    return { adaptations: adaptations.slice(offset, offset + limit), total: adaptations.length, limit, offset };
  }

  private async listOrdinaryFlowAdaptationSummaries(
    input: { projectId: string; flowId?: string; subflowId?: string; status?: string; risk?: string },
    page: { limit: number; offset: number; search?: string; sort: "updated" | "status" | "risk" | "trigger"; direction: "asc" | "desc" }
  ): Promise<AutomationStudioAdaptationSummaryPage> {
    let typedPage: Awaited<ReturnType<AutomationStudioProjectAdaptationStore["listAdaptationsPage"]>> | null = null;
    if (this.runtimeProjectDatabasePool && this.paths.root) {
      const store = await AutomationStudioProjectAdaptationStore.open({ pool: this.runtimeProjectDatabasePool, projectId: input.projectId });
      try {
        typedPage = await store.listAdaptationsPage({
          ...(input.flowId ? { flowId: input.flowId } : {}),
          ...(input.subflowId ? { subflowId: input.subflowId } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.risk ? { risk: input.risk } : {}),
          ...(page.search ? { search: page.search } : {}),
          sort: page.sort,
          direction: page.direction,
          limit: page.limit,
          offset: page.offset
        });
        if (typedPage.total === 0 && (input.status || input.risk || page.search)) {
          const canonicalScope = await store.listAdaptationsPage({
            ...(input.flowId ? { flowId: input.flowId } : {}),
            ...(input.subflowId ? { subflowId: input.subflowId } : {}),
            limit: 1,
            offset: 0
          });
          if (canonicalScope.total > 0) return { adaptations: [], total: 0, limit: typedPage.limit, offset: typedPage.offset };
        }
      } finally {
        await store.close();
      }
    }
    if (typedPage && typedPage.total > 0) return { adaptations: typedPage.adaptations.map(adaptationSummaryFromTypedStore), total: typedPage.total, limit: typedPage.limit, offset: typedPage.offset };
    if (!this.paths.root) {
      const index = await this.indexes.readFlowAdaptationIndex(input.projectId);
      const scoped = (index.adaptations ?? []).filter((item) =>
        (!input.flowId || item.flowId === input.flowId)
        && (!input.subflowId || item.subflowId === input.subflowId)
        && (!input.status || item.status === input.status)
        && (!input.risk || item.riskLevel === input.risk)
        && (!page.search || item.adaptationId.toLowerCase().includes(page.search) || item.trigger.toLowerCase().includes(page.search))
      ).sort((left, right) => compareFlowAdaptationSummaries(left, right, page.sort, page.direction));
      return { adaptations: scoped.slice(page.offset, page.offset + page.limit), total: scoped.length, limit: page.limit, offset: page.offset };
    }
    await this.ensureFlowAdaptationSummaryIndex(input.projectId);
    return await this.listSqlFlowAdaptationSummaryPage(this.flowAdaptationSummaryRepository(input.projectId), {
      ...(input.flowId ? { flowId: input.flowId } : {}),
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.risk ? { risk: input.risk } : {}),
      ...(page.search ? { search: page.search } : {}),
      sort: page.sort,
      direction: page.direction,
      limit: page.limit,
      offset: page.offset
    });
  }

  private async listAllOrdinaryFlowAdaptationSummaries(
    input: { projectId: string; flowId?: string; subflowId?: string; status?: string; risk?: string },
    options: { search?: string; sort: "updated" | "status" | "risk" | "trigger"; direction: "asc" | "desc" }
  ): Promise<AutomationStudioAdaptationSummary[]> {
    const result: AutomationStudioAdaptationSummary[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.listOrdinaryFlowAdaptationSummaries(input, { ...options, limit: 100, offset });
      result.push(...page.adaptations);
      if (offset + page.adaptations.length >= page.total || page.adaptations.length === 0) break;
    }
    return result;
  }
}

