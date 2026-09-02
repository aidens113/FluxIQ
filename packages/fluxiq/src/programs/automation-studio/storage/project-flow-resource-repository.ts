import { createHash } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { AutomationStudioSchemaMigrationRunner, type AutomationStudioSchemaMigration } from "./schema-migrations.ts";
import { automationStudioFilterHash, automationStudioPageLimit, decodeAutomationStudioPageCursor, encodeAutomationStudioPageCursor } from "./paging.ts";

export type AutomationStudioFlowResourcePage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean; limit: number };
export type AutomationStudioFlowResourceOffsetPage<T> = { items: T[]; total: number; limit: number; offset: number };
export type AutomationStudioSqlSubflowTargetPage = { items: AutomationStudioSqlSubflow[]; total: number; limit: number; nextCursor: string | null; hasMore: boolean };
export type AutomationStudioRouterRouteCounts = { total: number; active: number; disabled: number; byGroup: Record<string, number> };
export type AutomationStudioSqlRouterRoutePage = { items: AutomationStudioSqlRouterRoute[]; counts: AutomationStudioRouterRouteCounts; limit: number; nextCursor: string | null; hasMore: boolean };
export type AutomationStudioSqlRouterSummary = Omit<AutomationStudioSqlRouter, "groups" | "routes"> & { groups: AutomationStudioSqlRouterGroup[] };
export type AutomationStudioSqlRouterTargetReference = { subflowId: string; routes: AutomationStudioSqlRouterRoute[]; routeCount: number; fallback: boolean; total: number; hasMore: boolean };
export type AutomationStudioSqlRouterTargetReferenceBatch = { targets: AutomationStudioSqlRouterTargetReference[]; perTargetLimit: number };
export type AutomationStudioSqlFlowRecord = {
  flowId: string; parentFlowId: string | null; owningSubflowId: string | null; name: string; description: string;
  scopeKind: "global" | "domain"; scopeId: string | null; visibility: "private" | "project" | "domain" | "global";
  origin: "user" | "recording" | "adaptation" | "import" | "system"; sourceMode: "visual" | "code" | "hybrid";
  status: "draft" | "active" | "archived" | "deleted"; graphRevision: number; settingsRevision: number;
  compiledRevision: number | null; createdAt: number; updatedAt: number; deletedAt: number | null;
};
export type AutomationStudioSqlFlowSettings = { interventionMode: "fully_adaptive" | "manual_approval" | "no_llm_intervention"; interventionModeVersion: 1; executionDefaults: JsonObject; training: JsonObject; adaptation: JsonObject; llm: JsonObject; safety: JsonObject; revision: number; updatedAt: number };
export type AutomationStudioSqlFlowDetail = AutomationStudioSqlFlowRecord & { settings: AutomationStudioSqlFlowSettings | null; inputs: AutomationStudioSqlFlowPort[]; outputs: AutomationStudioSqlFlowPort[]; variables: AutomationStudioSqlFlowVariable[]; errors: AutomationStudioSqlFlowError[] };
export type AutomationStudioSqlFlowPort = { portId: string; direction: "input" | "output"; name: string; valueType: JsonValue; required: boolean; defaultValue: JsonValue | null; description: string; sortKey: string; revision: number };
export type AutomationStudioSqlFlowVariable = { variableId: string; name: string; valueType: JsonValue; initialValue: JsonValue | null; description: string; sortKey: string; revision: number };
export type AutomationStudioSqlFlowError = { errorId: string; code: string; description: string; metadata: JsonObject; revision: number };
export type AutomationStudioSqlSubflowCategory = { categoryId: string; flowId: string; parentCategoryId: string | null; name: string; sortKey: string; revision: number; createdAt: number; updatedAt: number };
export type AutomationStudioSqlSubflow = { subflowId: string; parentFlowId: string; graphFlowId: string; parentCategoryId: string | null; name: string; description: string; role: string; status: "draft" | "active" | "archived" | "deleted"; inputMapping: JsonValue; outputMapping: JsonValue; approvalOverride: "adaptive" | "manual_approval" | "disabled" | null; revision: number; createdAt: number; updatedAt: number; deletedAt: number | null };
export type AutomationStudioSqlRouter = { routerId: string; flowId: string; fallbackKind: "none" | "subflow" | "error"; fallbackSubflowId: string | null; revision: number; createdAt: number; updatedAt: number; groups: AutomationStudioSqlRouterGroup[]; routes: AutomationStudioSqlRouterRoute[] };
export type AutomationStudioSqlRouterGroup = { groupId: string; routerId: string; name: string; description: string; order: number; status: "active" | "disabled" | "archived"; collapsed: boolean; sortKey: string; revision: number; createdAt: number; updatedAt: number; metadata: JsonObject };
export type AutomationStudioSqlRouterRoute = { routeId: string; routerId: string; groupId: string | null; name: string; priority: number; enabled: boolean; conditionKind: string; condition: JsonValue; targetKind: "subflow" | "flow" | "error" | "none"; targetSubflowId: string | null; revision: number; createdAt: number; updatedAt: number };
export type AutomationStudioSqlInstructionScope = { scopeKind: "global" | "project" | "flow" | "router" | "subflow" | "node" | "error"; projectId: string | null; flowId: string | null; routerId: string | null; subflowId: string | null; nodeId: string | null; errorCode: string | null };
export type AutomationStudioSqlInstruction = { instructionId: string; title: string; bodyObjectId: string | null; inlineBody: string | null; requirement: "guidance" | "required" | "forbidden"; status: "draft" | "active" | "archived" | "deleted"; priority: number; contentDigest: string; revision: number; createdAt: number; updatedAt: number; deletedAt: number | null; scopes: AutomationStudioSqlInstructionScope[]; tags: string[] };
export type AutomationStudioSqlInstructionSummary = Omit<AutomationStudioSqlInstruction, "bodyObjectId" | "inlineBody" | "scopes" | "tags"> & { scope: AutomationStudioSqlInstructionScope | null };
export type AutomationStudioSqlInstructionBinding = { bindingId: string; ownerKind: string; ownerId: string; instructionId: string; sortKey: string; enabled: boolean; revision: number };
export type AutomationStudioSqlAdaptationPolicy = { policyId: string; projectId: string; flowId: string; subflowId: string | null; preset: "locked" | "observe" | "repair" | "adaptive" | "autonomous"; proposalMode: "auto" | "manual" | "mixed"; settings: JsonObject; revision: number; createdAt: number; updatedAt: number; deletedAt: number | null };
export type AutomationStudioEffectiveInstructionSet = { scopeDigest: string; contentDigest: string; maxRevision: number; instructionIds: string[]; instructions: AutomationStudioSqlInstruction[]; cached: boolean };

export const AUTOMATION_STUDIO_PROJECT_FLOW_RESOURCE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0010_flow_owned_resource_tables",
  statements: [
    `create table if not exists adaptation_policies (policy_id text primary key, project_id text not null, flow_id text not null, subflow_id text, preset text not null check (preset in ('locked','observe','repair','adaptive','autonomous')), proposal_mode text not null check (proposal_mode in ('auto','manual','mixed')), settings_json text not null default '{}', revision integer not null default 1 check (revision > 0), created_at_ms integer not null, updated_at_ms integer not null, deleted_at_ms integer)`,
    "create unique index if not exists adaptation_policies_scope_uq on adaptation_policies (flow_id, coalesce(subflow_id, ''))",
    "create index if not exists adaptation_policies_flow_idx on adaptation_policies (flow_id, deleted_at_ms, updated_at_ms desc, policy_id)",
    `create table if not exists effective_instruction_digest_cache (scope_digest text primary key, instruction_revision integer not null check (instruction_revision > 0), content_digest text not null, instruction_ids_json text not null, created_at_ms integer not null)`
  ]
};

const FLOW_RESOURCE_MIGRATIONS: readonly AutomationStudioSchemaMigration[] = [
  ...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS,
  AUTOMATION_STUDIO_PROJECT_FLOW_RESOURCE_MIGRATION
].sort((left, right) => left.id.localeCompare(right.id));

export class AutomationStudioProjectFlowResourceRepository {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectFlowResourceRepository> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: FLOW_RESOURCE_MIGRATIONS }).migrate();
      return new AutomationStudioProjectFlowResourceRepository(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> { return this.lease.release(); }

  async upsertFlow(input: Omit<AutomationStudioSqlFlowRecord, "graphRevision" | "settingsRevision" | "createdAt" | "updatedAt" | "deletedAt"> & { graphRevision?: number; settingsRevision?: number; createdAt?: number; updatedAt?: number; deletedAt?: number | null; settings?: Partial<Omit<AutomationStudioSqlFlowSettings, "revision" | "updatedAt">>; inputs?: Array<Omit<AutomationStudioSqlFlowPort, "direction" | "revision">>; outputs?: Array<Omit<AutomationStudioSqlFlowPort, "direction" | "revision">>; variables?: Array<Omit<AutomationStudioSqlFlowVariable, "revision">>; errors?: Array<Omit<AutomationStudioSqlFlowError, "revision">> }, expectedSettingsRevision?: number): Promise<AutomationStudioSqlFlowDetail> {
    const now = input.updatedAt ?? Date.now();
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<FlowRow>("select * from flows where flow_id = ?", [requiredId(input.flowId, "Flow")]);
      const settings = existing ? await sql.get<FlowSettingsRow>("select * from flow_settings where flow_id = ?", [input.flowId]) : undefined;
      if (expectedSettingsRevision !== undefined && settings?.revision !== expectedSettingsRevision) throw new Error(`Flow ${input.flowId} settings revision conflict.`);
      const settingsRevision = settings ? settings.revision + 1 : positive(input.settingsRevision ?? 1, "settings revision");
      await sql.run(`insert into flows (flow_id, parent_flow_id, owning_subflow_id, name, description, scope_kind, scope_id, visibility, origin, source_mode, status, graph_revision, settings_revision, compiled_revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(flow_id) do update set parent_flow_id = excluded.parent_flow_id, owning_subflow_id = excluded.owning_subflow_id, name = excluded.name, description = excluded.description, scope_kind = excluded.scope_kind, scope_id = excluded.scope_id, visibility = excluded.visibility, origin = excluded.origin, source_mode = excluded.source_mode, status = excluded.status, settings_revision = excluded.settings_revision, compiled_revision = excluded.compiled_revision, updated_at_ms = excluded.updated_at_ms, deleted_at_ms = excluded.deleted_at_ms`, [input.flowId, optionalId(input.parentFlowId), optionalId(input.owningSubflowId), requiredName(input.name, "Flow"), input.description ?? "", input.scopeKind, optionalId(input.scopeId), input.visibility, input.origin, input.sourceMode, input.status, existing?.graph_revision ?? positive(input.graphRevision ?? 1, "graph revision"), settingsRevision, input.compiledRevision ?? null, existing?.created_at_ms ?? input.createdAt ?? now, now, input.deletedAt ?? null]);
      const interventionMode = input.settings?.interventionMode ?? interventionModeFromLegacySettings(input.settings?.training, input.settings?.adaptation);
      await sql.run(`insert into flow_settings (flow_id, intervention_mode, intervention_mode_version, execution_defaults_json, training_json, adaptation_json, llm_json, safety_json, revision, updated_at_ms) values (?, ?, 1, ?, ?, ?, ?, ?, ?, ?) on conflict(flow_id) do update set intervention_mode = excluded.intervention_mode, intervention_mode_version = excluded.intervention_mode_version, execution_defaults_json = excluded.execution_defaults_json, training_json = excluded.training_json, adaptation_json = excluded.adaptation_json, llm_json = excluded.llm_json, safety_json = excluded.safety_json, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`, [input.flowId, interventionMode, json(input.settings?.executionDefaults ?? {}), json(input.settings?.training ?? {}), json(input.settings?.adaptation ?? {}), json(input.settings?.llm ?? {}), json(input.settings?.safety ?? {}), settingsRevision, now]);
      if (input.inputs || input.outputs) await replacePorts(sql, input.flowId, input.inputs ?? [], input.outputs ?? []);
      if (input.variables) await replaceVariables(sql, input.flowId, input.variables);
      if (input.errors) await replaceErrors(sql, input.flowId, input.errors);
      return readFlow(sql, input.flowId);
    });
  }

  async getFlow(flowId: string): Promise<AutomationStudioSqlFlowDetail | null> {
    const row = await this.lease.database.get<FlowRow>("select * from flows where flow_id = ?", [requiredId(flowId, "Flow")]);
    return row ? readFlow(this.lease.database, row.flow_id) : null;
  }

  async markFlowDeleted(flowId: string, deletedAt = Date.now()): Promise<AutomationStudioSqlFlowRecord | null> {
    const id = requiredId(flowId, "Flow");
    const existing = await this.lease.database.get<FlowRow>("select * from flows where flow_id = ?", [id]);
    if (!existing) return null;
    await this.lease.database.run("update flows set status = 'deleted', deleted_at_ms = ?, updated_at_ms = ? where flow_id = ?", [deletedAt, deletedAt, id]);
    const row = await this.lease.database.get<FlowRow>("select * from flows where flow_id = ?", [id]);
    return row ? flowFromRow(row) : null;
  }

  async listFlowsPage(input: { parentFlowId?: string | null; status?: string; limit?: number; cursor?: string | null } = {}): Promise<AutomationStudioFlowResourcePage<AutomationStudioSqlFlowRecord>> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ updatedAt: number; flowId: string }>(input.cursor);
    const where = ["deleted_at_ms is null"];
    const params: unknown[] = [];
    if (input.parentFlowId !== undefined) input.parentFlowId === null ? where.push("parent_flow_id is null") : (where.push("parent_flow_id = ?"), params.push(requiredId(input.parentFlowId, "parent Flow")));
    if (input.status) { where.push("status = ?"); params.push(input.status); }
    if (cursor) { where.push("(updated_at_ms < ? or (updated_at_ms = ? and flow_id < ?))"); params.push(cursor.updatedAt, cursor.updatedAt, cursor.flowId); }
    const rows = await this.lease.database.all<FlowRow>(`select * from flows where ${where.join(" and ")} order by updated_at_ms desc, flow_id desc limit ?`, [...params, limit + 1]);
    return page(rows, limit, flowFromRow, (row) => ({ updatedAt: row.updated_at_ms, flowId: row.flow_id }));
  }

  async upsertSubflowCategory(input: Omit<AutomationStudioSqlSubflowCategory, "revision" | "createdAt" | "updatedAt"> & { revision?: number; createdAt?: number; updatedAt?: number }, expectedRevision?: number): Promise<AutomationStudioSqlSubflowCategory> {
    const now = input.updatedAt ?? Date.now();
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<SubflowCategoryRow>("select * from subflow_categories where category_id = ?", [requiredId(input.categoryId, "Subflow category")]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Subflow category ${input.categoryId} revision conflict.`);
      const revision = existing ? existing.revision + 1 : positive(input.revision ?? 1, "category revision");
      await sql.run(`insert into subflow_categories (category_id, flow_id, parent_category_id, name, sort_key, revision, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?) on conflict(category_id) do update set parent_category_id = excluded.parent_category_id, name = excluded.name, sort_key = excluded.sort_key, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`, [input.categoryId, requiredId(input.flowId, "Flow"), optionalId(input.parentCategoryId), requiredName(input.name, "Subflow category"), input.sortKey || input.name.toLowerCase(), revision, existing?.created_at_ms ?? input.createdAt ?? now, now]);
      return subflowCategoryFromRow(required(await sql.get<SubflowCategoryRow>("select * from subflow_categories where category_id = ?", [input.categoryId]), `Subflow category ${input.categoryId} was not persisted.`));
    });
  }

  async listSubflowCategoriesPage(input: { flowId: string; parentCategoryId?: string | null; limit?: number; cursor?: string | null }): Promise<AutomationStudioFlowResourcePage<AutomationStudioSqlSubflowCategory>> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ sortKey: string; categoryId: string }>(input.cursor);
    const where = ["flow_id = ?"];
    const params: unknown[] = [requiredId(input.flowId, "Flow")];
    if (input.parentCategoryId === undefined || input.parentCategoryId === null) where.push("parent_category_id is null");
    else { where.push("parent_category_id = ?"); params.push(requiredId(input.parentCategoryId, "parent category")); }
    if (cursor) { where.push("(sort_key > ? or (sort_key = ? and category_id > ?))"); params.push(cursor.sortKey, cursor.sortKey, cursor.categoryId); }
    const rows = await this.lease.database.all<SubflowCategoryRow>(`select * from subflow_categories where ${where.join(" and ")} order by sort_key, category_id limit ?`, [...params, limit + 1]);
    return page(rows, limit, subflowCategoryFromRow, (row) => ({ sortKey: row.sort_key, categoryId: row.category_id }));
  }

  async upsertSubflow(input: Omit<AutomationStudioSqlSubflow, "revision" | "createdAt" | "updatedAt" | "deletedAt"> & { revision?: number; createdAt?: number; updatedAt?: number; deletedAt?: number | null }, expectedRevision?: number): Promise<AutomationStudioSqlSubflow> {
    const now = input.updatedAt ?? Date.now();
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<SubflowRow>("select * from subflows where subflow_id = ?", [requiredId(input.subflowId, "Subflow")]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Subflow ${input.subflowId} revision conflict.`);
      const revision = existing ? existing.revision + 1 : positive(input.revision ?? 1, "subflow revision");
      await sql.run(`insert into subflows (subflow_id, parent_flow_id, graph_flow_id, parent_category_id, name, description, role, status, input_mapping_json, output_mapping_json, approval_override, revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(subflow_id) do update set parent_category_id = excluded.parent_category_id, name = excluded.name, description = excluded.description, role = excluded.role, status = excluded.status, input_mapping_json = excluded.input_mapping_json, output_mapping_json = excluded.output_mapping_json, approval_override = excluded.approval_override, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms, deleted_at_ms = excluded.deleted_at_ms`, [input.subflowId, requiredId(input.parentFlowId, "parent Flow"), requiredId(input.graphFlowId, "graph Flow"), optionalId(input.parentCategoryId), requiredName(input.name, "Subflow"), input.description ?? "", input.role, input.status, json(input.inputMapping ?? []), json(input.outputMapping ?? []), input.approvalOverride ?? null, revision, existing?.created_at_ms ?? input.createdAt ?? now, now, input.deletedAt ?? null]);
      return subflowFromRow(required(await sql.get<SubflowRow>("select * from subflows where subflow_id = ?", [input.subflowId]), `Subflow ${input.subflowId} was not persisted.`));
    });
  }

  async getSubflow(subflowId: string): Promise<AutomationStudioSqlSubflow | null> {
    const row = await this.lease.database.get<SubflowRow>("select * from subflows where subflow_id = ?", [requiredId(subflowId, "Subflow")]);
    return row ? subflowFromRow(row) : null;
  }

  async listSubflowsPage(input: { flowId: string; categoryId?: string | null; status?: string; limit?: number; cursor?: string | null }): Promise<AutomationStudioFlowResourcePage<AutomationStudioSqlSubflow>> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ name: string; subflowId: string }>(input.cursor);
    const where = ["parent_flow_id = ?", "deleted_at_ms is null"];
    const params: unknown[] = [requiredId(input.flowId, "Flow")];
    if (input.categoryId !== undefined) input.categoryId === null ? where.push("parent_category_id is null") : (where.push("parent_category_id = ?"), params.push(requiredId(input.categoryId, "category")));
    if (input.status) { where.push("status = ?"); params.push(input.status); }
    if (cursor) { where.push("(name collate nocase > ? or (name collate nocase = ? and subflow_id > ?))"); params.push(cursor.name, cursor.name, cursor.subflowId); }
    const rows = await this.lease.database.all<SubflowRow>(`select * from subflows where ${where.join(" and ")} order by name collate nocase, subflow_id limit ?`, [...params, limit + 1]);
    return page(rows, limit, subflowFromRow, (row) => ({ name: row.name, subflowId: row.subflow_id }));
  }

  async listSubflowSummariesPage(input: { flowId?: string; categoryId?: string | null; status?: string; role?: string; search?: string; sort?: "updated" | "name" | "status" | "role"; direction?: "asc" | "desc"; limit?: number; offset?: number } = {}): Promise<AutomationStudioFlowResourceOffsetPage<AutomationStudioSqlSubflow>> {
    const limit = clampLimit(input.limit);
    const offset = clampOffset(input.offset);
    const where = ["deleted_at_ms is null"];
    const params: unknown[] = [];
    if (input.flowId) { where.push("parent_flow_id = ?"); params.push(requiredId(input.flowId, "Flow")); }
    if (input.categoryId !== undefined) input.categoryId === null ? where.push("parent_category_id is null") : (where.push("parent_category_id = ?"), params.push(requiredId(input.categoryId, "category")));
    if (input.status) { where.push("status = ?"); params.push(requiredKind(input.status, "subflow status")); }
    if (input.role) { where.push("role = ?"); params.push(requiredKind(input.role, "subflow role")); }
    if (input.search?.trim()) { where.push("(lower(name) like ? or lower(subflow_id) like ? or lower(graph_flow_id) like ?)"); const search = `%${input.search.trim().toLowerCase()}%`; params.push(search, search, search); }
    const orderBy = subflowSummaryOrder(input.sort ?? "updated", input.direction ?? "desc");
    const result = await this.lease.database.transaction(async (sql) => {
      const total = await sql.get<{ total: number }>(`select count(*) as total from subflows where ${where.join(" and ")}`, params);
      const rows = await sql.all<SubflowRow>(`select * from subflows where ${where.join(" and ")} ${orderBy} limit ? offset ?`, [...params, limit, offset]);
      return { total: total?.total ?? 0, rows };
    });
    return { items: result.rows.map(subflowFromRow), total: result.total, limit, offset };
  }

  async listSubflowTargetsPage(input: { flowId: string; status?: string; role?: string; search?: string; limit?: unknown; cursor?: unknown }): Promise<AutomationStudioSqlSubflowTargetPage> {
    const flowId = requiredId(input.flowId, "Flow");
    const status = input.status?.trim() || "active";
    const role = input.role?.trim() || "";
    const search = input.search?.trim().toLowerCase() || "";
    const limit = automationStudioPageLimit(input.limit);
    const owner = `subflow-targets:${flowId}`;
    const filterHash = automationStudioFilterHash({ status, role, search });
    const cursor = decodeAutomationStudioPageCursor<{ name: string; subflowId: string }>(input.cursor, { owner, filterHash, validate: (values) => typeof values.name === "string" && typeof values.subflowId === "string" });
    const where = ["parent_flow_id = ?", "deleted_at_ms is null", "status = ?"];
    const params: unknown[] = [flowId, status];
    if (role) { where.push("role = ?"); params.push(requiredKind(role, "subflow role")); }
    if (search) { where.push("(lower(name) like ? or lower(subflow_id) like ? or lower(role) like ?)"); const needle = `%${search}%`; params.push(needle, needle, needle); }
    if (cursor) { where.push("(lower(name) > ? or (lower(name) = ? and subflow_id > ?))"); params.push(cursor.name, cursor.name, cursor.subflowId); }
    const countParams = params.slice(0, params.length - (cursor ? 3 : 0));
    const countWhere = where.slice(0, where.length - (cursor ? 1 : 0));
    const result = await this.lease.database.transaction(async (sql) => {
      const total = await sql.get<{ total: number }>(`select count(*) as total from subflows where ${countWhere.join(" and ")}`, countParams);
      const rows = await sql.all<SubflowRow>(`select * from subflows where ${where.join(" and ")} order by lower(name), subflow_id limit ?`, [...params, limit + 1]);
      return { total: total?.total ?? 0, rows };
    });
    const pageRows = result.rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(subflowFromRow),
      total: result.total,
      limit,
      hasMore: result.rows.length > limit,
      nextCursor: result.rows.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { name: last.name.toLowerCase(), subflowId: last.subflow_id } }) : null
    };
  }

  async upsertRouter(input: Omit<AutomationStudioSqlRouter, "revision" | "createdAt" | "updatedAt" | "groups" | "routes"> & { revision?: number; createdAt?: number; updatedAt?: number }, expectedRevision?: number): Promise<AutomationStudioSqlRouter> {
    const now = input.updatedAt ?? Date.now();
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<RouterRow>("select * from routers where router_id = ?", [requiredId(input.routerId, "Router")]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Router ${input.routerId} revision conflict.`);
      const revision = existing ? existing.revision + 1 : positive(input.revision ?? 1, "router revision");
      await sql.run(`insert into routers (router_id, flow_id, fallback_kind, fallback_subflow_id, revision, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?) on conflict(router_id) do update set fallback_kind = excluded.fallback_kind, fallback_subflow_id = excluded.fallback_subflow_id, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`, [input.routerId, requiredId(input.flowId, "Flow"), input.fallbackKind, optionalId(input.fallbackSubflowId), revision, existing?.created_at_ms ?? input.createdAt ?? now, now]);
      return readRouter(sql, input.routerId);
    });
  }

  async upsertRouterGroup(input: Omit<AutomationStudioSqlRouterGroup, "revision" | "description" | "order" | "status" | "collapsed" | "createdAt" | "updatedAt" | "metadata"> & Partial<Pick<AutomationStudioSqlRouterGroup, "description" | "order" | "status" | "collapsed" | "createdAt" | "updatedAt" | "metadata">> & { revision?: number }, expectedRevision?: number): Promise<AutomationStudioSqlRouterGroup> {
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<RouterGroupRow>("select * from router_groups where group_id = ?", [requiredId(input.groupId, "Router group")]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Router group ${input.groupId} revision conflict.`);
      const revision = existing ? existing.revision + 1 : positive(input.revision ?? 1, "router group revision");
      const now = input.updatedAt ?? Date.now();
      await sql.run(`insert into router_groups (group_id, router_id, name, sort_key, revision, description, order_value, status, collapsed, created_at_ms, updated_at_ms, metadata_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(group_id) do update set name = excluded.name, sort_key = excluded.sort_key, revision = excluded.revision, description = excluded.description, order_value = excluded.order_value, status = excluded.status, collapsed = excluded.collapsed, updated_at_ms = excluded.updated_at_ms, metadata_json = excluded.metadata_json`, [input.groupId, requiredId(input.routerId, "Router"), requiredName(input.name, "Router group"), input.sortKey || input.name.toLowerCase(), revision, input.description ?? existing?.description ?? "", Math.trunc(input.order ?? existing?.order_value ?? 0), input.status ?? existing?.status ?? "active", (input.collapsed ?? existing?.collapsed === 1) ? 1 : 0, existing?.created_at_ms ?? input.createdAt ?? now, now, json(input.metadata ?? (existing ? object(existing.metadata_json) : {}))]);
      return routerGroupFromRow(required(await sql.get<RouterGroupRow>("select * from router_groups where group_id = ?", [input.groupId]), `Router group ${input.groupId} was not persisted.`));
    });
  }

  async upsertRouterRoute(input: Omit<AutomationStudioSqlRouterRoute, "revision" | "createdAt" | "updatedAt"> & { revision?: number; createdAt?: number; updatedAt?: number }, expectedRevision?: number): Promise<AutomationStudioSqlRouterRoute> {
    const now = input.updatedAt ?? Date.now();
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<RouterRouteRow>("select * from router_routes where route_id = ?", [requiredId(input.routeId, "Router route")]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Router route ${input.routeId} revision conflict.`);
      const revision = existing ? existing.revision + 1 : positive(input.revision ?? 1, "router route revision");
      await sql.run(`insert into router_routes (route_id, router_id, group_id, name, priority, enabled, condition_kind, condition_json, target_kind, target_subflow_id, revision, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(route_id) do update set group_id = excluded.group_id, name = excluded.name, priority = excluded.priority, enabled = excluded.enabled, condition_kind = excluded.condition_kind, condition_json = excluded.condition_json, target_kind = excluded.target_kind, target_subflow_id = excluded.target_subflow_id, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`, [input.routeId, requiredId(input.routerId, "Router"), optionalId(input.groupId), requiredName(input.name, "Router route"), Math.trunc(input.priority), input.enabled ? 1 : 0, requiredKind(input.conditionKind, "condition kind"), json(input.condition ?? null), input.targetKind, optionalId(input.targetSubflowId), revision, existing?.created_at_ms ?? input.createdAt ?? now, now]);
      return routerRouteFromRow(required(await sql.get<RouterRouteRow>("select * from router_routes where route_id = ?", [input.routeId]), `Router route ${input.routeId} was not persisted.`));
    });
  }

  async getRouterForFlow(flowId: string): Promise<AutomationStudioSqlRouter | null> {
    const row = await this.lease.database.get<RouterRow>("select * from routers where flow_id = ?", [requiredId(flowId, "Flow")]);
    return row ? readRouter(this.lease.database, row.router_id) : null;
  }

  async getRouterSummaryForFlow(flowId: string): Promise<AutomationStudioSqlRouterSummary | null> {
    const row = await this.lease.database.get<RouterRow>("select * from routers where flow_id = ?", [requiredId(flowId, "Flow")]);
    if (!row) return null;
    const groups = await this.lease.database.all<RouterGroupRow>("select * from router_groups where router_id = ? order by order_value, group_id", [row.router_id]);
    return { ...routerFromRow(row), groups: groups.map(routerGroupFromRow) };
  }

  async listRouterTargetReferences(input: { flowId: string; subflowIds: string[]; perTargetLimit?: unknown }): Promise<AutomationStudioSqlRouterTargetReferenceBatch> {
    const flowId = requiredId(input.flowId, "Flow");
    const subflowIds = unique(input.subflowIds.map((id) => requiredId(id, "Subflow")));
    if (subflowIds.length > 50) throw new Error("Router target reference requests are limited to 50 Subflows.");
    const perTargetLimit = automationStudioPageLimit(input.perTargetLimit, 20);
    if (!subflowIds.length) return { targets: [], perTargetLimit };
    const router = await this.lease.database.get<RouterRow>("select * from routers where flow_id = ?", [flowId]);
    if (!router) return { targets: subflowIds.map((subflowId) => ({ subflowId, routes: [], routeCount: 0, fallback: false, total: 0, hasMore: false })), perTargetLimit };
    const placeholders = subflowIds.map(() => "?").join(", ");
    const baseParams: unknown[] = [router.router_id, ...subflowIds];
    const result = await this.lease.database.transaction(async (sql) => {
      const counts = await sql.all<{ target_subflow_id: string; total: number }>(`select target_subflow_id, count(*) as total from router_routes where router_id = ? and target_kind = 'subflow' and target_subflow_id in (${placeholders}) group by target_subflow_id`, baseParams);
      const routes = await sql.all<RouterRouteRow & { target_rank: number }>(`select * from (
        select router_routes.*, row_number() over (partition by target_subflow_id order by priority, route_id) as target_rank
        from router_routes
        where router_id = ? and target_kind = 'subflow' and target_subflow_id in (${placeholders})
      ) where target_rank <= ? order by target_subflow_id, priority, route_id`, [...baseParams, perTargetLimit]);
      return { counts, routes };
    });
    const countByTarget = new Map(result.counts.map((row) => [row.target_subflow_id, row.total]));
    const routesByTarget = new Map<string, AutomationStudioSqlRouterRoute[]>();
    for (const row of result.routes) {
      const targetSubflowId = row.target_subflow_id;
      if (!targetSubflowId) continue;
      const routes = routesByTarget.get(targetSubflowId) ?? [];
      routes.push(routerRouteFromRow(row));
      routesByTarget.set(targetSubflowId, routes);
    }
    return {
      targets: subflowIds.map((subflowId) => {
        const routes = routesByTarget.get(subflowId) ?? [];
        const routeCount = countByTarget.get(subflowId) ?? 0;
        const fallback = router.fallback_kind === "subflow" && router.fallback_subflow_id === subflowId;
        return { subflowId, routes, routeCount, fallback, total: routeCount + (fallback ? 1 : 0), hasMore: routeCount > routes.length };
      }),
      perTargetLimit
    };
  }

  async replaceRouterProjection(input: AutomationStudioSqlRouter): Promise<void> {
    await this.lease.database.transaction(async (sql) => {
      await sql.run(`insert into routers (router_id, flow_id, fallback_kind, fallback_subflow_id, revision, created_at_ms, updated_at_ms)
        values (?, ?, ?, ?, ?, ?, ?)
        on conflict(router_id) do update set flow_id = excluded.flow_id, fallback_kind = excluded.fallback_kind, fallback_subflow_id = excluded.fallback_subflow_id, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`,
      [requiredId(input.routerId, "Router"), requiredId(input.flowId, "Flow"), input.fallbackKind, optionalId(input.fallbackSubflowId), positive(input.revision, "router revision"), input.createdAt, input.updatedAt]);
      const groupIds = input.groups.map((group) => requiredId(group.groupId, "Router group"));
      const routeIds = input.routes.map((route) => requiredId(route.routeId, "Router route"));
      await deleteMissing(sql, "router_routes", "router_id", input.routerId, "route_id", routeIds);
      await deleteMissing(sql, "router_groups", "router_id", input.routerId, "group_id", groupIds);
      for (const group of input.groups) await sql.run(`insert into router_groups (group_id, router_id, name, sort_key, revision, description, order_value, status, collapsed, created_at_ms, updated_at_ms, metadata_json) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(group_id) do update set router_id = excluded.router_id, name = excluded.name, sort_key = excluded.sort_key, revision = excluded.revision, description = excluded.description, order_value = excluded.order_value, status = excluded.status, collapsed = excluded.collapsed, updated_at_ms = excluded.updated_at_ms, metadata_json = excluded.metadata_json`,
      [group.groupId, input.routerId, group.name, group.sortKey, positive(group.revision, "group revision"), group.description, Math.trunc(group.order), group.status, group.collapsed ? 1 : 0, group.createdAt, group.updatedAt, json(group.metadata)]);
      for (const route of input.routes) await sql.run(`insert into router_routes (route_id, router_id, group_id, name, priority, enabled, condition_kind, condition_json, target_kind, target_subflow_id, revision, created_at_ms, updated_at_ms)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(route_id) do update set router_id = excluded.router_id, group_id = excluded.group_id, name = excluded.name, priority = excluded.priority, enabled = excluded.enabled, condition_kind = excluded.condition_kind, condition_json = excluded.condition_json, target_kind = excluded.target_kind, target_subflow_id = excluded.target_subflow_id, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`,
      [route.routeId, input.routerId, optionalId(route.groupId), route.name, route.priority, route.enabled ? 1 : 0, route.conditionKind, json(route.condition), route.targetKind, optionalId(route.targetSubflowId), positive(route.revision, "route revision"), route.createdAt, route.updatedAt]);
    });
  }

  async listRouterRoutesPage(input: { flowId: string; groupId?: string | null; status?: "active" | "disabled"; search?: string; limit?: unknown; cursor?: unknown }): Promise<AutomationStudioSqlRouterRoutePage> {
    const flowId = requiredId(input.flowId, "Flow");
    if (input.status !== undefined && input.status !== "active" && input.status !== "disabled") throw new Error("Invalid Router route status filter.");
    const router = await this.lease.database.get<RouterRow>("select * from routers where flow_id = ?", [flowId]);
    const limit = automationStudioPageLimit(input.limit, 100);
    if (!router) return { items: [], counts: { total: 0, active: 0, disabled: 0, byGroup: {} }, limit, nextCursor: null, hasMore: false };
    const groupId = input.groupId === undefined ? undefined : input.groupId === null || input.groupId === "ungrouped" ? null : requiredId(input.groupId, "Router group");
    const status = input.status ?? "";
    const search = input.search?.trim().toLowerCase() || "";
    const owner = `router-routes:${router.router_id}`;
    const filterHash = automationStudioFilterHash({ groupId: groupId ?? (input.groupId === undefined ? "*" : null), status, search });
    const cursor = decodeAutomationStudioPageCursor<{ priority: number; routeId: string }>(input.cursor, { owner, filterHash, validate: (values) => Number.isSafeInteger(values.priority) && typeof values.routeId === "string" });
    const where = ["router_id = ?"];
    const params: unknown[] = [router.router_id];
    if (input.groupId !== undefined) groupId === null ? where.push("group_id is null") : (where.push("group_id = ?"), params.push(groupId));
    if (status) { where.push("enabled = ?"); params.push(status === "active" ? 1 : 0); }
    if (search) { where.push("(lower(name) like ? or lower(route_id) like ? or lower(target_subflow_id) like ?)"); const needle = `%${search}%`; params.push(needle, needle, needle); }
    const filterWhere = [...where];
    const filterParams = [...params];
    if (cursor) { where.push("(priority > ? or (priority = ? and route_id > ?))"); params.push(cursor.priority, cursor.priority, cursor.routeId); }
    const result = await this.lease.database.transaction(async (sql) => {
      const rows = await sql.all<RouterRouteRow>(`select * from router_routes where ${where.join(" and ")} order by priority, route_id limit ?`, [...params, limit + 1]);
      const countRows = await sql.all<{ group_id: string | null; enabled: number; total: number }>(`select group_id, enabled, count(*) as total from router_routes where ${filterWhere.join(" and ")} group by group_id, enabled`, filterParams);
      return { rows, countRows };
    });
    const counts: AutomationStudioRouterRouteCounts = { total: 0, active: 0, disabled: 0, byGroup: {} };
    for (const row of result.countRows) {
      counts.total += row.total;
      if (row.enabled) counts.active += row.total; else counts.disabled += row.total;
      const key = row.group_id ?? "ungrouped";
      counts.byGroup[key] = (counts.byGroup[key] ?? 0) + row.total;
    }
    const pageRows = result.rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(routerRouteFromRow),
      counts,
      limit,
      hasMore: result.rows.length > limit,
      nextCursor: result.rows.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { priority: last.priority, routeId: last.route_id } }) : null
    };
  }

  async upsertInstruction(input: Omit<AutomationStudioSqlInstruction, "contentDigest" | "revision" | "createdAt" | "updatedAt" | "deletedAt"> & { contentDigest?: string; revision?: number; createdAt?: number; updatedAt?: number; deletedAt?: number | null }, expectedRevision?: number): Promise<AutomationStudioSqlInstruction> {
    const now = input.updatedAt ?? Date.now();
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<InstructionRow>("select * from instructions where instruction_id = ?", [requiredId(input.instructionId, "Instruction")]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Instruction ${input.instructionId} revision conflict.`);
      const revision = existing ? existing.revision + 1 : positive(input.revision ?? 1, "instruction revision");
      const contentDigest = input.contentDigest ?? digest([input.title, input.inlineBody ?? "", input.bodyObjectId ?? ""]);
      await sql.run(`insert into instructions (instruction_id, title, body_object_id, inline_body, requirement, status, priority, content_digest, revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(instruction_id) do update set title = excluded.title, body_object_id = excluded.body_object_id, inline_body = excluded.inline_body, requirement = excluded.requirement, status = excluded.status, priority = excluded.priority, content_digest = excluded.content_digest, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms, deleted_at_ms = excluded.deleted_at_ms`, [input.instructionId, requiredName(input.title, "Instruction"), optionalId(input.bodyObjectId), input.inlineBody ?? null, input.requirement, input.status, Math.trunc(input.priority), contentDigest, revision, existing?.created_at_ms ?? input.createdAt ?? now, now, input.deletedAt ?? null]);
      await sql.run("delete from instruction_scopes where instruction_id = ?", [input.instructionId]);
      for (const scope of input.scopes) await sql.run("insert into instruction_scopes (instruction_id, scope_kind, project_id, flow_id, router_id, subflow_id, node_id, error_code) values (?, ?, ?, ?, ?, ?, ?, ?)", [input.instructionId, scope.scopeKind, optionalId(scope.projectId), optionalId(scope.flowId), optionalId(scope.routerId), optionalId(scope.subflowId), optionalId(scope.nodeId), scope.errorCode ?? null]);
      await sql.run("delete from instruction_tags where instruction_id = ?", [input.instructionId]);
      for (const tag of unique(input.tags.map((tag) => requiredKind(tag, "instruction tag")))) await sql.run("insert into instruction_tags (instruction_id, tag) values (?, ?)", [input.instructionId, tag]);
      await sql.run("delete from instructions_fts where instruction_id = ?", [input.instructionId]);
      if (input.status !== "deleted") await sql.run("insert into instructions_fts (instruction_id, title, inline_body) values (?, ?, ?)", [input.instructionId, input.title, input.inlineBody ?? ""]);
      await sql.run("delete from effective_instruction_digest_cache");
      return readInstruction(sql, input.instructionId);
    });
  }

  async getInstruction(instructionId: string): Promise<AutomationStudioSqlInstruction | null> {
    const row = await this.lease.database.get<InstructionRow>("select * from instructions where instruction_id = ?", [requiredId(instructionId, "Instruction")]);
    return row ? readInstruction(this.lease.database, row.instruction_id) : null;
  }

  async upsertInstructionBinding(input: Omit<AutomationStudioSqlInstructionBinding, "revision"> & { revision?: number }, expectedRevision?: number): Promise<AutomationStudioSqlInstructionBinding> {
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<InstructionBindingRow>("select * from instruction_bindings where binding_id = ?", [requiredId(input.bindingId, "Instruction binding")]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Instruction binding ${input.bindingId} revision conflict.`);
      const revision = existing ? existing.revision + 1 : positive(input.revision ?? 1, "instruction binding revision");
      await sql.run("insert into instruction_bindings (binding_id, owner_kind, owner_id, instruction_id, sort_key, enabled, revision) values (?, ?, ?, ?, ?, ?, ?) on conflict(binding_id) do update set owner_kind = excluded.owner_kind, owner_id = excluded.owner_id, instruction_id = excluded.instruction_id, sort_key = excluded.sort_key, enabled = excluded.enabled, revision = excluded.revision", [input.bindingId, requiredKind(input.ownerKind, "binding owner kind"), requiredId(input.ownerId, "binding owner"), requiredId(input.instructionId, "Instruction"), input.sortKey, input.enabled ? 1 : 0, revision]);
      return bindingFromRow(required(await sql.get<InstructionBindingRow>("select * from instruction_bindings where binding_id = ?", [input.bindingId]), `Instruction binding ${input.bindingId} was not persisted.`));
    });
  }

  async listInstructionBindings(input: { ownerKind: string; ownerId: string; enabledOnly?: boolean }): Promise<AutomationStudioSqlInstructionBinding[]> {
    const rows = await this.lease.database.all<InstructionBindingRow>(`select * from instruction_bindings where owner_kind = ? and owner_id = ? ${input.enabledOnly ? "and enabled = 1" : ""} order by sort_key, binding_id`, [requiredKind(input.ownerKind, "binding owner kind"), requiredId(input.ownerId, "binding owner")]);
    return rows.map(bindingFromRow);
  }

  async listInstructionsPage(input: { flowId?: string; subflowId?: string; scopeKind?: string; status?: string; search?: string; limit?: number; cursor?: string | null }): Promise<AutomationStudioFlowResourcePage<AutomationStudioSqlInstruction>> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ priority: number; updatedAt: number; instructionId: string }>(input.cursor);
    const params: unknown[] = [];
    const scopeClauses: string[] = [];
    if (input.flowId) { scopeClauses.push("instruction_id in (select instruction_id from instruction_scopes where flow_id = ?)"); params.push(requiredId(input.flowId, "Flow")); }
    if (input.subflowId) { scopeClauses.push("instruction_id in (select instruction_id from instruction_scopes where subflow_id = ?)"); params.push(requiredId(input.subflowId, "Subflow")); }
    if (input.scopeKind) { scopeClauses.push("instruction_id in (select instruction_id from instruction_scopes where scope_kind = ?)"); params.push(requiredKind(input.scopeKind, "instruction scope")); }
    const where = ["deleted_at_ms is null", ...(scopeClauses.length ? [`(${scopeClauses.join(" or ")})`] : [])];
    if (input.status) { where.push("status = ?"); params.push(input.status); }
    if (input.search?.trim()) { where.push("instruction_id in (select instruction_id from instructions_fts where instructions_fts match ?)"); params.push(input.search.trim()); }
    if (cursor) { where.push("(priority < ? or (priority = ? and updated_at_ms < ?) or (priority = ? and updated_at_ms = ? and instruction_id < ?))"); params.push(cursor.priority, cursor.priority, cursor.updatedAt, cursor.priority, cursor.updatedAt, cursor.instructionId); }
    const rows = await this.lease.database.all<InstructionRow>(`select * from instructions where ${where.join(" and ")} order by priority desc, updated_at_ms desc, instruction_id desc limit ?`, [...params, limit + 1]);
    const pageRows = rows.slice(0, limit);
    const items = await Promise.all(pageRows.map((row) => readInstruction(this.lease.database, row.instruction_id)));
    const last = pageRows.at(-1);
    return { items, limit, hasMore: rows.length > limit, nextCursor: rows.length > limit && last ? encodeCursor({ priority: last.priority, updatedAt: last.updated_at_ms, instructionId: last.instruction_id }) : null };
  }

  async listInstructionSummariesPage(input: { flowId?: string; subflowId?: string; scopeKind?: string; status?: string; requirement?: string; search?: string; sort?: "updated" | "title" | "status" | "scope" | "priority"; direction?: "asc" | "desc"; limit?: number; offset?: number } = {}): Promise<AutomationStudioFlowResourceOffsetPage<AutomationStudioSqlInstructionSummary>> {
    const limit = clampLimit(input.limit);
    const offset = clampOffset(input.offset);
    const params: unknown[] = [];
    const scopeClauses: string[] = [];
    if (input.flowId) { scopeClauses.push("instruction_id in (select instruction_id from instruction_scopes where flow_id = ? or scope_kind in ('global', 'project'))"); params.push(requiredId(input.flowId, "Flow")); }
    if (input.subflowId) { scopeClauses.push("instruction_id in (select instruction_id from instruction_scopes where subflow_id = ? or scope_kind in ('global', 'project', 'flow'))"); params.push(requiredId(input.subflowId, "Subflow")); }
    if (input.scopeKind) { scopeClauses.push("instruction_id in (select instruction_id from instruction_scopes where scope_kind = ?)"); params.push(requiredKind(input.scopeKind, "instruction scope")); }
    const where = ["i.deleted_at_ms is null", ...(scopeClauses.length ? [`(${scopeClauses.map((clause) => `i.${clause}`).join(" or ")})`] : [])];
    if (input.status) { where.push("i.status = ?"); params.push(requiredKind(input.status, "instruction status")); }
    if (input.requirement) { where.push("i.requirement = ?"); params.push(requiredKind(input.requirement, "instruction requirement")); }
    if (input.search?.trim()) { where.push("(lower(i.instruction_id) like ? or i.instruction_id in (select instruction_id from instructions_fts where instructions_fts match ?))"); const search = input.search.trim(); params.push(`%${search.toLowerCase()}%`, search); }
    const fromSql = instructionSummaryFromSql();
    const whereSql = where.join(" and ");
    const orderBy = instructionSummaryOrder(input.sort ?? "updated", input.direction ?? "desc");
    const result = await this.lease.database.transaction(async (sql) => {
      const total = await sql.get<{ total: number }>(`select count(*) as total from instructions i where ${whereSql}`, params);
      const rows = await sql.all<InstructionSummaryRow>(`${fromSql} where ${whereSql} ${orderBy} limit ? offset ?`, [...params, limit, offset]);
      return { total: total?.total ?? 0, rows };
    });
    return { items: result.rows.map(instructionSummaryFromRow), total: result.total, limit, offset };
  }

  async resolveEffectiveInstructions(input: { projectId: string; flowId?: string; routerId?: string; subflowId?: string; nodeId?: string; errorCode?: string; limit?: number }): Promise<AutomationStudioEffectiveInstructionSet> {
    const scopeDigest = digest(input);
    const clauses = ["scope_kind = 'global'", "(scope_kind = 'project' and project_id = ?)"];
    const params: unknown[] = [requiredId(input.projectId, "Project")];
    if (input.flowId) { clauses.push("(scope_kind = 'flow' and flow_id = ?)"); params.push(requiredId(input.flowId, "Flow")); }
    if (input.routerId) { clauses.push("(scope_kind = 'router' and router_id = ?)"); params.push(requiredId(input.routerId, "Router")); }
    if (input.subflowId) { clauses.push("(scope_kind = 'subflow' and subflow_id = ?)"); params.push(requiredId(input.subflowId, "Subflow")); }
    if (input.nodeId) { clauses.push("(scope_kind = 'node' and node_id = ?)"); params.push(requiredId(input.nodeId, "Node")); }
    if (input.errorCode) { clauses.push("(scope_kind = 'error' and error_code = ?)"); params.push(input.errorCode); }
    const ids = await this.lease.database.all<{ instruction_id: string }>(`select distinct instruction_id from instruction_scopes where ${clauses.join(" or ")}`, params);
    if (!ids.length) return { scopeDigest, contentDigest: digest([]), maxRevision: 1, instructionIds: [], instructions: [], cached: false };
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await this.lease.database.all<InstructionRow>(`select * from instructions where instruction_id in (${placeholders}) and status = 'active' and deleted_at_ms is null order by priority desc, updated_at_ms desc, instruction_id desc limit ?`, [...ids.map((row) => row.instruction_id), clampLimit(input.limit)]);
    const instructionIds = rows.map((row) => row.instruction_id);
    const maxRevision = Math.max(1, ...rows.map((row) => row.revision));
    const contentDigest = digest(rows.map((row) => [row.instruction_id, row.content_digest, row.revision]));
    const cached = await this.lease.database.get<{ instruction_revision: number; content_digest: string; instruction_ids_json: string }>("select * from effective_instruction_digest_cache where scope_digest = ?", [scopeDigest]);
    const instructions = await Promise.all(instructionIds.map((id) => readInstruction(this.lease.database, id)));
    if (cached?.instruction_revision === maxRevision && cached.content_digest === contentDigest) return { scopeDigest, contentDigest, maxRevision, instructionIds: JSON.parse(cached.instruction_ids_json) as string[], instructions, cached: true };
    await this.lease.database.run("insert into effective_instruction_digest_cache (scope_digest, instruction_revision, content_digest, instruction_ids_json, created_at_ms) values (?, ?, ?, ?, ?) on conflict(scope_digest) do update set instruction_revision = excluded.instruction_revision, content_digest = excluded.content_digest, instruction_ids_json = excluded.instruction_ids_json, created_at_ms = excluded.created_at_ms", [scopeDigest, maxRevision, contentDigest, JSON.stringify(instructionIds), Date.now()]);
    return { scopeDigest, contentDigest, maxRevision, instructionIds, instructions, cached: false };
  }

  async upsertAdaptationPolicy(input: Omit<AutomationStudioSqlAdaptationPolicy, "revision" | "createdAt" | "updatedAt" | "deletedAt"> & { revision?: number; createdAt?: number; updatedAt?: number; deletedAt?: number | null }, expectedRevision?: number): Promise<AutomationStudioSqlAdaptationPolicy> {
    const now = input.updatedAt ?? Date.now();
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<AdaptationPolicyRow>("select * from adaptation_policies where policy_id = ?", [requiredId(input.policyId, "Adaptation policy")]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Adaptation policy ${input.policyId} revision conflict.`);
      const revision = existing ? existing.revision + 1 : positive(input.revision ?? 1, "adaptation policy revision");
      await sql.run(`insert into adaptation_policies (policy_id, project_id, flow_id, subflow_id, preset, proposal_mode, settings_json, revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(policy_id) do update set preset = excluded.preset, proposal_mode = excluded.proposal_mode, settings_json = excluded.settings_json, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms, deleted_at_ms = excluded.deleted_at_ms`, [input.policyId, requiredId(input.projectId, "Project"), requiredId(input.flowId, "Flow"), optionalId(input.subflowId), input.preset, input.proposalMode, json(input.settings), revision, existing?.created_at_ms ?? input.createdAt ?? now, now, input.deletedAt ?? null]);
      return adaptationPolicyFromRow(required(await sql.get<AdaptationPolicyRow>("select * from adaptation_policies where policy_id = ?", [input.policyId]), `Adaptation policy ${input.policyId} was not persisted.`));
    });
  }
}

type FlowRow = { flow_id: string; parent_flow_id: string | null; owning_subflow_id: string | null; name: string; description: string; scope_kind: "global" | "domain"; scope_id: string | null; visibility: AutomationStudioSqlFlowRecord["visibility"]; origin: AutomationStudioSqlFlowRecord["origin"]; source_mode: AutomationStudioSqlFlowRecord["sourceMode"]; status: AutomationStudioSqlFlowRecord["status"]; graph_revision: number; settings_revision: number; compiled_revision: number | null; created_at_ms: number; updated_at_ms: number; deleted_at_ms: number | null };
type FlowSettingsRow = { flow_id: string; intervention_mode: AutomationStudioSqlFlowSettings["interventionMode"] | null; intervention_mode_version: number; execution_defaults_json: string; training_json: string; adaptation_json: string; llm_json: string; safety_json: string; revision: number; updated_at_ms: number };
type PortRow = { port_id: string; direction: "input" | "output"; name: string; value_type: string; required: number; default_value_json: string | null; description: string; sort_key: string; revision: number };
type VariableRow = { variable_id: string; name: string; value_type: string; initial_value_json: string | null; description: string; sort_key: string; revision: number };
type ErrorRow = { error_id: string; code: string; description: string; metadata_json: string; revision: number };
type SubflowCategoryRow = { category_id: string; flow_id: string; parent_category_id: string | null; name: string; sort_key: string; revision: number; created_at_ms: number; updated_at_ms: number };
type SubflowRow = { subflow_id: string; parent_flow_id: string; graph_flow_id: string; parent_category_id: string | null; name: string; description: string; role: string; status: AutomationStudioSqlSubflow["status"]; input_mapping_json: string; output_mapping_json: string; approval_override: AutomationStudioSqlSubflow["approvalOverride"]; revision: number; created_at_ms: number; updated_at_ms: number; deleted_at_ms: number | null };
type RouterRow = { router_id: string; flow_id: string; fallback_kind: AutomationStudioSqlRouter["fallbackKind"]; fallback_subflow_id: string | null; revision: number; created_at_ms: number; updated_at_ms: number };
type RouterGroupRow = { group_id: string; router_id: string; name: string; sort_key: string; revision: number; description: string; order_value: number; status: AutomationStudioSqlRouterGroup["status"]; collapsed: number; created_at_ms: number; updated_at_ms: number; metadata_json: string };
type RouterRouteRow = { route_id: string; router_id: string; group_id: string | null; name: string; priority: number; enabled: number; condition_kind: string; condition_json: string; target_kind: AutomationStudioSqlRouterRoute["targetKind"]; target_subflow_id: string | null; revision: number; created_at_ms: number; updated_at_ms: number };
type InstructionRow = { instruction_id: string; title: string; body_object_id: string | null; inline_body: string | null; requirement: AutomationStudioSqlInstruction["requirement"]; status: AutomationStudioSqlInstruction["status"]; priority: number; content_digest: string; revision: number; created_at_ms: number; updated_at_ms: number; deleted_at_ms: number | null };
type InstructionScopeRow = AutomationStudioSqlInstructionScope;
type InstructionSummaryRow = Omit<InstructionRow, "body_object_id" | "inline_body"> & { scope_kind: AutomationStudioSqlInstructionScope["scopeKind"] | null; project_id: string | null; flow_id: string | null; router_id: string | null; subflow_id: string | null; node_id: string | null; error_code: string | null };
type InstructionBindingRow = { binding_id: string; owner_kind: string; owner_id: string; instruction_id: string; sort_key: string; enabled: number; revision: number };
type AdaptationPolicyRow = { policy_id: string; project_id: string; flow_id: string; subflow_id: string | null; preset: AutomationStudioSqlAdaptationPolicy["preset"]; proposal_mode: AutomationStudioSqlAdaptationPolicy["proposalMode"]; settings_json: string; revision: number; created_at_ms: number; updated_at_ms: number; deleted_at_ms: number | null };

async function readFlow(sql: AutomationStudioSqlExecutor, flowId: string): Promise<AutomationStudioSqlFlowDetail> {
  const row = required(await sql.get<FlowRow>("select * from flows where flow_id = ?", [flowId]), `Unknown Flow: ${flowId}`);
  const [settings, ports, variables, errors] = await Promise.all([sql.get<FlowSettingsRow>("select * from flow_settings where flow_id = ?", [flowId]), sql.all<PortRow>("select * from flow_ports where flow_id = ? order by direction, sort_key, port_id", [flowId]), sql.all<VariableRow>("select * from flow_variables where flow_id = ? order by sort_key, variable_id", [flowId]), sql.all<ErrorRow>("select * from flow_errors where flow_id = ? order by code, error_id", [flowId])]);
  return { ...flowFromRow(row), settings: settings ? settingsFromRow(settings) : null, inputs: ports.filter((port) => port.direction === "input").map(portFromRow), outputs: ports.filter((port) => port.direction === "output").map(portFromRow), variables: variables.map(variableFromRow), errors: errors.map(errorFromRow) };
}
async function readRouter(sql: AutomationStudioSqlExecutor, routerId: string): Promise<AutomationStudioSqlRouter> { const row = required(await sql.get<RouterRow>("select * from routers where router_id = ?", [routerId]), `Unknown Router: ${routerId}`); const [groups, routes] = await Promise.all([sql.all<RouterGroupRow>("select * from router_groups where router_id = ? order by order_value, group_id", [routerId]), sql.all<RouterRouteRow>("select * from router_routes where router_id = ? order by enabled desc, priority desc, route_id", [routerId])]); return { ...routerFromRow(row), groups: groups.map(routerGroupFromRow), routes: routes.map(routerRouteFromRow) }; }
async function readInstruction(sql: AutomationStudioSqlExecutor, instructionId: string): Promise<AutomationStudioSqlInstruction> { const row = required(await sql.get<InstructionRow>("select * from instructions where instruction_id = ?", [instructionId]), `Unknown Instruction: ${instructionId}`); const [scopes, tags] = await Promise.all([sql.all<InstructionScopeRow>("select scope_kind as scopeKind, project_id as projectId, flow_id as flowId, router_id as routerId, subflow_id as subflowId, node_id as nodeId, error_code as errorCode from instruction_scopes where instruction_id = ? order by scope_kind", [instructionId]), sql.all<{ tag: string }>("select tag from instruction_tags where instruction_id = ? order by tag", [instructionId])]); return { instructionId: row.instruction_id, title: row.title, bodyObjectId: row.body_object_id, inlineBody: row.inline_body, requirement: row.requirement, status: row.status, priority: row.priority, contentDigest: row.content_digest, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, deletedAt: row.deleted_at_ms, scopes, tags: tags.map((tag) => tag.tag) }; }
function flowFromRow(row: FlowRow): AutomationStudioSqlFlowRecord { return { flowId: row.flow_id, parentFlowId: row.parent_flow_id, owningSubflowId: row.owning_subflow_id, name: row.name, description: row.description, scopeKind: row.scope_kind, scopeId: row.scope_id, visibility: row.visibility, origin: row.origin, sourceMode: row.source_mode, status: row.status, graphRevision: row.graph_revision, settingsRevision: row.settings_revision, compiledRevision: row.compiled_revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, deletedAt: row.deleted_at_ms }; }
function settingsFromRow(row: FlowSettingsRow): AutomationStudioSqlFlowSettings { const training = object(row.training_json); const adaptation = object(row.adaptation_json); return { interventionMode: row.intervention_mode_version === 1 && row.intervention_mode ? row.intervention_mode : interventionModeFromLegacySettings(training, adaptation), interventionModeVersion: 1, executionDefaults: object(row.execution_defaults_json), training, adaptation, llm: object(row.llm_json), safety: object(row.safety_json), revision: row.revision, updatedAt: row.updated_at_ms }; }

function interventionModeFromLegacySettings(training: JsonObject | undefined, adaptation: JsonObject | undefined): AutomationStudioSqlFlowSettings["interventionMode"] {
  const trainingMode = training?.mode;
  const preset = adaptation?.preset;
  const approval = adaptation?.proposalMode ?? training?.proposalApprovalMode;
  if (trainingMode === "normal" || preset === "locked" || approval === "disabled" || approval === "deterministic") return "no_llm_intervention";
  if (approval === "manual" || approval === "mixed" || approval === "manual_approval" || preset === "observe" || preset === "repair") return "manual_approval";
  return "fully_adaptive";
}
function portFromRow(row: PortRow): AutomationStudioSqlFlowPort { return { portId: row.port_id, direction: row.direction, name: row.name, valueType: parse(row.value_type), required: row.required === 1, defaultValue: row.default_value_json === null ? null : parse(row.default_value_json), description: row.description, sortKey: row.sort_key, revision: row.revision }; }
function variableFromRow(row: VariableRow): AutomationStudioSqlFlowVariable { return { variableId: row.variable_id, name: row.name, valueType: parse(row.value_type), initialValue: row.initial_value_json === null ? null : parse(row.initial_value_json), description: row.description, sortKey: row.sort_key, revision: row.revision }; }
function errorFromRow(row: ErrorRow): AutomationStudioSqlFlowError { return { errorId: row.error_id, code: row.code, description: row.description, metadata: object(row.metadata_json), revision: row.revision }; }
function subflowCategoryFromRow(row: SubflowCategoryRow): AutomationStudioSqlSubflowCategory { return { categoryId: row.category_id, flowId: row.flow_id, parentCategoryId: row.parent_category_id, name: row.name, sortKey: row.sort_key, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function subflowFromRow(row: SubflowRow): AutomationStudioSqlSubflow { return { subflowId: row.subflow_id, parentFlowId: row.parent_flow_id, graphFlowId: row.graph_flow_id, parentCategoryId: row.parent_category_id, name: row.name, description: row.description, role: row.role, status: row.status, inputMapping: parse(row.input_mapping_json), outputMapping: parse(row.output_mapping_json), approvalOverride: row.approval_override, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, deletedAt: row.deleted_at_ms }; }
function instructionSummaryFromRow(row: InstructionSummaryRow): AutomationStudioSqlInstructionSummary { return { instructionId: row.instruction_id, title: row.title, requirement: row.requirement, status: row.status, priority: row.priority, contentDigest: row.content_digest, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, deletedAt: row.deleted_at_ms, scope: row.scope_kind ? { scopeKind: row.scope_kind, projectId: row.project_id, flowId: row.flow_id, routerId: row.router_id, subflowId: row.subflow_id, nodeId: row.node_id, errorCode: row.error_code } : null }; }
function routerFromRow(row: RouterRow): Omit<AutomationStudioSqlRouter, "groups" | "routes"> { return { routerId: row.router_id, flowId: row.flow_id, fallbackKind: row.fallback_kind, fallbackSubflowId: row.fallback_subflow_id, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function routerGroupFromRow(row: RouterGroupRow): AutomationStudioSqlRouterGroup { return { groupId: row.group_id, routerId: row.router_id, name: row.name, description: row.description, order: row.order_value, status: row.status, collapsed: row.collapsed === 1, sortKey: row.sort_key, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, metadata: object(row.metadata_json) }; }
function routerRouteFromRow(row: RouterRouteRow): AutomationStudioSqlRouterRoute { return { routeId: row.route_id, routerId: row.router_id, groupId: row.group_id, name: row.name, priority: row.priority, enabled: row.enabled === 1, conditionKind: row.condition_kind, condition: parse(row.condition_json), targetKind: row.target_kind, targetSubflowId: row.target_subflow_id, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function adaptationPolicyFromRow(row: AdaptationPolicyRow): AutomationStudioSqlAdaptationPolicy { return { policyId: row.policy_id, projectId: row.project_id, flowId: row.flow_id, subflowId: row.subflow_id, preset: row.preset, proposalMode: row.proposal_mode, settings: object(row.settings_json), revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms, deletedAt: row.deleted_at_ms }; }
function bindingFromRow(row: InstructionBindingRow): AutomationStudioSqlInstructionBinding { return { bindingId: row.binding_id, ownerKind: row.owner_kind, ownerId: row.owner_id, instructionId: row.instruction_id, sortKey: row.sort_key, enabled: row.enabled === 1, revision: row.revision }; }
async function replacePorts(sql: AutomationStudioSqlExecutor, flowId: string, inputs: Array<Omit<AutomationStudioSqlFlowPort, "direction" | "revision">>, outputs: Array<Omit<AutomationStudioSqlFlowPort, "direction" | "revision">>): Promise<void> { await sql.run("delete from flow_ports where flow_id = ?", [flowId]); for (const [direction, ports] of [["input", inputs], ["output", outputs]] as const) for (const [index, port] of ports.entries()) await sql.run("insert into flow_ports (port_id, flow_id, direction, name, value_type, required, default_value_json, description, sort_key, revision) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)", [port.portId, flowId, direction, requiredName(port.name, "Flow port"), json(port.valueType), port.required ? 1 : 0, port.defaultValue === null ? null : json(port.defaultValue), port.description, port.sortKey || String(index).padStart(8, "0")]); }
async function replaceVariables(sql: AutomationStudioSqlExecutor, flowId: string, variables: Array<Omit<AutomationStudioSqlFlowVariable, "revision">>): Promise<void> { await sql.run("delete from flow_variables where flow_id = ?", [flowId]); for (const [index, variable] of variables.entries()) await sql.run("insert into flow_variables (variable_id, flow_id, name, value_type, initial_value_json, description, sort_key, revision) values (?, ?, ?, ?, ?, ?, ?, 1)", [variable.variableId, flowId, requiredName(variable.name, "Flow variable"), json(variable.valueType), variable.initialValue === null ? null : json(variable.initialValue), variable.description, variable.sortKey || String(index).padStart(8, "0")]); }
async function replaceErrors(sql: AutomationStudioSqlExecutor, flowId: string, errors: Array<Omit<AutomationStudioSqlFlowError, "revision">>): Promise<void> { await sql.run("delete from flow_errors where flow_id = ?", [flowId]); for (const error of errors) await sql.run("insert into flow_errors (error_id, flow_id, code, description, metadata_json, revision) values (?, ?, ?, ?, ?, 1)", [error.errorId, flowId, requiredKind(error.code, "Flow error code"), error.description, json(error.metadata)]); }
async function deleteMissing(sql: AutomationStudioSqlExecutor, table: "router_groups" | "router_routes", ownerColumn: "router_id", ownerId: string, idColumn: "group_id" | "route_id", ids: string[]): Promise<void> {
  if (!ids.length) {
    await sql.run(`delete from ${table} where ${ownerColumn} = ?`, [ownerId]);
    return;
  }
  await sql.run(`delete from ${table} where ${ownerColumn} = ? and ${idColumn} not in (${ids.map(() => "?").join(", ")})`, [ownerId, ...ids]);
}
function page<TRow, TItem>(rows: TRow[], limit: number, map: (row: TRow) => TItem, cursorFor: (row: TRow) => unknown): AutomationStudioFlowResourcePage<TItem> { const pageRows = rows.slice(0, limit); const last = pageRows.at(-1); return { items: pageRows.map(map), limit, hasMore: rows.length > limit, nextCursor: rows.length > limit && last ? encodeCursor(cursorFor(last)) : null }; }
function clampLimit(value?: number): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 50))); }
function clampOffset(value?: number): number { const normalized = Math.trunc(value ?? 0); return Number.isFinite(normalized) ? Math.max(0, Math.min(10_000_000, normalized)) : 0; }
function directionSql(value: "asc" | "desc"): "asc" | "desc" { return value === "asc" ? "asc" : "desc"; }
function subflowSummaryOrder(sort: "updated" | "name" | "status" | "role", direction: "asc" | "desc"): string { const dir = directionSql(direction); const column = sort === "name" ? "name collate nocase" : sort === "status" ? "status" : sort === "role" ? "role" : "updated_at_ms"; return `order by ${column} ${dir}, subflow_id ${dir}`; }
function instructionSummaryOrder(sort: "updated" | "title" | "status" | "scope" | "priority", direction: "asc" | "desc"): string { const dir = directionSql(direction); const column = sort === "title" ? "i.title collate nocase" : sort === "status" ? "i.status" : sort === "scope" ? "coalesce(s.scope_kind, '')" : sort === "priority" ? "i.priority" : "i.updated_at_ms"; return `order by ${column} ${dir}, i.instruction_id ${dir}`; }
function instructionSummaryFromSql(): string { return `select i.instruction_id, i.title, i.requirement, i.status, i.priority, i.content_digest, i.revision, i.created_at_ms, i.updated_at_ms, i.deleted_at_ms, s.scope_kind, s.project_id, s.flow_id, s.router_id, s.subflow_id, s.node_id, s.error_code from instructions i left join instruction_scopes s on s.rowid = (select scope.rowid from instruction_scopes scope where scope.instruction_id = i.instruction_id order by case scope.scope_kind when 'flow' then 0 when 'subflow' then 1 when 'router' then 2 when 'node' then 3 when 'error' then 4 when 'project' then 5 else 6 end, scope.flow_id, scope.subflow_id limit 1)`; }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T>(value: string | null | undefined): T | null { if (!value) return null; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new Error("Invalid Automation Studio Flow resource cursor."); } }
function parse(value: string): JsonValue { return JSON.parse(value) as JsonValue; }
function object(value: string): JsonObject { const parsed = JSON.parse(value) as unknown; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {}; }
function json(value: unknown): string { return JSON.stringify(value) ?? "null"; }
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`; }
function stableStringify(value: unknown): string { if (value === undefined) return "null"; if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"; if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`; }
function required<T>(value: T | undefined, message: string): T { if (value === undefined) throw new Error(message); return value; }
function requiredId(value: string | null | undefined, kind: string): string { const id = value?.trim() ?? ""; if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function optionalId(value: string | null | undefined): string | null { const id = value?.trim(); return id ? requiredId(id, "optional resource") : null; }
function requiredKind(value: string, kind: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${kind}.`); return normalized; }
function requiredName(value: string, kind: string): string { const name = value.trim(); if (!name || name.length > 200) throw new Error(`${kind} name is required and must not exceed 200 characters.`); return name; }
function positive(value: number, kind: string): number { const number = Math.trunc(value); if (number < 1) throw new Error(`${kind} must be positive.`); return number; }
function unique(values: string[]): string[] { return Array.from(new Set(values)); }
