import { createHash } from "node:crypto";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { AutomationStudioProjectUnitOfWork, type AutomationStudioIdempotentMutationResult } from "./project-unit-of-work.ts";
import type { AutomationStudioSqlFlowRecord, AutomationStudioSqlInstructionScope, AutomationStudioSqlSubflow } from "./project-flow-resource-repository.ts";

export class AutomationStudioProjectFlowResourceMutations {
  private constructor(private readonly unit: AutomationStudioProjectUnitOfWork) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectFlowResourceMutations> {
    return new AutomationStudioProjectFlowResourceMutations(await AutomationStudioProjectUnitOfWork.open(input));
  }

  close(): Promise<void> { return this.unit.close(); }

  createFlow(input: { mutationId: string; flowId: string; name: string; description?: string; scopeKind?: "global" | "domain"; scopeId?: string | null; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<{ flowId: string; revision: number }>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: "flow.create", ownerKind: "flow", ownerId: input.flowId, request: withoutChangedAt(input), ...changedAt(input.changedAt) }, async (context) => {
      await insertFlow(context.sql, { flowId: input.flowId, name: input.name, description: input.description ?? "", scopeKind: input.scopeKind ?? "global", scopeId: input.scopeId ?? null, changedAt: context.changedAt });
      await context.recordChange({ entityKind: "flow", entityId: input.flowId, operation: "create", revision: 1 });
      return { flowId: input.flowId, revision: 1 };
    });
  }

  updateFlowSettings(input: { mutationId: string; flowId: string; expectedRevision: number; interventionMode?: "fully_adaptive" | "manual_approval" | "no_llm_intervention"; executionDefaults?: JsonObject; training?: JsonObject; adaptation?: JsonObject; llm?: JsonObject; safety?: JsonObject; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<{ flowId: string; revision: number }>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: "flow.settings.update", ownerKind: "flow", ownerId: input.flowId, request: withoutChangedAt(input), ...changedAt(input.changedAt) }, async (context) => {
      const current = await context.sql.get<SettingsRow>("select * from flow_settings where flow_id = ?", [requiredId(input.flowId, "Flow")]);
      if (!current) throw new Error(`Unknown Flow settings: ${input.flowId}`);
      if (current.revision !== input.expectedRevision) throw new Error(`Flow ${input.flowId} settings revision conflict.`);
      const revision = current.revision + 1;
      const interventionMode = input.interventionMode ?? canonicalInterventionMode(current);
      await context.sql.run("update flow_settings set intervention_mode = ?, intervention_mode_version = 1, execution_defaults_json = ?, training_json = ?, adaptation_json = ?, llm_json = ?, safety_json = ?, revision = ?, updated_at_ms = ? where flow_id = ?", [interventionMode, json(input.executionDefaults ?? object(current.execution_defaults_json)), json(input.training ?? object(current.training_json)), json(input.adaptation ?? object(current.adaptation_json)), json(input.llm ?? object(current.llm_json)), json(input.safety ?? object(current.safety_json)), revision, context.changedAt, input.flowId]);
      await context.sql.run("update flows set settings_revision = ?, updated_at_ms = ? where flow_id = ?", [revision, context.changedAt, input.flowId]);
      await context.recordChange({ entityKind: "flow_settings", entityId: input.flowId, operation: "update", revision });
      return { flowId: input.flowId, revision };
    });
  }

  createSubflow(input: { mutationId: string; subflowId: string; parentFlowId: string; graphFlowId: string; categoryId?: string | null; name: string; role?: string; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<{ subflowId: string; revision: number }>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: "subflow.create", ownerKind: "flow", ownerId: input.parentFlowId, request: withoutChangedAt(input), ...changedAt(input.changedAt) }, async (context) => {
      await context.sql.run("insert into subflows (subflow_id, parent_flow_id, graph_flow_id, parent_category_id, name, description, role, status, input_mapping_json, output_mapping_json, approval_override, revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, ?, ?, ?, ?, '', ?, 'active', '[]', '[]', null, 1, ?, ?, null)", [requiredId(input.subflowId, "Subflow"), requiredId(input.parentFlowId, "parent Flow"), requiredId(input.graphFlowId, "graph Flow"), input.categoryId ?? null, requiredName(input.name, "Subflow"), input.role ?? "utility", context.changedAt, context.changedAt]);
      await context.recordChange({ entityKind: "subflow", entityId: input.subflowId, operation: "create", revision: 1 });
      await context.recordTouchedEntity({ entityKind: "flow_subflows", entityId: input.parentFlowId, operation: "touch" });
      return { subflowId: input.subflowId, revision: 1 };
    });
  }

  saveInstruction(input: { mutationId: string; instructionId: string; title: string; body: string; scopes: AutomationStudioSqlInstructionScope[]; tags?: string[]; priority?: number; requirement?: "guidance" | "required" | "forbidden"; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<{ instructionId: string; revision: number }>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: "instruction.save", ownerKind: "instruction", ownerId: input.instructionId, request: withoutChangedAt(input), ...changedAt(input.changedAt) }, async (context) => {
      const current = await context.sql.get<{ revision: number; created_at_ms: number }>("select revision, created_at_ms from instructions where instruction_id = ?", [requiredId(input.instructionId, "Instruction")]);
      const revision = current ? current.revision + 1 : 1;
      await context.sql.run("insert into instructions (instruction_id, title, body_object_id, inline_body, requirement, status, priority, content_digest, revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, ?, null, ?, ?, 'active', ?, ?, ?, ?, ?, null) on conflict(instruction_id) do update set title = excluded.title, inline_body = excluded.inline_body, requirement = excluded.requirement, priority = excluded.priority, content_digest = excluded.content_digest, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms", [input.instructionId, requiredName(input.title, "Instruction"), input.body, input.requirement ?? "guidance", Math.trunc(input.priority ?? 50), sha([input.title, input.body]), revision, current?.created_at_ms ?? context.changedAt, context.changedAt]);
      await context.sql.run("delete from instruction_scopes where instruction_id = ?", [input.instructionId]);
      for (const scope of input.scopes) await context.sql.run("insert into instruction_scopes (instruction_id, scope_kind, project_id, flow_id, router_id, subflow_id, node_id, error_code) values (?, ?, ?, ?, ?, ?, ?, ?)", [input.instructionId, scope.scopeKind, scope.projectId, scope.flowId, scope.routerId, scope.subflowId, scope.nodeId, scope.errorCode]);
      await context.sql.run("delete from instruction_tags where instruction_id = ?", [input.instructionId]);
      for (const tag of [...new Set(input.tags ?? [])]) await context.sql.run("insert into instruction_tags (instruction_id, tag) values (?, ?)", [input.instructionId, tag]);
      await context.sql.run("delete from instructions_fts where instruction_id = ?", [input.instructionId]);
      await context.sql.run("insert into instructions_fts (instruction_id, title, inline_body) values (?, ?, ?)", [input.instructionId, input.title, input.body]);
      await context.sql.run("delete from effective_instruction_digest_cache").catch(() => undefined);
      await context.recordChange({ entityKind: "instruction", entityId: input.instructionId, operation: current ? "update" : "create", revision });
      return { instructionId: input.instructionId, revision };
    });
  }

  deleteResource(input: { mutationId: string; entityKind: "flow" | "subflow" | "instruction" | "router_route" | "subflow_category" | "adaptation_policy"; entityId: string; expectedRevision?: number; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<{ entityKind: string; entityId: string; deleted: boolean }>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: `${input.entityKind}.delete`, ownerKind: input.entityKind, ownerId: input.entityId, request: withoutChangedAt(input), ...changedAt(input.changedAt) }, async (context) => {
      const changed = await markDeleted(context.sql, input, context.changedAt);
      await context.recordChange({ entityKind: input.entityKind, entityId: input.entityId, operation: "delete", revision: changed.revision });
      return { entityKind: input.entityKind, entityId: input.entityId, deleted: changed.deleted };
    });
  }
}

type SettingsRow = { intervention_mode: string | null; intervention_mode_version: number; execution_defaults_json: string; training_json: string; adaptation_json: string; llm_json: string; safety_json: string; revision: number };

async function insertFlow(sql: AutomationStudioSqlExecutor, input: { flowId: string; name: string; description: string; scopeKind: AutomationStudioSqlFlowRecord["scopeKind"]; scopeId: string | null; changedAt: number }): Promise<void> {
  await sql.run("insert into flows (flow_id, parent_flow_id, owning_subflow_id, name, description, scope_kind, scope_id, visibility, origin, source_mode, status, graph_revision, settings_revision, compiled_revision, created_at_ms, updated_at_ms, deleted_at_ms) values (?, null, null, ?, ?, ?, ?, 'private', 'user', 'visual', 'draft', 1, 1, null, ?, ?, null)", [requiredId(input.flowId, "Flow"), requiredName(input.name, "Flow"), input.description, input.scopeKind, input.scopeId, input.changedAt, input.changedAt]);
  await sql.run("insert into flow_settings (flow_id, intervention_mode, intervention_mode_version, execution_defaults_json, training_json, adaptation_json, llm_json, safety_json, revision, updated_at_ms) values (?, 'fully_adaptive', 1, '{}', '{}', '{}', '{}', '{}', 1, ?)", [input.flowId, input.changedAt]);
}

function canonicalInterventionMode(row: SettingsRow): "fully_adaptive" | "manual_approval" | "no_llm_intervention" {
  if (row.intervention_mode_version === 1 && (row.intervention_mode === "fully_adaptive" || row.intervention_mode === "manual_approval" || row.intervention_mode === "no_llm_intervention")) return row.intervention_mode;
  const adaptation = object(row.adaptation_json) as Record<string, unknown>;
  if (adaptation.adaptationMode === "manual_approval" || adaptation.proposalMode === "manual" || adaptation.approvalMode === "manual") return "manual_approval";
  if (adaptation.adaptationMode === "no_llm_intervention" || adaptation.enabled === false || adaptation.allowLlm === false || adaptation.preset === "locked") return "no_llm_intervention";
  return "fully_adaptive";
}

async function markDeleted(sql: AutomationStudioSqlExecutor, input: { entityKind: string; entityId: string; expectedRevision?: number }, changedAt: number): Promise<{ deleted: boolean; revision: number }> {
  const table = tableForDelete(input.entityKind);
  const idColumn = idColumnForDelete(input.entityKind);
  const row = await sql.get<{ revision: number }>(`select revision from ${table} where ${idColumn} = ?`, [requiredId(input.entityId, input.entityKind)]);
  if (!row) return { deleted: false, revision: 1 };
  if (input.expectedRevision !== undefined && row.revision !== input.expectedRevision) throw new Error(`${input.entityKind} ${input.entityId} revision conflict.`);
  if (table === "router_routes") await sql.run(`delete from ${table} where ${idColumn} = ?`, [input.entityId]);
  else if (table === "subflow_categories") await sql.run(`delete from ${table} where ${idColumn} = ?`, [input.entityId]);
  else await sql.run(`update ${table} set deleted_at_ms = ?, revision = revision + 1 where ${idColumn} = ?`, [changedAt, input.entityId]);
  if (table === "instructions") await sql.run("delete from instructions_fts where instruction_id = ?", [input.entityId]);
  return { deleted: true, revision: row.revision + 1 };
}

function tableForDelete(kind: string): string { if (kind === "flow") return "flows"; if (kind === "subflow") return "subflows"; if (kind === "instruction") return "instructions"; if (kind === "router_route") return "router_routes"; if (kind === "subflow_category") return "subflow_categories"; if (kind === "adaptation_policy") return "adaptation_policies"; throw new Error(`Unsupported resource kind: ${kind}`); }
function idColumnForDelete(kind: string): string { if (kind === "flow") return "flow_id"; if (kind === "subflow") return "subflow_id"; if (kind === "instruction") return "instruction_id"; if (kind === "router_route") return "route_id"; if (kind === "subflow_category") return "category_id"; if (kind === "adaptation_policy") return "policy_id"; throw new Error(`Unsupported resource kind: ${kind}`); }
function object(value: string): JsonObject { const parsed = JSON.parse(value) as unknown; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {}; }
function json(value: JsonObject): string { return JSON.stringify(value); }
function sha(value: JsonValue): string { return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function requiredName(value: string, kind: string): string { const name = value.trim(); if (!name || name.length > 200) throw new Error(`${kind} name is required and must not exceed 200 characters.`); return name; }
function changedAt(value: number | undefined): { changedAt: number } | {} { return value === undefined ? {} : { changedAt: value }; }
function withoutChangedAt<T extends { changedAt?: number }>(input: T): Omit<T, "changedAt"> { const copy: Partial<T> = { ...input }; delete copy.changedAt; return copy as Omit<T, "changedAt">; }
