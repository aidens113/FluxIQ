import type { JsonObject } from "../../../core/index.ts";
import {
  AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION,
  assertAutomationStudioCompiledPlan,
  compileAutomationStudioPlan,
  runAutomationStudioCompiledPlan,
  type AutomationStudioCompiledPlan,
  type AutomationStudioCompiledPlanEdge,
  type AutomationStudioCompiledPlanInstruction,
  type AutomationStudioCompiledPlanNode
} from "../runtime/compiled-plan.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../runtime/executor.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

export type AutomationStudioCompiledArtifactManifest = {
  artifactId: string;
  flowId: string;
  flowRevision: number;
  compilerVersion: string;
  objectId: string;
  digest: string;
  status: "pending" | "ready" | "failed";
  createdAt: number;
};

export type AutomationStudioLoadedCompiledPlan = {
  manifest: AutomationStudioCompiledArtifactManifest;
  plan: AutomationStudioCompiledPlan;
  cached: boolean;
};

export type AutomationStudioRuntimeStartFromCompiledPlan = {
  runId: string;
  manifest: AutomationStudioCompiledArtifactManifest;
  trace: AutomationStudioGraphExecutionTrace;
};

export type AutomationStudioSafePointAdoption = {
  adoptionId: string;
  runId: string;
  fromArtifactId: string;
  toArtifactId: string;
  safePointSequence: number;
  adaptationId: string | null;
  reason: string;
  adoptedAt: number;
};

export type AutomationStudioCompiledPlanStoreOptions = {
  pool: AutomationStudioProjectDatabasePool;
  projectId: string;
  maxCachedBytes?: number;
  onSql?: (sql: string) => void;
};

export class AutomationStudioProjectCompiledPlanStore {
  private readonly cache: CompiledPlanDigestCache;
  private readonly onSql: ((sql: string) => void) | undefined;

  private constructor(
    private readonly lease: AutomationStudioProjectDatabaseLease,
    private readonly content: AutomationStudioProjectContentStore,
    input: { maxCachedBytes: number; onSql?: (sql: string) => void }
  ) {
    this.cache = new CompiledPlanDigestCache(input.maxCachedBytes);
    this.onSql = input.onSql;
  }

  static async open(input: AutomationStudioCompiledPlanStoreOptions): Promise<AutomationStudioProjectCompiledPlanStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      const content = await AutomationStudioProjectContentStore.open({ pool: input.pool, projectId: input.projectId });
      return new AutomationStudioProjectCompiledPlanStore(lease, content, { maxCachedBytes: Math.max(1, Math.trunc(input.maxCachedBytes ?? 4 * 1024 * 1024)), ...(input.onSql ? { onSql: input.onSql } : {}) });
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.content.close();
    await this.lease.release();
  }

  async enqueueCompileJob(input: { flowId: string; flowRevision: number; compilerVersion?: string; priority?: number; availableAt?: number; createdAt?: number }): Promise<{ jobId: string }> {
    const compilerVersion = input.compilerVersion ?? AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION;
    const jobId = compileJobId(input.flowId, input.flowRevision, compilerVersion);
    const now = input.createdAt ?? Date.now();
    await this.run(
      `insert into background_jobs (job_id, kind, owner_kind, owner_id, status, priority, available_at_ms, created_at_ms, updated_at_ms)
       values (?, 'compiled_plan.compile', 'flow', ?, 'pending', ?, ?, ?, ?)
       on conflict(job_id) do update set status = case when background_jobs.status = 'done' then 'done' else 'pending' end,
         priority = excluded.priority, available_at_ms = excluded.available_at_ms, updated_at_ms = excluded.updated_at_ms`,
      [jobId, requiredId(input.flowId, "flow"), Math.trunc(input.priority ?? 0), input.availableAt ?? now, now, now]
    );
    return { jobId };
  }

  async processNextCompileJob(input: { now?: number } = {}): Promise<AutomationStudioCompiledArtifactManifest | null> {
    const now = input.now ?? Date.now();
    const job = await this.get<BackgroundJobRow>(
      "select * from background_jobs where kind = 'compiled_plan.compile' and status = 'pending' and available_at_ms <= ? order by available_at_ms, priority desc, created_at_ms, job_id limit 1",
      [now]
    );
    if (!job) return null;
    await this.run("update background_jobs set status = 'running', attempts = attempts + 1, started_at_ms = ?, updated_at_ms = ? where job_id = ?", [now, now, job.job_id]);
    try {
      const parsed = parseCompileJobId(job.job_id);
      const manifest = await this.compileFlowRevision({ flowId: parsed.flowId, flowRevision: parsed.flowRevision, compilerVersion: parsed.compilerVersion, compiledAt: now });
      await this.run("update background_jobs set status = 'done', output_object_id = ?, finished_at_ms = ?, updated_at_ms = ?, error_json = null where job_id = ?", [manifest.objectId, now, now, job.job_id]);
      return manifest;
    } catch (error) {
      await this.run("update background_jobs set status = 'failed', error_json = ?, finished_at_ms = ?, updated_at_ms = ? where job_id = ?", [JSON.stringify({ message: error instanceof Error ? error.message : String(error) }).slice(0, 4_000), now, now, job.job_id]);
      throw error;
    }
  }

  async compileFlowRevision(input: { flowId: string; flowRevision?: number; compilerVersion?: string; compiledAt?: number }): Promise<AutomationStudioCompiledArtifactManifest> {
    const flow = await this.get<FlowRow>("select * from flows where flow_id = ? and deleted_at_ms is null", [requiredId(input.flowId, "flow")]);
    if (!flow) throw new Error(`Flow ${input.flowId} was not found for compilation.`);
    const flowRevision = positiveInteger(input.flowRevision ?? flow.graph_revision, "flow revision");
    if (flow.graph_revision !== flowRevision) throw new Error(`Flow ${input.flowId} is at graph revision ${flow.graph_revision}, not requested revision ${flowRevision}.`);
    const compilerVersion = input.compilerVersion ?? AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION;
    const existing = await this.getCompiledArtifact({ flowId: flow.flow_id, flowRevision, compilerVersion });
    if (existing?.status === "ready") return existing;
    const [nodes, edges, settings, revision, instructions] = await Promise.all([
      this.all<NodeRow>("select * from graph_nodes where flow_id = ? and deleted_at_ms is null order by node_id", [flow.flow_id]),
      this.all<EdgeRow>("select * from graph_edges where flow_id = ? and deleted_at_ms is null order by source_node_id, source_port_id, target_node_id, edge_id", [flow.flow_id]),
      this.get<SettingsRow>("select * from flow_settings where flow_id = ?", [flow.flow_id]),
      this.get<GraphRevisionRow>("select * from graph_revisions where flow_id = ? and revision_number = ?", [flow.flow_id, flowRevision]),
      this.resolveCompileTimeInstructions(flow.flow_id)
    ]);
    const planInput = {
      projectId: this.lease.projectId,
      flowId: flow.flow_id,
      flowRevision,
      graphRevision: flow.graph_revision,
      settingsRevision: settings?.revision ?? flow.settings_revision,
      instructionRevision: Math.max(1, ...instructions.map((instruction) => instruction.revision)),
      compilerVersion,
      nodes: nodes.map(nodeFromRow),
      edges: edges.map(edgeFromRow),
      resolvedSettings: settingsFromRow(settings),
      resolvedInstructions: instructions,
      dependencies: dependencyList(nodes, instructions),
      ...(input.compiledAt !== undefined ? { compiledAt: input.compiledAt } : {}),
      ...(revision?.revision_id ? { graphRevisionId: revision.revision_id } : {}),
      ...(revision?.digest ? { graphDigest: revision.digest } : {})
    };
    const plan = compileAutomationStudioPlan(planInput);
    const artifactId = compiledArtifactId(flow.flow_id, flowRevision, compilerVersion);
    const written = await this.content.putJson({
      value: plan,
      transactionId: pathSafeTransactionId(artifactId),
      owner: { ownerKind: "compiled_artifact", ownerId: artifactId, purpose: "compiled_plan" },
      createdAt: plan.compiledAt
    });
    await this.run(
      `insert into compiled_artifacts (artifact_id, flow_id, flow_revision, compiler_version, object_id, digest, status, created_at_ms)
       values (?, ?, ?, ?, ?, ?, 'ready', ?)
       on conflict(flow_id, flow_revision, compiler_version) do update set object_id = excluded.object_id, digest = excluded.digest, status = 'ready'`,
      [artifactId, flow.flow_id, flowRevision, compilerVersion, written.object.objectId, written.object.sha256, plan.compiledAt]
    );
    const saved = await this.getCompiledArtifactById(artifactId);
    if (!saved) throw new Error(`Compiled artifact ${artifactId} was not persisted.`);
    this.cache.set(saved.digest, plan);
    return saved;
  }

  async getCompiledArtifact(input: { flowId: string; flowRevision: number; compilerVersion?: string }): Promise<AutomationStudioCompiledArtifactManifest | null> {
    const row = await this.get<CompiledArtifactRow>("select * from compiled_artifacts where flow_id = ? and flow_revision = ? and compiler_version = ?", [requiredId(input.flowId, "flow"), positiveInteger(input.flowRevision, "flow revision"), input.compilerVersion ?? AUTOMATION_STUDIO_COMPILED_PLAN_COMPILER_VERSION]);
    return row ? manifestFromRow(row) : null;
  }

  async getCompiledArtifactById(artifactId: string): Promise<AutomationStudioCompiledArtifactManifest | null> {
    const row = await this.get<CompiledArtifactRow>("select * from compiled_artifacts where artifact_id = ?", [requiredId(artifactId, "compiled artifact")]);
    return row ? manifestFromRow(row) : null;
  }

  async loadCompiledPlan(artifactId: string): Promise<AutomationStudioLoadedCompiledPlan> {
    const manifest = await this.getCompiledArtifactById(artifactId);
    if (!manifest || manifest.status !== "ready") throw new Error(`Compiled artifact ${artifactId} is not ready.`);
    const cached = this.cache.get(manifest.digest);
    if (cached) return { manifest, plan: cached, cached: true };
    const content = await this.content.readBytesBySha256(manifest.digest);
    const parsed = JSON.parse(content.content.toString("utf8")) as unknown;
    assertAutomationStudioCompiledPlan(parsed);
    this.cache.set(manifest.digest, parsed);
    return { manifest, plan: parsed, cached: false };
  }

  async startRunFromArtifact(input: { artifactId: string; runId: string; triggerKind?: string; queuedAt?: number; startedAt?: number; options?: AutomationStudioGraphExecutionOptions }): Promise<AutomationStudioRuntimeStartFromCompiledPlan> {
    const loaded = await this.loadCompiledPlan(input.artifactId);
    return this.startRunFromLoadedPlan({ ...input, loaded });
  }

  async startRunFromLoadedPlan(input: { loaded: AutomationStudioLoadedCompiledPlan; runId: string; triggerKind?: string; queuedAt?: number; startedAt?: number; options?: AutomationStudioGraphExecutionOptions }): Promise<AutomationStudioRuntimeStartFromCompiledPlan> {
    const now = input.startedAt ?? Date.now();
    await this.run(
      `insert into runtime_runs (run_id, flow_id, flow_revision, compiled_artifact_id, status, trigger_kind, queued_at_ms, started_at_ms, updated_at_ms)
       values (?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
      [requiredId(input.runId, "run"), input.loaded.manifest.flowId, input.loaded.manifest.flowRevision, input.loaded.manifest.artifactId, input.triggerKind ?? "manual", input.queuedAt ?? now, now, now]
    );
    const trace = await runAutomationStudioCompiledPlan(input.loaded.plan, input.options ?? {});
    await this.run("update runtime_runs set status = ?, finished_at_ms = ?, action_count = ?, effect_count = ?, error_count = ?, updated_at_ms = ? where run_id = ?", [runtimeStatus(trace.status), trace.finishedAt ?? now, trace.attempts.length, trace.effects.length, trace.status === "failed" ? 1 : 0, trace.finishedAt ?? now, input.runId]);
    return { runId: input.runId, manifest: input.loaded.manifest, trace };
  }

  async recordSafePointAdoption(input: { adoptionId: string; runId: string; fromArtifactId: string; toArtifactId: string; safePointSequence: number; adaptationId?: string | null; reason?: string; adoptedAt?: number }): Promise<AutomationStudioSafePointAdoption> {
    await this.run(
      `insert into compiled_plan_adoptions (adoption_id, run_id, from_artifact_id, to_artifact_id, safe_point_sequence, adaptation_id, reason, adopted_at_ms)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [requiredId(input.adoptionId, "compiled plan adoption"), requiredId(input.runId, "run"), requiredId(input.fromArtifactId, "compiled artifact"), requiredId(input.toArtifactId, "compiled artifact"), nonNegativeInteger(input.safePointSequence, "safe point sequence"), input.adaptationId ?? null, input.reason ?? "", input.adoptedAt ?? Date.now()]
    );
    const saved = await this.get<AdoptionRow>("select * from compiled_plan_adoptions where adoption_id = ?", [input.adoptionId]);
    if (!saved) throw new Error(`Compiled plan adoption ${input.adoptionId} was not persisted.`);
    return adoptionFromRow(saved);
  }

  cacheStats(): { entries: number; byteCount: number; maxBytes: number } {
    return this.cache.stats();
  }

  private async resolveCompileTimeInstructions(flowId: string): Promise<AutomationStudioCompiledPlanInstruction[]> {
    const rows = await this.all<InstructionRow>(
      `select distinct i.*, coalesce(s.scope_kind, b.owner_kind, 'project') as resolved_scope_kind
       from instructions i
       left join instruction_scopes s on s.instruction_id = i.instruction_id
       left join instruction_bindings b on b.instruction_id = i.instruction_id and b.enabled = 1
       where i.deleted_at_ms is null and i.status = 'active' and (
         s.scope_kind in ('global', 'project') or s.flow_id = ? or (b.owner_kind = 'flow' and b.owner_id = ?)
       )
       order by i.priority desc, i.instruction_id`,
      [flowId, flowId]
    );
    return rows.map((row) => ({
      instructionId: row.instruction_id,
      title: row.title,
      body: row.inline_body ?? "",
      scopeKind: row.resolved_scope_kind,
      requirement: row.requirement,
      priority: row.priority,
      revision: row.revision,
      contentDigest: row.content_digest
    }));
  }

  private async run(sql: string, params: readonly unknown[] = []) {
    this.onSql?.(sql);
    return this.lease.database.run(sql, params);
  }

  private async get<T>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    this.onSql?.(sql);
    return this.lease.database.get<T>(sql, params);
  }

  private async all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    this.onSql?.(sql);
    return this.lease.database.all<T>(sql, params);
  }
}

type FlowRow = { flow_id: string; graph_revision: number; settings_revision: number };
type SettingsRow = { execution_defaults_json: string; training_json: string; adaptation_json: string; llm_json: string; safety_json: string; revision: number };
type NodeRow = { node_id: string; definition_id: string; definition_version: string; label: string; parameter_values_json: string; metadata_json: string };
type EdgeRow = { edge_id: string; source_node_id: string; target_node_id: string; source_port_id: string | null; target_port_id: string | null; label: string; metadata_json: string };
type GraphRevisionRow = { revision_id: string; digest: string };
type InstructionRow = { instruction_id: string; title: string; inline_body: string | null; requirement: string; priority: number; revision: number; content_digest: string; resolved_scope_kind: string };
type CompiledArtifactRow = { artifact_id: string; flow_id: string; flow_revision: number; compiler_version: string; object_id: string; digest: string; status: "pending" | "ready" | "failed"; created_at_ms: number };
type AdoptionRow = { adoption_id: string; run_id: string; from_artifact_id: string; to_artifact_id: string; safe_point_sequence: number; adaptation_id: string | null; reason: string; adopted_at_ms: number };
type BackgroundJobRow = { job_id: string };

class CompiledPlanDigestCache {
  private readonly values = new Map<string, { plan: AutomationStudioCompiledPlan; bytes: number }>();
  private byteCount = 0;

  constructor(private readonly maxBytes: number) {}

  get(digest: string): AutomationStudioCompiledPlan | null {
    const existing = this.values.get(digest);
    if (!existing) return null;
    this.values.delete(digest);
    this.values.set(digest, existing);
    return existing.plan;
  }

  set(digest: string, plan: AutomationStudioCompiledPlan): void {
    const bytes = Buffer.byteLength(JSON.stringify(plan), "utf8");
    const existing = this.values.get(digest);
    if (existing) this.byteCount -= existing.bytes;
    this.values.delete(digest);
    if (bytes <= this.maxBytes) {
      this.values.set(digest, { plan, bytes });
      this.byteCount += bytes;
    }
    while (this.byteCount > this.maxBytes) {
      const first = this.values.keys().next().value as string | undefined;
      if (!first) break;
      const removed = this.values.get(first);
      this.values.delete(first);
      this.byteCount -= removed?.bytes ?? 0;
    }
  }

  stats(): { entries: number; byteCount: number; maxBytes: number } {
    return { entries: this.values.size, byteCount: this.byteCount, maxBytes: this.maxBytes };
  }
}

function nodeFromRow(row: NodeRow): AutomationStudioCompiledPlanNode {
  return { id: row.node_id, definitionId: row.definition_id, definitionVersion: row.definition_version, label: row.label, parameterValues: parseJsonObject(row.parameter_values_json), metadata: parseJsonObject(row.metadata_json) };
}

function edgeFromRow(row: EdgeRow): AutomationStudioCompiledPlanEdge {
  return { id: row.edge_id, sourceNodeId: row.source_node_id, targetNodeId: row.target_node_id, sourcePortId: row.source_port_id, targetPortId: row.target_port_id, label: row.label, metadata: parseJsonObject(row.metadata_json) };
}

function settingsFromRow(row: SettingsRow | undefined): JsonObject {
  if (!row) return {};
  return {
    executionDefaults: parseJsonObject(row.execution_defaults_json),
    training: parseJsonObject(row.training_json),
    adaptation: parseJsonObject(row.adaptation_json),
    llm: parseJsonObject(row.llm_json),
    safety: parseJsonObject(row.safety_json)
  };
}

function dependencyList(nodes: NodeRow[], instructions: AutomationStudioCompiledPlanInstruction[]): Array<{ kind: string; id: string; revision?: number; digest?: string }> {
  const definitions = new Map<string, { kind: string; id: string; revision?: number; digest?: string }>();
  for (const node of nodes) {
    const parsedRevision = Number.parseInt(node.definition_version, 10);
    definitions.set(`node_definition:${node.definition_id}:${node.definition_version}`, Number.isFinite(parsedRevision) ? { kind: "node_definition", id: node.definition_id, revision: parsedRevision } : { kind: "node_definition", id: node.definition_id });
  }
  for (const instruction of instructions) definitions.set(`instruction:${instruction.instructionId}`, { kind: "instruction", id: instruction.instructionId, revision: instruction.revision, digest: instruction.contentDigest });
  return [...definitions.values()];
}

function manifestFromRow(row: CompiledArtifactRow): AutomationStudioCompiledArtifactManifest {
  return { artifactId: row.artifact_id, flowId: row.flow_id, flowRevision: row.flow_revision, compilerVersion: row.compiler_version, objectId: row.object_id, digest: row.digest, status: row.status, createdAt: row.created_at_ms };
}

function adoptionFromRow(row: AdoptionRow): AutomationStudioSafePointAdoption {
  return { adoptionId: row.adoption_id, runId: row.run_id, fromArtifactId: row.from_artifact_id, toArtifactId: row.to_artifact_id, safePointSequence: row.safe_point_sequence, adaptationId: row.adaptation_id, reason: row.reason, adoptedAt: row.adopted_at_ms };
}

function runtimeStatus(status: AutomationStudioGraphExecutionTrace["status"]): "running" | "succeeded" | "failed" | "cancelled" {
  if (status === "succeeded" || status === "failed" || status === "cancelled") return status;
  return "running";
}

function parseJsonObject(value: string): JsonObject {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as JsonObject;
}

function compiledArtifactId(flowId: string, flowRevision: number, compilerVersion: string): string {
  return `compiled:${requiredId(flowId, "flow")}:${positiveInteger(flowRevision, "flow revision")}:${requiredId(compilerVersion, "compiler")}`;
}

function compileJobId(flowId: string, flowRevision: number, compilerVersion: string): string {
  return `job:${compiledArtifactId(flowId, flowRevision, compilerVersion)}`;
}

function pathSafeTransactionId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, ".");
}

function parseCompileJobId(jobId: string): { flowId: string; flowRevision: number; compilerVersion: string } {
  const [prefix, kind, flowId, revision, compilerVersion] = jobId.split(":");
  if (prefix !== "job" || kind !== "compiled" || !flowId || !revision || !compilerVersion) throw new Error(`Invalid compiled-plan job ID: ${jobId}`);
  return { flowId, flowRevision: positiveInteger(Number.parseInt(revision, 10), "flow revision"), compilerVersion };
}

function requiredId(value: string, kind: string): string {
  const id = value.trim();
  if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`);
  return id;
}

function positiveInteger(value: number, label: string): number {
  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized) || normalized < 1) throw new Error(`${label} must be positive.`);
  return normalized;
}

function nonNegativeInteger(value: number, label: string): number {
  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be non-negative.`);
  return normalized;
}
