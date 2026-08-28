import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { AUTOMATION_STUDIO_PROJECT_ADAPTATION_EVIDENCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_COMPILED_RUNTIME_ISOLATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_DOMAIN_RESOURCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_EVENT_CURSOR_MIGRATION, AUTOMATION_STUDIO_PROJECT_FAST_UI_QUERY_INDEX_MIGRATION, AUTOMATION_STUDIO_PROJECT_MUTATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_RELATION_INDEX_MIGRATION, AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION, AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_MIGRATION } from "./project-schema.ts";
import { AutomationStudioSchemaMigrationRunner, type AutomationStudioSchemaMigration } from "./schema-migrations.ts";

type TransactionalProjectExecutor = AutomationStudioSqlExecutor & {
  projectId: string;
  transaction<TResult>(operation: (transaction: AutomationStudioSqlExecutor) => Promise<TResult>): Promise<TResult>;
};

export type AutomationStudioProjectMeta = {
  projectId: string;
  name: string;
  description: string;
  domainId: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioChangeFeedOperation = "create" | "update" | "delete" | "touch";
export type AutomationStudioChangeFeedHierarchyScope = { kind: string; id?: string };
export type AutomationStudioChangeFeedEvent = {
  projectId: string;
  sequence: number;
  transactionId: string;
  entityKind: string;
  entityId: string;
  parentId?: string | null;
  operation: AutomationStudioChangeFeedOperation;
  revision: number;
  changedAt: number;
  hierarchyScope?: AutomationStudioChangeFeedHierarchyScope | null;
};

export type AutomationStudioStorageOutboxStatus = "pending" | "in_progress" | "done" | "failed" | "abandoned";
export type AutomationStudioStorageOutboxEntry = {
  outboxId: string;
  operation: "put_file" | "delete_file" | "move_file" | "verify_file";
  stagedPath: string | null;
  finalPath: string;
  sha256: string | null;
  status: AutomationStudioStorageOutboxStatus;
  attemptCount: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioMigrationJobStatus = "pending" | "running" | "done" | "failed";
export type AutomationStudioMigrationJob = {
  jobId: string;
  kind: string;
  cursorJson: string;
  status: AutomationStudioMigrationJobStatus;
  errorJson: string | null;
  startedAt: number | null;
  updatedAt: number;
  completedAt: number | null;
};

export type AutomationStudioBackgroundJobStatus = "pending" | "running" | "done" | "failed" | "cancelled";
export type AutomationStudioBackgroundJob = {
  jobId: string;
  kind: string;
  ownerKind: string;
  ownerId: string;
  status: AutomationStudioBackgroundJobStatus;
  priority: number;
  inputObjectId: string | null;
  outputObjectId: string | null;
  attempts: number;
  availableAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  errorJson: string | null;
  createdAt: number;
  updatedAt: number;
};

export const AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS: readonly AutomationStudioSchemaMigration[] = [{
  id: "0001_project_administration",
  statements: [
    `create table project_meta (
      project_id text primary key,
      name text not null,
      description text not null default '',
      domain_id text,
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    `create table change_feed (
      sequence integer primary key autoincrement,
      transaction_id text not null,
      entity_kind text not null,
      entity_id text not null,
      operation text not null check (operation in ('create', 'update', 'delete', 'touch')),
      revision integer not null check (revision > 0),
      changed_at_ms integer not null
    )`,
    "create index change_feed_transaction_idx on change_feed (transaction_id, sequence)",
    "create index change_feed_entity_idx on change_feed (entity_kind, entity_id, sequence)",
    "create index change_feed_changed_idx on change_feed (changed_at_ms, sequence)",
    `create table storage_outbox (
      outbox_id text primary key,
      operation text not null check (operation in ('put_file', 'delete_file', 'move_file', 'verify_file')),
      staged_path text,
      final_path text not null,
      sha256 text,
      status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'failed', 'abandoned')),
      attempt_count integer not null default 0 check (attempt_count >= 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create index storage_outbox_status_idx on storage_outbox (status, updated_at_ms, outbox_id)",
    "create index storage_outbox_final_path_idx on storage_outbox (final_path)",
    `create table migration_jobs (
      job_id text primary key,
      kind text not null,
      cursor_json text not null default '{}',
      status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
      error_json text,
      started_at_ms integer,
      updated_at_ms integer not null,
      completed_at_ms integer
    )`,
    "create index migration_jobs_status_idx on migration_jobs (status, updated_at_ms, job_id)",
    "create index migration_jobs_kind_idx on migration_jobs (kind, status, updated_at_ms, job_id)",
    `create table background_jobs (
      job_id text primary key,
      kind text not null,
      owner_kind text not null,
      owner_id text not null,
      status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
      priority integer not null default 0,
      input_object_id text,
      output_object_id text,
      attempts integer not null default 0 check (attempts >= 0),
      available_at_ms integer not null,
      started_at_ms integer,
      finished_at_ms integer,
      error_json text,
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create index background_jobs_ready_idx on background_jobs (status, available_at_ms, priority desc, created_at_ms, job_id)",
    "create index background_jobs_owner_idx on background_jobs (owner_kind, owner_id, status, updated_at_ms, job_id)",
    "create index background_jobs_input_object_idx on background_jobs (input_object_id)",
    "create index background_jobs_output_object_idx on background_jobs (output_object_id)"
  ]
}, AUTOMATION_STUDIO_PROJECT_DOMAIN_RESOURCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_RELATION_INDEX_MIGRATION, AUTOMATION_STUDIO_PROJECT_MUTATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_MIGRATION, AUTOMATION_STUDIO_PROJECT_EVENT_CURSOR_MIGRATION, AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION, AUTOMATION_STUDIO_PROJECT_COMPILED_RUNTIME_ISOLATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_ADAPTATION_EVIDENCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_FAST_UI_QUERY_INDEX_MIGRATION] as const;

export class AutomationStudioProjectAdministration {
  readonly meta: AutomationStudioProjectMetaRepository;
  readonly changeFeed: AutomationStudioChangeFeedRepository;
  readonly storageOutbox: AutomationStudioStorageOutboxRepository;
  readonly migrationJobs: AutomationStudioMigrationJobRepository;
  readonly backgroundJobs: AutomationStudioBackgroundJobRepository;

  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {
    this.meta = new AutomationStudioProjectMetaRepository(lease.database);
    this.changeFeed = new AutomationStudioChangeFeedRepository(lease.database);
    this.storageOutbox = new AutomationStudioStorageOutboxRepository(lease.database);
    this.migrationJobs = new AutomationStudioMigrationJobRepository(lease.database);
    this.backgroundJobs = new AutomationStudioBackgroundJobRepository(lease.database);
  }

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; backup?: (databasePath: string, migrationIds: string[]) => Promise<void> }): Promise<AutomationStudioProjectAdministration> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({
        database: lease.database,
        migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS,
        ...(input.backup ? { backup: (context) => input.backup!(context.databasePath, context.pendingMigrationIds) } : {})
      }).migrate();
      return new AutomationStudioProjectAdministration(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.lease.release();
  }
}

export class AutomationStudioProjectMetaRepository {
  constructor(private readonly database: TransactionalProjectExecutor) {}

  async put(input: { name: string; description?: string; domainId?: string | null; createdAt?: number; updatedAt?: number; revision?: number }, expectedRevision?: number): Promise<AutomationStudioProjectMeta> {
    const projectId = this.database.projectId;
    const name = requiredName(input.name, "Project");
    const now = input.updatedAt ?? Date.now();
    return this.database.transaction(async (sql) => {
      const existing = await sql.get<ProjectMetaRow>("select * from project_meta where project_id = ?", [projectId]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Project ${projectId} metadata revision conflict.`);
      const revision = existing ? existing.revision + 1 : Math.max(1, Math.trunc(input.revision ?? 1));
      const createdAt = existing?.created_at_ms ?? input.createdAt ?? now;
      await sql.run(
        `insert into project_meta (project_id, name, description, domain_id, revision, created_at_ms, updated_at_ms)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(project_id) do update set name = excluded.name, description = excluded.description, domain_id = excluded.domain_id,
           revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`,
        [projectId, name, input.description ?? existing?.description ?? "", optionalId(input.domainId), revision, createdAt, now]
      );
      const saved = await sql.get<ProjectMetaRow>("select * from project_meta where project_id = ?", [projectId]);
      if (!saved) throw new Error(`Project ${projectId} metadata was not persisted.`);
      return metaFromRow(saved);
    });
  }

  async get(): Promise<AutomationStudioProjectMeta | null> {
    const row = await this.database.get<ProjectMetaRow>("select * from project_meta where project_id = ?", [this.database.projectId]);
    return row ? metaFromRow(row) : null;
  }
}

export class AutomationStudioChangeFeedRepository {
  constructor(private readonly database: AutomationStudioSqlExecutor & { projectId?: string }) {}

  async append(input: Omit<AutomationStudioChangeFeedEvent, "projectId" | "sequence" | "changedAt"> & { changedAt?: number }): Promise<AutomationStudioChangeFeedEvent> {
    const changedAt = input.changedAt ?? Date.now();
    const result = await this.database.run(
      `insert into change_feed (transaction_id, entity_kind, entity_id, operation, revision, changed_at_ms)
       values (?, ?, ?, ?, ?, ?)`,
      [requiredId(input.transactionId, "transaction"), requiredKind(input.entityKind, "entity kind"), requiredId(input.entityId, "entity"), input.operation, positiveRevision(input.revision), changedAt]
    );
    return { ...input, projectId: requiredId(this.database.projectId ?? "unknown", "project"), sequence: result.lastID, changedAt };
  }

  async listAfter(sequence: number, limit = 100): Promise<AutomationStudioChangeFeedEvent[]> {
    const rows = await this.database.all<ChangeFeedRow>(
      "select * from change_feed where sequence > ? order by sequence limit ?",
      [Math.max(0, Math.trunc(sequence)), clampLimit(limit, 500)]
    );
    return rows.map((row) => changeFeedFromRow(row, this.database.projectId));
  }

  async listEntity(input: { entityKind: string; entityId: string; afterSequence?: number; limit?: number }): Promise<AutomationStudioChangeFeedEvent[]> {
    const rows = await this.database.all<ChangeFeedRow>(
      `select * from change_feed where entity_kind = ? and entity_id = ? and sequence > ? order by sequence limit ?`,
      [requiredKind(input.entityKind, "entity kind"), requiredId(input.entityId, "entity"), Math.max(0, Math.trunc(input.afterSequence ?? 0)), clampLimit(input.limit, 500)]
    );
    return rows.map((row) => changeFeedFromRow(row, this.database.projectId));
  }
}

export class AutomationStudioStorageOutboxRepository {
  constructor(private readonly database: AutomationStudioSqlExecutor) {}

  async enqueue(input: Omit<AutomationStudioStorageOutboxEntry, "status" | "attemptCount" | "createdAt" | "updatedAt"> & { status?: AutomationStudioStorageOutboxStatus; attemptCount?: number; createdAt?: number; updatedAt?: number }): Promise<AutomationStudioStorageOutboxEntry> {
    const now = input.updatedAt ?? Date.now();
    await this.database.run(
      `insert into storage_outbox (outbox_id, operation, staged_path, final_path, sha256, status, attempt_count, created_at_ms, updated_at_ms)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [requiredId(input.outboxId, "outbox"), input.operation, optionalText(input.stagedPath), requiredPath(input.finalPath), optionalText(input.sha256), input.status ?? "pending", Math.max(0, Math.trunc(input.attemptCount ?? 0)), input.createdAt ?? now, now]
    );
    return this.mustGet(input.outboxId);
  }

  async get(outboxId: string): Promise<AutomationStudioStorageOutboxEntry | null> {
    const row = await this.database.get<StorageOutboxRow>("select * from storage_outbox where outbox_id = ?", [requiredId(outboxId, "outbox")]);
    return row ? outboxFromRow(row) : null;
  }

  async listByStatus(status: AutomationStudioStorageOutboxStatus, limit = 100): Promise<AutomationStudioStorageOutboxEntry[]> {
    const rows = await this.database.all<StorageOutboxRow>("select * from storage_outbox where status = ? order by updated_at_ms, outbox_id limit ?", [status, clampLimit(limit, 500)]);
    return rows.map(outboxFromRow);
  }

  async updateStatus(outboxId: string, input: { status: AutomationStudioStorageOutboxStatus; attemptDelta?: number; updatedAt?: number }): Promise<AutomationStudioStorageOutboxEntry> {
    await this.database.run(
      `update storage_outbox set status = ?, attempt_count = attempt_count + ?, updated_at_ms = ? where outbox_id = ?`,
      [input.status, Math.max(0, Math.trunc(input.attemptDelta ?? 0)), input.updatedAt ?? Date.now(), requiredId(outboxId, "outbox")]
    );
    return this.mustGet(outboxId);
  }

  private async mustGet(outboxId: string): Promise<AutomationStudioStorageOutboxEntry> {
    const entry = await this.get(outboxId);
    if (!entry) throw new Error(`Storage outbox entry ${outboxId} was not persisted.`);
    return entry;
  }
}

export class AutomationStudioMigrationJobRepository {
  constructor(private readonly database: AutomationStudioSqlExecutor) {}

  async upsert(input: Omit<AutomationStudioMigrationJob, "updatedAt"> & { updatedAt?: number }): Promise<AutomationStudioMigrationJob> {
    const now = input.updatedAt ?? Date.now();
    await this.database.run(
      `insert into migration_jobs (job_id, kind, cursor_json, status, error_json, started_at_ms, updated_at_ms, completed_at_ms)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(job_id) do update set kind = excluded.kind, cursor_json = excluded.cursor_json, status = excluded.status,
         error_json = excluded.error_json, started_at_ms = excluded.started_at_ms, updated_at_ms = excluded.updated_at_ms,
         completed_at_ms = excluded.completed_at_ms`,
      [requiredId(input.jobId, "migration job"), requiredKind(input.kind, "migration kind"), validJson(input.cursorJson, "migration cursor"), input.status, optionalText(input.errorJson), input.startedAt, now, input.completedAt]
    );
    return this.mustGet(input.jobId);
  }

  async get(jobId: string): Promise<AutomationStudioMigrationJob | null> {
    const row = await this.database.get<MigrationJobRow>("select * from migration_jobs where job_id = ?", [requiredId(jobId, "migration job")]);
    return row ? migrationJobFromRow(row) : null;
  }

  async list(input: { status?: AutomationStudioMigrationJobStatus; kind?: string; limit?: number } = {}): Promise<AutomationStudioMigrationJob[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.status) { where.push("status = ?"); params.push(input.status); }
    if (input.kind) { where.push("kind = ?"); params.push(requiredKind(input.kind, "migration kind")); }
    const rows = await this.database.all<MigrationJobRow>(
      `select * from migration_jobs${where.length ? ` where ${where.join(" and ")}` : ""} order by updated_at_ms, job_id limit ?`,
      [...params, clampLimit(input.limit, 500)]
    );
    return rows.map(migrationJobFromRow);
  }

  private async mustGet(jobId: string): Promise<AutomationStudioMigrationJob> {
    const job = await this.get(jobId);
    if (!job) throw new Error(`Migration job ${jobId} was not persisted.`);
    return job;
  }
}

export class AutomationStudioBackgroundJobRepository {
  constructor(private readonly database: AutomationStudioSqlExecutor) {}

  async enqueue(input: Omit<AutomationStudioBackgroundJob, "status" | "attempts" | "startedAt" | "finishedAt" | "errorJson" | "createdAt" | "updatedAt"> & Partial<Pick<AutomationStudioBackgroundJob, "status" | "attempts" | "startedAt" | "finishedAt" | "errorJson" | "createdAt" | "updatedAt">>): Promise<AutomationStudioBackgroundJob> {
    const now = input.updatedAt ?? Date.now();
    await this.database.run(
      `insert into background_jobs (job_id, kind, owner_kind, owner_id, status, priority, input_object_id, output_object_id, attempts, available_at_ms, started_at_ms, finished_at_ms, error_json, created_at_ms, updated_at_ms)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [requiredId(input.jobId, "background job"), requiredKind(input.kind, "background job kind"), requiredKind(input.ownerKind, "owner kind"), requiredId(input.ownerId, "owner"), input.status ?? "pending", Math.trunc(input.priority), optionalId(input.inputObjectId), optionalId(input.outputObjectId), Math.max(0, Math.trunc(input.attempts ?? 0)), input.availableAt, input.startedAt ?? null, input.finishedAt ?? null, optionalText(input.errorJson), input.createdAt ?? now, now]
    );
    return this.mustGet(input.jobId);
  }

  async get(jobId: string): Promise<AutomationStudioBackgroundJob | null> {
    const row = await this.database.get<BackgroundJobRow>("select * from background_jobs where job_id = ?", [requiredId(jobId, "background job")]);
    return row ? backgroundJobFromRow(row) : null;
  }

  async listReady(input: { now?: number; limit?: number } = {}): Promise<AutomationStudioBackgroundJob[]> {
    const rows = await this.database.all<BackgroundJobRow>(
      `select * from background_jobs where status = 'pending' and available_at_ms <= ? order by available_at_ms, priority desc, created_at_ms, job_id limit ?`,
      [input.now ?? Date.now(), clampLimit(input.limit, 500)]
    );
    return rows.map(backgroundJobFromRow);
  }

  async listByOwner(input: { ownerKind: string; ownerId: string; status?: AutomationStudioBackgroundJobStatus; limit?: number }): Promise<AutomationStudioBackgroundJob[]> {
    const statusClause = input.status ? " and status = ?" : "";
    const rows = await this.database.all<BackgroundJobRow>(
      `select * from background_jobs where owner_kind = ? and owner_id = ?${statusClause} order by updated_at_ms, job_id limit ?`,
      [requiredKind(input.ownerKind, "owner kind"), requiredId(input.ownerId, "owner"), ...(input.status ? [input.status] : []), clampLimit(input.limit, 500)]
    );
    return rows.map(backgroundJobFromRow);
  }

  async updateStatus(jobId: string, input: { status: AutomationStudioBackgroundJobStatus; attemptsDelta?: number; outputObjectId?: string | null; errorJson?: string | null; startedAt?: number | null; finishedAt?: number | null; updatedAt?: number }): Promise<AutomationStudioBackgroundJob> {
    await this.database.run(
      `update background_jobs set status = ?, attempts = attempts + ?, output_object_id = coalesce(?, output_object_id),
        error_json = ?, started_at_ms = ?, finished_at_ms = ?, updated_at_ms = ? where job_id = ?`,
      [input.status, Math.max(0, Math.trunc(input.attemptsDelta ?? 0)), optionalId(input.outputObjectId), optionalText(input.errorJson), input.startedAt ?? null, input.finishedAt ?? null, input.updatedAt ?? Date.now(), requiredId(jobId, "background job")]
    );
    return this.mustGet(jobId);
  }

  private async mustGet(jobId: string): Promise<AutomationStudioBackgroundJob> {
    const job = await this.get(jobId);
    if (!job) throw new Error(`Background job ${jobId} was not persisted.`);
    return job;
  }
}

type ProjectMetaRow = { project_id: string; name: string; description: string; domain_id: string | null; revision: number; created_at_ms: number; updated_at_ms: number };
type ChangeFeedRow = { sequence: number; transaction_id: string; entity_kind: string; entity_id: string; operation: AutomationStudioChangeFeedOperation; revision: number; changed_at_ms: number };
type StorageOutboxRow = { outbox_id: string; operation: AutomationStudioStorageOutboxEntry["operation"]; staged_path: string | null; final_path: string; sha256: string | null; status: AutomationStudioStorageOutboxStatus; attempt_count: number; created_at_ms: number; updated_at_ms: number };
type MigrationJobRow = { job_id: string; kind: string; cursor_json: string; status: AutomationStudioMigrationJobStatus; error_json: string | null; started_at_ms: number | null; updated_at_ms: number; completed_at_ms: number | null };
type BackgroundJobRow = { job_id: string; kind: string; owner_kind: string; owner_id: string; status: AutomationStudioBackgroundJobStatus; priority: number; input_object_id: string | null; output_object_id: string | null; attempts: number; available_at_ms: number; started_at_ms: number | null; finished_at_ms: number | null; error_json: string | null; created_at_ms: number; updated_at_ms: number };

function metaFromRow(row: ProjectMetaRow): AutomationStudioProjectMeta { return { projectId: row.project_id, name: row.name, description: row.description, domainId: row.domain_id, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function changeFeedFromRow(row: ChangeFeedRow, projectId = "unknown"): AutomationStudioChangeFeedEvent { return { projectId, sequence: row.sequence, transactionId: row.transaction_id, entityKind: row.entity_kind, entityId: row.entity_id, operation: row.operation, revision: row.revision, changedAt: row.changed_at_ms }; }
function outboxFromRow(row: StorageOutboxRow): AutomationStudioStorageOutboxEntry { return { outboxId: row.outbox_id, operation: row.operation, stagedPath: row.staged_path, finalPath: row.final_path, sha256: row.sha256, status: row.status, attemptCount: row.attempt_count, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function migrationJobFromRow(row: MigrationJobRow): AutomationStudioMigrationJob { return { jobId: row.job_id, kind: row.kind, cursorJson: row.cursor_json, status: row.status, errorJson: row.error_json, startedAt: row.started_at_ms, updatedAt: row.updated_at_ms, completedAt: row.completed_at_ms }; }
function backgroundJobFromRow(row: BackgroundJobRow): AutomationStudioBackgroundJob { return { jobId: row.job_id, kind: row.kind, ownerKind: row.owner_kind, ownerId: row.owner_id, status: row.status, priority: row.priority, inputObjectId: row.input_object_id, outputObjectId: row.output_object_id, attempts: row.attempts, availableAt: row.available_at_ms, startedAt: row.started_at_ms, finishedAt: row.finished_at_ms, errorJson: row.error_json, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function requiredKind(value: string, kind: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${kind}.`); return normalized; }
function requiredName(value: string, kind: string): string { const name = value.trim(); if (!name || name.length > 200) throw new Error(`${kind} name is required and must not exceed 200 characters.`); return name; }
function requiredPath(value: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 1_000 || normalized.includes("\0")) throw new Error("Storage path is required and must be valid text."); return normalized; }
function optionalId(value: string | null | undefined): string | null { const normalized = value?.trim(); return normalized ? requiredId(normalized, "optional") : null; }
function optionalText(value: string | null | undefined): string | null { const normalized = value?.trim(); return normalized ? normalized : null; }
function positiveRevision(value: number): number { const revision = Math.trunc(value); if (revision < 1) throw new Error("Revision must be positive."); return revision; }
function clampLimit(value: number | undefined, max: number): number { return Math.max(1, Math.min(max, Math.trunc(value ?? 100))); }
function validJson(value: string, label: string): string { try { JSON.parse(value); return value; } catch { throw new Error(`${label} must be valid JSON.`); } }
